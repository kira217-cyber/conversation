import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { signUpload } from "@/lib/cloudinary";
import { authFail, handleError, ok, zodFail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ kind: z.enum(["image", "voice"]) });

/**
 * ব্রাউজার এই signature নিয়ে সরাসরি Cloudinary-তে আপলোড করে।
 * ফাইল আমাদের সার্ভারে আসেই না — তাই Vercel-এর ৪.৫MB limit
 * বা function timeout-এর সমস্যা হয় না।
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return zodFail(parsed.error);

    return ok(signUpload(parsed.data.kind));
  } catch (err) {
    return handleError(err);
  }
}
