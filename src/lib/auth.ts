import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Role, Session, User } from "@prisma/client";
import { prisma } from "./prisma";
import { env } from "./env";
import { randomToken, sha256 } from "./crypto";

export { SESSION_COOKIE } from "./constants";
import { SESSION_COOKIE } from "./constants";

export type SessionPayload = { uid: string; sid: string; did: string; role: Role };

export type AuthFailure =
  | "NO_SESSION"
  | "BAD_TOKEN"
  | "SESSION_REVOKED"
  | "SESSION_IDLE"
  | "DEVICE_MISMATCH"
  | "USER_DISABLED";

export type AuthResult =
  | { ok: true; user: User; session: Session; payload: SessionPayload }
  | { ok: false; reason: AuthFailure };

function secret() {
  return new TextEncoder().encode(env().JWT_SECRET);
}

function idleLimitMs() {
  return env().IDLE_TIMEOUT_MINUTES * 60 * 1000;
}

async function signSessionToken(payload: SessionPayload, expiresAt: Date) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setIssuer("conversation")
    .sign(secret());
}

/** কত দিন ইনস্টল করা অ্যাপ লগইন থাকবে */
const PERSISTENT_DAYS = 60;

/**
 * ব্রাউজারে cookie-তে ইচ্ছে করেই maxAge দেওয়া হয় না — ব্রাউজার বন্ধ
 * করলেই মুছে যায়, আর ট্যাব বন্ধের ক্ষেত্রটা sessionStorage marker সামলায়।
 *
 * কিন্তু ইনস্টল করা অ্যাপে (APK / home screen) ওই নিয়ম চলে না: Android
 * ব্যাকগ্রাউন্ডে Chrome এর প্রসেস মেরে ফেলে, তখন session cookie আর
 * marker দুটোই হারিয়ে যায় — ফলে প্রতিবার অ্যাপ খুললেই লগআউট।
 * তাই ইনস্টল করা অ্যাপ টেকসই cookie পায়, আসল অ্যাপের মতোই।
 */
function cookieOptions(persistent = false) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(persistent ? { maxAge: PERSISTENT_DAYS * 24 * 60 * 60 } : {}),
  };
}

export function deviceLabelFrom(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : "Browser";
  const os =
    /Windows/.test(userAgent) ? "Windows"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : "Unknown";
  return `${browser} on ${os}`;
}

export async function clientIp() {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null
  );
}

/**
 * 🔐 Login. একই ট্রানজ্যাকশনে এই user-এর বাকি সব session revoke হয়ে যায়
 * — মানে নতুন ডিভাইসে ঢুকলেই পুরোনো ডিভাইস বেরিয়ে যাবে।
 */
export async function createSession(opts: {
  user: User;
  deviceId: string;
  userAgent: string | null;
  ip: string | null;
  /** true when signing in from the installed app rather than a browser tab */
  persistent?: boolean;
}) {
  const { user, deviceId, userAgent, ip, persistent = false } = opts;
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + (persistent ? PERSISTENT_DAYS * 24 * 60 * 60 * 1000 : idleLimitMs()),
  );
  const refreshToken = randomToken();

  const { session, killed } = await prisma.$transaction(async (tx) => {
    const killed = await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now, revokedReason: "NEW_DEVICE_LOGIN" },
    });

    const session = await tx.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        deviceId,
        deviceLabel: deviceLabelFrom(userAgent),
        ipAddress: ip,
        persistent,
        lastActiveAt: now,
        expiresAt,
      },
    });

    return { session, killed: killed.count };
  });

  const token = await signSessionToken(
    { uid: user.id, sid: session.id, did: deviceId, role: user.role },
    expiresAt,
  );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(persistent));

  return { session, killedCount: killed };
}

/**
 * প্রতিটা protected request-এ এটাই আসল দেয়াল।
 * JWT ঠিক থাকলেও DB-তে session revoked বা ৩০ মিনিট idle হলে ঢুকতে দেবে না।
 */
export async function getAuth(opts?: { touch?: boolean }): Promise<AuthResult> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, reason: "NO_SESSION" };

  let payload: SessionPayload;
  try {
    const verified = await jwtVerify(token, secret(), { issuer: "conversation" });
    payload = verified.payload as unknown as SessionPayload;
  } catch {
    return { ok: false, reason: "BAD_TOKEN" };
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });

  if (!session || session.revokedAt) return { ok: false, reason: "SESSION_REVOKED" };
  if (!session.user.isActive) return { ok: false, reason: "USER_DISABLED" };
  if (session.deviceId !== payload.did) return { ok: false, reason: "DEVICE_MISMATCH" };

  const idleFor = Date.now() - session.lastActiveAt.getTime();

  // ইনস্টল করা অ্যাপ নিষ্ক্রিয়তার কারণে বেরোয় না — ফোনের অ্যাপ তো
  // ঘণ্টার পর ঘণ্টা বন্ধ থাকতেই পারে। তার বদলে expiresAt সীমা।
  if (session.persistent && session.expiresAt < new Date()) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: "EXPIRED" },
    });
    return { ok: false, reason: "SESSION_IDLE" };
  }

  if (!session.persistent && idleFor > idleLimitMs()) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: "IDLE_TIMEOUT" },
    });
    return { ok: false, reason: "SESSION_IDLE" };
  }

  // Sliding window — তবে প্রতি request-এ DB লিখব না, ৬০ সেকেন্ড পরপর
  if (opts?.touch !== false && idleFor > 60_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    });
  }

  const { user, ...rest } = session;
  return { ok: true, user, session: rest as Session, payload };
}

export async function revokeCurrentSession(reason: string) {
  const auth = await getAuth({ touch: false });
  if (auth.ok) {
    await prisma.session.update({
      where: { id: auth.session.id },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
  await clearSessionCookie();
  return auth.ok ? auth.user.id : null;
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

export async function audit(action: string, userId?: string | null, meta?: unknown) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: userId ?? null,
        ipAddress: await clientIp(),
        meta: (meta ?? undefined) as never,
      },
    });
  } catch {
    // audit fail করলে মূল request যেন না ভাঙে
  }
}
