// Shared backfill: move report PDFs out of Postgres (base64 `pdf_content`) into
// object storage (Cloudflare R2), then null the column. Used by both the one-off
// CLI script and the admin-triggered endpoint, so the logic lives in one place.
//
// Idempotent: only touches rows that still have inline content and no object key
// yet, oldest-first (frees the stalest data first). Bounded by batchSize and the
// optional maxToProcess / maxMs so the endpoint can run within an HTTP request
// and the caller can poll until `remaining` reaches 0.
import { pool } from "./db";
import {
  isObjectStorageConfigured,
  buildReportPdfKey,
  putPdf,
} from "./object-storage";

export interface BackfillResult {
  migrated: number;
  failed: number;
  remaining: number;
  // First error encountered (if any), to diagnose systemic failures without
  // digging through server logs.
  sampleError?: string;
}

export async function backfillReportPdfs(opts?: {
  batchSize?: number;
  maxToProcess?: number;
  maxMs?: number;
}): Promise<BackfillResult> {
  if (!pool) throw new Error("Database not available (DATABASE_URL not set)");
  if (!isObjectStorageConfigured()) {
    throw new Error(
      "Object storage not configured (set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET)",
    );
  }

  const batchSize = opts?.batchSize ?? 25;
  const maxToProcess = opts?.maxToProcess ?? Number.POSITIVE_INFINITY;
  const deadline =
    opts?.maxMs != null ? Date.now() + opts.maxMs : Number.POSITIVE_INFINITY;

  let migrated = 0;
  let failed = 0;
  let sampleError: string | undefined;

  while (migrated + failed < maxToProcess && Date.now() < deadline) {
    const { rows } = await pool.query<{
      id: string;
      lead_id: string | null;
      date: string | null;
      pdf_content: string;
    }>(
      `SELECT id, lead_id, date, pdf_content
         FROM reports
        WHERE pdf_content IS NOT NULL AND pdf_key IS NULL
        ORDER BY created_at ASC
        LIMIT ${batchSize}`,
    );
    if (rows.length === 0) break;

    for (const r of rows) {
      if (migrated + failed >= maxToProcess || Date.now() >= deadline) break;
      try {
        const buffer = Buffer.from(r.pdf_content, "base64");
        const key = buildReportPdfKey(r.lead_id || r.id, r.date || "");
        await putPdf(key, buffer);
        await pool.query(
          "UPDATE reports SET pdf_key = $1, pdf_content = NULL WHERE id = $2",
          [key, r.id],
        );
        migrated++;
      } catch (err) {
        failed++;
        if (!sampleError) {
          sampleError = `${(err as any)?.name || "Error"}: ${(err as any)?.message || String(err)}`;
        }
        console.error(`[pdf-backfill] FAILED report ${r.id}:`, err);
      }
    }
  }

  const { rows: cnt } = await pool.query<{ n: string }>(
    "SELECT count(*) AS n FROM reports WHERE pdf_content IS NOT NULL AND pdf_key IS NULL",
  );
  const remaining = Number(cnt[0]?.n ?? 0);

  return { migrated, failed, remaining, sampleError };
}
