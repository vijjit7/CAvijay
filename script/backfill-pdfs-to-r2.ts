// One-off CLI migration: move existing report PDFs out of Postgres (base64
// `pdf_content`) into object storage (Cloudflare R2), then null the column.
//
// Prefer the admin endpoint (POST /api/admin/backfill-pdfs-to-r2) when the DB is
// on a managed host like Railway, since it runs inside the network. Use this CLI
// when you can reach the database directly (point env at a PUBLIC connection URL).
//
// Usage:
//   DATABASE_URL=<public url>        \
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
import { backfillReportPdfs } from "../server/pdf-backfill";

async function main() {
  // No maxMs/maxToProcess: run to completion.
  const result = await backfillReportPdfs({ batchSize: 25 });
  console.log(`\nDone. Migrated ${result.migrated}, failed ${result.failed}, remaining ${result.remaining}.`);
  if (result.failed === 0 && result.remaining === 0) {
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
