import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getConversationId, getPartner } from "@/lib/convo";
import { messageNotification, pushToUser } from "@/lib/push";
import { seal } from "@/lib/crypto";
import { toDTO } from "@/lib/message";
import { CH, EV, emit } from "@/lib/pusher";
import { authFail, fail, handleError, ok, zodFail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** ডেটাবেস সিঙ্গাপুরে — ফাংশনও সেখানেই চলুক, নইলে প্রতিটা কোয়েরিতে পৃথিবী ঘোরে */
export const preferredRegion = "sin1";

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

    const conversationId = await getConversationId();

    const rows = await prisma.message.findMany({
      where: { conversationId },
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
    message: "Message cannot be empty",
  });

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const parsed = sendSchema.safeParse(await req.json());
    if (!parsed.success) return zodFail(parsed.error);
    const input = parsed.data;

    const conversationId = await getConversationId(); // cached, DB hit নেই
    const sealed = input.body?.trim() ? seal(input.body.trim()) : {};

    const data = {
      conversationId,
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
    };

    let created;
    try {
      created = await prisma.message.create({ data, include: { replyTo: true } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // নেট খারাপ হয়ে retry হলে একই clientMsgId দুইবার আসে —
        // আগে একটা SELECT করে দেখার বদলে unique constraint কেই কাজে লাগাই
        if (err.code === "P2002") {
          const existing = await prisma.message.findUnique({
            where: { clientMsgId: input.clientMsgId },
            include: { replyTo: true },
          });
          if (existing) {
            return ok(
              { message: toDTO(existing, auth.user.id), duplicate: true },
              "Already sent",
            );
          }
        }
        // replyToId এমন মেসেজের দিকে দেখাচ্ছে যেটা নেই
        if (err.code === "P2003") {
          return fail(400, "The message you replied to no longer exists", "REPLY_NOT_FOUND");
        }
      }
      throw err;
    }

    const dto = toDTO(created, auth.user.id)!;

    // socketId দেওয়ায় পাঠানোর ট্যাবে নিজের মেসেজ দ্বিতীয়বার আসবে না
    await emit(CH.convo(conversationId), EV.messageNew, dto, input.socketId);

    // Reaches the other person's phone even with the app closed.
    // Deliberately not awaited alongside the response path above — but on
    // serverless an unawaited promise can be killed, so we do wait for it.
    const partner = await getPartner(auth.user.id);
    if (partner) {
      await pushToUser(
        partner.id,
        messageNotification(auth.user.displayName, input.type, input.body?.trim() ?? ""),
      );
    }

    return ok({ message: dto, duplicate: false }, "Sent");
  } catch (err) {
    return handleError(err);
  }
}
