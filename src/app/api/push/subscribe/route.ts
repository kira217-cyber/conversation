import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { authFail, handleError, ok, zodFail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** The browser hands us an address it can be reached at; we store it per user. */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return zodFail(parsed.error);
    const { endpoint, keys } = parsed.data;

    // The same endpoint can come back after a reinstall — move it to
    // whoever is signed in now rather than creating a duplicate.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: auth.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers.get("user-agent"),
        lastUsed: new Date(),
      },
      create: {
        userId: auth.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers.get("user-agent"),
      },
    });

    const count = await prisma.pushSubscription.count({ where: { userId: auth.user.id } });
    return ok({ devices: count }, "Notifications are on");
  } catch (err) {
    return handleError(err);
  }
}

/** Called when notifications are turned off, or the subscription is replaced. */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const endpoint = new URL(req.url).searchParams.get("endpoint");
    await prisma.pushSubscription.deleteMany({
      where: endpoint ? { endpoint, userId: auth.user.id } : { userId: auth.user.id },
    });

    return ok(null, "Notifications are off");
  } catch (err) {
    return handleError(err);
  }
}
