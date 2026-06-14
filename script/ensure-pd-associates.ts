// One-off: ensure the PD-team associates from the sheet/roster exist in the local
// store so their areas can be seeded. Idempotent — skips anyone already present
// (matched by username). Names mirror the Associates Management screenshot so the
// location seeder resolves sheet column → associate cleanly.
//
//   npx tsx script/ensure-pd-associates.ts            # preview
//   npx tsx script/ensure-pd-associates.ts --apply    # create missing
//
import "dotenv/config";
import { storage } from "../server/storage";
import { pool } from "../server/db";

const APPLY = process.argv.includes("--apply");

// Verification officers that may be missing from a stale local roster.
const WANTED = [
  { username: "shankar", name: "V .Shankar" },
  { username: "srikanth", name: "srikanth yadav" },
  { username: "anil", name: "Anil" },
  { username: "mahesh", name: "Bolla Mahesh" },
];

async function main() {
  console.log(pool ? "Backend: Postgres" : "Backend: local in-memory dev-state");

  const existing = await storage.getAssociates();
  const haveUsernames = new Set(existing.map((a) => a.username.toLowerCase()));
  const maxNum = existing
    .map((a) => /^A(\d+)$/.exec(a.id)?.[1])
    .filter(Boolean)
    .reduce((m, n) => Math.max(m, parseInt(n as string, 10)), 0);

  let next = maxNum + 1;
  const toCreate = WANTED.filter((w) => !haveUsernames.has(w.username));

  console.log(`Existing: ${existing.length} associates. Missing: ${toCreate.length}`);
  for (const w of toCreate) console.log(`  will create A${next++} ${w.name} (@${w.username})`);

  if (!APPLY) {
    console.log("\nDRY RUN — re-run with --apply to create.");
    return;
  }

  next = maxNum + 1;
  for (const w of toCreate) {
    await storage.createUser({
      id: `A${next++}`,
      username: w.username,
      password: "password123",
      name: w.name,
      role: "Verification Officer",
      avatar: "",
    } as any);
    console.log(`  ✅ created ${w.name}`);
  }
  console.log(`\nDone — created ${toCreate.length} associate(s).`);
}

main()
  .catch((e) => { console.error("Failed:", e?.message || e); process.exitCode = 1; })
  .finally(async () => { await pool?.end().catch(() => {}); });
