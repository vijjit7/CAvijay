// Service worker for the AuditGuard associate PWA.
//
// Responsibilities:
//   1. Receive Web Push messages and show a notification (new work allocated).
//   2. On notification click, focus an existing app window or open the intray.
//
// It deliberately does NOT cache app assets — the app is online-only, and an
// aggressive cache here would risk serving stale builds. Keep it minimal.

self.addEventListener("install", () => {
  // Activate this worker immediately rather than waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: "New work allocated", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "New work allocated";
  const body = data.body || "A new case is in your intray.";
  const options = {
    body,
    icon: "/favicon.png",
    badge: "/favicon.png",
    tag: data.tag || "mis-new-work",
    renotify: true,
    // Keep the notification on screen until the associate acts on it, rather than
    // auto-dismissing after a few seconds — this is the closest a background PWA can
    // get to "alarm until noticed" (a service worker can't play a looping sound).
    requireInteraction: true,
    // Strong, attention-grabbing buzz. (Honoured on Android Chrome; ignored where the
    // platform doesn't support notification vibration.)
    vibrate: data.vibrate || [600, 300, 600, 300, 600, 300, 600],
    data: { url: data.url || "/mis" },
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // If the app is already open, tell it to start the in-app ringing alarm now —
      // the service worker itself can't play audio, but a live window can.
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        client.postMessage({ type: "new-work", body });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const baseUrl = (event.notification.data && event.notification.data.url) || "/mis";
  // Carry an "alarm" flag so the app starts ringing the moment it's focused/opened
  // from the notification, and keeps ringing until the associate silences it.
  const targetUrl = baseUrl + (baseUrl.includes("?") ? "&" : "?") + "alarm=1";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an already-open tab if we have one, navigating it to the intray.
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          client.postMessage({ type: "new-work" });
          return client.focus();
        }
      }
      // Otherwise open a new window.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
