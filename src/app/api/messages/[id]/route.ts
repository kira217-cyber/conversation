import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getConversation } from "@/lib/convo";
import { destroyAsset } from "@/lib/cloudinary";
import { CH, EV, emit } from "@/lib/pusher";
import { authFail, fail, handleError, ok, zodFail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/* ─────────────── DELETE — for me / for everyone ─────────────── */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const { id } = await ctx.params;
    const scope = new URL(req.url).searchParams.get("scope") === "all" ? "all" : "me";

    const convo = await getConversation();
    const msg = await prisma.message.findFirst({
      where: { id, conversationId: convo.id },
    });
    if (!msg) return fail(404, "মেসেজটি নেই", "NOT_FOUND");

    if (scope === "all") {
      if (msg.senderId !== auth.user.id)
        return fail(403, "অন্যের মেসেজ সবার জন্য মোছা যাবে না", "FORBIDDEN");

      if (msg.mediaPublicId) {
        await destroyAsset(msg.mediaPublicId, msg.type === "IMAGE" ? "image" : "voice");
      }

      await prisma.message.update({
        where: { id },
        data: {
          deletedForAll: true,
          body: null,
          bodyIv: null,
          bodyTag: null,
          mediaPublicId: null,
          mediaUrl: null,
          reaction: null,
          waveform: [],
        },
      });

      await emit(CH.convo(convo.id), EV.messageDeleted, { id, scope: "all" });
      return ok({ id, scope: "all" }, "সবার জন্য মুছে ফেলা হয়েছে");
    }

    await prisma.message.update({
      where: { id },
      data: { deletedForIds: { push: auth.user.id } },
    });
    return ok({ id, scope: "me" }, "তোমার জন্য মুছে ফেলা হয়েছে");
  } catch (err) {
    return handleError(err);
  }
}

/* ─────────────── PATCH — reaction toggle ─────────────── */
const patchSchema = z.object({
  reaction: z.string().max(8).nullable(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const { id } = await ctx.params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return zodFail(parsed.error);

    const convo = await getConversation();
    const msg = await prisma.message.findFirst({
      where: { id, conversationId: convo.id, deletedForAll: false },
    });
    if (!msg) return fail(404, "মেসেজটি নেই", "NOT_FOUND");

    // একই ইমোজি আবার দিলে উঠে যাবে (toggle)
    const next = msg.reaction === parsed.data.reaction ? null : parsed.data.reaction;

    await prisma.message.update({ where: { id }, data: { reaction: next } });
    await emit(CH.convo(convo.id), EV.messageReaction, {
      id,
      reaction: next,
      by: auth.user.id,
    });

    return ok({ id, reaction: next });
  } catch (err) {
    return handleError(err);
  }
}
