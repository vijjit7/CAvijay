// One-off correction: align a MIS entry's applicant name to what the Piramal email
// actually says (the email is the source of truth). Configured for lead HLSA0013444D,
// whose manual record read "MOHAMMED Arif" while the "New PD Assigned" mail says
// "MOHD ALTAF". DRY RUN by default — pass --apply to write.
//
//   npx tsx script/fix-applicant-name.ts            # show what would change
//   npx tsx script/fix-applicant-name.ts --apply    # perform the correction
//
import "dotenv/config";
import { storage } from "../server/storage";
import { pool } from "../server/db";

// ── What to fix (name as per the mail) ───────────────────────────────────────
const LEAD_ID = "HLSA0013444D";
const OLD_NAME = "MOHAMMED Arif"; // wrong name in the manual record
const NEW_NAME = "MOHD ALTAF";    // correct name from the email

const APPLY = process.argv.includes("--apply");
const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

const MONTH_NUM: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
function monthKey(inDate: string | null | undefined): string {
  if (!inDate) return "unknown";
  const p = inDate.trim().split(/[-/]/);
  if (p.length >= 3) {
    const mid = p[1].toLowerCase().substring(0, 3);
    if (MONTH_NUM[mid]) return `${p[2].length === 4 ? p[2] : "20" + p[2]}-${MONTH_NUM[mid]}`;
    if (p[0].length === 4) return `${p[0]}-${p[1].padStart(2, "0")}`;
    if (p[2].length === 4) return `${p[2]}-${p[1].padStart(2, "0")}`;
  }
  return "unknown";
}

async function main() {
  console.log(pool ? "Backend: Postgres (DATABASE_URL set)" : "Backend: local in-memory dev-state");

  const entries = await storage.getMisEntriesByLeadId(LEAD_ID);
  console.log(`\nEntries for ${LEAD_ID}:`);
  for (const e of entries) {
    console.log(`  id=${e.id} name="${e.customerName}" inDate="${e.inDate}" (month ${monthKey(e.inDate)}) status=${(e as any).workflowStatus}`);
  }

  const oldEntry = entries.find((e) => norm(e.customerName) === norm(OLD_NAME));
  const newEntry = entries.find((e) => norm(e.customerName) === norm(NEW_NAME));

  if (!oldEntry && newEntry) {
    console.log(`\nNothing to fix: the entry already reads "${newEntry.customerName}" (id=${newEntry.id}) — matches the mail.`);
    return;
  }
  if (!oldEntry) {
    console.log(`\nNo entry named "${OLD_NAME}" found for ${LEAD_ID}; nothing to correct.`);
    return;
  }

  // A correctly-named entry already exists in the same month → renaming would create a
  // duplicate. Flag it for a human decision rather than silently merging/deleting.
  if (newEntry && monthKey(newEntry.inDate) === monthKey(oldEntry.inDate)) {
    console.log(
      `\n⚠️ Both "${OLD_NAME}" (id=${oldEntry.id}) and "${NEW_NAME}" (id=${newEntry.id}) exist in the same ` +
        `month. Renaming would duplicate. Keep the email-named id=${newEntry.id} and DELETE the mis-named ` +
        `id=${oldEntry.id} — but check first whether id=${oldEntry.id} carries PD/status work worth keeping. ` +
        `Not auto-resolved.`,
    );
    return;
  }

  console.log(`\nWill rename id=${oldEntry.id}: "${oldEntry.customerName}" → "${NEW_NAME}"`);
  if (!APPLY) {
    console.log("\nDRY RUN — no changes written. Re-run with --apply to perform the correction.");
    return;
  }
  const updated = await storage.updateMisEntry(oldEntry.id, { customerName: NEW_NAME });
  console.log(updated ? `\n✅ Updated id=${oldEntry.id}: name is now "${updated.customerName}".`
                      : `\n⚠️ Update returned no row for id=${oldEntry.id}.`);
}

main()
  .catch((e) => { console.error("Fix failed:", e?.message || e); process.exitCode = 1; })
  .finally(async () => { await pool?.end().catch(() => {}); });
