"use client";

/**
 * One place for microphone/camera access — voice notes and calls both use it.
 * Every browser quirk is handled here, not at the call sites.
 */

/** Safari exposes it under a prefix */
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
    // Browsers refuse microphone access outside HTTPS / localhost
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

/** Says what actually went wrong, instead of a single "it didn't work" */
export function mediaErrorMessage(err: unknown, wantsVideo = false): string {
  const device = wantsVideo ? "Camera or microphone" : "Microphone";
  const name = err instanceof DOMException ? err.name : (err as Error)?.message;

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return `${device} access was blocked. Tap the 🔒 icon next to the address bar, allow it, then reload.`;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return `No ${device.toLowerCase()} found on this device.`;
    case "NotReadableError":
    case "TrackStartError":
      return `${device} is being used by another app. Close it and try again.`;
    case "OverconstrainedError":
      return `${device} does not support the requested settings.`;
    case "SecurityError":
      return "Blocked for security reasons — open the site over HTTPS.";
    case "INSECURE_CONTEXT":
      return "The microphone only works over HTTPS. Use the https:// link.";
    case "NO_GET_USER_MEDIA":
      return "This browser cannot access the microphone. Try a recent Chrome or Safari.";
    case "NO_MEDIA_RECORDER":
      return "This browser cannot record audio.";
    default:
      return `${device} could not be started${name ? ` (${name})` : ""}.`;
  }
}

/**
 * ⚠️ Call this immediately on the user gesture — no awaits before it.
 * iOS Safari dismisses the permission prompt if a network call comes first.
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
