import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

/**
 * প্রথম স্তরের গার্ড — cookie আছে কিনা শুধু সেটাই দেখে (Edge-এ DB নেই)।
 * আসল যাচাই (session revoked? idle?) হয় API route-এ getAuth() দিয়ে।
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasCookie = !!req.cookies.get(SESSION_COOKIE)?.value;

  if (pathname === "/login" && hasCookie) {
    return NextResponse.redirect(new URL("/chat", req.url));
  }

  if (pathname.startsWith("/chat") && !hasCookie) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/chat/:path*", "/login"],
};
