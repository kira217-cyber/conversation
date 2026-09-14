"use client";

import { useState } from "react";
import { Heart, LogOut, MoreVertical, Phone, Video, WifiOff } from "lucide-react";
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
}) {
  const { partner, lastSeen, online, typing, connected, daysTogether, callActive } = props;
  const [menu, setMenu] = useState(false);

  const status = typing
    ? "লিখছে..."
    : online
      ? "অনলাইন"
      : lastSeen
        ? `শেষ দেখা ${formatLastSeen(lastSeen)}`
        : "অফলাইন";

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
            {partner?.displayName ?? "আমার মানুষ"}
          </h2>
          {daysTogether !== null && (
            <span className="hidden items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent-soft)] sm:inline-flex">
              <Heart className="h-2.5 w-2.5 fill-current" />
              {daysTogether} দিন
            </span>
          )}
        </div>
        <p
          className={`truncate text-xs ${
            typing ? "text-[var(--color-accent-soft)]" : "text-[var(--color-muted)]"
          }`}
        >
          {!connected ? "সংযোগ হচ্ছে..." : status}
        </p>
      </div>

      {!connected && <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />}

      <button
        onClick={props.onCall}
        disabled={callActive || !partner}
        title="ভয়েস কল"
        className="rounded-full p-2 text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)] hover:text-white disabled:opacity-40"
      >
        <Phone className="h-5 w-5" />
      </button>
      <button
        onClick={props.onVideoCall}
        disabled={callActive || !partner}
        title="ভিডিও কল"
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
            <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] py-1 shadow-2xl">
              <button
                onClick={props.onLogout}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-300 hover:bg-white/5"
              >
                <LogOut className="h-4 w-4" />
                লগআউট
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
  if (mins < 1) return "একটু আগে";
  if (mins < 60) return `${mins} মিনিট আগে`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ঘণ্টা আগে`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "গতকাল" : `${days} দিন আগে`;
}
