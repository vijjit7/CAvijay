// Ad-hoc reconciliation of two MIS CSV exports: report rows present in the larger
// (expected) file but missing from the smaller (import) file, keyed on Lead ID +
// Applicant. Read-only; takes two file paths.
//   npx tsx script/reconcile-mis-csv.ts "<expected.csv>" "<import.csv>"
import * as fs from "fs";

// Minimal RFC-4180 CSV parser (handles quoted fields with commas/newlines).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
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
  const header = rows[0];
  const li = header.findIndex((h) => norm(h) === "lead id");
  const ai = header.findIndex((h) => norm(h) === "applicant");
  const di = header.findIndex((h) => norm(h) === "in date");
  const body = rows.slice(1);
  const byKey = new Map<string, { lead: string; applicant: string; inDate: string; count: number }>();
  for (const r of body) {
    const lead = r[li] || "", applicant = r[ai] || "", inDate = di >= 0 ? r[di] || "" : "";
    const key = `${norm(lead)}__${norm(applicant)}`;
    const ex = byKey.get(key);
    if (ex) ex.count++;
    else byKey.set(key, { lead, applicant, inDate, count: 1 });
  }
  return { rows: body.length, byKey };
}

function main() {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) { console.error("Usage: reconcile-mis-csv.ts <expected.csv> <import.csv>"); process.exit(1); }
  const exp = load(a);
  const imp = load(b);

  console.log(`Expected file: ${exp.rows} data rows, ${exp.byKey.size} unique lead+applicant`);
  console.log(`Import file:   ${imp.rows} data rows, ${imp.byKey.size} unique lead+applicant`);

  const dupExp = [...exp.byKey.values()].filter((v) => v.count > 1);
  if (dupExp.length) {
    console.log(`\nDuplicate lead+applicant in EXPECTED (${dupExp.length}):`);
    dupExp.forEach((v) => console.log(`  ${v.lead}  "${v.applicant}"  ×${v.count}`));
  }

  const missing = [...exp.byKey.values()].filter((v) => !imp.byKey.has(`${norm(v.lead)}__${norm(v.applicant)}`));
  console.log(`\nIn EXPECTED but MISSING from import (${missing.length}):`);
  missing.sort((x, y) => x.lead.localeCompare(y.lead))
    .forEach((v) => console.log(`  ${v.lead}\t"${v.applicant}"\tinDate=${v.inDate}`));

  const extra = [...imp.byKey.values()].filter((v) => !exp.byKey.has(`${norm(v.lead)}__${norm(v.applicant)}`));
  if (extra.length) {
    console.log(`\nIn IMPORT but NOT in expected (${extra.length}):`);
    extra.forEach((v) => console.log(`  ${v.lead}\t"${v.applicant}"\tinDate=${v.inDate}`));
  }

  // Why are the missing ones missing? Bucket by in-date month so cross-month rows stand out.
  const monthOf = (s: string) => {
    const m = s.trim().split(/[-/]/);
    if (m.length >= 3) {
      const mid = m[1].toLowerCase().substring(0, 3);
      const names: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
      if (names[mid]) return `${m[2].length === 4 ? m[2] : "20" + m[2]}-${names[mid]}`;
      if (m[0].length === 4) return `${m[0]}-${m[1].padStart(2, "0")}`;
      if (m[2].length === 4) return `${m[2]}-${m[1].padStart(2, "0")}`;
    }
    return "unknown";
  };
  const byMonth: Record<string, number> = {};
  missing.forEach((v) => { const k = monthOf(v.inDate); byMonth[k] = (byMonth[k] || 0) + 1; });
  console.log(`\nMissing rows by in-date month:`);
  Object.entries(byMonth).sort().forEach(([k, n]) => console.log(`  ${k}: ${n}`));
}

main();
