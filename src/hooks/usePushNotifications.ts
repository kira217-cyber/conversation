"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";

export type PushState =
  | "unsupported" // browser cannot do this at all
  | "needs-install" // iOS: only works once added to the Home Screen
  | "denied" // the person said no; only they can undo it
  | "off"
  | "on"
  | "working";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** iOS only allows push once the site has been added to the Home Screen */
function isIosBrowserNotInstalled() {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("off");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState(isIosBrowserNotInstalled() ? "needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

  // Register the worker once; without it nothing else here can run
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      setState(isIosBrowserNotInstalled() ? "needs-install" : "unsupported");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => refresh())
      .catch((err) => {
        console.error("[push] service worker registration failed", err);
        setState("unsupported");
      });
  }, [refresh]);

  const enable = useCallback(async () => {
    setError(null);
    setState("working");

    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Notifications are not configured on the server");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
        }));

      await api("/api/push/subscribe", { method: "POST", json: sub.toJSON() });
      setState("on");
    } catch (err) {
      console.error("[push] enable failed", err);
      setError(err instanceof Error ? err.message : "Could not turn on notifications");
      setState("off");
    }
  }, []);

  const disable = useCallback(async () => {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: "DELETE",
          silent401: true,
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("off");
    }
  }, []);

  const sendTest = useCallback(async () => {
    setError(null);
    try {
      await api("/api/push/test", { method: "POST" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    }
  }, []);

  return { state, error, enable, disable, sendTest, refresh };
}
