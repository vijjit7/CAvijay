// Web Push for the associate PWA.
//
// When new work is auto-allocated to an associate (a pincode match on a freshly
// created MIS case), we send a push notification to every device that associate has
// subscribed. Subscriptions are persisted in the `push_subscriptions` table.
//
// Configuration is entirely via env vars — if the VAPID keys are not set the module
// stays dormant and every entry point here is a safe no-op, so the rest of the app
// (MIS creation, Gmail import) is never affected by push being unconfigured.
//
// Generate a key pair once with:  npx tsx script/generate-vapid-keys.ts
// then set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (and optionally VAPID_SUBJECT).

import webpush from "web-push";
import { storage } from "./storage";
import { geocodeAddress, haversineKm, formatDistance, type LatLng } from "./geocode";
import type { MisEntry, PushSubscription } from "@shared/schema";

const publicKey = process.env.VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";
// Must be a mailto: or https: URL identifying the sender to the push service.
const subject = process.env.VAPID_SUBJECT || "mailto:admin@auditguard.app";

let configured = false;
if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
    console.log("[Push] Web Push configured");
  } catch (err) {
    console.error("[Push] Failed to configure VAPID details:", err);
  }
} else {
  console.log("[Push] VAPID keys not set — push notifications disabled");
}

export function isPushConfigured(): boolean {
  return configured;
}

export function getVapidPublicKey(): string {
  return publicKey;
}

// Outcome of a notify attempt, so callers that want to report back (e.g. a manual
// "send notification" from the admin console) can tell the user what happened.
export type NotifyResult = { devices: number; sent: number; pruned: number };

/**
 * Notify an associate that new work has landed in their intray. Fans the push out to
 * all of the associate's device subscriptions and prunes any the push service reports
 * as gone (HTTP 404/410). Never throws — failures are logged, not propagated, so a
 * notification problem can't break the MIS write that triggered it.
 *
 * Returns how many devices were targeted, how many sends succeeded, and how many dead
 * subscriptions were pruned.
 */
export async function notifyAssociateNewWork(associateId: string, entries: MisEntry[]): Promise<NotifyResult> {
  const empty: NotifyResult = { devices: 0, sent: 0, pruned: 0 };
  if (!configured || entries.length === 0) return empty;

  let subs: PushSubscription[];
  try {
    subs = await storage.getPushSubscriptionsByAssociate(associateId);
  } catch (err) {
    console.error("[Push] Failed to load subscriptions:", err);
    return empty;
  }
  if (subs.length === 0) return empty;

  const count = entries.length;
  const first = entries[0];
  const title = count === 1 ? "New work allocated" : `${count} new cases allocated`;

  // Lead line: who/what the case is. For a single case we also show the address and,
  // per device, the distance from that device's last-known location to the address.
  const headline =
    count === 1
      ? [first.customerName, first.leadId ? `Lead ${first.leadId}` : null]
          .filter(Boolean)
          .join(" · ")
      : `${count} new cases are in your intray`;

  // Geocode the (single) case address once; distance is then computed per device from
  // each subscription's last-known location. null = unconfigured/unresolvable → no
  // distance line, just the address.
  const address = count === 1 ? (first.customerAddress || "").trim() : "";
  const caseLoc: LatLng | null = address ? await geocodeAddress(address) : null;

  // Build this device's notification body: headline, then (for a single case) the
  // address and a "~X km away" line when we have both the case coords and the device's
  // last-known location.
  function bodyFor(sub: (typeof subs)[number]): string {
    const lines = [headline];
    if (count === 1 && address) {
      lines.push(address);
      if (caseLoc && sub.lastLat && sub.lastLng) {
        const lat = parseFloat(sub.lastLat);
        const lng = parseFloat(sub.lastLng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          lines.push(`📍 ${formatDistance(haversineKm({ lat, lng }, caseLoc))}`);
        }
      }
    }
    return lines.join("\n");
  }

  const results = await Promise.all(
    subs.map(async (sub): Promise<{ sent: boolean; pruned: boolean }> => {
      const payload = JSON.stringify({
        title,
        body: bodyFor(sub),
        url: "/mis",
        tag: "mis-new-work",
      });
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        return { sent: true, pruned: false };
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          // Subscription expired or the user unsubscribed — drop it.
          await storage.deletePushSubscription(sub.endpoint).catch(() => {});
          return { sent: false, pruned: true };
        }
        console.error("[Push] sendNotification failed:", status, err?.body || err?.message || err);
        return { sent: false, pruned: false };
      }
    }),
  );

  return {
    devices: subs.length,
    sent: results.filter((r) => r.sent).length,
    pruned: results.filter((r) => r.pruned).length,
  };
}
