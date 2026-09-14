import crypto from "node:crypto";
import { env } from "./env";

/**
 * মেসেজ DB-তে AES-256-GCM দিয়ে encrypted হয়ে থাকে।
 * DB dump লিক হলেও key ছাড়া কিছু পড়া যাবে না — key থাকে Vercel env-এ।
 */

function key() {
  return Buffer.from(env().MESSAGE_ENCRYPTION_KEY, "base64");
}

export type Sealed = { body: string; bodyIv: string; bodyTag: string };

export function seal(plain: string): Sealed {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    body: ct.toString("base64"),
    bodyIv: iv.toString("base64"),
    bodyTag: cipher.getAuthTag().toString("base64"),
  };
}

type MaybeSealed = { [K in keyof Sealed]?: string | null };

export function open(sealed: MaybeSealed | null | undefined): string {
  if (!sealed?.body || !sealed.bodyIv || !sealed.bodyTag) return "";
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(sealed.bodyIv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(sealed.bodyTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.body, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // key বদলে গেলে বা data নষ্ট হলে — crash না করে খালি ফেরত
    return "";
  }
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString("base64url");
}
