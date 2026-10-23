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
  const options = {
    body: data.body || "A new case is in your intray.",
    icon: "/favicon.png",
    badge: "/favicon.png",
    tag: data.tag || "mis-new-work",
    renotify: true,
    data: { url: data.url || "/mis" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/mis";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an already-open tab if we have one, navigating it to the intray.
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
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
