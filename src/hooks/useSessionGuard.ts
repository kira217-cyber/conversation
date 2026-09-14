"use client";

import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/client/api";
import { clearTabSession, getTabSession, setTabSession } from "@/lib/client/device";
import { disconnectPusher } from "@/lib/client/pusher";

/** কত পরপর "আমি এখনো আছি" বার্তা যাবে */
const HEARTBEAT_MS = 60_000;

type Options = {
  sessionId: string;
};

/**
 * নিয়ম দুটো, আর দুটোই সহজ:
 *
 *   ট্যাব খোলা আছে  →  লগইন থাকবে। যত ঘণ্টাই হোক।
 *   ট্যাব বন্ধ হলো   →  লগআউট।
 *
 * কীভাবে: ট্যাব খোলা থাকলে প্রতি মিনিটে একটা heartbeat যায় — এটাই
 * "আমি সাইটে আছি" এর প্রমাণ। মাউস নড়ছে কিনা সেটা দেখা হয় না, কারণ
 * ফোনে চ্যাট পড়তে থাকলে কোনো ইভেন্টই হয় না।
 *
 * ট্যাব বন্ধ হলে heartbeat থেমে যায়। সার্ভারের ৩০ মিনিটের মেয়াদ তখন
 * নিরাপত্তার জাল হিসেবে কাজ করে — beacon পৌঁছাক বা না পৌঁছাক
 * (ব্রাউজার ক্র্যাশ, ল্যাপটপ ঘুমিয়ে যাওয়া), session আপনাআপনি মরে যায়।
 */
export function useSessionGuard({ sessionId }: Options) {
  const done = useRef(false);

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
    window.location.href = `/login?reason=${reason === "TAB_CLOSED" ? "tab-closed" : "expired"}`;
  }, []);

  /* ── ১. এই ট্যাবটা কি আগে বন্ধ হয়েছিল? ── */
  useEffect(() => {
    const marker = getTabSession();
    if (!marker) {
      // cookie আছে কিন্তু ট্যাব-মার্কার নেই = ট্যাব বন্ধ করে আবার খোলা হয়েছে
      void logout("TAB_CLOSED");
      return;
    }
    if (marker !== sessionId) setTabSession(sessionId);
  }, [sessionId, logout]);

  /* ── ২. ট্যাব বন্ধ হওয়ার মুহূর্তে সার্ভারকে জানাও ── */
  useEffect(() => {
    function onPageHide(e: PageTransitionEvent) {
      // bfcache এ গেলে সত্যিকারের বন্ধ নয় — ফিরে এলে আবার কাজ চলবে
      if (e.persisted || done.current) return;
      clearTabSession();
      navigator.sendBeacon?.("/api/auth/logout", new Blob([], { type: "text/plain" }));
    }
    // beforeunload মোবাইলে প্রায়ই fire করে না, তাই pagehide
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  /* ── ৩. ট্যাব খোলা থাকলে heartbeat ── */
  useEffect(() => {
    let last = 0;

    const beat = (force = false) => {
      if (done.current) return;
      const now = Date.now();
      // অল্প সময়ের মধ্যে বারবার নয় (ট্যাব বদল করলে যেন বন্যা না হয়)
      if (!force && now - last < HEARTBEAT_MS - 5_000) return;
      last = now;
      api("/api/auth/session", { method: "POST", silent401: true }).catch(() => {
        // নেট নেই বা session বাতিল — পরের API কলেই ধরা পড়বে
      });
    };

    beat(true); // পেজ খোলার সাথে সাথেই একবার

    const timer = window.setInterval(() => beat(), HEARTBEAT_MS);

    // ব্যাকগ্রাউন্ডে থাকলে ব্রাউজার টাইমার ধীর করে দেয়,
    // তাই ফিরে আসার সাথে সাথে একটা পাঠিয়ে দিই
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
