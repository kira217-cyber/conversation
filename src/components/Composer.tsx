"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ImagePlus, Loader2, Mic, Send, Smile, Trash2, X } from "lucide-react";
import { uploadFile } from "@/lib/client/upload";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import type { Message } from "@/types";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

const MAX_IMAGE_MB = 15;

type SendPayload = {
  type: "TEXT" | "IMAGE" | "VOICE";
  body?: string;
  media?: Record<string, unknown>;
  localPreview?: Message["media"];
};

export default function Composer({
  replyTo,
  meId,
  onCancelReply,
  onTyping,
  onStopTyping,
  onSend,
}: {
  replyTo: Message | null;
  meId: string;
  onCancelReply: () => void;
  onTyping: () => void;
  onStopTyping: () => void;
  onSend: (p: SendPayload) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState(false);
  const [uploading, setUploading] = useState<null | { percent: number; kind: string }>(null);
  const [error, setError] = useState<string | null>(null);

  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const voice = useVoiceRecorder();

  /* textarea নিজে থেকে বড় হবে */
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  useEffect(() => {
    if (replyTo) textarea.current?.focus();
  }, [replyTo]);

  const sendText = useCallback(async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    setEmoji(false);
    onStopTyping();
    await onSend({ type: "TEXT", body });
  }, [text, onSend, onStopTyping]);

  const sendImage = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.type.startsWith("image/")) {
        setError("শুধু ছবি পাঠানো যাবে");
        return;
      }
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        setError(`ছবিটা ${MAX_IMAGE_MB}MB এর বেশি বড়`);
        return;
      }

      setUploading({ percent: 0, kind: "ছবি" });
      try {
        const up = await uploadFile(file, "image", file.name, (p) =>
          setUploading({ percent: p, kind: "ছবি" }),
        );
        await onSend({
          type: "IMAGE",
          body: text.trim() || undefined,
          media: {
            publicId: up.publicId,
            mime: up.mime,
            size: up.bytes,
            name: up.name,
            width: up.width,
            height: up.height,
          },
        });
        setText("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "ছবি পাঠানো গেল না");
      } finally {
        setUploading(null);
      }
    },
    [onSend, text],
  );

  const sendVoice = useCallback(async () => {
    const rec = await voice.finish();
    if (!rec) return;

    setUploading({ percent: 0, kind: "ভয়েস" });
    try {
      const ext = rec.mime.includes("mp4") ? "m4a" : "webm";
      const up = await uploadFile(rec.blob, "voice", `voice-${Date.now()}.${ext}`, (p) =>
        setUploading({ percent: p, kind: "ভয়েস" }),
      );
      await onSend({
        type: "VOICE",
        media: {
          publicId: up.publicId,
          mime: rec.mime,
          size: up.bytes,
          duration: up.duration ?? rec.duration,
          waveform: rec.waveform,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ভয়েস পাঠানো গেল না");
    } finally {
      setUploading(null);
    }
  }, [voice, onSend]);

  /* ছবি পেস্ট করে পাঠানো */
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = Array.from(e.clipboardData?.files ?? [])[0];
      if (file?.type.startsWith("image/")) {
        e.preventDefault();
        void sendImage(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [sendImage]);

  const hasText = text.trim().length > 0;

  return (
    <div className="relative z-30 border-t border-[var(--color-line)] bg-[var(--color-panel)]">
      {/* উত্তরের প্রিভিউ */}
      {replyTo && (
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2">
          <div className="min-w-0 flex-1 border-l-[3px] border-[var(--color-accent)] pl-2">
            <p className="text-[11px] font-medium text-[var(--color-accent-soft)]">
              {replyTo.senderId === meId ? "তুমি" : "সে"}
            </p>
            <p className="truncate text-xs text-[var(--color-muted)]">
              {replyTo.type === "IMAGE"
                ? "📷 ছবি"
                : replyTo.type === "VOICE"
                  ? "🎤 ভয়েস মেসেজ"
                  : replyTo.body}
            </p>
          </div>
          <button onClick={onCancelReply} className="rounded-full p-1.5 text-[var(--color-muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {(error || voice.error) && (
        <div className="flex items-center justify-between border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          <span>{error ?? voice.error}</span>
          <button onClick={() => setError(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {uploading && (
        <div className="border-b border-[var(--color-line)] px-4 py-2">
          <div className="mb-1 flex justify-between text-[11px] text-[var(--color-muted)]">
            <span>{uploading.kind} পাঠানো হচ্ছে...</span>
            <span>{uploading.percent}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[var(--color-line)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
              style={{ width: `${uploading.percent}%` }}
            />
          </div>
        </div>
      )}

      {emoji && (
        <div className="absolute bottom-full left-2 mb-2">
          <EmojiPicker
            onEmojiClick={(e: { emoji: string }) => {
              setText((t) => t + e.emoji);
              textarea.current?.focus();
            }}
            theme={"dark" as never}
            width={320}
            height={380}
            searchDisabled
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}

      {/* রেকর্ডিং চলাকালীন আলাদা বার */}
      {voice.recording ? (
        <div className="flex items-center gap-3 px-3 py-3">
          <button
            onClick={() => void voice.cancel()}
            className="rounded-full p-2 text-red-400 transition hover:bg-red-500/10"
            title="বাতিল"
          >
            <Trash2 className="h-5 w-5" />
          </button>

          <span className="recording-pulse h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />

          <div className="flex flex-1 items-center gap-[2px] overflow-hidden">
            {voice.levels.map((v, i) => (
              <span
                key={i}
                style={{ height: `${Math.max(10, v * 100)}%` }}
                className="w-[3px] shrink-0 rounded-full bg-[var(--color-accent-soft)]"
              />
            ))}
          </div>

          <span className="shrink-0 font-mono text-sm tabular-nums text-white">
            {Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, "0")}
          </span>

          <button
            onClick={() => void sendVoice()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-white"
            title="পাঠাও"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5 px-2 py-2">
          <button
            onClick={() => setEmoji((v) => !v)}
            className={`rounded-full p-2.5 transition hover:bg-[var(--color-panel-2)] ${
              emoji ? "text-[var(--color-accent-soft)]" : "text-[var(--color-muted)]"
            }`}
          >
            <Smile className="h-5 w-5" />
          </button>

          <button
            onClick={() => fileInput.current?.click()}
            disabled={!!uploading}
            className="rounded-full p-2.5 text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)] disabled:opacity-40"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void sendImage(f);
              e.target.value = "";
            }}
          />

          <textarea
            ref={textarea}
            rows={1}
            value={text}
            placeholder="কিছু লেখো..."
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) onTyping();
              else onStopTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendText();
              }
            }}
            onBlur={onStopTyping}
            className="max-h-[140px] min-h-[42px] flex-1 resize-none rounded-2xl bg-[var(--color-panel-2)] px-4 py-2.5 text-[15px] text-white outline-none placeholder:text-[#5a6b74]"
          />

          {hasText ? (
            <button
              onClick={() => void sendText()}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-white transition active:scale-95"
            >
              <Send className="h-4.5 w-4.5" />
            </button>
          ) : (
            <button
              onClick={() => void voice.start()}
              disabled={!!uploading}
              title="ভয়েস মেসেজ"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--color-panel-2)] text-[var(--color-muted)] transition hover:text-white active:scale-95 disabled:opacity-40"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
