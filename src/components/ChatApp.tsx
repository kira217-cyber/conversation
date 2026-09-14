"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Channel, PresenceChannel } from "pusher-js";
import { ArrowDown } from "lucide-react";
import { api } from "@/lib/client/api";
import { CH, getPusher, socketId } from "@/lib/client/pusher";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { useWebRTC } from "@/hooks/useWebRTC";
import type { Message, SessionInfo } from "@/types";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import Composer from "./Composer";
import CallOverlay from "./CallOverlay";

export default function ChatApp({ initial }: { initial: SessionInfo }) {
  const me = initial.user;
  const partner = initial.partner;
  const convoId = initial.conversation.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  /** পেজ লোডের স্ন্যাপশট দিয়ে শুরু, পরে presence ইভেন্টে হালনাগাদ হয় */
  const [partnerLastSeen, setPartnerLastSeen] = useState<string | null>(
    partner?.lastSeenAt ?? null,
  );
  /** "৫ মিনিট আগে" লেখাটা যেন নিজে থেকে বাড়তে থাকে */
  const [, forceTick] = useState(0);
  const [connected, setConnected] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);

  const [userChannel, setUserChannel] = useState<Channel | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | null>(null);

  // ট্যাব খোলা থাকলে লগইন থাকবে, ট্যাব বন্ধ হলে লগআউট
  const { logout } = useSessionGuard({ sessionId: initial.session.id });

  const onCallEvent = useCallback(() => {
    /* কল শেষ — আপাতত আলাদা কিছু দেখানোর দরকার নেই */
  }, []);

  const rtc = useWebRTC({ userChannel, partner, onCallEvent });

  /* ─────────────────── প্রথমবার ইতিহাস আনা ─────────────────── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api<{ messages: Message[]; nextCursor: string | null; hasMore: boolean }>(
          "/api/messages?limit=40",
        );
        if (!alive) return;
        setMessages(data.messages);
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ─────────────────── Realtime ─────────────────── */
  useEffect(() => {
    const pusher = getPusher();

    const convo = pusher.subscribe(CH.convo(convoId)) as PresenceChannel;
    const personal = pusher.subscribe(CH.user(me.id));
    setUserChannel(personal);

    pusher.connection.bind("connected", () => setConnected(true));
    pusher.connection.bind("disconnected", () => setConnected(false));
    pusher.connection.bind("unavailable", () => setConnected(false));

    /* ⭐ অন্য ডিভাইসে লগইন হলে এই ট্যাব সাথে সাথে বেরিয়ে যাবে */
    personal.bind("session:force-logout", (data: { newSessionId?: string }) => {
      if (data?.newSessionId && data.newSessionId === initial.session.id) return; // এটাই নতুন ট্যাব
      void logout("NEW_DEVICE_LOGIN");
    });

    /* মেসেজ */
    convo.bind("message:new", (msg: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m.clientMsgId === msg.clientMsgId)) return prev;
        return [...prev, msg];
      });
      if (msg.senderId !== me.id) {
        if (document.visibilityState === "visible" && atBottom) {
          void api("/api/messages/read", { method: "POST", json: { mode: "read" }, silent401: true });
        } else {
          void api("/api/messages/read", {
            method: "POST",
            json: { mode: "delivered" },
            silent401: true,
          });
          setUnseen((n) => n + 1);
        }
      }
    });

    convo.bind("message:deleted", ({ id }: { id: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, deletedForAll: true, body: "", media: null, reaction: null } : m,
        ),
      );
    });

    convo.bind("message:reaction", ({ id, reaction }: { id: string; reaction: string | null }) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, reaction } : m)));
    });

    convo.bind("message:delivered", ({ by, at }: { by: string; at: string }) => {
      if (by === me.id) return;
      setMessages((prev) =>
        prev.map((m) => (m.senderId === me.id && !m.deliveredAt ? { ...m, deliveredAt: at } : m)),
      );
    });

    convo.bind("message:read", ({ by, at }: { by: string; at: string }) => {
      if (by === me.id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === me.id && !m.readAt ? { ...m, readAt: at, deliveredAt: m.deliveredAt ?? at } : m,
        ),
      );
    });

    /* টাইপিং */
    convo.bind("typing:start", ({ userId }: { userId: string }) => {
      if (userId !== me.id) setPartnerTyping(true);
    });
    convo.bind("typing:stop", ({ userId }: { userId: string }) => {
      if (userId !== me.id) setPartnerTyping(false);
    });

    /* অনলাইন / অফলাইন — presence চ্যানেল নিজেই জানায় */
    const refreshPresence = () => {
      const members = convo.members;
      if (!members) return;
      let online = false;
      members.each((m: { id: string }) => {
        if (m.id !== me.id) online = true;
      });
      setPartnerOnline(online);
      return online;
    };

    convo.bind("pusher:subscription_succeeded", refreshPresence);
    convo.bind("pusher:member_added", (m: { id: string }) => {
      if (m.id !== me.id) setPartnerOnline(true);
    });
    convo.bind("pusher:member_removed", (m: { id: string }) => {
      if (m.id === me.id) return;
      setPartnerOnline(false);
      setPartnerTyping(false);
      // এইমাত্র বেরিয়ে গেল — সার্ভারে জিজ্ঞেস না করেই সময়টা জানি
      setPartnerLastSeen(new Date().toISOString());
    });

    return () => {
      convo.unbind_all();
      personal.unbind_all();
      pusher.unsubscribe(CH.convo(convoId));
      pusher.unsubscribe(CH.user(me.id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convoId, me.id, initial.session.id, logout]);

  /* ─────────────────── "শেষ দেখা" তাজা রাখা ─────────────────── */
  useEffect(() => {
    // অফলাইন থাকলে প্রতি ৩০ সেকেন্ডে লেখাটা নতুন করে হিসাব হোক
    // ("২ মিনিট আগে" যেন "২ মিনিট আগে"ই আটকে না থাকে)
    const tick = window.setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    // অনলাইন থাকা অবস্থায় শেষ দেখা = এখন। অফলাইন হলে এই মানটাই জমে থাকবে।
    if (!partnerOnline) return;
    const sync = () => setPartnerLastSeen(new Date().toISOString());
    sync();
    const t = window.setInterval(sync, 30_000);
    return () => window.clearInterval(t);
  }, [partnerOnline]);

  /* ─────────────────── না-পড়া মেসেজ পড়া হিসেবে চিহ্নিত ─────────────────── */
  useEffect(() => {
    if (loading) return;
    const markRead = () => {
      if (document.visibilityState !== "visible") return;
      void api("/api/messages/read", { method: "POST", json: { mode: "read" }, silent401: true });
      setUnseen(0);
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [loading]);

  /* ─────────────────── স্ক্রল ─────────────────── */
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setUnseen(0);
  }, []);

  useEffect(() => {
    if (!loading && atBottom) scrollToBottom();
  }, [messages.length, loading, atBottom, scrollToBottom]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const el = scroller.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const data = await api<{ messages: Message[]; nextCursor: string | null; hasMore: boolean }>(
        `/api/messages?limit=30&cursor=${cursor}`,
      );
      setMessages((prev) => [...data.messages, ...prev]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
      // পুরোনো মেসেজ যোগ হলে যেন স্ক্রিন লাফ না দেয়
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, hasMore]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(bottom);
    if (bottom) setUnseen(0);
    if (el.scrollTop < 120) void loadMore();
  }, [loadMore]);

  /* ─────────────────── টাইপিং পাঠানো ─────────────────── */
  const notifyTyping = useCallback((isTyping: boolean) => {
    api("/api/presence/typing", {
      method: "POST",
      json: { isTyping, socketId: socketId() },
      silent401: true,
    }).catch(() => {});
  }, []);

  const handleTyping = useCallback(() => {
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    else notifyTyping(true);
    typingTimer.current = window.setTimeout(() => {
      notifyTyping(false);
      typingTimer.current = null;
    }, 2200);
  }, [notifyTyping]);

  /* ─────────────────── মেসেজ পাঠানো (optimistic) ─────────────────── */
  const sendMessage = useCallback(
    async (payload: {
      type: "TEXT" | "IMAGE" | "VOICE";
      body?: string;
      media?: Record<string, unknown>;
      localPreview?: Message["media"];
    }) => {
      const clientMsgId = crypto.randomUUID();
      const optimistic: Message = {
        id: clientMsgId,
        clientMsgId,
        senderId: me.id,
        type: payload.type,
        body: payload.body ?? "",
        media: payload.localPreview ?? null,
        replyTo: replyTo
          ? {
              id: replyTo.id,
              senderId: replyTo.senderId,
              type: replyTo.type,
              preview:
                replyTo.type === "IMAGE" ? "📷 Photo"
                : replyTo.type === "VOICE" ? "🎤 Voice message"
                : replyTo.body.slice(0, 90),
            }
          : null,
        reaction: null,
        deliveredAt: null,
        readAt: null,
        deletedForAll: false,
        createdAt: new Date().toISOString(),
        pending: true,
      };

      const replyId = replyTo?.id ?? null;
      setReplyTo(null);
      setMessages((prev) => [...prev, optimistic]);
      setAtBottom(true);

      try {
        const data = await api<{ message: Message }>("/api/messages", {
          method: "POST",
          json: {
            clientMsgId,
            type: payload.type,
            body: payload.body,
            replyToId: replyId,
            media: payload.media,
            socketId: socketId(),
          },
        });
        setMessages((prev) =>
          prev.map((m) => (m.clientMsgId === clientMsgId ? data.message : m)),
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMsgId === clientMsgId ? { ...m, pending: false, failed: true } : m,
          ),
        );
      }
    },
    [me.id, replyTo],
  );

  const deleteMessage = useCallback(async (msg: Message, scope: "me" | "all") => {
    setMessages((prev) =>
      scope === "me"
        ? prev.filter((m) => m.id !== msg.id)
        : prev.map((m) =>
            m.id === msg.id ? { ...m, deletedForAll: true, body: "", media: null } : m,
          ),
    );
    await api(`/api/messages/${msg.id}?scope=${scope}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const reactToMessage = useCallback(async (msg: Message, emoji: string) => {
    const next = msg.reaction === emoji ? null : emoji;
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reaction: next } : m)));
    await api(`/api/messages/${msg.id}`, { method: "PATCH", json: { reaction: emoji } }).catch(
      () => {},
    );
  }, []);

  const daysTogether = useMemo(() => {
    if (!initial.conversation.anniversary) return null;
    const start = new Date(initial.conversation.anniversary).getTime();
    return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
  }, [initial.conversation.anniversary]);

  return (
    <div className="flex h-dvh flex-col bg-[var(--color-ink)]">
      <ChatHeader
        partner={partner}
        lastSeen={partnerLastSeen}
        online={partnerOnline}
        typing={partnerTyping}
        connected={connected}
        daysTogether={daysTogether}
        onCall={() => rtc.startCall(false)}
        onVideoCall={() => rtc.startCall(true)}
        onLogout={() => logout("MANUAL")}
        callActive={!!rtc.call}
      />

      <MessageList
        ref={scroller}
        messages={messages}
        meId={me.id}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        typing={partnerTyping}
        partnerName={partner?.displayName ?? "them"}
        onScroll={onScroll}
        onReply={setReplyTo}
        onDelete={deleteMessage}
        onReact={reactToMessage}
      />

      {!atBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-24 right-4 z-20 flex items-center gap-1.5 rounded-full bg-[var(--color-panel-2)] px-3 py-2 text-xs text-white shadow-lg ring-1 ring-[var(--color-line)]"
        >
          <ArrowDown className="h-4 w-4" />
          {unseen > 0 && <span className="font-semibold text-[var(--color-accent-soft)]">{unseen}</span>}
        </button>
      )}

      <Composer
        replyTo={replyTo}
        meId={me.id}
        onCancelReply={() => setReplyTo(null)}
        onTyping={handleTyping}
        onSend={sendMessage}
        onStopTyping={() => {
          if (typingTimer.current) {
            window.clearTimeout(typingTimer.current);
            typingTimer.current = null;
          }
          notifyTyping(false);
        }}
      />

      {rtc.call && (
        <CallOverlay
          call={rtc.call}
          muted={rtc.muted}
          error={rtc.error}
          needsTap={rtc.needsTap}
          remoteStream={rtc.remoteStream}
          localStream={rtc.localStream}
          onAccept={rtc.accept}
          onReject={() => rtc.hangup("reject")}
          onEnd={() => rtc.hangup("end")}
          onToggleMute={rtc.toggleMute}
          onResumeAudio={rtc.resumeAudio}
        />
      )}

      {/* কল ছাড়াই মাইকের সমস্যা হলে (যেমন অনুমতি নেই) */}
      {!rtc.call && rtc.error && (
        <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <div className="flex max-w-md items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-3 text-xs text-red-100 shadow-lg backdrop-blur">
            <span className="flex-1">{rtc.error}</span>
            <button onClick={rtc.clearError} className="shrink-0 font-semibold">
              ✕
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
