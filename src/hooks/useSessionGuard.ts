"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { clearTabSession, getTabSession, setTabSession } from "@/lib/client/device";
import { disconnectPusher } from "@/lib/client/pusher";

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "touchstart",
  "scroll",
  "click",
] as const;

type Options = {
  sessionId: string;
  idleMinutes: number;
  /** শেষ কত মিনিটে সতর্কবার্তা দেখাবে */
  warnBeforeMinutes?: number;
};

/**
 * তিনটা নিরাপত্তার নিয়ম এখানে একসাথে:
 *
 *  1. ট্যাব বন্ধ → পরেরবার খুললে logout   (sessionStorage marker)
 *  2. ট্যাব বন্ধ → সাথে সাথে সার্ভারেও logout (pagehide + sendBeacon)
 *  3. ৩০ মিনিট নিষ্ক্রিয় → logout          (activity timer + heartbeat)
 *
 * মনে রাখবেন: আসল গ্যারান্টিটা সার্ভারে — এই hook শুধু জিনিসটা
 * তাৎক্ষণিক আর স্পষ্ট করে।
 */
export function useSessionGuard({ sessionId, idleMinutes, warnBeforeMinutes = 2 }: Options) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const lastActivity = useRef(Date.now());
  const lastHeartbeat = useRef(0);
  const done = useRef(false);

  const idleMs = idleMinutes * 60_000;
  const warnMs = Math.max(0, idleMs - warnBeforeMinutes * 60_000);

  const logout = useCallback(async (reason: string) => {
    if (done.current) return;
    done.current = true;

    clearTabSession();
    disconnectPusher();
    try {
      await api("/api/auth/logout", { method: "POST", json: { reason }, silent401: true });
    } catch {
      /* যাই হোক, লগইন পেজে পাঠাবই */
    }
    window.location.href = `/login?reason=${reason === "IDLE_TIMEOUT" ? "idle" : "expired"}`;
  }, []);

  /* ── ১. ট্যাব-মার্কার: এই ট্যাবটা কি আগে বন্ধ হয়েছিল? ── */
  useEffect(() => {
    const marker = getTabSession();
    if (!marker) {
      // cookie আছে কিন্তু ট্যাব-মার্কার নেই = ট্যাব বন্ধ করে আবার খোলা হয়েছে
      void logout("TAB_CLOSED");
      return;
    }
    if (marker !== sessionId) {
      // অন্য session-এর মার্কার — নতুন করে বসিয়ে দাও
      setTabSession(sessionId);
    }
  }, [sessionId, logout]);

  /* ── ২. ট্যাব বন্ধ হওয়ার মুহূর্তে সার্ভারকে জানাও ── */
  useEffect(() => {
    function onPageHide(e: PageTransitionEvent) {
      // bfcache-এ গেলে সত্যিকারের বন্ধ নয় — তখন কিছু করা যাবে না
      if (e.persisted || done.current) return;
      clearTabSession();
      navigator.sendBeacon?.("/api/auth/logout", new Blob([], { type: "text/plain" }));
    }
    // beforeunload মোবাইলে অনেক সময় fire করে না, তাই pagehide
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  /* ── ৩. নিষ্ক্রিয়তার হিসাব ── */
  useEffect(() => {
    function touch() {
      lastActivity.current = Date.now();
      setSecondsLeft(null);
    }

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, touch, { passive: true });
    }
    document.addEventListener("visibilitychange", touch);

    const timer = window.setInterval(() => {
      const idleFor = Date.now() - lastActivity.current;

      if (idleFor >= idleMs) {
        void logout("IDLE_TIMEOUT");
        return;
      }

      setSecondsLeft(idleFor >= warnMs ? Math.ceil((idleMs - idleFor) / 1000) : null);

      // heartbeat শুধু তখনই, যখন সত্যিই কিছু করা হয়েছে এবং ট্যাব সামনে আছে।
      // নাহলে session কখনো expire করত না — নিয়মটাই অর্থহীন হয়ে যেত।
      const recentlyActive = idleFor < 60_000;
      const due = Date.now() - lastHeartbeat.current > 60_000;
      if (recentlyActive && due && document.visibilityState === "visible") {
        lastHeartbeat.current = Date.now();
        api("/api/auth/session", { method: "POST", silent401: true }).catch(() => {
          // সার্ভার session বাতিল করে থাকলে পরের API কলেই ধরা পড়বে
        });
      }
    }, 5_000);

    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, touch);
      document.removeEventListener("visibilitychange", touch);
      window.clearInterval(timer);
    };
  }, [idleMs, warnMs, logout]);

  return { secondsLeft, logout };
}
