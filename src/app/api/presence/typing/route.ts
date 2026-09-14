import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getConversation } from "@/lib/convo";
import { CH, EV, emit } from "@/lib/pusher";
import { authFail, handleError, ok, zodFail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  isTyping: z.boolean(),
  socketId: z.string().optional(),
});

/** শুধু event — কোনো DB লেখা নেই, তাই দ্রুত ও সস্তা */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth({ touch: false });
    if (!auth.ok) return authFail(auth.reason);

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return zodFail(parsed.error);

    const convo = await getConversation();
    await emit(
      CH.convo(convo.id),
      parsed.data.isTyping ? EV.typingStart : EV.typingStop,
      { userId: auth.user.id },
      parsed.data.socketId,
    );

    return ok(null);
  } catch (err) {
    return handleError(err);
  }
}
