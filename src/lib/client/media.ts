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

/**
 * Microphone settings tuned for a clean call.
 *
 * autoGainControl is deliberately off. It hunts for a target volume and,
 * in the gaps between words, winds the gain up until room hiss, a fan or
 * traffic is as loud as speech — which is most of what "the call is
 * noisy" actually is. Off, quiet rooms stay quiet.
 *
 * voiceIsolation is Chrome's stronger background-noise model; it is not
 * in the TypeScript lib yet, and browsers ignore constraints they do not
 * recognise, so asking for it costs nothing where it is missing.
 */
export function micConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: false },
    // Voice is mono. A second channel only doubles what has to survive the network.
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    ...({ voiceIsolation: { ideal: true } } as MediaTrackConstraints),
  };
}

/**
 * Only a ceiling on size — no fixed width and height.
 *
 * Asking for 1280x720 asks for a landscape frame. A phone held upright
 * then sends a sideways picture, which the other end crops to fit a tall
 * screen, and the result is a face filling the whole display. Letting the
 * camera keep its own orientation and aspect ratio avoids all of it.
 */
export function cameraConstraints(facing: "user" | "environment" = "user"): MediaTrackConstraints {
  return {
    width: { max: 1280 },
    height: { max: 1280 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: { ideal: facing },
  };
}

export type MediaSupport = {
  secure: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  webrtc: boolean;
  audioContext: boolean;
  screenShare: boolean;
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
    screenShare: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia,
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
export async function getMediaStream(
  wantsVideo = false,
  facing: "user" | "environment" = "user",
): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new DOMException("insecure", "INSECURE_CONTEXT");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("unsupported", "NO_GET_USER_MEDIA");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: micConstraints(),
    video: wantsVideo ? cameraConstraints(facing) : false,
  });

  // Tells the browser what the track carries, so it can pick the right
  // processing — speech gets the voice path instead of the music one.
  stream.getAudioTracks().forEach((t) => (t.contentHint = "speech"));
  stream.getVideoTracks().forEach((t) => (t.contentHint = "motion"));

  return stream;
}

/**
 * Opus settings for speech, applied to the SDP before it is sent.
 *
 *   useinbandfec  recovers lost packets, which otherwise arrive as the
 *                 crackle and dropouts people describe as noise
 *   usedtx        sends nothing during silence, so no hiss is transmitted
 *   stereo=0      one channel for a voice
 *
 * Existing parameters are kept; only ours are merged in. If anything about
 * the SDP is unexpected it is returned untouched — a slightly noisier call
 * beats one that will not connect.
 */
export function tuneOpusForVoice(sdp: string): string {
  try {
    const rtpmap = sdp.match(/^a=rtpmap:(\d+) opus\/48000/im);
    if (!rtpmap) return sdp;
    const pt = rtpmap[1];

    const ours: Record<string, string> = {
      stereo: "0",
      "sprop-stereo": "0",
      useinbandfec: "1",
      usedtx: "1",
      maxaveragebitrate: "32000",
      maxplaybackrate: "48000",
    };

    const fmtpRe = new RegExp(`^a=fmtp:${pt} (.*)$`, "im");
    const existing = sdp.match(fmtpRe);

    const params: Record<string, string> = {};
    if (existing) {
      for (const pair of existing[1].split(";")) {
        const [k, v] = pair.split("=");
        if (k?.trim()) params[k.trim()] = (v ?? "").trim();
      }
    }
    Object.assign(params, ours);

    const line = `a=fmtp:${pt} ${Object.entries(params)
      .map(([k, v]) => (v === "" ? k : `${k}=${v}`))
      .join(";")}`;

    return existing
      ? sdp.replace(fmtpRe, line)
      : sdp.replace(rtpmap[0], `${rtpmap[0]}\r\n${line}`);
  } catch (err) {
    console.warn("[call] could not tune opus, using defaults", err);
    return sdp;
  }
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}
