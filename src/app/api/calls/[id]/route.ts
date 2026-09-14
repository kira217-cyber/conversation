import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getConversation, getPartner } from "@/lib/convo";
import { CH, EV, emit } from "@/lib/pusher";
import { authFail, fail, handleError, ok, zodFail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["accept", "reject", "end"]) });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const { id } = await ctx.params;
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return zodFail(parsed.error);

    const convo = await getConversation();
    const call = await prisma.call.findFirst({ where: { id, conversationId: convo.id } });
    if (!call) return fail(404, "কলটি নেই", "NOT_FOUND");

    const partner = await getPartner(auth.user.id);
    if (!partner) return fail(400, "সঙ্গী নেই", "NO_PARTNER");

    const now = new Date();

    if (parsed.data.action === "accept") {
      await prisma.call.update({
        where: { id },
        data: { status: "ONGOING", answeredAt: now },
      });
      await emit(CH.user(partner.id), EV.callAccepted, { callId: id });
      return ok({ callId: id, status: "ONGOING" });
    }

    if (parsed.data.action === "reject") {
      await prisma.call.update({
        where: { id },
        data: { status: "REJECTED", endedAt: now },
      });
      await emit(CH.user(partner.id), EV.callRejected, { callId: id });
      return ok({ callId: id, status: "REJECTED" });
    }

    // end — কেউ ধরার আগেই কাটলে সেটা "মিসড কল"
    const answered = !!call.answeredAt;
    const durationSec = answered
      ? Math.max(0, Math.round((now.getTime() - call.answeredAt!.getTime()) / 1000))
      : null;

    await prisma.call.update({
      where: { id },
      data: {
        status: answered ? "ENDED" : "MISSED",
        endedAt: now,
        durationSec,
      },
    });

    await emit(CH.user(partner.id), EV.callEnded, { callId: id, durationSec });
    return ok({ callId: id, status: answered ? "ENDED" : "MISSED", durationSec });
  } catch (err) {
    return handleError(err);
  }
}
