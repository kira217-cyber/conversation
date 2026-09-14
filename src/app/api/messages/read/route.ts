import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getConversationId } from "@/lib/convo";
import { CH, EV, emit } from "@/lib/pusher";
import { authFail, handleError, ok, zodFail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const schema = z.object({
  /** "delivered" = ✓✓ ধূসর, "read" = ✓✓ নীল */
  mode: z.enum(["delivered", "read"]),
});

/**
 * অন্যজনের পাঠানো মেসেজগুলোর status আপডেট করে।
 * নিজের মেসেজে নিজে tick বসাতে পারবে না — তাই senderId: { not: me }।
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return zodFail(parsed.error);

    const conversationId = await getConversationId();
    const now = new Date();
    const isRead = parsed.data.mode === "read";

    const result = await prisma.message.updateMany({
      where: {
        conversationId: conversationId,
        senderId: { not: auth.user.id },
        ...(isRead ? { readAt: null } : { deliveredAt: null }),
      },
      data: isRead ? { readAt: now, deliveredAt: now } : { deliveredAt: now },
    });

    if (result.count > 0) {
      await emit(
        CH.convo(conversationId),
        isRead ? EV.messageRead : EV.messageDelivered,
        { by: auth.user.id, at: now.toISOString(), count: result.count },
      );
    }

    return ok({ updated: result.count });
  } catch (err) {
    return handleError(err);
  }
}
