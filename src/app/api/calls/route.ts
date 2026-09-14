import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getConversation, getPartner } from "@/lib/convo";
import { CH, EV, emit } from "@/lib/pusher";
import { authFail, fail, handleError, ok, zodFail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ video: z.boolean().default(false) });

/** কল শুরু — সঙ্গীর private চ্যানেলে রিং পাঠায় */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return zodFail(parsed.error);

    const [convo, partner] = await Promise.all([
      getConversation(),
      getPartner(auth.user.id),
    ]);
    if (!partner) return fail(400, "সঙ্গীর অ্যাকাউন্ট পাওয়া যায়নি", "NO_PARTNER");

    // আগের ঝুলে থাকা কল বন্ধ করে দাও, নাহলে দুটো কল একসাথে বাজবে
    await prisma.call.updateMany({
      where: { conversationId: convo.id, status: { in: ["RINGING", "ONGOING"] } },
      data: { status: "ENDED", endedAt: new Date() },
    });

    const call = await prisma.call.create({
      data: { conversationId: convo.id, callerId: auth.user.id, status: "RINGING" },
    });

    await emit(CH.user(partner.id), EV.callIncoming, {
      callId: call.id,
      video: parsed.data.video,
      caller: {
        id: auth.user.id,
        displayName: auth.user.displayName,
        avatarUrl: auth.user.avatarUrl,
      },
    });

    return ok({ callId: call.id, partnerId: partner.id });
  } catch (err) {
    return handleError(err);
  }
}

/** কল হিস্ট্রি */
export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const convo = await getConversation();
    const calls = await prisma.call.findMany({
      where: { conversationId: convo.id },
      orderBy: { startedAt: "desc" },
      take: 50,
      select: {
        id: true,
        callerId: true,
        status: true,
        startedAt: true,
        durationSec: true,
      },
    });

    return ok({ calls });
  } catch (err) {
    return handleError(err);
  }
}
