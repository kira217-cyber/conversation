"use client";

import { useCallback, useRef, useState } from "react";
import { getMediaStream, makeAudioContext, mediaErrorMessage, stopStream } from "@/lib/client/media";

export type Recording = {
  blob: Blob;
  mime: string;
  duration: number;
  /** প্রতি ~১০০ms এ একটা মান (0..1) — বাবলে waveform আঁকার জন্য */
  waveform: number[];
};

function pickMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4", // iOS Safari
    "audio/mp4;codecs=mp4a.40.2",
    "audio/ogg;codecs=opus",
    "audio/aac",
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* isTypeSupported নিজেই না থাকলে */
    }
  }
  return ""; // ব্রাউজারের ডিফল্টে ছেড়ে দাও
}

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const sampler = useRef<number | null>(null);
  const ticker = useRef<number | null>(null);
  const startedAt = useRef(0);
  const peaks = useRef<number[]>([]);
  const cancelled = useRef(false);

  const cleanup = useCallback(() => {
    if (sampler.current) window.clearInterval(sampler.current);
    if (ticker.current) window.clearInterval(ticker.current);
    sampler.current = null;
    ticker.current = null;
    stopStream(stream.current);
    stream.current = null;
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    recorder.current = null;
  }, []);

  /** waveform শুধু সাজসজ্জা — এটা ব্যর্থ হলেও রেকর্ডিং যেন থেমে না যায় */
  const attachVisualizer = useCallback((s: MediaStream) => {
    try {
      const ctx = makeAudioContext();
      if (!ctx) return; // পুরোনো Safari — visualizer ছাড়াই চলবে
      audioCtx.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      sampler.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) {
          const n = (v - 128) / 128;
          sum += n * n;
        }
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
        peaks.current.push(level);
        setLevels((prev) => [...prev.slice(-49), level]);
      }, 100);
    } catch (err) {
      console.warn("[voice] visualizer বাদ দেওয়া হলো", err);
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);

    if (typeof MediaRecorder === "undefined") {
      setError(mediaErrorMessage(new DOMException("x", "NO_MEDIA_RECORDER")));
      return;
    }

    // ⚠️ সবার আগে মাইক — মাঝে কোনো await নয়, নইলে iOS প্রম্পট বাতিল করে
    let s: MediaStream;
    try {
      s = await getMediaStream(false);
    } catch (err) {
      console.error("[voice] getUserMedia", err);
      setError(mediaErrorMessage(err));
      return;
    }

    try {
      stream.current = s;
      const mime = pickMime();
      const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);

      chunks.current = [];
      peaks.current = [];
      cancelled.current = false;
      setLevels([]);

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onerror = (e) => {
        console.error("[voice] recorder error", e);
        setError("রেকর্ডিং এ সমস্যা হয়েছে");
        cleanup();
        setRecording(false);
      };

      rec.start(250);
      recorder.current = rec;

      attachVisualizer(s);

      startedAt.current = Date.now();
      setSeconds(0);
      ticker.current = window.setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
      }, 250);

      setRecording(true);
    } catch (err) {
      console.error("[voice] MediaRecorder", err);
      setError(mediaErrorMessage(err));
      cleanup();
    }
  }, [cleanup, attachVisualizer]);

  const finish = useCallback((): Promise<Recording | null> => {
    return new Promise((resolve) => {
      const rec = recorder.current;
      if (!rec) {
        resolve(null);
        return;
      }

      const mime = rec.mimeType || "audio/webm";
      const duration = (Date.now() - startedAt.current) / 1000;

      rec.onstop = () => {
        const wasCancelled = cancelled.current;
        const blob = new Blob(chunks.current, { type: mime });

        cleanup();
        setRecording(false);
        setLevels([]);
        setSeconds(0);

        if (wasCancelled || duration < 0.6 || blob.size < 1200) {
          resolve(null);
          return;
        }

        // ৪০টা বারে নামিয়ে আনি, নাহলে বাবলে আঁটবে না
        const src = peaks.current;
        const target = 40;
        let waveform: number[] = [];
        if (src.length) {
          const step = Math.max(1, Math.floor(src.length / target));
          for (let i = 0; i < src.length; i += step) {
            const slice = src.slice(i, i + step);
            waveform.push(Number((slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(3)));
          }
          waveform = waveform.slice(0, target);
        } else {
          // visualizer চলেনি — একটা সমান waveform দেখাই
          waveform = Array.from({ length: target }, () => 0.4);
        }

        resolve({ blob, mime, duration, waveform });
      };

      try {
        rec.stop();
      } catch {
        cleanup();
        setRecording(false);
        resolve(null);
      }
    });
  }, [cleanup]);

  const cancel = useCallback(async () => {
    cancelled.current = true;
    await finish();
  }, [finish]);

  return { recording, seconds, levels, error, start, finish, cancel, clearError: () => setError(null) };
}
