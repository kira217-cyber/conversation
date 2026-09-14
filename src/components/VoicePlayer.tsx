"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/** ভয়েস নোট — waveform-এ ট্যাপ করে যেকোনো জায়গায় যাওয়া যায় */
export default function VoicePlayer({
  url,
  duration,
  waveform,
  mine,
}: {
  url: string;
  duration: number | null;
  waveform: number[];
  mine: boolean;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [elapsed, setElapsed] = useState(0);

  const bars = waveform.length ? waveform : Array.from({ length: 28 }, () => 0.35);
  const total = duration ?? 0;

  useEffect(() => {
    const el = audio.current;
    if (!el) return;

    const onTime = () => {
      const d = el.duration && isFinite(el.duration) ? el.duration : total;
      setElapsed(el.currentTime);
      setProgress(d ? el.currentTime / d : 0);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
      setElapsed(0);
    };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
    };
  }, [total]);

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.playbackRate = speed;
      void el.play();
      setPlaying(true);
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = audio.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const d = el.duration && isFinite(el.duration) ? el.duration : total;
    if (d) {
      el.currentTime = ratio * d;
      setProgress(ratio);
    }
  }

  function cycleSpeed() {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = next;
  }

  return (
    <div className="flex min-w-[220px] items-center gap-3 py-0.5">
      <audio ref={audio} src={url} preload="metadata" />

      <button
        onClick={toggle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
          mine ? "bg-white/20 hover:bg-white/30" : "bg-[var(--color-accent)]/25 hover:bg-[var(--color-accent)]/40"
        }`}
      >
        {playing ? (
          <Pause className="h-4 w-4 fill-white text-white" />
        ) : (
          <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
        )}
      </button>

      <div className="flex-1">
        <div onClick={seek} className="flex h-8 cursor-pointer items-center gap-[2px]">
          {bars.map((v, i) => {
            const played = i / bars.length <= progress;
            return (
              <span
                key={i}
                style={{ height: `${Math.max(12, Math.min(100, v * 100))}%` }}
                className={`w-[3px] shrink-0 rounded-full transition-colors ${
                  played
                    ? mine
                      ? "bg-white"
                      : "bg-[var(--color-accent-soft)]"
                    : mine
                      ? "bg-white/35"
                      : "bg-white/25"
                }`}
              />
            );
          })}
        </div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-[10px] text-white/60">
            {fmt(playing || progress > 0 ? elapsed : total)}
          </span>
          <button
            onClick={cycleSpeed}
            className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white/70"
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}

function fmt(seconds: number) {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
