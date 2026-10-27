// Object storage for report PDFs (Cloudflare R2, S3-compatible).
//
// Report PDFs used to live as base64 TEXT in the Postgres `reports.pdf_content`
// column, which bloated the most expensive storage tier and every backup. They
// now live in an object store, with only a small `pdf_key` kept in the DB.
//
// This module is a no-op unless the R2 env vars are set, so a deployment without
// object storage keeps the legacy inline-base64 behaviour untouched. Set these to
// enable it:
//   R2_ACCOUNT_ID         - Cloudflare account id (for the endpoint URL)
//   R2_ACCESS_KEY_ID      - R2 API token access key id
//   R2_SECRET_ACCESS_KEY  - R2 API token secret
//   R2_BUCKET             - bucket name (e.g. "auditguard-reports")
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { randomBytes } from "crypto";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET?.trim();

// Build the S3 endpoint, tolerating a value that was pasted as the full endpoint
// URL/host (e.g. "https://<id>.r2.cloudflarestorage.com") instead of the bare
// account id. Also honours an explicit R2_ENDPOINT override.
function resolveEndpoint(): string | undefined {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT.trim();
  let id = (accountId || "").trim();
  if (!id) return undefined;
  // If a full "<id>.r2.cloudflarestorage.com" host was pasted, pull out the id.
  const m = id.match(/([a-z0-9]+)\.r2\.cloudflarestorage\.com/i);
  if (m) {
    id = m[1];
  } else {
    // Otherwise strip any scheme/path so a bare id (or "https://id") still works.
    id = id.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }
  return `https://${id}.r2.cloudflarestorage.com`;
}

const endpoint = resolveEndpoint();

const client: S3Client | null =
  endpoint && accessKeyId && secretAccessKey && bucket
    ? new S3Client({
        region: "auto",
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      })
    : null;

export function isObjectStorageConfigured(): boolean {
  return client !== null;
}

// Stable, collision-resistant key for a report PDF.
export function buildReportPdfKey(leadId: string, date: string): string {
  const safe = (s: string) =>
    (s || "report").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  return `reports/${safe(leadId)}_${safe(date)}_${randomBytes(6).toString("hex")}.pdf`;
}

export async function putPdf(key: string, body: Buffer): Promise<void> {
  if (!client) throw new Error("Object storage is not configured");
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/pdf",
    }),
  );
}

export async function getPdf(key: string): Promise<Buffer> {
  if (!client) throw new Error("Object storage is not configured");
  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const chunks: Buffer[] = [];
  // Body is a Node Readable stream in the Node runtime.
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function deletePdf(key: string): Promise<void> {
  if (!client) return;
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// Store a report PDF in the cheapest place available: object storage when it is
// configured (returns a `pdfKey`), otherwise inline base64 in Postgres (legacy
// `pdfContent`). Callers spread the result into the report row.
export async function persistReportPdf(
  leadId: string,
  date: string,
  buffer: Buffer,
): Promise<{ pdfKey?: string; pdfContent?: string; fileSize: number }> {
  const fileSize = buffer.length;
  if (isObjectStorageConfigured()) {
    const key = buildReportPdfKey(leadId, date);
    await putPdf(key, buffer);
    return { pdfKey: key, fileSize };
  }
  return { pdfContent: buffer.toString("base64"), fileSize };
}

// Load a report's stored PDF from wherever it lives (object storage first, then
// legacy inline base64). Returns null when the report has no stored PDF so the
// caller can fall back to on-the-fly regeneration.
export async function loadStoredReportPdf(report: {
  pdfKey?: string | null;
  pdfContent?: string | null;
}): Promise<Buffer | null> {
  if (report.pdfKey && isObjectStorageConfigured()) {
    try {
      return await getPdf(report.pdfKey);
    } catch (err) {
      console.error(`[object-storage] Failed to fetch ${report.pdfKey}:`, err);
      // Fall through to inline content if present.
    }
  }
  if (report.pdfContent) {
    return Buffer.from(report.pdfContent, "base64");
  }
  return null;
}
