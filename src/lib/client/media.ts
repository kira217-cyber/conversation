"use client";

/**
 * মাইক/ক্যামেরা নেওয়ার একটাই জায়গা — ভয়েস নোট আর কল দুটোই এটা ব্যবহার করে।
 * ব্রাউজারভেদে যা যা আলাদা, সব এখানে সামলানো।
 */

/** Safari-তে AudioContext এর নাম আলাদা */
export function makeAudioContext(): AudioContext | null {
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

export type MediaSupport = {
  secure: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  webrtc: boolean;
  audioContext: boolean;
};

export function checkSupport(): MediaSupport {
  return {
    // HTTPS বা localhost ছাড়া ব্রাউজার মাইক দেয় না
    secure: typeof window !== "undefined" && window.isSecureContext,
    getUserMedia: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    mediaRecorder: typeof MediaRecorder !== "undefined",
    webrtc: typeof RTCPeerConnection !== "undefined",
    audioContext:
      typeof window !== "undefined" &&
      !!((window as unknown as { AudioContext?: unknown }).AudioContext ??
        (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext),
  };
}

/** ব্যর্থতার আসল কারণটা বাংলায় বলে — "কাজ করছে না" এর বদলে */
export function mediaErrorMessage(err: unknown, wantsVideo = false): string {
  const device = wantsVideo ? "ক্যামেরা বা মাইক্রোফোন" : "মাইক্রোফোন";
  const name = err instanceof DOMException ? err.name : (err as Error)?.message;

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return `${device} এর অনুমতি দাওনি। ঠিকানার পাশে 🔒 আইকনে চেপে Allow করো, তারপর পেজটা রিফ্রেশ করো।`;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return `এই ডিভাইসে কোনো ${device} পাওয়া যায়নি।`;
    case "NotReadableError":
    case "TrackStartError":
      return `${device} অন্য কোনো অ্যাপ দখল করে আছে। সেটা বন্ধ করে আবার চেষ্টা করো।`;
    case "OverconstrainedError":
      return `${device} চাওয়া সেটিংসে চলে না।`;
    case "SecurityError":
      return "নিরাপত্তার কারণে ব্লক হয়েছে — HTTPS লিংক দিয়ে খোলো।";
    case "INSECURE_CONTEXT":
      return "মাইক্রোফোন শুধু HTTPS এ কাজ করে। https:// দিয়ে শুরু হওয়া লিংকটা ব্যবহার করো।";
    case "NO_GET_USER_MEDIA":
      return "এই ব্রাউজারে মাইক্রোফোন সাপোর্ট নেই। Chrome বা Safari এর নতুন ভার্সন ব্যবহার করো।";
    case "NO_MEDIA_RECORDER":
      return "এই ব্রাউজারে ভয়েস রেকর্ডিং সাপোর্ট নেই।";
    default:
      return `${device} চালু করা গেল না${name ? ` (${name})` : ""}।`;
  }
}

/**
 * ⚠️ এটা user gesture এর সাথে সাথেই ডাকতে হবে — আগে কোনো await নয়।
 * iOS Safari মাঝে নেটওয়ার্ক কল থাকলে অনুমতির প্রম্পট বাতিল করে দেয়।
 */
export async function getMediaStream(wantsVideo = false): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new DOMException("insecure", "INSECURE_CONTEXT");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("unsupported", "NO_GET_USER_MEDIA");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: wantsVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
  });
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}
