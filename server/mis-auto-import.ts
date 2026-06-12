import { importWorkAllocationEmails } from "./gmail";
import { isGmailOAuthConfigured } from "./gmail-oauth";
import { storage } from "./storage";

// Default owner for auto-imported work. Entries land under ADMIN with the schema
// default workflowStatus 'unassigned', so they appear in the in-tray for an admin
// to assign a PD person — mirroring the manual paste flow.
const DEFAULT_OWNER_ID = "ADMIN";

export interface GmailImportSummary {
  added: number;
  skipped: number;
  emailCount: number;
  message: string;
}

// Is any Gmail read path available? Standard OAuth (any host) or the Replit
// connector (only on Replit). Used to skip the scheduler when nothing is wired up.
export function isGmailReadAvailable(): boolean {
  if (isGmailOAuthConfigured()) return true;
  const onReplit = !!(
    process.env.REPLIT_CONNECTORS_HOSTNAME &&
    (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL)
  );
  return onReplit;
}

// Shared pipeline used by both the manual route and the scheduler: read work
// allocation emails, map to MIS rows, drop Lead IDs already present (new work
// only), assign serial numbers, and bulk-insert.
export async function importGmailWorkAllocations(opts: {
  ownerId?: string;
  daysBack?: number;
} = {}): Promise<GmailImportSummary> {
  const ownerId = opts.ownerId || DEFAULT_OWNER_ID;
  const daysBack = opts.daysBack ?? 7;

  const importResult = await importWorkAllocationEmails(daysBack);
  if (!importResult.success) {
    return { added: 0, skipped: 0, emailCount: importResult.emailCount, message: importResult.message };
  }
  if (importResult.entries.length === 0) {
    return { added: 0, skipped: 0, emailCount: importResult.emailCount, message: importResult.message };
  }

  // Map parsed entries to MIS rows (same shape as POST /api/mis/import-gmail).
  const misRows = importResult.entries.map((entry) => ({
    leadId: entry.leadId,
    customerName: entry.customerName,
    businessName: entry.businessName,
    contactDetails: entry.mobileNumber,
    customerAddress: entry.address,
    inDate: entry.initiationDate,
    outDate: null,
    initiatedPerson: entry.initiatedPerson,
    product: entry.product,
    workNature: entry.workNature ?? null,
    pdPerson: null,
    pdTyping: null,
    location: entry.branch,
    status: "Pending",
  }));

  // New work only: skip Lead IDs already in MIS.
  const uniqueRows = [];
  for (const row of misRows) {
    const existing = await storage.getMisEntryByLeadId(row.leadId);
    if (!existing) uniqueRows.push(row);
  }

  if (uniqueRows.length === 0) {
    return {
      added: 0,
      skipped: misRows.length,
      emailCount: importResult.emailCount,
      message: `All ${misRows.length} entries already exist in MIS`,
    };
  }

  let nextSno = await storage.getNextMisSno();
  const entriesWithSno = uniqueRows.map((row) => ({
    ...row,
    associateId: ownerId,
    sno: nextSno++,
  }));

  const inserted = await storage.createMisEntriesBulk(entriesWithSno);

  return {
    added: inserted.length,
    skipped: misRows.length - uniqueRows.length,
    emailCount: importResult.emailCount,
    message: `Imported ${inserted.length} new entries from ${importResult.emailCount} emails`,
  };
}

// ────────────────────────── Background scheduler ──────────────────────────

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

async function runOnce(): Promise<void> {
  if (running) {
    console.log("[MIS Auto-Import] Previous run still in progress, skipping this tick");
    return;
  }
  if (!isGmailReadAvailable()) {
    console.log("[MIS Auto-Import] Gmail not configured (set GMAIL_CLIENT_ID/SECRET/TOKEN), skipping");
    return;
  }
  running = true;
  try {
    const daysBack = parseInt(process.env.MIS_AUTO_IMPORT_DAYS_BACK || "2", 10);
    const summary = await importGmailWorkAllocations({ daysBack });
    console.log(
      `[MIS Auto-Import] ${summary.added} added, ${summary.skipped} skipped, ` +
        `from ${summary.emailCount} emails`,
    );
  } catch (err: any) {
    console.error("[MIS Auto-Import] Run failed:", err?.message || err);
  } finally {
    running = false;
  }
}

// Start the periodic Gmail → MIS import. Enabled by default whenever Gmail is
// configured; disable with MIS_AUTO_IMPORT_ENABLED=false. Interval is
// MIS_AUTO_IMPORT_INTERVAL_MIN minutes (default 15).
export function startMisAutoImport(): void {
  const enabled = (process.env.MIS_AUTO_IMPORT_ENABLED ?? "true").toLowerCase() !== "false";
  if (!enabled) {
    console.log("[MIS Auto-Import] Disabled via MIS_AUTO_IMPORT_ENABLED=false");
    return;
  }
  if (!isGmailReadAvailable()) {
    console.log("[MIS Auto-Import] Gmail not configured — scheduler not started");
    return;
  }
  if (timer) return; // already started

  const intervalMin = Math.max(1, parseInt(process.env.MIS_AUTO_IMPORT_INTERVAL_MIN || "15", 10));
  console.log(`[MIS Auto-Import] Scheduler started — every ${intervalMin} min`);

  // First run shortly after boot, then on the interval.
  setTimeout(() => { void runOnce(); }, 30_000);
  timer = setInterval(() => { void runOnce(); }, intervalMin * 60_000);
}
