// One-off data fix for the BLSA000BA19F May entry whose in-date was dragged into
// June by the old leadId-only auto-import dedup (see fixes in server/gmail.ts and
// server/mis-auto-import.ts). The same Lead ID was re-assigned in June to two
// customers; the buggy self-heal rewrote the existing May "MAAGAPU SUSI" entry's
// in-date to the June received date instead of creating new June entries.
//
// This script restores that entry's in-date to its correct May value. It is SAFE
// to run repeatedly: it only touches a row whose in-date month is wrong, and it is
// a DRY RUN unless you pass --apply.
//
//   npx tsx script/fix-may-mis-entry.ts            # dry run: show what would change
//   npx tsx script/fix-may-mis-entry.ts --apply    # perform the correction
//
import "dotenv/config";
import { storage } from "../server/storage";
import { pool } from "../server/db";

// ── What to fix ────────────────────────────────────────────────────────────
const LEAD_ID = "BLSA000BA19F";
const CUSTOMER = "MAAGAPU SUSI";
const CORRECT_MONTH = "2026-05"; // the month this entry belongs to
const CORRECT_IN_DATE = "23-May-2026"; // value to restore (UI showed 23/05/2026)

const APPLY = process.argv.includes("--apply");

const MONTH_NUM: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Month bucket ("YYYY-MM") for an MIS in-date string — same logic the app uses.
function monthKey(inDate: string | null | undefined): string {
  if (!inDate) return "unknown";
  const parts = inDate.trim().split(/[-/]/);
  if (parts.length >= 3) {
    const mid = parts[1].toLowerCase().substring(0, 3);
    if (MONTH_NUM[mid]) {
      const year = parts[2].length === 4 ? parts[2] : "20" + parts[2];
      return `${year}-${MONTH_NUM[mid]}`;
    }
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, "0")}`;
    if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, "0")}`;
  }
  return "unknown";
}

const normalizeName = (s: string | null | undefined) =>
  (s || "").trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  // Works against whichever backend `storage` is using: the Postgres database when
  // DATABASE_URL is set, or the local in-memory dev-state (tmp/dev-state.json)
  // otherwise. Run this in the environment that holds the data you want to fix.
  console.log(pool ? "Backend: Postgres (DATABASE_URL set)" : "Backend: local in-memory dev-state");

  const entries = await storage.getMisEntriesByLeadId(LEAD_ID);
  console.log(`\nFound ${entries.length} MIS entr${entries.length === 1 ? "y" : "ies"} for Lead ID ${LEAD_ID}:`);
  for (const e of entries) {
    console.log(
      `  id=${e.id} sno=${e.sno} customer="${e.customerName}" inDate="${e.inDate}" ` +
        `(month ${monthKey(e.inDate)}) status=${(e as any).workflowStatus} owner=${e.associateId}`,
    );
  }

  // The corrupted row: this lead + this customer whose in-date is NOT in the
  // month it belongs to (i.e. it was bumped out of May).
  const target = entries.find(
    (e) => normalizeName(e.customerName) === normalizeName(CUSTOMER) && monthKey(e.inDate) !== CORRECT_MONTH,
  );

  if (!target) {
    console.log(
      `\nNothing to fix: no "${CUSTOMER}" entry for ${LEAD_ID} is outside ${CORRECT_MONTH}. ` +
        `The in-date is already correct.`,
    );
    return;
  }

  console.log(
    `\nWill correct id=${target.id} ("${target.customerName}"): ` +
      `inDate "${target.inDate}" (${monthKey(target.inDate)}) → "${CORRECT_IN_DATE}" (${CORRECT_MONTH})`,
  );

  if (!APPLY) {
    console.log("\nDRY RUN — no changes written. Re-run with --apply to perform the correction.");
    return;
  }

  const updated = await storage.updateMisEntry(target.id, { inDate: CORRECT_IN_DATE });
  if (updated) {
    console.log(`\n✅ Updated id=${target.id}: inDate is now "${updated.inDate}".`);
  } else {
    console.log(`\n⚠️ Update returned no row for id=${target.id} — nothing changed.`);
  }
}

main()
  .catch((err) => {
    console.error("Fix failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end().catch(() => {});
  });
