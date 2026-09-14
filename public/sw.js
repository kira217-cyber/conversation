/* Conversation — service worker
 *
 * This is what makes notifications arrive when the app is closed. The
 * browser's push service wakes this file up; nothing else of ours has to
 * be running. Inside the Android APK the same worker runs, so the
 * notification belongs to the app.
 *
 * The one rule that matters here: a push MUST result in a visible
 * notification. If the handler throws, or finishes without showing one,
 * Chrome puts up "Possible spam" instead — and repeatedly failing gets
 * the site's notification permission taken away. So every path below
 * ends in showNotification(), including the ones where something broke.
 */

const VERSION = "v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Never throws. Falls back through JSON -> text -> nothing at all. */
function readPayload(event) {
  if (!event.data) return {};

  try {
    return event.data.json() || {};
  } catch {
    // Not JSON, or could not be decrypted
  }

  try {
    const text = event.data.text();
    return text ? { body: text } : {};
  } catch {
    // Payload unreadable — still worth telling the person something arrived
    return {};
  }
}

self.addEventListener("push", (event) => {
  const data = readPayload(event);

  const title = typeof data.title === "string" && data.title ? data.title : "Conversation";
  const body = typeof data.body === "string" && data.body ? data.body : "New message";
  const tag = typeof data.tag === "string" && data.tag ? data.tag : "message";
  const url = typeof data.url === "string" && data.url ? data.url : "/chat";

  event.waitUntil(
    (async () => {
      try {
        await self.registration.showNotification(title, {
          body,
          tag,
          // A second message replaces the first rather than stacking
          renotify: true,
          icon: "/icon-192.png",
          badge: "/badge-72.png",
          data: { url },
        });
      } catch (err) {
        console.error("[sw] showNotification failed", VERSION, err);
        // Last resort: the plainest notification the API accepts. Showing
        // something imperfect beats showing nothing and being marked spam.
        try {
          await self.registration.showNotification(title, { body });
        } catch (err2) {
          console.error("[sw] fallback notification failed too", err2);
        }
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/chat";

  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // Already open somewhere? Focus that rather than opening another
      for (const client of list) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      for (const client of list) {
        if ("navigate" in client && "focus" in client) {
          const c = await client.navigate(target);
          return c && c.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

/* The push service can rotate a subscription on its own. When it does,
 * the old endpoint goes dead, so register the new one immediately. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
        if (!applicationServerKey) return;

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
