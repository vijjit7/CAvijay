// Seed the associate ↔ location map from script/data/pd-area-mappings.json
// (produced by build-pd-area-mappings.ts from the PD-team Excel).
//
// It resolves each sheet display-name to a real associate AT RUNTIME, so the sheet's
// names ("V .Shankar", "Bolla Mahesh") line up with whatever the live roster calls them.
//
// TWO BACKENDS — pick the one that can see your real roster:
//
//   • Storage (default): talks straight to the app's store. Use this where
//     DATABASE_URL is set (production / Postgres). In local in-memory dev it only
//     sees the persisted roster (often stale), so prefer HTTP mode there.
//
//   • HTTP (--http <baseUrl>): logs into a RUNNING server as admin and seeds through
//     the API. This is the only way to reach a local in-memory server's live roster
//     (associates added through the UI live in that process's memory).
//
// DRY RUN by default — prints the resolution + plan without writing. Add --apply.
//
//   npx tsx script/seed-associate-locations.ts                                  # storage, preview
//   npx tsx script/seed-associate-locations.ts --apply                          # storage, write
//   npx tsx script/seed-associate-locations.ts --http http://localhost:5000     # HTTP, preview
//   npx tsx script/seed-associate-locations.ts --http http://localhost:5000 --apply
//
// Admin creds for HTTP mode: --user / --pass flags, or SEED_ADMIN_USER /
// SEED_ADMIN_PASS env, default username "admin".
//
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";

const APPLY = process.argv.includes("--apply");
const DATA_FILE = path.resolve(process.cwd(), "script", "data", "pd-area-mappings.json");

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const HTTP_BASE = flag("--http");

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type Assoc = { id: string; name: string; username: string };

// Resolve a sheet display-name to one associate: exact normalised name → username as a
// token in the sheet name → shared name token. null if none; throws if ambiguous.
function resolveAssociate(sheetName: string, associates: Assoc[]): Assoc | null {
  const n = norm(sheetName);
  const nTokens = new Set(n.split(" ").filter(Boolean));

  const exact = associates.filter((a) => norm(a.name) === n);
  if (exact.length === 1) return exact[0];

  const byUsername = associates.filter((a) => a.username && nTokens.has(a.username.toLowerCase()));
  if (byUsername.length === 1) return byUsername[0];

  const byToken = associates.filter((a) =>
    norm(a.name).split(" ").filter((t) => t.length > 2).some((t) => nTokens.has(t)),
  );
  if (byToken.length === 1) return byToken[0];

  if (exact.length > 1 || byUsername.length > 1 || byToken.length > 1) {
    const cands = (exact.length ? exact : byUsername.length ? byUsername : byToken)
      .map((a) => `${a.name} (${a.id})`).join(", ");
    throw new Error(`ambiguous match for "${sheetName}": ${cands}`);
  }
  return null;
}

// ── Backend abstraction ──────────────────────────────────────────────────────
type Backend = {
  label: string;
  getAssociates(): Promise<Assoc[]>;
  getExistingLocations(): Promise<string[]>;
  insert(associateId: string, location: string): Promise<void>;
  close(): Promise<void>;
};

async function storageBackend(): Promise<Backend> {
  const { storage } = await import("../server/storage");
  const { pool } = await import("../server/db");
  return {
    label: pool ? "Storage / Postgres (DATABASE_URL set)" : "Storage / local in-memory dev-state",
    async getAssociates() {
      return (await storage.getAssociates()).map((a) => ({ id: a.id, name: a.name, username: a.username }));
    },
    async getExistingLocations() {
      return (await storage.getAssociateLocations()).map((r) => r.location);
    },
    async insert(associateId, location) {
      await storage.createAssociateLocation({ associateId, location });
    },
    async close() { await pool?.end().catch(() => {}); },
  };
}

