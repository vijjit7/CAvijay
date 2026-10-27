// One-off migration: move existing report PDFs out of Postgres (base64
// `pdf_content`) into object storage (Cloudflare R2), then null the column.
//
// Safe to run repeatedly: it only touches rows that still have inline content
// and no object key yet. Processes oldest-first so the stalest data is freed
// first, in small batches to keep memory/DB load low.
//
// Usage (point the env at the TARGET database + R2 bucket, then run):
//   DATABASE_URL=...                \
//   R2_ACCOUNT_ID=...               \
//   R2_ACCESS_KEY_ID=...            \
//   R2_SECRET_ACCESS_KEY=...        \
//   R2_BUCKET=...                   \
//   npx tsx script/backfill-pdfs-to-r2.ts
//
// After it reports "Done" and you've verified downloads, reclaim disk with:
//   VACUUM FULL reports;   -- locks the table briefly
import "dotenv/config";
import { pool } from "../server/db";
import {
  isObjectStorageConfigured,
  buildReportPdfKey,
  putPdf,
} from "../server/object-storage";

const BATCH_SIZE = 25;

async function main() {
  if (!pool) {
    console.error("DATABASE_URL is not set — nothing to migrate.");
    process.exit(1);
  }
  if (!isObjectStorageConfigured()) {
    console.error(
      "Object storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, " +
        "R2_SECRET_ACCESS_KEY and R2_BUCKET before running.",
    );
    process.exit(1);
  }

  const { rows: countRows } = await pool.query<{ n: string }>(
    "SELECT count(*) AS n FROM reports WHERE pdf_content IS NOT NULL AND pdf_key IS NULL",
  );
  const total = Number(countRows[0]?.n ?? 0);
  console.log(`Found ${total} report(s) with inline PDF content to migrate.`);
  if (total === 0) return;

  let migrated = 0;
  let failed = 0;

  // Oldest-first; always re-query the head of the queue so nulled rows drop out.
  for (;;) {
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
        LIMIT ${BATCH_SIZE}`,
    );
    if (rows.length === 0) break;

    for (const r of rows) {
      try {
        const buffer = Buffer.from(r.pdf_content, "base64");
        const key = buildReportPdfKey(r.lead_id || r.id, r.date || "");
        await putPdf(key, buffer);
        await pool.query(
          "UPDATE reports SET pdf_key = $1, pdf_content = NULL WHERE id = $2",
          [key, r.id],
        );
        migrated++;
        if (migrated % 25 === 0 || migrated === total) {
          console.log(`  migrated ${migrated}/${total} …`);
        }
      } catch (err) {
        failed++;
        console.error(`  FAILED report ${r.id}:`, err);
      }
    }
  }

  console.log(`\nDone. Migrated ${migrated}, failed ${failed}.`);
  if (failed === 0) {
    console.log(
      "All inline PDFs moved to object storage. Run `VACUUM FULL reports;` to reclaim disk.",
    );
  }
}

main()
  .then(() => pool?.end())
  .catch(async (err) => {
    console.error(err);
    await pool?.end();
    process.exit(1);
  });
