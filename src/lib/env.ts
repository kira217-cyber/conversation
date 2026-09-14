import { z } from "zod";

/**
 * সার্ভার-সাইড env। ভুল/missing env থাকলে boot-এই ধরা পড়বে,
 * production-এ গিয়ে রহস্যময় crash হবে না।
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  MESSAGE_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message: "MESSAGE_ENCRYPTION_KEY must decode to exactly 32 bytes (openssl rand -base64 32)",
    }),

  PUSHER_APP_ID: z.string().min(1),
  PUSHER_KEY: z.string().min(1),
  PUSHER_SECRET: z.string().min(1),
  PUSHER_CLUSTER: z.string().min(1),

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  CLOUDINARY_FOLDER: z.string().default("conversation"),

  // ঐচ্ছিক — না থাকলে শুধু STUN দিয়ে কল হবে (একই WiFi-তে কাজ করবে)
  CLOUDFLARE_TURN_KEY_ID: z.string().optional(),
  CLOUDFLARE_TURN_API_TOKEN: z.string().optional(),

  IDLE_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function env() {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`❌ Environment variable problem:\n${issues}\n\nCheck your .env.local file.`);
  }

  cached = parsed.data;
  return cached;
}

/** ক্লায়েন্টেও নিরাপদ (NEXT_PUBLIC_) */
export const publicEnv = {
  pusherKey: process.env.NEXT_PUBLIC_PUSHER_KEY ?? "",
  pusherCluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap2",
  cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "",
  idleMinutes: Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES ?? 30),
  anniversary: process.env.NEXT_PUBLIC_ANNIVERSARY_DATE ?? "",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Conversation",
};
