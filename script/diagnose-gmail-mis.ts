// Diagnose the gap between work allocations expected and entries the Gmail import
// produces. Read-only: it scans the mailbox and prints the funnel from "emails
// received" down to "unique entries", showing exactly where allocations are lost
// (page-cap truncation, non-PD subjects, parse failures, de-duplication). Use this
// to reconcile a manual count (e.g. 137) against the import (e.g. 95).
//
//   npx tsx script/diagnose-gmail-mis.ts             # last 20 days
//   npx tsx script/diagnose-gmail-mis.ts --days 35   # last 35 days (e.g. a full month)
//
import "dotenv/config";
import { importWorkAllocationEmails } from "../server/gmail";
import { isGmailReadAvailable } from "../server/mis-auto-import";
import { pool } from "../server/db";

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
  if (!isGmailReadAvailable()) {
    console.error("Gmail is not configured in this environment. Cannot read emails.");
    process.exit(1);
  }

  const result = await importWorkAllocationEmails(daysBack);
  const d = result.diagnostics;
  if (!result.success || !d) {
    console.error("Scan failed:", result.message);
    process.exit(1);
  }

  const line = "─".repeat(60);
  console.log(`\n${line}\nGmail → MIS import funnel — last ${daysBack} days\n${line}`);
  console.log(`Emails matched by query ............ ${d.emailsMatched}${d.truncated ? "  ⚠️ TRUNCATED (more exist)" : ""}`);
  console.log(`  − non "New PD Assigned" subjects . ${d.nonPdSubject}`);
  console.log(`  − parse failures (no lead+cust) .. ${d.parseFailed}`);
  console.log(`  − fetch/parse errors ............. ${d.processErrors}`);
  console.log(`  = entries parsed ................. ${d.parsedEntries}`);
  console.log(line);
  console.log(`De-dup, by Lead ID alone ........... ${d.uniqueByLead}`);
  console.log(`De-dup, by Lead + Customer ......... ${d.uniqueByLeadCustomer}`);
  console.log(`De-dup, by Lead + Customer + Month . ${d.uniqueByLeadCustomerMonth}  ← imported`);
  console.log(line);
  console.log(
    `Collapsed as duplicates: ${d.parsedEntries - d.uniqueByLeadCustomerMonth} ` +
      `(${d.parsedEntries} parsed → ${d.uniqueByLeadCustomerMonth} unique)`,
  );

  if (d.truncated) {
    console.log(
      `\n⚠️ The mailbox returned more emails than were fetched. Some allocations are NOT ` +
        `in these numbers — narrow --days or raise the MAX_MESSAGES cap in server/gmail.ts.`,
    );
  }
  if (d.parseFailedSamples.length > 0) {
    console.log(`\nParse-failure samples (subjects that yielded no entry):`);
    d.parseFailedSamples.forEach((s) => console.log(`  • ${s}`));
  }
  console.log(
    `\nReconcile: a manual count counts every allocation email; the import counts ` +
      `unique lead+customer+month. The difference is the "collapsed as duplicates" line ` +
      `plus any parse failures / truncation above.\n`,
  );
}

main()
  .catch((err) => {
    console.error("Diagnose failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end().catch(() => {});
  });
