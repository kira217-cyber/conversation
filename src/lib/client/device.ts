"use client";

const DEVICE_KEY = "cv_device_id";
const TAB_KEY = "cv_tab_session";

/**
 * Is this the installed app (Android APK / Home Screen) rather than a
 * browser tab?
 *
 * It changes the session rules. A browser tab signs out when it closes;
 * an installed app must not, because Android kills its process whenever
 * it goes to the background — which would otherwise look exactly like
 * the tab being closed and sign the person out every single time.
 */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      // iOS
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      // Trusted Web Activity — the Android wrapper
      document.referrer.startsWith("android-app://")
    );
  } catch {
    return false;
  }
}

/** ডিভাইসের স্থায়ী পরিচয় — localStorage-এ থাকে, ব্রাউজার বন্ধ করলেও থাকে */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // private mode ইত্যাদিতে storage বন্ধ থাকতে পারে
    return crypto.randomUUID();
  }
}

/**
 * ⭐ ট্যাব বন্ধ হলে logout — এই জিনিসটাই মূল কৌশল।
 * sessionStorage প্রতিটা ট্যাবের আলাদা এবং ট্যাব বন্ধ হলেই মুছে যায়।
 * তাই cookie থাকলেও এই marker না থাকা মানে "ট্যাবটা বন্ধ হয়েছিল"।
 */
export function setTabSession(sessionId: string) {
  try {
    sessionStorage.setItem(TAB_KEY, sessionId);
  } catch {
    /* ignore */
  }
}

export function getTabSession(): string | null {
  try {
    return sessionStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

export function clearTabSession() {
  try {
    sessionStorage.removeItem(TAB_KEY);
  } catch {
    /* ignore */
  }
}
