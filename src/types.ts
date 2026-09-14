export type MessageType = "TEXT" | "IMAGE" | "VOICE" | "SYSTEM";

export type Media = {
  url: string;
  mime: string | null;
  size: number | null;
  name: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  waveform: number[];
};

export type Message = {
  id: string;
  clientMsgId: string;
  senderId: string;
  type: MessageType;
  body: string;
  media: Media | null;
  replyTo: { id: string; senderId: string; preview: string; type: MessageType } | null;
  reaction: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  deletedForAll: boolean;
  createdAt: string;
  /** শুধু ক্লায়েন্টে — অপটিমিস্টিক অবস্থা */
  pending?: boolean;
  failed?: boolean;
};

export type Me = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: "ADMIN" | "PARTNER";
};

export type Partner = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  about: string | null;
  lastSeenAt: string | null;
} | null;

export type SessionInfo = {
  user: Me;
  partner: Partner;
  conversation: {
    id: string;
    title: string;
    wallpaper: string | null;
    themeColor: string | null;
    anniversary: string | null;
  };
  session: { id: string; deviceLabel: string | null; lastActiveAt: string };
  idleTimeoutMinutes: number;
};

export type CallState = {
  callId: string;
  role: "caller" | "callee";
  status: "ringing" | "connecting" | "active" | "ended";
  video: boolean;
  peer: { id: string; displayName: string; avatarUrl: string | null } | null;
  startedAt: number | null;
};
