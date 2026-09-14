"use client";

import { useState } from "react";
import {
  Bell,
  BellOff,
  Heart,
  Loader2,
  LogOut,
  MoreVertical,
  Phone,
  Video,
  WifiOff,
} from "lucide-react";
import type { usePushNotifications } from "@/hooks/usePushNotifications";
import type { Partner } from "@/types";

export default function ChatHeader(props: {
  partner: Partner;
  /** সার্ভারের পুরোনো স্ন্যাপশট নয় — presence ইভেন্টে হালনাগাদ হওয়া সময় */
  lastSeen: string | null;
  online: boolean;
  typing: boolean;
  connected: boolean;
  daysTogether: number | null;
  callActive: boolean;
  onCall: () => void;
  onVideoCall: () => void;
  onLogout: () => void;
  /** shared with the banner, so both show the same state */
  push: ReturnType<typeof usePushNotifications>;
}) {
  const { partner, lastSeen, online, typing, connected, daysTogether, callActive, push } = props;
  const [menu, setMenu] = useState(false);

  const status = typing
    ? "typing..."
    : online
      ? "online"
      : lastSeen
        ? `last seen ${formatLastSeen(lastSeen)}`
        : "offline";

  const initial = partner?.displayName?.trim()?.[0] ?? "💜";

  return (
    <header className="relative z-30 flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2.5">
      <div className="relative shrink-0">
        {partner?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={partner.avatarUrl}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-sm font-semibold text-white">
            {initial}
          </div>
        )}
        {online && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--color-panel)] bg-green-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-white">
            {partner?.displayName ?? "My person"}
          </h2>
          {daysTogether !== null && (
            <span className="hidden items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent-soft)] sm:inline-flex">
              <Heart className="h-2.5 w-2.5 fill-current" />
              {daysTogether} days
            </span>
          )}
        </div>
        <p
          className={`truncate text-xs ${
            typing ? "text-[var(--color-accent-soft)]" : "text-[var(--color-muted)]"
          }`}
        >
          {!connected ? "connecting..." : status}
        </p>
      </div>

      {!connected && <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />}

      <button
        onClick={props.onCall}
        disabled={callActive || !partner}
        title="Voice call"
        className="rounded-full p-2 text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)] hover:text-white disabled:opacity-40"
      >
        <Phone className="h-5 w-5" />
      </button>
      <button
        onClick={props.onVideoCall}
        disabled={callActive || !partner}
        title="Video call"
        className="rounded-full p-2 text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)] hover:text-white disabled:opacity-40"
      >
        <Video className="h-5 w-5" />
      </button>

      <div className="relative">
        <button
          onClick={() => setMenu((v) => !v)}
          className="rounded-full p-2 text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)] hover:text-white"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-11 z-20 w-60 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] py-1 shadow-2xl">
              {push.state === "on" ? (
                <>
                  <button
                    onClick={() => void push.disable()}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white hover:bg-white/5"
                  >
                    <BellOff className="h-4 w-4 shrink-0" />
                    Turn off notifications
                  </button>
                  <button
                    onClick={() => {
                      void push.sendTest();
                      setMenu(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[var(--color-muted)] hover:bg-white/5"
                  >
                    <Bell className="h-4 w-4 shrink-0" />
                    Send a test notification
                  </button>
                </>
              ) : push.state === "working" ? (
                <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--color-muted)]">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  Working...
                </div>
              ) : push.state === "denied" ? (
                <p className="px-4 py-2.5 text-xs leading-relaxed text-[var(--color-muted)]">
                  Notifications are blocked. Allow them for this site in your browser settings.
                </p>
              ) : push.state === "needs-install" ? (
                <p className="px-4 py-2.5 text-xs leading-relaxed text-[var(--color-muted)]">
                  On iPhone, add this to your Home Screen first — then notifications can be turned
                  on.
                </p>
              ) : push.state === "unsupported" ? (
                <p className="px-4 py-2.5 text-xs leading-relaxed text-[var(--color-muted)]">
                  This browser cannot show notifications.
                </p>
              ) : (
                <button
                  onClick={() => void push.enable()}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white hover:bg-white/5"
                >
                  <Bell className="h-4 w-4 shrink-0" />
                  Turn on notifications
                </button>
              )}

              {push.error && (
                <p className="px-4 py-2 text-xs text-red-300">{push.error}</p>
              )}

              <div className="my-1 border-t border-[var(--color-line)]" />

              <button
                onClick={props.onLogout}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-300 hover:bg-white/5"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

function formatLastSeen(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
