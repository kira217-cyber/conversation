"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Heart, Loader2, Lock, Mail } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { getDeviceId, isInstalledApp, setTabSession } from "@/lib/client/device";

const REASONS: Record<string, string> = {
  idle: "You were signed out after a long time away",
  "other-device": "Someone signed in on another device, so this one was signed out",
  expired: "Please sign in again",
  "tab-closed": "The tab was closed — please sign in again",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const reason = params.get("reason");
    if (reason && REASONS[reason]) setNotice(REASONS[reason]);
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const data = await api<{ sessionId: string }>("/api/auth/login", {
        method: "POST",
        silent401: true,
        // The installed app gets a session that survives being closed
        json: { email, password, deviceId: getDeviceId(), persistent: isInstalledApp() },
      });

      // Mark this tab — without it, the next visit counts as a reopened tab
      setTabSession(data.sessionId);
      router.replace("/chat");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-900/40">
            <Heart className="h-8 w-8 fill-white text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-white">Our place</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Just the two of us — nobody else
          </p>
        </div>

        {notice && (
          <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {notice}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-6 shadow-2xl"
        >
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--color-muted)]">
              Email
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-ink)] px-3 focus-within:border-[var(--color-accent)]">
              <Mail className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
              <input
                type="email"
                required
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-[#5a6b74]"
                placeholder="tumi@ours.app"
              />
            </div>
          </label>

          <label className="mb-5 block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--color-muted)]">
              Password
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-ink)] px-3 focus-within:border-[var(--color-accent)]">
              <Lock className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-[#5a6b74]"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                // ট্যাব চেপে এখানে আটকাবে না, সরাসরি লগইন বাটনে যাবে
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide" : "Show"}
                className="shrink-0 rounded-lg p-1.5 text-[var(--color-muted)] transition hover:text-white"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 py-3 text-sm font-semibold text-white transition hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
            {busy ? "Signing in..." : "Come in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-[#5a6b74]">
          No new accounts can be created here.
          <br />
          Built for two people only.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
