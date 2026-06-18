// Pincode-based auto-allocation of MIS cases to associates.
//
// Admins map each 6-digit pincode to an associate via the "Pincode Mapping" page.
// When a new case is created — from the Gmail auto-import, a manual entry, or a bulk
// paste — we pull the pincode out of the case's customer address and hand the case to
// the associate who owns that pincode. The MIS feed has no dedicated pincode column,
// so we scan the free-text address for a 6-digit code and look it up in the map. If no
// mapped pincode appears in the address the case is left unassigned for an admin.

import { storage } from "./storage";
import type { AssociateLocation } from "@shared/schema";

// Every 6-digit run in `text` that is not part of a longer digit sequence (so a 10-digit
// phone number won't yield a false "pincode"). Returns them in the order they appear.
function extractPincodes(text: string): string[] {
  return text.match(/(?<!\d)\d{6}(?!\d)/g) ?? [];
}

/**
 * Pick the associate that should handle a case, given the pincode mappings and the
 * free-text fields to search (the customer address). Returns the associate id, or null
 * when no mapped pincode is found.
 *
 * A pincode belongs to exactly one associate (enforced when the mapping is created), so
 * there is no ambiguity: we take the first mapped pincode that appears in the address.
 */
export function pickAssociateForPincode(
  mappings: AssociateLocation[],
  ...fields: Array<string | null | undefined>
): string | null {
  const byPincode = new Map<string, string>();
  for (const m of mappings) {
    const pin = (m.pincode || "").trim();
    if (pin && !byPincode.has(pin)) byPincode.set(pin, m.associateId);
  }
  if (byPincode.size === 0) return null;

  const haystack = fields.filter(Boolean).join(" ");
  for (const pin of extractPincodes(haystack)) {
    const associateId = byPincode.get(pin);
    if (associateId) return associateId;
  }
  return null;
}

/**
 * Allocation fields to merge onto a new MIS row when a pincode matches. Empty object
 * when there is no match, so callers can spread it unconditionally.
 */
export function allocationFields(
  associateId: string | null,
  nameById: Map<string, string>,
): Partial<{
  pdPersonId: string;
  pdPerson: string | null;
  workflowStatus: string;
  assignedAt: Date;
}> {
  if (!associateId) return {};
  return {
    pdPersonId: associateId,
    pdPerson: nameById.get(associateId) ?? null,
    workflowStatus: "assigned",
    assignedAt: new Date(),
  };
}

/**
 * Convenience for callers that create a single row and don't want to pre-load the
 * mappings/name map themselves. Returns the allocation fields (possibly empty).
 * Never overrides an already-assigned case.
 */
export async function resolveAllocation(row: {
  pdPersonId?: string | null;
  customerAddress?: string | null;
}): Promise<ReturnType<typeof allocationFields>> {
  if (row.pdPersonId) return {};
  const mappings = await storage.getAssociateLocations();
  if (mappings.length === 0) return {};
  const associates = await storage.getAssociates();
  const nameById = new Map(associates.map((a) => [a.id, a.name]));
  // Don't route to associates who are on leave — drop their pincodes from the pool.
  const onLeave = new Set(associates.filter((a) => a.onLeave).map((a) => a.id));
  const active = mappings.filter((m) => !onLeave.has(m.associateId));
  const associateId = pickAssociateForPincode(active, row.customerAddress);
  return allocationFields(associateId, nameById);
}
