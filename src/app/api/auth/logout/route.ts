import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, revokeCurrentSession } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/**
 * সাধারণ logout, আবার ট্যাব বন্ধ হওয়ার সময় navigator.sendBeacon() থেকেও
 * এখানেই কল আসে। তাই body না থাকলেও যেন কাজ করে।
 */
export async function POST(req: NextRequest) {
  try {
    let reason = "MANUAL";
    try {
      const text = await req.text();
      if (text) reason = (JSON.parse(text).reason as string) ?? "MANUAL";
    } catch {
      // sendBeacon খালি body পাঠায় — সমস্যা নেই
    }

    const userId = await revokeCurrentSession(reason);
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
      });
      await audit("LOGOUT", userId, { reason });
    }

    return ok(null, "Signed out");
  } catch (err) {
    return handleError(err);
  }
}
