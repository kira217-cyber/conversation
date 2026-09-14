import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getConversation, getPartner } from "@/lib/convo";
import { env } from "@/lib/env";
import ChatApp from "@/components/ChatApp";
import type { SessionInfo } from "@/types";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const auth = await getAuth();
  if (!auth.ok) redirect("/login?reason=expired");

  const [convo, partner] = await Promise.all([getConversation(), getPartner(auth.user.id)]);

  const initial: SessionInfo = {
    user: {
      id: auth.user.id,
      email: auth.user.email,
      displayName: auth.user.displayName,
      avatarUrl: auth.user.avatarUrl,
      role: auth.user.role,
    },
    partner,
    conversation: {
      id: convo.id,
      title: convo.title,
      wallpaper: convo.wallpaper,
      themeColor: convo.themeColor,
      anniversary: convo.anniversary?.toISOString() ?? null,
    },
    session: {
      id: auth.session.id,
      deviceLabel: auth.session.deviceLabel,
      lastActiveAt: auth.session.lastActiveAt.toISOString(),
    },
    idleTimeoutMinutes: env().IDLE_TIMEOUT_MINUTES,
  };

  return <ChatApp initial={initial} />;
}
