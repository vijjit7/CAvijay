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
import type { MisEntry } from "@shared/schema";

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

/**
 * Notify an associate that new work has landed in their intray. Fans the push out to
 * all of the associate's device subscriptions and prunes any the push service reports
 * as gone (HTTP 404/410). Never throws — failures are logged, not propagated, so a
 * notification problem can't break the MIS write that triggered it.
 */
export async function notifyAssociateNewWork(associateId: string, entries: MisEntry[]): Promise<void> {
  if (!configured || entries.length === 0) return;

  let subs;
  try {
    subs = await storage.getPushSubscriptionsByAssociate(associateId);
  } catch (err) {
    console.error("[Push] Failed to load subscriptions:", err);
    return;
  }
  if (subs.length === 0) return;

  const count = entries.length;
  const first = entries[0];
  const title = count === 1 ? "New work allocated" : `${count} new cases allocated`;
  const body =
    count === 1
      ? [first.customerName, first.leadId ? `Lead ${first.leadId}` : null]
          .filter(Boolean)
          .join(" · ")
      : `${count} new cases are in your intray`;

  const payload = JSON.stringify({
    title,
    body,
    url: "/mis",
    tag: "mis-new-work",
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          // Subscription expired or the user unsubscribed — drop it.
          await storage.deletePushSubscription(sub.endpoint).catch(() => {});
        } else {
          console.error("[Push] sendNotification failed:", status, err?.body || err?.message || err);
        }
      }
    }),
  );
}
