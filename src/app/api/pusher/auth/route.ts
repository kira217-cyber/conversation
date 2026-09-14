import { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { getConversation } from "@/lib/convo";
import { CH, pusherServer } from "@/lib/pusher";
import { authFail, fail, handleError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * private-/presence- চ্যানেলে ঢোকার অনুমতি এখান থেকেই দেওয়া হয়।
 * এটাই realtime layer-এর নিরাপত্তার দেয়াল — এখানে ছাড় দিলে
 * যে কেউ অন্যের চ্যানেলে subscribe করে মেসেজ পড়ে ফেলতে পারত।
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const form = await req.formData();
    const socketId = String(form.get("socket_id") ?? "");
    const channel = String(form.get("channel_name") ?? "");
    if (!socketId || !channel) return fail(400, "socket_id/channel_name নেই", "BAD_REQUEST");

    const convo = await getConversation();
    const allowedUser = CH.user(auth.user.id);
    const allowedConvo = CH.convo(convo.id);

    if (channel !== allowedUser && channel !== allowedConvo) {
      return fail(403, "এই চ্যানেলে ঢোকার অনুমতি নেই", "CHANNEL_FORBIDDEN");
    }

    const pusher = pusherServer();

    if (channel.startsWith("presence-")) {
      const authResponse = pusher.authorizeChannel(socketId, channel, {
        user_id: auth.user.id,
        user_info: {
          displayName: auth.user.displayName,
          avatarUrl: auth.user.avatarUrl,
        },
      });
      return Response.json(authResponse);
    }

    return Response.json(pusher.authorizeChannel(socketId, channel));
  } catch (err) {
    return handleError(err);
  }
}
