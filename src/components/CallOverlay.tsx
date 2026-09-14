"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Volume2 } from "lucide-react";
import type { CallState } from "@/types";

export default function CallOverlay({
  call,
  muted,
  error,
  needsTap,
  remoteStream,
  localStream,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onResumeAudio,
}: {
  call: CallState;
  muted: boolean;
  error: string | null;
  needsTap: boolean;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onResumeAudio: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [showChrome, setShowChrome] = useState(true);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<number | null>(null);

  const incoming = call.role === "callee" && call.status === "ringing";
  /** Video filling the screen — the timer and buttons sit on top of it */
  const videoMode = call.video && !!remoteStream && !incoming;

  useEffect(() => {
    if (call.status !== "active" || !call.startedAt) return;
    const t = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - call.startedAt!) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, [call.status, call.startedAt]);

  useEffect(() => {
    if (remoteVideo.current && remoteStream) remoteVideo.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (localVideo.current && localStream) localVideo.current.srcObject = localStream;
  }, [localStream]);

  /** Only the video view auto-hides; a voice call keeps its buttons visible */
  const revealChrome = useCallback(() => {
    setShowChrome(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowChrome(false), 3500);
  }, []);

  useEffect(() => {
    if (!videoMode) {
      setShowChrome(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      return;
    }
    revealChrome();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [videoMode, revealChrome]);

  const label =
    error ??
    (call.status === "ringing"
      ? incoming
        ? `Incoming ${call.video ? "video" : "voice"} call...`
        : "Ringing..."
      : call.status === "connecting"
        ? "Connecting..."
        : call.status === "active"
          ? fmt(seconds)
          : "Call ended");

  const initial = call.peer?.displayName?.trim()?.[0] ?? "💜";
  const chrome = showChrome ? "opacity-100" : "pointer-events-none opacity-0";

  return (
    <div
      onClick={videoMode ? revealChrome : undefined}
      onTouchStart={videoMode ? revealChrome : undefined}
      className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#1a1025] to-[#0b141a]"
    >
      {call.video && remoteStream && (
        <video
          ref={remoteVideo}
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {call.video && localStream && (
        <video
          ref={localVideo}
          autoPlay
          playsInline
          muted
          className="absolute right-3 z-20 h-36 w-24 rounded-xl object-cover shadow-2xl ring-1 ring-white/20 sm:h-40 sm:w-28"
          style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        />
      )}

      {/* Video call: name and timer sit in a slim bar at the top */}
      {videoMode && (
        <div
          className={`absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 bg-gradient-to-b from-black/65 to-transparent px-4 pb-10 transition-opacity duration-300 ${chrome}`}
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.85rem)" }}
        >
          <p className="text-sm font-medium text-white drop-shadow">
            {call.peer?.displayName ?? "My person"}
          </p>
          <p className={`text-xs tabular-nums ${error ? "text-red-300" : "text-white/75"}`}>
            {label}
          </p>
        </div>
      )}

      {/* Voice call, or a video call that has not connected yet */}
      {!videoMode && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
          {call.peer?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={call.peer.avatarUrl}
              alt=""
              className={`mb-6 h-28 w-28 rounded-full object-cover ${
                call.status === "ringing" ? "recording-pulse" : ""
              }`}
            />
          ) : (
            <div
              className={`mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-4xl font-semibold text-white ${
                call.status === "ringing" ? "recording-pulse" : ""
              }`}
            >
              {initial}
            </div>
          )}

          <h2 className="text-2xl font-semibold text-white">
            {call.peer?.displayName ?? "My person"}
          </h2>

          <p
            className={`mt-2 max-w-sm text-sm tabular-nums ${
              error ? "text-red-300" : "text-[var(--color-accent-soft)]"
            }`}
          >
            {label}
          </p>

          {needsTap && (
            <button
              onClick={onResumeAudio}
              className="mt-4 flex items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-sm font-medium text-white backdrop-blur transition active:scale-95"
            >
              <Volume2 className="h-4 w-4" />
              Tap here to listen
            </button>
          )}
        </div>
      )}

      {videoMode && needsTap && (
        <button
          onClick={onResumeAudio}
          className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-black/70 px-5 py-2.5 text-sm font-medium text-white backdrop-blur"
        >
          <Volume2 className="h-4 w-4" />
          Tap here to listen
        </button>
      )}

      <div
        className={`relative z-10 mt-auto flex items-center justify-center gap-6 transition-opacity duration-300 ${
          videoMode ? chrome : "opacity-100"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 3rem)" }}
      >
        {incoming ? (
          <>
            <button
              onClick={onReject}
              aria-label="Decline"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition active:scale-95"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <button
              onClick={onAccept}
              aria-label="Answer"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition active:scale-95"
            >
              <Phone className="h-7 w-7" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onToggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition active:scale-95 ${
                muted ? "bg-white/90 text-black" : "bg-white/15 text-white"
              }`}
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
            <button
              onClick={onEnd}
              aria-label="End call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition active:scale-95"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
