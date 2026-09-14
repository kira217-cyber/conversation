import type { Message } from "@prisma/client";
import { open } from "./crypto";
import { signedUrl } from "./cloudinary";

export type MediaDTO = {
  url: string;
  mime: string | null;
  size: number | null;
  name: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  waveform: number[];
};

export type MessageDTO = {
  id: string;
  clientMsgId: string;
  senderId: string;
  type: Message["type"];
  body: string;
  media: MediaDTO | null;
  replyTo: { id: string; senderId: string; preview: string; type: Message["type"] } | null;
  reaction: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  deletedForAll: boolean;
  createdAt: string;
};

type WithReply = Message & { replyTo?: Message | null };

export function toDTO(msg: WithReply, viewerId: string): MessageDTO | null {
  // "delete for me" — যে মুছেছে সে আর দেখবে না
  if (msg.deletedForIds.includes(viewerId)) return null;

  const deleted = msg.deletedForAll;
  const kind = msg.type === "IMAGE" ? "image" : "voice";

  return {
    id: msg.id,
    clientMsgId: msg.clientMsgId,
    senderId: msg.senderId,
    type: msg.type,
    body: deleted ? "" : open(msg),
    media:
      deleted || !msg.mediaPublicId
        ? null
        : {
            url: signedUrl(msg.mediaPublicId, kind),
            mime: msg.mediaMime,
            size: msg.mediaSize,
            name: msg.mediaName,
            width: msg.mediaWidth,
            height: msg.mediaHeight,
            duration: msg.mediaDuration,
            waveform: msg.waveform,
          },
    replyTo:
      msg.replyTo && !msg.replyTo.deletedForAll
        ? {
            id: msg.replyTo.id,
            senderId: msg.replyTo.senderId,
            type: msg.replyTo.type,
            preview:
              msg.replyTo.type === "IMAGE"
                ? "📷 ছবি"
                : msg.replyTo.type === "VOICE"
                  ? "🎤 ভয়েস মেসেজ"
                  : open(msg.replyTo).slice(0, 90),
          }
        : null,
    reaction: deleted ? null : msg.reaction,
    deliveredAt: msg.deliveredAt?.toISOString() ?? null,
    readAt: msg.readAt?.toISOString() ?? null,
    deletedForAll: deleted,
    createdAt: msg.createdAt.toISOString(),
  };
}
