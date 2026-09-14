import { NextRequest } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { audit, clientIp, createSession } from "@/lib/auth";
import { CH, EV, emit } from "@/lib/pusher";
import { fail, handleError, ok, zodFail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const schema = z.object({
  email: z.email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
  deviceId: z.string().min(8).max(64),
  /** true from the installed app — that session survives the app closing */
  persistent: z.boolean().default(false),
});

// লগইন fail হলে সবসময় একই বার্তা — কোন ইমেইলটা আছে সেটা যেন বোঝা না যায়
const GENERIC = "Email or password is incorrect";

// user না পেলেও একটা dummy hash যাচাই করি, যাতে response time দেখে
// ইমেইল আছে কিনা আন্দাজ করা না যায় (timing attack)
const DUMMY_HASH = "$2b$12$abcdefghijklmnopqrstuv0123456789012345678901234567890a";

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return zodFail(parsed.error);
    const { email, password, deviceId, persistent } = parsed.data;

    const e = env();
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      await compare(password, DUMMY_HASH).catch(() => false);
      await audit("LOGIN_FAILED", null, { email, reason: "NO_USER" });
      return fail(401, GENERIC, "AUTH_INVALID");
    }

    if (!user.isActive) {
      await audit("LOGIN_BLOCKED", user.id, { reason: "INACTIVE" });
      return fail(403, "This account is disabled", "ACCOUNT_DISABLED");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return fail(429, `Too many attempts — try again in ${mins} minute(s)`, "ACCOUNT_LOCKED");
    }

    const valid = await compare(password, user.passwordHash);

    if (!valid) {
      const attempts = user.failedLogins + 1;
      const shouldLock = attempts >= e.MAX_LOGIN_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: shouldLock ? 0 : attempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + e.LOCKOUT_MINUTES * 60_000)
            : null,
        },
      });
      await audit("LOGIN_FAILED", user.id, { attempts, locked: shouldLock });
      return shouldLock
        ? fail(429, `Too many attempts — try again in ${e.LOCKOUT_MINUTES} minutes`, "ACCOUNT_LOCKED")
        : fail(401, GENERIC, "AUTH_INVALID");
    }

    // ✅ সফল — এখানেই পুরোনো সব session মরে যায়
    const ip = await clientIp();
    const { session, killedCount } = await createSession({
      user,
      deviceId,
      userAgent: req.headers.get("user-agent"),
      ip,
      persistent,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastSeenAt: new Date() },
    });

    // পুরোনো ডিভাইস খোলা থাকলে সাথে সাথে বের করে দাও।
    // newSessionId পাঠানো হচ্ছে যাতে নতুন ট্যাব নিজেই নিজেকে logout না করে।
    if (killedCount > 0) {
      await emit(CH.user(user.id), EV.forceLogout, {
        reason: "NEW_DEVICE_LOGIN",
        newSessionId: session.id,
      });
    }

    await audit("LOGIN_SUCCESS", user.id, { deviceId, persistent, killedSessions: killedCount });

    return ok(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: user.role,
        },
        sessionId: session.id,
        persistent,
        idleTimeoutMinutes: e.IDLE_TIMEOUT_MINUTES,
      },
      "Welcome 💜",
    );
  } catch (err) {
    return handleError(err);
  }
}
