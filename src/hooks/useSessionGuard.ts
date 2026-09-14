"use client";

import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/client/api";
import {
  clearTabSession,
  getTabSession,
  isInstalledApp,
  setTabSession,
} from "@/lib/client/device";
import { disconnectPusher } from "@/lib/client/pusher";

/** How often "I am still here" goes out */
const HEARTBEAT_MS = 60_000;

type Options = {
  sessionId: string;
};

/**
 * Two rules, and which pair applies depends on where the app is running.
 *
 *   In a browser tab
 *     tab open   → stays signed in, for as long as it is open
 *     tab closed → signed out
 *
 *   In the installed app (APK / Home Screen)
 *     stays signed in, like any other app on the phone
 *
 * The split matters. Android destroys the web view whenever the app goes
 * to the background, which wipes sessionStorage — indistinguishable from
 * the tab being closed. Applying the browser rule there signed the person
 * out every single time they switched apps.
 */
export function useSessionGuard({ sessionId }: Options) {
  const done = useRef(false);
  const installed = useRef(false);

  const logout = useCallback(async (reason: string) => {
    if (done.current) return;
    done.current = true;

    clearTabSession();
    disconnectPusher();
    try {
      await api("/api/auth/logout", { method: "POST", json: { reason }, silent401: true });
    } catch {
      /* head for the login page regardless */
    }
    window.location.href = `/login?reason=${reason === "TAB_CLOSED" ? "tab-closed" : "expired"}`;
  }, []);

  /* ── 1. Was this tab closed and reopened? (browser only) ── */
  useEffect(() => {
    installed.current = isInstalledApp();
    if (installed.current) {
      // Mark it anyway, so the app keeps working if it is later opened in a tab
      setTabSession(sessionId);
      return;
    }

    const marker = getTabSession();
    if (!marker) {
      // Cookie present but no tab marker = the tab was closed and reopened
      void logout("TAB_CLOSED");
      return;
    }
    if (marker !== sessionId) setTabSession(sessionId);
  }, [sessionId, logout]);

  /* ── 2. Tell the server the moment the tab closes (browser only) ── */
  useEffect(() => {
    if (isInstalledApp()) return;

    function onPageHide(e: PageTransitionEvent) {
      // bfcache is not a real close — coming back should just resume
      if (e.persisted || done.current) return;
      clearTabSession();
      navigator.sendBeacon?.("/api/auth/logout", new Blob([], { type: "text/plain" }));
    }
    // beforeunload often does not fire on mobile, so pagehide
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  /* ── 3. Heartbeat while open ── */
  useEffect(() => {
    let last = 0;

    const beat = (force = false) => {
      if (done.current) return;
      const now = Date.now();
      if (!force && now - last < HEARTBEAT_MS - 5_000) return;
      last = now;
      api("/api/auth/session", { method: "POST", silent401: true }).catch(() => {
        // offline, or the session is gone — the next real request will say so
      });
    };

    beat(true);

    const timer = window.setInterval(() => beat(), HEARTBEAT_MS);

    // Background tabs get their timers slowed right down, so send one
    // the moment we are back in front of the person.
    const onVisible = () => {
      if (document.visibilityState === "visible") beat(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, []);

  return { logout };
}
