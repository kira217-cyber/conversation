"use client";

import { useState } from "react";
import { Bell, X } from "lucide-react";
import type { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * Buried in a menu, notifications never got switched on — so this asks
 * directly, once, at the top of the chat. Dismissing it is remembered
 * for the session; the menu toggle is still there either way.
 */
export default function NotificationPrompt({
  push,
}: {
  push: ReturnType<typeof usePushNotifications>;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (push.state !== "off" && push.state !== "denied") return null;

  const blocked = push.state === "denied";

  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-line)] bg-purple-500/10 px-4 py-2.5">
      <Bell className="h-4 w-4 shrink-0 text-[var(--color-accent-soft)]" />

      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed text-white">
          {blocked
            ? "Notifications are blocked. Allow them for this app in your phone's settings to hear about new messages."
            : "Turn on notifications so you know when a message arrives, even with the app closed."}
        </p>
      </div>

      {!blocked && (
        <button
          onClick={() => void push.enable()}
          className="shrink-0 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-3.5 py-1.5 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-60"
        >
          Turn on
        </button>
      )}

      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 rounded-full p-1 text-[var(--color-muted)] transition hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
