"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Heart, Loader2, Lock, Mail } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { getDeviceId, setTabSession } from "@/lib/client/device";

const REASONS: Record<string, string> = {
  idle: "অনেকক্ষণ চুপচাপ ছিলে — নিরাপত্তার জন্য লগআউট করে দেওয়া হয়েছে",
  "other-device": "অন্য একটি ডিভাইসে লগইন হয়েছে, তাই এখান থেকে বের করে দেওয়া হলো",
  expired: "আবার লগইন করো",
  "tab-closed": "ট্যাব বন্ধ হয়েছিল — আবার লগইন করো",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        json: { email, password, deviceId: getDeviceId() },
      });

      // ট্যাব-মার্কার বসানো — এটা না থাকলে পরেরবার ঢুকলে logout হয়ে যাবে
      setTabSession(data.sessionId);
      router.replace("/chat");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "লগইন করা গেল না");
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
          <h1 className="text-2xl font-semibold text-white">আমাদের জায়গা</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            শুধু আমাদের দুজনের — আর কারও নয়
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
              ইমেইল
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
              পাসওয়ার্ড
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-ink)] px-3 focus-within:border-[var(--color-accent)]">
              <Lock className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-[#5a6b74]"
                placeholder="••••••••"
              />
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
            {busy ? "ঢুকছি..." : "ভেতরে এসো"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-[#5a6b74]">
          এখানে নতুন অ্যাকাউন্ট খোলা যায় না।
          <br />
          মাত্র দুজনের জন্য বানানো।
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
