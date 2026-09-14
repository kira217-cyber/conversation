"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Mic,
  MicOff,
  Minimize2,
  Maximize2,
  MonitorUp,
  MonitorX,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import type { CallState } from "@/types";

type Props = {
  call: CallState;
  muted: boolean;
  cameraOff: boolean;
  sharingScreen: boolean;
  canShareScreen: boolean;
  facing: "user" | "environment";
  error: string | null;
  needsTap: boolean;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
  onStartShare: () => void;
  onStopShare: () => void;
  onResumeAudio: () => void;
};

export default function CallOverlay(props: Props) {
  const {
    call,
    muted,
    cameraOff,
    sharingScreen,
    canShareScreen,
    facing,
    error,
    needsTap,
    remoteStream,
    localStream,
  } = props;

  const [seconds, setSeconds] = useState(0);
  const [showChrome, setShowChrome] = useState(true);
  const [minimized, setMinimized] = useState(false);

  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const miniVideo = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<number | null>(null);

  const incoming = call.role === "callee" && call.status === "ringing";
  /** video filling the screen — timer and buttons sit on top of it */
  const videoMode = call.video && !!remoteStream && !incoming;

  useEffect(() => {
    if (call.status !== "active" || !call.startedAt) return;
    const t = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - call.startedAt!) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, [call.status, call.startedAt]);

  // An incoming call must never be hidden behind the chat
  useEffect(() => {
    if (incoming) setMinimized(false);
  }, [incoming]);

  /**
   * The remote <video> is muted on purpose. Sound comes from the single
   * hidden <audio> element the call hook owns — playing it here as well
   * produced a metallic echo and broke echo cancellation.
   */
  useEffect(() => {
    for (const el of [remoteVideo.current, miniVideo.current]) {
      if (el && remoteStream) el.srcObject = remoteStream;
    }
  }, [remoteStream, minimized]);

  useEffect(() => {
    if (localVideo.current && localStream) localVideo.current.srcObject = localStream;
  }, [localStream, minimized]);

  const revealChrome = useCallback(() => {
    setShowChrome(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowChrome(false), 3500);
  }, []);

  useEffect(() => {
    if (!videoMode || minimized) {
      setShowChrome(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      return;
    }
    revealChrome();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [videoMode, minimized, revealChrome]);

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

  /* ─────────────── minimised: a small tile over the chat ─────────────── */
  if (minimized) {
    return (
      <div
        className="fixed right-3 z-50 w-40 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel-2)] shadow-2xl"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.5rem)" }}
      >
        {call.video && remoteStream ? (
          <video
            ref={miniVideo}
            autoPlay
            playsInline
            muted
            className="h-24 w-full bg-black object-cover"
          />
        ) : (
          <div className="flex h-24 w-full items-center justify-center bg-gradient-to-br from-purple-600 to-pink-600 text-2xl font-semibold text-white">
            {initial}
          </div>
        )}

        <div className="flex items-center gap-1 px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-white">
              {call.peer?.displayName ?? "My person"}
            </p>
            <p className="text-[10px] tabular-nums text-[var(--color-muted)]">{label}</p>
          </div>

          <button
            onClick={() => setMinimized(false)}
            aria-label="Expand call"
            className="shrink-0 rounded-full p-1.5 text-[var(--color-muted)] transition hover:text-white"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={props.onEnd}
            aria-label="End call"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition active:scale-95"
          >
            <PhoneOff className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  /* ─────────────── full screen ─────────────── */
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
          muted
          // contain, not cover: cover crops a landscape frame into a tall
          // screen and blows the middle up until a face fills everything.
          // Letterboxing shows the whole picture at its real size.
          className="absolute inset-0 h-full w-full bg-black object-contain"
        />
      )}

      {call.video && localStream && !cameraOff && (
        <video
          ref={localVideo}
          autoPlay
          playsInline
          muted
          // A front camera is mirrored, the way a mirror is — otherwise you
          // reach the wrong way and any writing reads backwards. The back
          // camera and a shared screen are shown as they are.
          className={`absolute right-3 z-20 h-36 w-24 rounded-xl bg-black object-cover shadow-2xl ring-1 ring-white/20 sm:h-40 sm:w-28 ${
            facing === "user" && !sharingScreen ? "-scale-x-100" : ""
          }`}
          style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        />
      )}

      {/* Video call: name and timer in a slim bar at the top */}
      {videoMode && (
        <div
          className={`absolute inset-x-0 top-0 z-10 flex items-start gap-2 bg-gradient-to-b from-black/65 to-transparent px-3 pb-10 transition-opacity duration-300 ${chrome}`}
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.85rem)" }}
        >
          <button
            onClick={() => setMinimized(true)}
            aria-label="Minimize call"
            className="shrink-0 rounded-full bg-black/40 p-2 text-white backdrop-blur transition active:scale-95"
          >
            <Minimize2 className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-medium text-white drop-shadow">
              {call.peer?.displayName ?? "My person"}
            </p>
            <p className={`text-xs tabular-nums ${error ? "text-red-300" : "text-white/75"}`}>
              {sharingScreen ? `Sharing screen · ${label}` : label}
            </p>
          </div>

          <div className="w-9 shrink-0" />
        </div>
      )}

      {/* Voice call, or a video call that has not connected yet */}
      {!videoMode && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
          {!incoming && (
            <button
              onClick={() => setMinimized(true)}
              aria-label="Minimize call"
              className="absolute right-4 rounded-full bg-white/10 p-2 text-white transition active:scale-95"
              style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          )}

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
              onClick={props.onResumeAudio}
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
          onClick={props.onResumeAudio}
          className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-black/70 px-5 py-2.5 text-sm font-medium text-white backdrop-blur"
        >
          <Volume2 className="h-4 w-4" />
          Tap here to listen
        </button>
      )}

      <div
        className={`relative z-10 mt-auto flex flex-wrap items-center justify-center gap-4 px-4 transition-opacity duration-300 ${
          videoMode ? chrome : "opacity-100"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 3rem)" }}
      >
        {incoming ? (
          <>
            <button
              onClick={props.onReject}
              aria-label="Decline"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition active:scale-95"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <button
              onClick={props.onAccept}
              aria-label="Answer"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition active:scale-95"
            >
              <Phone className="h-7 w-7" />
            </button>
          </>
        ) : (
          <>
            <RoundButton
              onClick={props.onToggleMute}
              active={muted}
              label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </RoundButton>

            {call.video && (
              <RoundButton
                onClick={props.onToggleCamera}
                active={cameraOff}
                label={cameraOff ? "Turn camera on" : "Turn camera off"}
              >
                {cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
              </RoundButton>
            )}

            {call.video && !sharingScreen && (
              <RoundButton onClick={props.onSwitchCamera} label="Switch camera">
                <Camera className="h-5 w-5" />
              </RoundButton>
            )}

            {call.video && canShareScreen && (
              <RoundButton
                onClick={sharingScreen ? props.onStopShare : props.onStartShare}
                active={sharingScreen}
                label={sharingScreen ? "Stop sharing" : "Share screen"}
              >
                {sharingScreen ? (
                  <MonitorX className="h-5 w-5" />
                ) : (
                  <MonitorUp className="h-5 w-5" />
                )}
              </RoundButton>
            )}

            <button
              onClick={props.onEnd}
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

function RoundButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition active:scale-95 ${
        active ? "bg-white/90 text-black" : "bg-white/15 text-white"
      }`}
    >
      {children}
    </button>
  );
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
