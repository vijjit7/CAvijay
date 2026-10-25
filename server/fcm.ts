// Firebase Cloud Messaging sender for the native Android app.
//
// The native app receives DATA-only messages so our own code runs even when the app is
// killed or the phone is locked — that's what lets it ring the full-screen alarm (see
// android/.../AlarmMessagingService). Notification-type messages would be handled by the
// OS and wouldn't trigger the alarm when backgrounded, so we never send those.
//
// Configuration is via a service-account key, provided EITHER as:
//   • FIREBASE_SERVICE_ACCOUNT  — the service-account JSON, inline (recommended on
//     Railway: paste the whole JSON as the value); or
//   • GOOGLE_APPLICATION_CREDENTIALS — a path to the JSON file.
// When neither is set the module stays dormant and every entry point is a safe no-op,
// exactly like the Web Push module when VAPID keys are missing.

import type { App } from "firebase-admin/app";

let app: App | null = null;
let configured = false;
let initError: string | null = null;

async function ensureApp(): Promise<App | null> {
  if (app) return app;
  if (initError) return null;

  try {
    const { initializeApp, cert, applicationDefault, getApps } = await import("firebase-admin/app");

    // Reuse an already-initialised default app if one exists (hot reload / repeated import).
    const existing = getApps();
    if (existing.length > 0) {
      app = existing[0];
      configured = true;
      return app;
    }

    const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (inline) {
      const serviceAccount = JSON.parse(inline);
      app = initializeApp({ credential: cert(serviceAccount) });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      app = initializeApp({ credential: applicationDefault() });
    } else {
      initError = "no credentials";
      console.log("[FCM] No service account set — native push disabled");
      return null;
    }

    configured = true;
    console.log("[FCM] Firebase Admin configured");
    return app;
  } catch (err: any) {
    initError = err?.message || String(err);
    console.error("[FCM] Failed to initialise Firebase Admin:", initError);
    return null;
  }
}

export function isFcmConfigured(): boolean {
  // Best-effort synchronous hint for diagnostics; real init happens lazily on first send.
  return configured || !!process.env.FIREBASE_SERVICE_ACCOUNT || !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

export type FcmSendResult = { sent: boolean; invalidToken: boolean };

/**
 * Send a "new work" data message to one native device token. Never throws — returns
 * whether it was sent and whether the token is dead (so the caller can prune it).
 * `invalidToken` is true for UNREGISTERED / invalid-argument errors from FCM.
 */
export async function sendNewWorkMessage(
  token: string,
  payload: { title: string; body: string },
): Promise<FcmSendResult> {
  const a = await ensureApp();
  if (!a) return { sent: false, invalidToken: false };

  try {
    const { getMessaging } = await import("firebase-admin/messaging");
    await getMessaging(a).send({
      token,
      // DATA-only (no `notification` block) so AlarmMessagingService always runs.
      data: {
        type: "new-work",
        title: payload.title,
        body: payload.body,
      },
      android: {
        priority: "high",
      },
    });
    return { sent: true, invalidToken: false };
  } catch (err: any) {
    const code = err?.errorInfo?.code || err?.code || "";
    const invalidToken =
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token" ||
      code === "messaging/invalid-argument";
    if (!invalidToken) {
      console.error("[FCM] send failed:", code || err?.message || err);
    }
    return { sent: false, invalidToken };
  }
}
