import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export type ApiOk<T> = { success: true; message: string; data: T };
export type ApiErr = { success: false; message: string; errorCode?: string; errors?: unknown };

export function ok<T>(data: T, message = "OK", init?: ResponseInit) {
  return NextResponse.json<ApiOk<T>>({ success: true, message, data }, init);
}

export function fail(status: number, message: string, errorCode?: string, errors?: unknown) {
  return NextResponse.json<ApiErr>({ success: false, message, errorCode, errors }, { status });
}

export function zodFail(error: ZodError) {
  return fail(
    422,
    "ইনপুট ঠিক নেই",
    "VALIDATION_ERROR",
    error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}

/** getAuth()-এর reason কে HTTP response-এ রূপান্তর */
export function authFail(reason: string) {
  const message =
    reason === "SESSION_IDLE"
      ? "অনেকক্ষণ নিষ্ক্রিয় ছিলে — আবার লগইন করো"
      : reason === "SESSION_REVOKED"
        ? "অন্য একটি ডিভাইসে লগইন হয়েছে"
        : "লগইন করতে হবে";
  return fail(401, message, reason);
}

export function handleError(err: unknown) {
  console.error("[api]", err);
  const message =
    process.env.NODE_ENV === "production"
      ? "কিছু একটা সমস্যা হয়েছে"
      : err instanceof Error
        ? err.message
        : "Unknown error";
  return fail(500, message, "INTERNAL_ERROR");
}