async function httpBackend(base: string): Promise<Backend> {
  const root = base.replace(/\/$/, "");
  const username = flag("--user") || process.env.SEED_ADMIN_USER || "admin";
  const password = flag("--pass") || process.env.SEED_ADMIN_PASS;
  if (!password) {
    throw new Error("HTTP mode needs the admin password — pass --pass <pwd> or set SEED_ADMIN_PASS.");
  }

  const loginRes = await fetch(`${root}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!loginRes.ok) {
    throw new Error(`Login failed (${loginRes.status}) for user "${username}" — check creds.`);
  }
  const setCookie = loginRes.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : "";
  if (!cookie) throw new Error("Login succeeded but no session cookie returned.");

  const authed = (p: string, init: RequestInit = {}) =>
    fetch(`${root}${p}`, { ...init, headers: { ...(init.headers || {}), Cookie: cookie } });

  return {
    label: `HTTP ${root} (as ${username})`,
    async getAssociates() {
      const res = await authed("/api/associates");
      if (!res.ok) throw new Error(`GET /api/associates failed (${res.status})`);
      return (await res.json()).map((a: any) => ({ id: a.id, name: a.name, username: a.username }));
    },
    async getExistingLocations() {
      const res = await authed("/api/associate-locations");
      if (!res.ok) return [];
      return (await res.json()).map((r: any) => r.location);
    },
    async insert(associateId, location) {
      const res = await authed("/api/associate-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ associateId, location }),
      });
      if (!res.ok && res.status !== 409) {
        const t = await res.text().catch(() => "");
        throw new Error(`POST location "${location}" failed (${res.status}) ${t}`);
      }
    },
    async close() {},
  };
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Missing ${DATA_FILE}. Run: npx tsx script/build-pd-area-mappings.ts`);
    process.exit(1);
  }
  const mapping: Record<string, string[]> = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  const backend = HTTP_BASE ? await httpBackend(HTTP_BASE) : await storageBackend();
  try {
    console.log(`Backend: ${backend.label}\n`);

    const associates = await backend.getAssociates();
    console.log(`Roster: ${associates.length} associates — ${associates.map((a) => a.name).join(", ")}\n`);

    const existingKeys = new Set((await backend.getExistingLocations()).map((l) => l.trim().toLowerCase()));

    const unmatched: string[] = [];
    const plan: Array<{ associate: Assoc; location: string }> = [];
    let skippedExisting = 0;

    console.log("Resolved sheet → associate:");
    for (const [sheetName, locations] of Object.entries(mapping)) {
      if (!locations.length) { console.log(`  ${sheetName}: (no areas — skipped)`); continue; }
      let assoc: Assoc | null = null;
      try {
        assoc = resolveAssociate(sheetName, associates);
      } catch (e: any) {
        console.warn(`  ${sheetName} → ⚠ ${e.message}`);
        continue;
      }
      console.log(`  ${sheetName} → ${assoc ? `${assoc.name} (${assoc.id})` : "NO MATCH"}`);
      if (!assoc) { unmatched.push(`${sheetName} (${locations.length} areas)`); continue; }
      for (const loc of locations) {
        if (existingKeys.has(loc.trim().toLowerCase())) { skippedExisting++; continue; }
        plan.push({ associate: assoc, location: loc });
      }
    }

    if (unmatched.length) {
      console.log(`\n⚠ Unmatched sheet names (no associate in this roster):\n  ${unmatched.join("\n  ")}`);
    }
    console.log(`\nPlan: ${plan.length} new mappings to insert, ${skippedExisting} already present (skipped).`);

    if (!APPLY) {
      console.log("\nDRY RUN — nothing written. Re-run with --apply to insert.");
      return;
    }

    let inserted = 0;
    for (const { associate, location } of plan) {
      await backend.insert(associate.id, location);
      inserted++;
      if (inserted % 50 === 0) console.log(`  …${inserted}/${plan.length}`);
    }
    console.log(`\n✅ Inserted ${inserted} location mappings.`);
  } finally {
    await backend.close();
  }
}

main().catch((err) => { console.error("Seed failed:", err?.message || err); process.exitCode = 1; });
