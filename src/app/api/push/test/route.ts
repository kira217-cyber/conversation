import { getAuth } from "@/lib/auth";
import { pushToUser } from "@/lib/push";
import { authFail, handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Sends a notification to your own devices — the quickest way to prove it works. */
export async function POST() {
  try {
    const auth = await getAuth();
    if (!auth.ok) return authFail(auth.reason);

    const result = await pushToUser(auth.user.id, {
      title: "Conversation",
      body: "Notifications are working 💜",
      tag: "test",
      url: "/chat",
    });

    return ok(result, result.sent > 0 ? "Test notification sent" : "No devices registered yet");
  } catch (err) {
    return handleError(err);
  }
}
