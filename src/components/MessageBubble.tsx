"use client";

import { useCallback, useRef, useState } from "react";
import { AlertCircle, Check, CheckCheck, Clock, Reply, Trash2, X } from "lucide-react";
import type { Message } from "@/types";
import VoicePlayer from "./VoicePlayer";
import RichText from "./RichText";

const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👍"];

export default function MessageBubble({
  message,
  mine,
  grouped,
  onReply,
  onDelete,
  onReact,
}: {
  message: Message;
  mine: boolean;
  grouped: boolean;
  onReply: (m: Message) => void;
  onDelete: (m: Message, scope: "me" | "all") => void;
  onReact: (m: Message, emoji: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  // Desktop reveals the actions on hover; phones have no hover, so a
  // long press opens the same sheet.
  const pressTimer = useRef<number | null>(null);
  const pressed = useRef(false);

  const openMenu = useCallback(() => {
    if (!message.deletedForAll) setMenu(true);
  }, [message.deletedForAll]);

  const startPress = useCallback(() => {
    pressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      pressed.current = true;
      navigator.vibrate?.(12);
      openMenu();
    }, 420);
  }, [openMenu]);

  const cancelPress = useCallback(() => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }, []);

  const time = new Date(message.createdAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <div
        className={`group relative flex ${mine ? "justify-end" : "justify-start"} ${
          grouped ? "mt-0.5" : "mt-2"
        }`}
      >
        <div className="relative max-w-[85%] sm:max-w-[70%]">
          {/* দ্রুত অ্যাকশন — হোভার করলে দেখা যায় */}
          {!message.deletedForAll && (
            <div
              className={`absolute top-1 z-10 hidden gap-1 group-hover:flex ${
                mine ? "-left-16" : "-right-16"
              }`}
            >
              <button
                onClick={() => onReply(message)}
                title="Reply"
                className="rounded-full bg-[var(--color-panel-2)] p-1.5 text-[var(--color-muted)] shadow hover:text-white"
              >
                <Reply className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setMenu(true)}
                title="More"
                className="rounded-full bg-[var(--color-panel-2)] p-1.5 text-[var(--color-muted)] shadow hover:text-white"
              >
                <span className="block h-3.5 w-3.5 text-center text-[13px] leading-[14px]">😊</span>
              </button>
            </div>
          )}

          <div
            onDoubleClick={() => !message.deletedForAll && onReact(message, "❤️")}
            // Android fires contextmenu on long press
            onContextMenu={(e) => {
              e.preventDefault();
              openMenu();
            }}
            onTouchStart={startPress}
            onTouchEnd={cancelPress}
            onTouchMove={cancelPress}
            onTouchCancel={cancelPress}
            // stops the iOS text-selection callout from hijacking the long press
            style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
            className={`relative rounded-2xl px-3 py-2 shadow-sm ${
              mine
                ? "rounded-br-md bg-[var(--color-bubble-out)] text-white"
                : "rounded-bl-md bg-[var(--color-bubble-in)] text-[#e9edef]"
            }`}
          >
            {/* উত্তরের উদ্ধৃতি */}
            {message.replyTo && (
              <div
                className={`mb-1.5 rounded-lg border-l-[3px] px-2 py-1 text-xs ${
                  mine
                    ? "border-pink-300 bg-black/15"
                    : "border-[var(--color-accent)] bg-black/20"
                }`}
              >
                <p className="truncate text-[var(--color-accent-soft)]">
                  {message.replyTo.preview || "Message"}
                </p>
              </div>
            )}

            {message.deletedForAll ? (
              <p className="flex items-center gap-1.5 py-0.5 text-sm italic text-white/45">
                <X className="h-3.5 w-3.5" />
                This message was deleted
              </p>
            ) : message.type === "IMAGE" && message.media ? (
              <button
                // a long press opened the menu — don't also open the viewer
                onClick={() => !pressed.current && setLightbox(true)}
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={message.media.url}
                  alt="Photo"
                  className="max-h-80 w-full rounded-lg object-cover"
                  style={{ maxWidth: 280 }}
                />
              </button>
            ) : message.type === "VOICE" && message.media ? (
              <VoicePlayer
                url={message.media.url}
                duration={message.media.duration}
                waveform={message.media.waveform}
                mine={mine}
              />
            ) : null}

            {message.body && (
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                <RichText text={message.body} mine={mine} />
              </p>
            )}

            {/* সময় + টিক */}
            <div
              className={`mt-0.5 flex items-center justify-end gap-1 ${
                message.type === "IMAGE" ? "absolute bottom-3 right-4 rounded bg-black/50 px-1.5" : ""
              }`}
            >
              <span className="text-[10px] text-white/55">{time}</span>
              {mine && !message.deletedForAll && <Ticks message={message} />}
            </div>

            {/* রিঅ্যাকশন */}
            {message.reaction && (
              <button
                onClick={() => onReact(message, message.reaction!)}
                className="absolute -bottom-2.5 left-2 rounded-full bg-[var(--color-panel-2)] px-1.5 py-0.5 text-xs shadow ring-1 ring-[var(--color-line)]"
              >
                {message.reaction}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* অ্যাকশন শিট */}
      {menu && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setMenu(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel-2)] pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex justify-around border-b border-[var(--color-line)] px-2 py-3">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(message, emoji);
                    setMenu(false);
                  }}
                  className="text-2xl transition hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                onReply(message);
                setMenu(false);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-white hover:bg-white/5"
            >
              <Reply className="h-4 w-4" /> Reply
            </button>

            {message.body && (
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(message.body);
                  setMenu(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-white hover:bg-white/5"
              >
                <Check className="h-4 w-4" /> Copy
              </button>
            )}

            <button
              onClick={() => {
                onDelete(message, "me");
                setMenu(false);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-white hover:bg-white/5"
            >
              <Trash2 className="h-4 w-4" /> Delete for me
            </button>

            {mine && (
              <button
                onClick={() => {
                  onDelete(message, "all");
                  setMenu(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-300 hover:bg-white/5"
              >
                <Trash2 className="h-4 w-4" /> Delete for everyone
              </button>
            )}
          </div>
        </div>
      )}

      {/* ছবি বড় করে দেখা */}
      {lightbox && message.media && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(false)}
        >
          <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white">
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={message.media.url}
            alt="Photo"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </>
  );
}

/** ✓ পাঠানো · ✓✓ পৌঁছেছে · ✓✓ নীল = পড়েছে */
function Ticks({ message }: { message: Message }) {
  if (message.failed) return <AlertCircle className="h-3 w-3 text-red-300" />;
  if (message.pending) return <Clock className="h-3 w-3 text-white/55" />;
  if (message.readAt) return <CheckCheck className="h-3.5 w-3.5 text-sky-300" />;
  if (message.deliveredAt) return <CheckCheck className="h-3.5 w-3.5 text-white/55" />;
  return <Check className="h-3.5 w-3.5 text-white/55" />;
}
