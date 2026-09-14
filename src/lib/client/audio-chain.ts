"use client";

import { makeAudioContext } from "./media";

/**
 * Cleans up the microphone before it goes down the wire.
 *
 * The browser's own processing only gets you so far: with automatic gain control
 * on, room hiss is wound up to speech volume in the gaps between words;
 * with it off, a softly spoken voice arrives too quiet to hear. Neither
 * setting alone is right, so the levelling is done here instead, where
 * silence and speech can be treated differently.
 *
 * The chain, in order:
 *
 *   high-pass 95 Hz   drops fan noise, mains hum and handling rumble,
 *                     none of which carries any speech
 *   low-pass 7.8 kHz  drops the hiss above the range a voice occupies
 *   presence +3 dB    a lift around 2.6 kHz, where consonants live —
 *                     this is what makes words easier to make out
 *   gate              closes when nothing is being said, so the room
 *                     behind the speaker is not transmitted at all
 *   compressor        evens out loud and quiet speech
 *   makeup gain       brings the levelled result back up
 *
 * Echo cancellation still happens before any of this, at capture, so
 * routing through here does not undo it.
 */

export type AudioChain = {
  stream: MediaStream;
  dispose: () => void;
};

/** Below this, treat it as silence rather than speech */
const GATE_OPEN_RMS = 0.012;
const GATE_CLOSE_RMS = 0.007;
/** Keep the gate open briefly, so gaps inside a sentence do not chop it up */
const GATE_HOLD_MS = 280;

export function processMic(raw: MediaStream): AudioChain | null {
  const ctx = makeAudioContext();
  if (!ctx) return null;

  try {
    void ctx.resume();

    const source = ctx.createMediaStreamSource(raw);

    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 95;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 7800;

    const presence = ctx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 2600;
    presence.Q.value = 0.9;
    presence.gain.value = 3;

    const gate = ctx.createGain();
    gate.gain.value = 1;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -30;
    compressor.knee.value = 24;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;

    const makeup = ctx.createGain();
    makeup.gain.value = 1.9;

    // A ceiling, so the makeup gain can never clip on a shout
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;

    const destination = ctx.createMediaStreamDestination();

    source
      .connect(highpass)
      .connect(lowpass)
      .connect(presence)
      .connect(gate)
      .connect(compressor)
      .connect(makeup)
      .connect(limiter)
      .connect(destination);

    // The gate listens before it, so it hears speech even while closed
    presence.connect(analyser);

    const buffer = new Float32Array(analyser.fftSize);
    let openUntil = 0;

    const tick = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);

      let sum = 0;
      for (const v of buffer) sum += v * v;
      const rms = Math.sqrt(sum / buffer.length);

      const now = performance.now();
      // Two thresholds, so a level hovering near the line does not chatter
      if (rms > GATE_OPEN_RMS) openUntil = now + GATE_HOLD_MS;
      const open = now < openUntil || rms > GATE_CLOSE_RMS;

      // Ramp rather than jump — a hard cut is audible as a click
      gate.gain.setTargetAtTime(open ? 1 : 0.02, ctx.currentTime, open ? 0.01 : 0.08);
    }, 40);

    // Video stays as it came from the camera; only the audio is replaced
    const stream = new MediaStream([
      ...destination.stream.getAudioTracks(),
      ...raw.getVideoTracks(),
    ]);
    stream.getAudioTracks().forEach((t) => (t.contentHint = "speech"));

    return {
      stream,
      dispose: () => {
        window.clearInterval(tick);
        try {
          source.disconnect();
        } catch {
          /* already gone */
        }
        void ctx.close().catch(() => {});
      },
    };
  } catch (err) {
    console.error("[audio] could not build the chain, sending the raw mic", err);
    void ctx.close().catch(() => {});
    return null;
  }
}

/**
 * Makes the incoming voice louder than an <audio> element alone can manage.
 *
 * The element caps at volume 1. Routing through a gain node lifts a quiet
 * speaker well past that, with a limiter so it never distorts.
 *
 * Exactly one of the two paths plays at a time. Both at once is what made
 * calls sound metallic before, so if the context cannot start, the element
 * is unmuted and the boost is simply skipped.
 */
export function boostRemote(
  stream: MediaStream,
  element: HTMLAudioElement,
): { dispose: () => void; resume: () => Promise<void> } | null {
  const ctx = makeAudioContext();
  if (!ctx) return null;

  try {
    const source = ctx.createMediaStreamSource(stream);

    const gain = ctx.createGain();
    gain.gain.value = 2.0;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.12;

    source.connect(gain).connect(limiter).connect(ctx.destination);

    element.muted = true;

    void ctx
      .resume()
      .then(() => {
        // Still blocked — give the element back so there is sound at all
        if (ctx.state !== "running") element.muted = false;
      })
      .catch(() => {
        element.muted = false;
      });

    return {
      // Called when the person taps to allow sound — without this the
      // boost stays suspended and tapping only unmutes a muted element,
      // which is silence.
      resume: async () => {
        try {
          await ctx.resume();
          element.muted = ctx.state === "running";
        } catch {
          element.muted = false;
        }
      },
      dispose: () => {
        element.muted = false;
        try {
          source.disconnect();
        } catch {
          /* already gone */
        }
        void ctx.close().catch(() => {});
      },
    };
  } catch (err) {
    console.error("[audio] remote boost unavailable", err);
    element.muted = false;
    void ctx.close().catch(() => {});
    return null;
  }
}
