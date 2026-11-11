// Gmail → MIS cancellation sweep.
//
// Companion to mis-auto-import.ts. Where that pulls "New PD Assigned" emails into the
// intray, this watches for cancellation emails — subjects like "Cancel the case",
// "Cancel the PD", "Customer withdrawn", "Cancel the Lead ID", "Cancel with Lead ID",
// or "Ignore this PD" (same intent, different wording).
// For every live MIS case whose Lead ID is referenced by such an email we flip the case
// to Cancelled, drop it out of the associate's intray, and fire a "Case cancelled" alert
// (same beep/buzz as a new allocation) to the associate who was handling it.
//
// The sweep is idempotent: once a case is Cancelled (workflowStatus 'completed') it no
// longer qualifies as "live", so re-running never double-processes or re-notifies.

import { fetchCancellationEmails, isCancellationEmail } from "./gmail";
import { storage } from "./storage";
import { notifyAssociateCancelled } from "./push";
import type { MisEntry } from "@shared/schema";

export interface CancelScanSummary {
  cancelled: number;
  notified: number;
  emailCount: number;
  message: string;
}

// A case is "live" (still in someone's intray) when it hasn't already been completed or
// cancelled. These are the only rows a cancellation email can act on.
function isLive(entry: MisEntry): boolean {
  return entry.workflowStatus !== "completed" && entry.status !== "Cancelled";
}

// Does the email text reference this exact Lead ID? Bounded match (no substring false
// positives) and case-insensitive, since Lead IDs are quoted inconsistently in replies.
function textReferencesLead(text: string, leadId: string): boolean {
  const id = (leadId || "").trim();
  if (id.length < 4) return false; // too short to match safely
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i").test(text);
}

// Scan recent cancellation emails and cancel every matching live MIS case.
export async function scanAndCancelFromEmails(opts: { daysBack?: number } = {}): Promise<CancelScanSummary> {
  const daysBack = opts.daysBack ?? 7;

  const emails = await fetchCancellationEmails(daysBack);
  if (emails.length === 0) {
    return { cancelled: 0, notified: 0, emailCount: 0, message: "No cancellation emails found" };
  }

  // Candidate cases: everything still live. One DB read; the matching is in-memory.
  const allEntries = await storage.getMisEntries();
  const liveEntries = allEntries.filter(isLive);
  if (liveEntries.length === 0) {
    return { cancelled: 0, notified: 0, emailCount: emails.length, message: "No live cases to cancel" };
  }

  // Pair each live case with the first cancellation email that references its Lead ID.
  const toCancel: { entry: MisEntry; email: (typeof emails)[number] }[] = [];
  for (const entry of liveEntries) {
    const match = emails.find((e) => isCancellationEmail(e.subject, e.text) && textReferencesLead(e.text, entry.leadId));
    if (match) toCancel.push({ entry, email: match });
  }

  if (toCancel.length === 0) {
    return {
      cancelled: 0,
      notified: 0,
      emailCount: emails.length,
      message: `Scanned ${emails.length} cancellation emails; no live case matched`,
    };
  }

  // Cancel each matched case and remove it from the intray. Group the cancelled rows by
  // the associate handling them (pdPersonId) so we can send one alert per associate.
  const byAssociate = new Map<string, MisEntry[]>();
  let cancelled = 0;
  for (const { entry, email } of toCancel) {
    const updated = await storage.updateMisEntry(entry.id, {
      status: "Cancelled",
      workflowStatus: "completed",
      availabilityNote: `Cancelled via email: "${email.subject.slice(0, 120)}"`,
    });
    cancelled++;
    console.log(`[MIS Cancel] Lead ${entry.leadId} (id ${entry.id}) cancelled — subject: "${email.subject.slice(0, 80)}"`);

    const associate = entry.pdPersonId;
    if (associate) {
      const bucket = byAssociate.get(associate);
      if (bucket) bucket.push(updated ?? entry);
      else byAssociate.set(associate, [updated ?? entry]);
    }
  }

  // Alert each concerned associate (same beep/buzz as a new allocation).
  let notified = 0;
  for (const [associate, entries] of byAssociate) {
    try {
      const res = await notifyAssociateCancelled(associate, entries);
      notified += res.sent;
    } catch (err) {
      console.error(`[MIS Cancel] notify associate ${associate} failed:`, err);
    }
  }

  return {
    cancelled,
    notified,
    emailCount: emails.length,
    message: `Cancelled ${cancelled} case(s) from ${emails.length} cancellation email(s)`,
  };
}
