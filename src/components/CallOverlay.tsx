"use client";

import { useEffect, useRef, useState } from "react";
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
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);

  const incoming = call.role === "callee" && call.status === "ringing";

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#1a1025] to-[#0b141a]">
      {/* ভিডিও কল হলে রিমোট ভিডিও পুরো স্ক্রিনে */}
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
          className="absolute right-4 top-4 z-10 h-40 w-28 rounded-xl object-cover shadow-2xl ring-1 ring-white/20"
        />
      )}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        {(!call.video || !remoteStream) && (
          <>
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
          </>
        )}

        <p
          className={`mt-2 max-w-sm text-sm ${
            error ? "text-red-300" : "text-[var(--color-accent-soft)]"
          } ${call.video && remoteStream ? "rounded-full bg-black/50 px-4 py-1.5" : ""}`}
        >
          {label}
        </p>

        {/* ব্রাউজার নিজে থেকে অডিও বাজাতে না দিলে একটা ট্যাপ লাগে */}
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

      <div className="relative z-10 flex items-center justify-center gap-6 pb-16">
        {incoming ? (
          <>
            <button
              onClick={onReject}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition active:scale-95"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <button
              onClick={onAccept}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition active:scale-95"
            >
              <Phone className="h-7 w-7" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onToggleMute}
              className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 ${
                muted ? "bg-white/90 text-black" : "bg-white/15"
              }`}
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
            <button
              onClick={onEnd}
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
