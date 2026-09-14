import webpush from "web-push";
import { prisma } from "./prisma";

/**
 * Web Push — the only way a message can reach the phone while the app
 * is closed. The browser's push service wakes the service worker, which
 * shows the notification; nothing of ours needs to be running.
 *
 * Inside the Android APK this is the same mechanism: the wrapper runs
 * Chrome, so the service worker and its notifications belong to the app.
 */

let configured = false;

function ready(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:noreply@example.com",
      publicKey,
      privateKey,
    );
    configured = true;
  }
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  /** keeps the phone quiet for things it does not need to interrupt for */
  silent?: boolean;
};

/**
 * Sends to every device that user has registered.
 * A subscription the browser has thrown away (404/410) is deleted —
 * otherwise dead endpoints pile up forever.
 */
export async function pushToUser(userId: string, payload: PushPayload) {
  if (!ready()) return { sent: 0, removed: 0 };

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: "high" },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
        else console.error("[push] send failed", status, err);
      }
    }),
  );

  if (dead.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }

  return { sent, removed: dead.length };
}

/** What a message should look like on the lock screen */
export function messageNotification(
  senderName: string,
  type: "TEXT" | "IMAGE" | "VOICE" | "SYSTEM",
  text: string,
): PushPayload {
  const body =
    type === "IMAGE"
      ? "📷 Photo"
      : type === "VOICE"
        ? "🎤 Voice message"
        : text.length > 120
          ? text.slice(0, 117) + "..."
          : text;

  return {
    title: senderName,
    body: body || "New message",
    // same tag means a second message replaces the first instead of stacking
    tag: "message",
    url: "/chat",
  };
}
