"use client";

import { useCallback, useRef, useState } from "react";

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
    "audio/ogg;codecs=opus",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
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
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    recorder.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stream.current = s;

      const mime = pickMime();
      const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      peaks.current = [];
      cancelled.current = false;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.start(250);
      recorder.current = rec;

      // waveform-এর জন্য নিয়মিত ভলিউম মাপা
      const ctx = new AudioContext();
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
        const rms = Math.sqrt(sum / buf.length);
        const level = Math.min(1, rms * 3.2);
        peaks.current.push(level);
        setLevels((prev) => [...prev.slice(-49), level]);
      }, 100);

      startedAt.current = Date.now();
      setSeconds(0);
      ticker.current = window.setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
      }, 250);

      setRecording(true);
    } catch {
      setError("মাইক্রোফোন চালু করা গেল না — ব্রাউজারে অনুমতি দাও");
      cleanup();
    }
  }, [cleanup]);

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

        // খুব ছোট বা বাতিল করা রেকর্ডিং পাঠানোর দরকার নেই
        if (wasCancelled || duration < 0.6 || blob.size < 1200) {
          resolve(null);
          return;
        }

        // ৪০টা বারে নামিয়ে আনি, নাহলে বাবলে আঁটবে না
        const src = peaks.current;
        const target = 40;
        const step = Math.max(1, Math.floor(src.length / target));
        const waveform: number[] = [];
        for (let i = 0; i < src.length; i += step) {
          const slice = src.slice(i, i + step);
          waveform.push(Number((slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(3)));
        }

        resolve({ blob, mime, duration, waveform: waveform.slice(0, target) });
      };

      rec.stop();
    });
  }, [cleanup]);

  const cancel = useCallback(async () => {
    cancelled.current = true;
    await finish();
  }, [finish]);

  return { recording, seconds, levels, error, start, finish, cancel };
}
