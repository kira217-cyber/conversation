import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * No landing page — the domain is either the chat or the sign-in screen.
 *
 * The `reason` on the way out matters: it tells the middleware this cookie
 * has already been judged useless, so it gets cleared rather than bouncing
 * the person back here.
 */
export default async function Home() {
  const auth = await getAuth({ touch: false });
  redirect(auth.ok ? "/chat" : "/login?reason=expired");
}
