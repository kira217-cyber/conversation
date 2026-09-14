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
    "Invalid input",
    "VALIDATION_ERROR",
    error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}

/** getAuth()-এর reason কে HTTP response-এ রূপান্তর */
export function authFail(reason: string) {
  const message =
    reason === "SESSION_IDLE"
      ? "Signed out after a long time away"
      : reason === "SESSION_REVOKED"
        ? "Signed in on another device"
        : "Please sign in";
  return fail(401, message, reason);
}

export function handleError(err: unknown) {
  console.error("[api]", err);
  const message =
    process.env.NODE_ENV === "production"
      ? "Something went wrong"
      : err instanceof Error
        ? err.message
        : "Unknown error";
  return fail(500, message, "INTERNAL_ERROR");
}
