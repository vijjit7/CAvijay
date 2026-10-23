// Client-side Web Push helpers for the associate PWA.
//
// Flow: register the service worker (done once at app startup), then — when the
// associate opts in — request notification permission, create a PushSubscription
// using the server's VAPID public key, and POST it to /api/push/subscribe.

export type PushState =
  | "unsupported" // browser lacks service workers / Push API (e.g. iOS Safari < 16.4)
  | "disabled" // server has no VAPID keys configured
  | "denied" // user blocked notifications
  | "default" // not yet asked
  | "subscribed"; // active subscription exists

// VAPID public keys are URL-safe base64; the Push API needs a Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Register the service worker. Safe to call on every load — the browser dedupes.
export async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.error("[Push] Service worker registration failed:", err);
  }
}

async function fetchVapidConfig(): Promise<{ publicKey: string; enabled: boolean }> {
  try {
    const res = await fetch("/api/push/vapid-public-key", { credentials: "include" });
    if (!res.ok) return { publicKey: "", enabled: false };
    return await res.json();
  } catch {
    return { publicKey: "", enabled: false };
  }
}

// Report the current push state for UI (to decide whether to show the opt-in button).
export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  const { enabled } = await fetchVapidConfig();
  if (!enabled) return "disabled";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) return "subscribed";
  } catch {
    /* fall through */
  }
  return Notification.permission === "granted" ? "default" : "default";
}

// Ask for permission, subscribe, and persist the subscription server-side.
export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { ok: false, error: "Notifications aren't supported on this device/browser." };
  }
  const { publicKey, enabled } = await fetchVapidConfig();
  if (!enabled || !publicKey) {
    return { ok: false, error: "Push notifications aren't configured on the server yet." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Notification permission was not granted." };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }));

    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
    });
    if (!res.ok) return { ok: false, error: "Failed to save subscription on the server." };
    return { ok: true };
  } catch (err: any) {
    console.error("[Push] subscribe failed:", err);
    return { ok: false, error: err?.message || "Could not enable notifications." };
  }
}

// Unsubscribe this device and tell the server to drop the row.
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ endpoint }),
    });
  } catch (err) {
    console.error("[Push] unsubscribe failed:", err);
  }
}
