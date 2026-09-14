import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getConversation } from "@/lib/convo";
import { seal } from "@/lib/crypto";
import { toDTO } from "@/lib/message";
import { CH, EV, emit } from "@/lib/pusher";
import { authFail, fail, handleError, ok, zodFail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 5000;

/* ──────────────────────────── GET (history) ──────────────────────────── */
/**
 * Cursor pagination — চ্যাটে ?page=2 কাজ করে না, কারণ নতুন মেসেজ এলে
 * পেজ সরে গিয়ে মেসেজ হারায় বা দুইবার আসে।
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(Number(searchParams.get("limit") ?? 30), 60);

    const convo = await getConversation();

    const rows = await prisma.message.findMany({
      where: { conversationId: convo.id },
      include: { replyTo: true },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const messages = page
      .map((m) => toDTO(m, auth.user.id))
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .reverse(); // পুরোনো → নতুন, যেভাবে স্ক্রিনে দেখাবে

    return ok({
      messages,
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    });
  } catch (err) {
    return handleError(err);
  }
}

/* ──────────────────────────── POST (send) ──────────────────────────── */
const mediaSchema = z.object({
  publicId: z.string().min(1),
  mime: z.string().max(120).optional(),
  size: z.number().int().nonnegative().optional(),
  name: z.string().max(255).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  waveform: z.array(z.number()).max(200).optional(),
});

const sendSchema = z
  .object({
    clientMsgId: z.uuid(),
    type: z.enum(["TEXT", "IMAGE", "VOICE"]).default("TEXT"),
    body: z.string().max(MAX_BODY).optional(),
    replyToId: z.uuid().optional().nullable(),
    media: mediaSchema.optional(),
    socketId: z.string().optional(),
  })
  .refine((v) => (v.type === "TEXT" ? !!v.body?.trim() : !!v.media), {
    message: "খালি মেসেজ পাঠানো যাবে না",
  });

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const parsed = sendSchema.safeParse(await req.json());
    if (!parsed.success) return zodFail(parsed.error);
    const input = parsed.data;

    // নেট খারাপ হয়ে retry হলেও যেন ডাবল মেসেজ না যায়
    const existing = await prisma.message.findUnique({
      where: { clientMsgId: input.clientMsgId },
      include: { replyTo: true },
    });
    if (existing) {
      return ok({ message: toDTO(existing, auth.user.id), duplicate: true }, "আগেই পাঠানো হয়েছে");
    }

    const convo = await getConversation();

    if (input.replyToId) {
      const target = await prisma.message.findFirst({
        where: { id: input.replyToId, conversationId: convo.id },
        select: { id: true },
      });
      if (!target) return fail(400, "যে মেসেজের উত্তর দিচ্ছ সেটি নেই", "REPLY_NOT_FOUND");
    }

    const sealed = input.body?.trim() ? seal(input.body.trim()) : {};

    const created = await prisma.message.create({
      data: {
        conversationId: convo.id,
        senderId: auth.user.id,
        clientMsgId: input.clientMsgId,
        type: input.type,
        ...sealed,
        replyToId: input.replyToId ?? null,
        mediaPublicId: input.media?.publicId ?? null,
        mediaMime: input.media?.mime ?? null,
        mediaSize: input.media?.size ?? null,
        mediaName: input.media?.name ?? null,
        mediaWidth: input.media?.width ?? null,
        mediaHeight: input.media?.height ?? null,
        mediaDuration: input.media?.duration ?? null,
        waveform: input.media?.waveform ?? [],
      },
      include: { replyTo: true },
    });

    const dto = toDTO(created, auth.user.id)!;

    // socketId দেওয়ায় পাঠানোর ট্যাবে নিজের মেসেজ দ্বিতীয়বার আসবে না
    await emit(CH.convo(convo.id), EV.messageNew, dto, input.socketId);

    return ok({ message: dto, duplicate: false }, "পাঠানো হয়েছে");
  } catch (err) {
    return handleError(err);
  }
}
