import { getAuth } from "@/lib/auth";
import { getConversation, getPartner } from "@/lib/convo";
import { env } from "@/lib/env";
import { authFail, handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** GET — আমি কে, সঙ্গী কে, thread কোনটা। অ্যাপ চালু হলেই কল হয়। */
export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const [convo, partner] = await Promise.all([
      getConversation(),
      getPartner(auth.user.id),
    ]);

    return ok({
      user: {
        id: auth.user.id,
        email: auth.user.email,
        displayName: auth.user.displayName,
        avatarUrl: auth.user.avatarUrl,
        role: auth.user.role,
      },
      partner,
      conversation: {
        id: convo.id,
        title: convo.title,
        wallpaper: convo.wallpaper,
        themeColor: convo.themeColor,
        anniversary: convo.anniversary?.toISOString() ?? null,
      },
      session: {
        id: auth.session.id,
        deviceLabel: auth.session.deviceLabel,
        lastActiveAt: auth.session.lastActiveAt.toISOString(),
      },
      idleTimeoutMinutes: env().IDLE_TIMEOUT_MINUTES,
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST — heartbeat. ক্লায়েন্ট শুধু তখনই পাঠায় যখন সত্যিকারের activity হয়েছে
 * (ট্যাব visible + শেষ ৬০ সেকেন্ডে mouse/key/touch)। নাহলে session কখনো
 * expire করত না, আর ৩০ মিনিটের নিয়মটা অর্থহীন হয়ে যেত।
 */
export async function POST() {
  try {
    const auth = await getAuth({ touch: false });
    if (!auth.ok) return authFail(auth.reason);

    const now = new Date();
    await prisma.session.update({
      where: { id: auth.session.id },
      data: { lastActiveAt: now },
    });
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { lastSeenAt: now },
    });

    return ok({ lastActiveAt: now.toISOString() });
  } catch (err) {
    return handleError(err);
  }
}
