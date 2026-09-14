"use client";

const DEVICE_KEY = "cv_device_id";
const TAB_KEY = "cv_tab_session";

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
