// Generator: turn the PD-team Excel ("All areas of Pd team.xlsx") into a clean,
// reviewable JSON that seed-associate-locations.ts consumes. Run this whenever the
// source sheet changes; commit the resulting script/data/pd-area-mappings.json.
//
// The sheet is column-per-associate: row 0 holds the associate display names, and
// each column below lists the areas that person covers.
//
//   npx tsx script/build-pd-area-mappings.ts                       # default Downloads path
//   npx tsx script/build-pd-area-mappings.ts "C:\\path\\to\\sheet.xlsx"
//
import * as fs from "fs";
import * as path from "path";
import XLSX from "xlsx";

const DEFAULT_XLSX = "C:\\Users\\Hp\\Downloads\\All areas of Pd team.xlsx";
const SRC = process.argv[2] || DEFAULT_XLSX;
const OUT_DIR = path.resolve(process.cwd(), "script", "data");
const OUT_FILE = path.join(OUT_DIR, "pd-area-mappings.json");

// Normalise a location for de-duplication / conflict checks (not for storage).
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// A cell is dropped when it isn't a usable single area keyword: blanks, the "XXX"
// placeholder, "… mandal villages" region headers, the giant concatenated paragraph
// (very long), and rows carrying parentheses / digits / colons / camel-concatenation
// ("PatnamIncherla") that mark a mashed-together dump rather than one place name.
function isDroppable(t: string): boolean {
  if (!t) return true;
  if (t.toUpperCase() === "XXX") return true;
  if (/mandal\s+village/i.test(t)) return true;
  if (/[()]/.test(t)) return true;
  if (/\d/.test(t)) return true;
  if (/:/.test(t)) return true;
  if (/[a-z][A-Z]/.test(t)) return true;
  if (t.length > 40) return true;
  return false;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Excel not found: ${SRC}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(SRC);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
  const names = (rows[0] || []).map((s: any) => String(s).trim());

  const mapping: Record<string, string[]> = {};
  const dropped: Record<string, string[]> = {};
  const conflicts: Array<{ location: string; keptWith: string; alsoClaimedBy: string }> = [];
  const claimed = new Map<string, string>(); // normalised location -> owning associate

  names.forEach((name, col) => {
    if (!name) return;
    const seenForPerson = new Set<string>();
    const kept: string[] = [];
    const drop: string[] = [];

    for (let r = 1; r < rows.length; r++) {
      const raw = String(rows[r]?.[col] ?? "").replace(/\s+/g, " ").trim();
      if (!raw) continue;
      if (isDroppable(raw)) { drop.push(raw); continue; }

      const key = norm(raw);
      if (seenForPerson.has(key)) continue; // intra-person duplicate
      seenForPerson.add(key);

      const owner = claimed.get(key);
      if (owner && owner !== name) {
        // One location → one associate. First column to claim it wins; record the clash.
        conflicts.push({ location: raw, keptWith: owner, alsoClaimedBy: name });
        continue;
      }
      claimed.set(key, name);
      kept.push(raw);
    }

    mapping[name] = kept;
    if (drop.length) dropped[name] = drop;
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(mapping, null, 2), "utf8");

  console.log(`Source: ${SRC}`);
  console.log(`Wrote:  ${OUT_FILE}\n`);
  console.log("Per-associate area counts (kept / dropped):");
  for (const name of names.filter(Boolean)) {
    console.log(`  ${name}: ${mapping[name].length} kept, ${(dropped[name] || []).length} dropped`);
  }
  const total = Object.values(mapping).reduce((a, b) => a + b.length, 0);
  console.log(`\nTotal kept areas: ${total}`);

  if (conflicts.length) {
    console.log(`\n⚠ ${conflicts.length} cross-associate duplicate location(s) — kept with first, skipped for the rest:`);
    for (const c of conflicts) {
      console.log(`  "${c.location}" → kept: ${c.keptWith}, skipped: ${c.alsoClaimedBy}`);
    }
  }
}

main();
