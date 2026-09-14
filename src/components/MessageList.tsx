"use client";

import { forwardRef, useMemo } from "react";
import { Loader2 } from "lucide-react";
import type { Message } from "@/types";
import MessageBubble from "./MessageBubble";

type Props = {
  messages: Message[];
  meId: string;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  typing: boolean;
  partnerName: string;
  onScroll: () => void;
  onReply: (m: Message) => void;
  onDelete: (m: Message, scope: "me" | "all") => void;
  onReact: (m: Message, emoji: string) => void;
};

const MessageList = forwardRef<HTMLDivElement, Props>(function MessageList(props, ref) {
  const { messages, meId, loading, loadingMore, hasMore, typing } = props;

  // তারিখ অনুযায়ী ভাগ করে নিই — WhatsApp-এর মতো "আজ / গতকাল" দাগ
  const grouped = useMemo(() => {
    const out: Array<{ date: string; items: Message[] }> = [];
    for (const m of messages) {
      const key = new Date(m.createdAt).toDateString();
      const last = out[out.length - 1];
      if (last?.date === key) last.items.push(m);
      else out.push({ date: key, items: [m] });
    }
    return out;
  }, [messages]);

  return (
    <div
      ref={ref}
      onScroll={props.onScroll}
      className="chat-wallpaper relative flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-6"
    >
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted)]" />
        </div>
      ) : (
        <div className="mx-auto flex max-w-2xl flex-col">
          {loadingMore && (
            <div className="mb-3 flex justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
            </div>
          )}

          {!hasMore && messages.length > 0 && (
            <p className="mb-4 text-center text-[11px] text-[#5a6b74]">
              💜 এখান থেকেই আমাদের শুরু
            </p>
          )}

          {messages.length === 0 && (
            <div className="flex h-full min-h-[50vh] flex-col items-center justify-center text-center">
              <div className="mb-3 text-4xl">💜</div>
              <p className="text-sm text-[var(--color-muted)]">
                এখনো কোনো কথা হয়নি।
                <br />
                প্রথম মেসেজটা তুমিই লেখো।
              </p>
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.date}>
              <div className="my-3 flex justify-center">
                <span className="rounded-lg bg-[#182229] px-3 py-1 text-[11px] font-medium text-[var(--color-muted)] shadow">
                  {formatDay(group.date)}
                </span>
              </div>

              {group.items.map((m, i) => {
                const prev = group.items[i - 1];
                const grouped =
                  prev?.senderId === m.senderId &&
                  new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 120_000;

                return (
                  <MessageBubble
                    key={m.clientMsgId}
                    message={m}
                    mine={m.senderId === meId}
                    grouped={grouped}
                    onReply={props.onReply}
                    onDelete={props.onDelete}
                    onReact={props.onReact}
                  />
                );
              })}
            </div>
          ))}

          {typing && (
            <div className="mb-2 flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-[var(--color-bubble-in)] px-4 py-3">
                <span className="dot h-1.5 w-1.5 rounded-full bg-[var(--color-muted)]" />
                <span className="dot h-1.5 w-1.5 rounded-full bg-[var(--color-muted)]" />
                <span className="dot h-1.5 w-1.5 rounded-full bg-[var(--color-muted)]" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function formatDay(dateString: string) {
  const d = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "আজ";
  if (d.toDateString() === yesterday.toDateString()) return "গতকাল";

  return d.toLocaleDateString("bn-BD", { day: "numeric", month: "long", year: "numeric" });
}

export default MessageList;
