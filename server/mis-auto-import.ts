import { importWorkAllocationEmails } from "./gmail";
import { isGmailOAuthConfigured } from "./gmail-oauth";
import { storage } from "./storage";
import { pickAssociateForLocation, allocationFields } from "./location-allocation";

// Default owner for auto-imported work. Entries land under ADMIN with the schema
// default workflowStatus 'unassigned', so they appear in the in-tray for an admin
// to assign a PD person — mirroring the manual paste flow.
const DEFAULT_OWNER_ID = "ADMIN";

const MONTH_NUM: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Month bucket ("YYYY-MM") for an MIS in-date string, mirroring the client's
// getMonthYearKey so the server dedups work into the same months the UI shows.
// Handles "DD-MMM-YYYY" (auto-import), "DD/MM/YYYY" and "YYYY-MM-DD" (manual).
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

// Normalize a customer name for comparison (case/whitespace-insensitive).
function normalizeName(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export interface GmailImportSummary {
  added: number;
  updated: number;
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
    return { added: 0, updated: 0, skipped: 0, emailCount: importResult.emailCount, message: importResult.message };
  }
  if (importResult.entries.length === 0) {
    return { added: 0, updated: 0, skipped: 0, emailCount: importResult.emailCount, message: importResult.message };
  }

  // Map parsed entries to MIS rows (same shape as POST /api/mis/import-gmail).
  const misRows = importResult.entries.map((entry) => ({
    leadId: entry.leadId,
    customerName: entry.customerName,
    businessName: entry.businessName,
    contactDetails: entry.mobileNumber,
    customerAddress: entry.address,
    // In-date = the date the "New PD Assigned" email was received, so work is bucketed
    // by the month it was actually assigned. Fall back to the email's initiation date
    // if the received timestamp is somehow unavailable.
    inDate: entry.receivedDate ?? entry.initiationDate,
    outDate: null,
    initiatedPerson: entry.initiatedPerson,
    product: entry.product,
    workNature: entry.workNature ?? null,
    pdPerson: null,
    pdTyping: null,
    location: entry.branch,
    status: "Pending",
  }));

  // Split into genuinely new rows vs. already-imported work. A Piramal Lead ID is
  // reused across customers (co-applicants) and re-assigned in later months, so the
  // Lead ID alone is NOT a unique key. An incoming row is a duplicate only when the
  // same lead + same customer + same in-date month already exists; a different
  // customer, or the same customer re-assigned in a new month, is genuinely new work.
  // For a same-month match that was auto-imported and is still unassigned, self-heal
  // the in-date to the email's received date (correcting the day within the month
  // only — never moving an entry across months, which previously dragged an old
  // month's entry into the current one).
  const uniqueRows = [];
  let updated = 0;
  for (const row of misRows) {
    const existingForLead = await storage.getMisEntriesByLeadId(row.leadId);
    const rowMonth = monthKey(row.inDate);
    const rowName = normalizeName(row.customerName);
    const sameWork = existingForLead.find(
      (e) => normalizeName(e.customerName) === rowName && monthKey(e.inDate) === rowMonth,
    );
    if (!sameWork) {
      uniqueRows.push(row);
      continue;
    }
    const isAutoUnassigned =
      sameWork.associateId === ownerId && (sameWork as any).workflowStatus === "unassigned";
    if (isAutoUnassigned && row.inDate && sameWork.inDate !== row.inDate) {
      await storage.updateMisEntry(sameWork.id, { inDate: row.inDate });
      updated++;
    }
  }

  if (uniqueRows.length === 0) {
    return {
      added: 0,
      updated,
      skipped: misRows.length - updated,
      emailCount: importResult.emailCount,
      message:
        updated > 0
          ? `Updated in-date on ${updated} existing entries; no new entries`
          : `All ${misRows.length} entries already exist in MIS`,
    };
  }

  // Auto-allocate each new case to the associate whose mapped location matches its
  // address / branch. Load the mapping + associate names once for the whole batch.
  const locationMappings = await storage.getAssociateLocations();
  const associates = await storage.getAssociates();
  const nameById = new Map(associates.map((a) => [a.id, a.name]));

  let nextSno = await storage.getNextMisSno();
  const entriesWithSno = uniqueRows.map((row) => ({
    ...row,
    ...allocationFields(
      pickAssociateForLocation(locationMappings, row.customerAddress, row.location),
      nameById,
    ),
    associateId: ownerId,
    sno: nextSno++,
  }));

  const inserted = await storage.createMisEntriesBulk(entriesWithSno);

  return {
    added: inserted.length,
    updated,
    skipped: misRows.length - uniqueRows.length - updated,
    emailCount: importResult.emailCount,
    message:
      `Imported ${inserted.length} new entries from ${importResult.emailCount} emails` +
      (updated > 0 ? `; updated in-date on ${updated} existing` : ""),
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
      `[MIS Auto-Import] ${summary.added} added, ${summary.updated} updated, ${summary.skipped} skipped, ` +
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
