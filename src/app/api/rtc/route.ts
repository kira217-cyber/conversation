import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getPartner } from "@/lib/convo";
import { CH, EV, emit } from "@/lib/pusher";
import { authFail, fail, handleError, ok, zodFail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  callId: z.string().min(1),
  kind: z.enum(["offer", "answer", "ice"]),
  payload: z.unknown(),
});

/**
 * WebRTC signaling relay. SDP আর ICE candidate এখান দিয়ে যায়।
 * কলের অডিও/ভিডিও কিন্তু এখান দিয়ে যায় না — ওটা সরাসরি peer-to-peer।
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth({ touch: false });
    if (!auth.ok) return authFail(auth.reason);

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return zodFail(parsed.error);

    const partner = await getPartner(auth.user.id);
    if (!partner) return fail(400, "সঙ্গী নেই", "NO_PARTNER");

    const event =
      parsed.data.kind === "offer" ? EV.rtcOffer
      : parsed.data.kind === "answer" ? EV.rtcAnswer
      : EV.rtcIce;

    await emit(CH.user(partner.id), event, {
      callId: parsed.data.callId,
      from: auth.user.id,
      payload: parsed.data.payload,
    });

    return ok(null);
  } catch (err) {
    return handleError(err);
  }
}
