"use client";

import { clearTabSession } from "./device";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errorCode?: string,
  ) {
    super(message);
  }
}

let loggingOut = false;

/** 401 এলে একবারই লগইন পেজে পাঠাবে, বারবার নয় */
function bounceToLogin(errorCode?: string) {
  if (loggingOut) return;
  loggingOut = true;
  clearTabSession();
  const reason =
    errorCode === "SESSION_IDLE" ? "idle"
    : errorCode === "SESSION_REVOKED" ? "other-device"
    : "expired";
  window.location.href = `/login?reason=${reason}`;
}

export async function api<T>(
  path: string,
  init?: RequestInit & { json?: unknown; silent401?: boolean },
): Promise<T> {
  const { json, silent401, ...rest } = init ?? {};

  const res = await fetch(path, {
    ...rest,
    credentials: "same-origin",
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });

  let payload: { success?: boolean; message?: string; data?: T; errorCode?: string } = {};
  try {
    payload = await res.json();
  } catch {
    /* খালি body */
  }

  if (!res.ok) {
    if (res.status === 401 && !silent401) bounceToLogin(payload.errorCode);
    throw new ApiError(res.status, payload.message ?? "Something went wrong", payload.errorCode);
  }

  return payload.data as T;
}
