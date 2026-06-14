// Verify that the June backfill created the entries that were missing from the
// import. Re-derives the "in expected but missing from import" lead+applicant set
// from the two CSV exports, then checks the live store for each. Read-only.
//   npx tsx script/verify-backfill.ts "<expected.csv>" "<import.csv>"
import "dotenv/config";
import * as fs from "fs";
import { storage } from "../server/storage";
import { pool } from "../server/db";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (s: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

function load(path: string) {
  const rows = parseCsv(fs.readFileSync(path, "utf8"));
  const h = rows[0];
  const li = h.findIndex((x) => norm(x) === "lead id");
  const ai = h.findIndex((x) => norm(x) === "applicant");
  const set = new Map<string, { lead: string; applicant: string }>();
  for (const r of rows.slice(1)) {
    const lead = r[li] || "", applicant = r[ai] || "";
    set.set(`${norm(lead)}__${norm(applicant)}`, { lead, applicant });
  }
  return set;
}

async function main() {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) { console.error("Usage: verify-backfill.ts <expected.csv> <import.csv>"); process.exit(1); }
  console.log(pool ? "Backend: Postgres (DATABASE_URL set)" : "Backend: local in-memory dev-state");

  const exp = load(a), imp = load(b);
  const missing = [...exp.entries()].filter(([k]) => !imp.has(k)).map(([, v]) => v);
  console.log(`\nChecking ${missing.length} entries that were missing from the import...\n`);

  let present = 0;
  const still: string[] = [];
  for (const m of missing) {
    const rows = await storage.getMisEntriesByLeadId(m.lead);
    const hit = rows.some((e) => norm(e.customerName) === norm(m.applicant));
    if (hit) present++;
    else still.push(`${m.lead}\t"${m.applicant}"`);
  }

  console.log(`✅ Now present in store: ${present}/${missing.length}`);
  if (still.length) {
    console.log(`\n❌ Still missing (${still.length}):`);
    still.forEach((s) => console.log(`  ${s}`));
  } else {
    console.log(`\nAll ${missing.length} previously-missing entries are now present.`);
  }
}

main()
  .catch((e) => { console.error("Verify failed:", e?.message || e); process.exitCode = 1; })
  .finally(async () => { await pool?.end().catch(() => {}); });
