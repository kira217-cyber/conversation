/* Conversation — service worker
 *
 * This is what makes notifications arrive when the app is closed.
 * The browser's push service wakes this file up; nothing else of ours
 * has to be running. Inside the Android APK the same worker runs, so
 * the notification belongs to the app.
 */

const VERSION = "v1";

self.addEventListener("install", () => {
  // Take over straight away instead of waiting for every tab to close
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Conversation", body: event.data ? event.data.text() : "New message" };
  }

  const title = data.title || "Conversation";
  const options = {
    body: data.body || "New message",
    tag: data.tag || "message",
    // replace the previous one rather than stacking a pile of them
    renotify: true,
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    vibrate: [90, 50, 90],
    data: { url: data.url || "/chat" },
    silent: !!data.silent,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/chat";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Already open somewhere? Focus that instead of opening another
      for (const client of list) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      for (const client of list) {
        if ("navigate" in client && "focus" in client) {
          return client.navigate(target).then((c) => c && c.focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

/* The push service can rotate a subscription on its own. When that
 * happens the old endpoint stops working, so re-register immediately. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
      if (!applicationServerKey) return;
      try {
        const fresh = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(fresh.toJSON()),
        });
      } catch (err) {
        console.error("[sw] resubscribe failed", VERSION, err);
      }
    })(),
  );
});
