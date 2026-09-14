"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on every page, not just the chat.
 *
 * This is what receives push messages, and it has to exist before a
 * subscription can be made. Registering it only where the notification
 * toggle lives meant that anyone who landed on the login page — which is
 * where you end up after being signed out — never got one at all.
 *
 * It also re-subscribes silently when permission has already been given,
 * so a subscription that was dropped (reinstall, cleared storage, a push
 * service rotating endpoints) comes back on its own.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    (async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const reg = await navigator.serviceWorker.ready;
        if (cancelled) return;

        // Only act where permission is already granted — asking needs a tap
        if (!("PushManager" in window) || Notification.permission !== "granted") return;

        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          // Make sure the server still knows about it; harmless if it does
          await send(existing);
          return;
        }

        const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!key) return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
        });
        await send(sub);
      } catch (err) {
        console.error("[sw] setup failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

async function send(sub: PushSubscription) {
  try {
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(sub.toJSON()),
    });
  } catch {
    // Signed out, or offline — the toggle in the app will sort it out
  }
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
