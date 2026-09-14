import { getAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { authFail, handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** TURN credential কখনো ক্লায়েন্টে hardcode করা যাবে না — এখান থেকে
 *  স্বল্পমেয়াদি credential ইস্যু হয়। */
const PUBLIC_STUN = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
];

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const e = env();

    if (!e.CLOUDFLARE_TURN_KEY_ID || !e.CLOUDFLARE_TURN_API_TOKEN) {
      // TURN সেট করা নেই — একই WiFi-তে কল হবে, আলাদা নেটওয়ার্কে হয়তো হবে না
      return ok({ iceServers: PUBLIC_STUN, turn: false });
    }

    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${e.CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${e.CLOUDFLARE_TURN_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 3600 }),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      console.error("[turn] cloudflare failed", res.status, await res.text());
      return ok({ iceServers: PUBLIC_STUN, turn: false });
    }

    const data = (await res.json()) as { iceServers?: unknown };
    const servers = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];

    return ok({ iceServers: [...PUBLIC_STUN, ...servers.filter(Boolean)], turn: true });
  } catch (err) {
    return handleError(err);
  }
}
