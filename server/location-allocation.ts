// Location-based auto-allocation of MIS cases to associates.
//
// Admins map each location (area / branch keyword) to an associate via the MIS
// "Location Mapping" tab. When a new case is created — from the Gmail auto-import,
// a manual entry, or a bulk paste — we look at the case's address and branch and
// hand it to the associate whose location keyword matches. The most specific
// (longest) matching keyword wins, so "kphb" beats "hyderabad"; if two different
// associates tie on keyword length the match is ambiguous and we leave the case
// unassigned for an admin to allocate by hand.

import { storage } from "./storage";
import type { AssociateLocation } from "@shared/schema";

// First whole-word occurrence of `kw` in `hay`, or -1. "Whole word" means the chars
// immediately before/after the match are non-alphanumeric (or the string edge), so
// "uppal" doesn't match inside "wuppals" but "uppal," / " uppal " do. Both strings
// must already be lower-cased.
function boundedIndexOf(hay: string, kw: string): number {
  let from = 0;
  for (;;) {
    const i = hay.indexOf(kw, from);
    if (i < 0) return -1;
    const before = i === 0 ? "" : hay[i - 1];
    const after = i + kw.length >= hay.length ? "" : hay[i + kw.length];
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return i;
    from = i + 1;
  }
}

/**
 * Pick the associate that should handle a case, given the location mappings and the
 * free-text fields to search (address first, then branch). Returns the associate id,
 * or null when nothing matches or the match is genuinely ambiguous.
 *
 * Indian addresses run locality → city, so among all matching location keywords we
 * prefer the one that appears EARLIEST in the address (the specific locality) over a
 * broad city name that happens to be longer (e.g. "ECIL …, Secunderabad" → the ECIL
 * associate, not the Secunderabad one). Ties on position are broken by the longer
 * (more specific) keyword; a dead-even tie between two associates is left unassigned.
 */
export function pickAssociateForLocation(
  mappings: AssociateLocation[],
  ...fields: Array<string | null | undefined>
): string | null {
  const haystack = fields.filter(Boolean).join(" , ").toLowerCase();
  if (!haystack.trim()) return null;

  let best: { associateId: string; pos: number; len: number } | null = null;
  let ambiguous = false;

  for (const m of mappings) {
    const kw = (m.location || "").trim().toLowerCase();
    if (!kw) continue;
    const pos = boundedIndexOf(haystack, kw);
    if (pos < 0) continue;

    if (!best || pos < best.pos || (pos === best.pos && kw.length > best.len)) {
      best = { associateId: m.associateId, pos, len: kw.length };
      ambiguous = false;
    } else if (pos === best.pos && kw.length === best.len && m.associateId !== best.associateId) {
      ambiguous = true;
    }
  }

  if (!best || ambiguous) return null;
  return best.associateId;
}

/**
 * Allocation fields to merge onto a new MIS row when a location matches. Empty
 * object when there is no match, so callers can spread it unconditionally.
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
  location?: string | null;
}): Promise<ReturnType<typeof allocationFields>> {
  if (row.pdPersonId) return {};
  const mappings = await storage.getAssociateLocations();
  if (mappings.length === 0) return {};
  const associates = await storage.getAssociates();
  const nameById = new Map(associates.map((a) => [a.id, a.name]));
  const associateId = pickAssociateForLocation(mappings, row.customerAddress, row.location);
  return allocationFields(associateId, nameById);
}
