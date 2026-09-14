import Pusher from "pusher";
import { env } from "./env";

/**
 * Vercel serverless-এ persistent WebSocket রাখা যায় না।
 * তাই সার্ভার শুধু Pusher-কে HTTP POST করে event পাঠায়।
 */
const globalForPusher = globalThis as unknown as { pusher?: Pusher };

export function pusherServer() {
  const e = env();
  globalForPusher.pusher ??= new Pusher({
    appId: e.PUSHER_APP_ID,
    key: e.PUSHER_KEY,
    secret: e.PUSHER_SECRET,
    cluster: e.PUSHER_CLUSTER,
    useTLS: true,
  });
  return globalForPusher.pusher;
}

export const CH = {
  /** শুধু ঐ user — force-logout, call signaling */
  user: (userId: string) => `private-user-${userId}`,
  /** দুইজনের thread — message, typing, presence */
  convo: (convId: string) => `presence-convo-${convId}`,
};

export const EV = {
  messageNew: "message:new",
  messageDeleted: "message:deleted",
  messageRead: "message:read",
  messageDelivered: "message:delivered",
  messageReaction: "message:reaction",
  typingStart: "typing:start",
  typingStop: "typing:stop",
  forceLogout: "session:force-logout",
  callIncoming: "call:incoming",
  callAccepted: "call:accepted",
  callRejected: "call:rejected",
  callEnded: "call:ended",
  rtcOffer: "webrtc:offer",
  rtcAnswer: "webrtc:answer",
  rtcIce: "webrtc:ice",
} as const;

/** Pusher fail করলেও API যেন 500 না দেয় — চ্যাট REST দিয়ে তো চলছেই */
export async function emit(channel: string, event: string, data: unknown, socketId?: string) {
  try {
    await pusherServer().trigger(channel, event, data, socketId ? { socket_id: socketId } : undefined);
  } catch (err) {
    console.error("[pusher] trigger failed", event, err);
  }
}
