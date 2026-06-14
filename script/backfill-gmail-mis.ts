// One-off backfill for "New PD Assigned" work-allocation emails that fell outside
// the scheduler's normal look-back window (MIS_AUTO_IMPORT_DAYS_BACK, default 2 days).
// Use this to re-import older emails — e.g. the June 5th BLSA000BA19F allocations
// (MAAGAPU SUSI + YESU MAAGAPU) that the old leadId-only dedup dropped. It reuses
// the SAME import pipeline as the live scheduler, so the corrected lead+customer+month
// dedup applies: already-imported work is skipped, genuinely-new work is created.
//
// DRY RUN by default — it only lists what the emails parse to. Pass --apply to write.
//
//   npx tsx script/backfill-gmail-mis.ts                 # preview last 20 days
//   npx tsx script/backfill-gmail-mis.ts --days 30       # preview last 30 days
//   npx tsx script/backfill-gmail-mis.ts --days 20 --apply   # import last 20 days
//
import "dotenv/config";
import { importWorkAllocationEmails } from "../server/gmail";
import { importGmailWorkAllocations, isGmailReadAvailable } from "../server/mis-auto-import";
import { pool } from "../server/db";

const APPLY = process.argv.includes("--apply");

function parseDays(): number {
  const i = process.argv.indexOf("--days");
  if (i !== -1 && process.argv[i + 1]) {
    const n = parseInt(process.argv[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 20;
}

async function main() {
  const daysBack = parseDays();
  console.log(pool ? "Backend: Postgres (DATABASE_URL set)" : "Backend: local in-memory dev-state");

  if (!isGmailReadAvailable()) {
    console.error(
      "Gmail is not configured in this environment (set GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / " +
        "GMAIL_REFRESH_TOKEN, or run on Replit with the connector). Cannot read emails.",
    );
    process.exit(1);
  }

  // Preview: parse the emails without writing, so you can confirm before importing.
  const preview = await importWorkAllocationEmails(daysBack);
  console.log(`\nGmail scan (last ${daysBack} days): ${preview.message}`);
  if (!preview.success) process.exit(1);

  console.log(`Parsed ${preview.entries.length} unique work allocation(s):`);
  for (const e of preview.entries) {
    console.log(
      `  lead=${e.leadId} customer="${e.customerName}" received=${e.receivedDate ?? "?"} ` +
        `branch="${e.branch ?? ""}" product="${e.product ?? ""}"`,
    );
  }

  if (!APPLY) {
    console.log(
      "\nDRY RUN — no entries written. Re-run with --apply to import. Already-existing " +
        "work (same lead + customer + month) is skipped automatically.",
    );
    return;
  }

  const summary = await importGmailWorkAllocations({ daysBack });
  console.log(
    `\n✅ Import complete: ${summary.added} added, ${summary.updated} updated, ` +
      `${summary.skipped} skipped, from ${summary.emailCount} emails.`,
  );
  console.log(summary.message);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end().catch(() => {});
  });
