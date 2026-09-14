import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

/**
 * First-line guard. It can only see whether a cookie exists — there is no
 * database at the edge — so the real check (revoked? idle?) happens in
 * getAuth() on the page and in every API route.
 *
 * That gap is what caused a redirect loop. A cookie can outlive its
 * session: installed apps get one with a sixty-day lifetime, so a session
 * that was revoked leaves the cookie sitting there. The chat page would
 * reject it and send the person to /login, this file would see the cookie
 * and send them back to /chat, and round it went until the browser gave
 * up with ERR_TOO_MANY_REDIRECTS.
 *
 * The fix is the `reason` parameter. Anything that turns someone away
 * adds it, and arriving at /login with one means the cookie has already
 * been judged useless — so it is deleted here and the loop ends on the
 * first pass.
 */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const hasCookie = !!req.cookies.get(SESSION_COOKIE)?.value;

  if (pathname === "/login") {
    const rejected = searchParams.has("reason");

    if (rejected && hasCookie) {
      // The session behind this cookie is gone. Clear it, show the login page.
      const res = NextResponse.next();
      res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }

    // Already signed in and just visiting /login — send them to the chat
    if (hasCookie) return NextResponse.redirect(new URL("/chat", req.url));

    return NextResponse.next();
  }

  if (pathname.startsWith("/chat") && !hasCookie) {
    return NextResponse.redirect(new URL("/login?reason=expired", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/chat/:path*", "/login"],
};
