"use client";

import { useEffect, useState } from "react";
import { checkSupport, getMediaStream, mediaErrorMessage, stopStream } from "@/lib/client/media";

type Row = { label: string; ok: boolean | null; note?: string };

/**
 * /diagnostics — when the mic or a call will not work, this page shows
 * exactly which step fails on the device that is actually failing.
 */
export default function Diagnostics() {
  const [rows, setRows] = useState<Row[]>([]);
  const [micRows, setMicRows] = useState<Row[]>([]);
  const [iceRows, setIceRows] = useState<Row[]>([]);
  const [pushRows, setPushRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const s = checkSupport();
    setRows([
      {
        label: "HTTPS / secure context",
        ok: s.secure,
        note: s.secure ? "" : "Opened over http:// — the microphone will not work",
      },
      { label: "getUserMedia (microphone access)", ok: s.getUserMedia },
      { label: "MediaRecorder (voice notes)", ok: s.mediaRecorder },
      { label: "RTCPeerConnection (calls)", ok: s.webrtc },
      {
        label: "AudioContext (waveform)",
        ok: s.audioContext,
        note: s.audioContext ? "" : "Recording still works, just without the waveform",
      },
    ]);
  }, []);

  async function testMic(video: boolean) {
    setBusy(video ? "camera" : "mic");
    const out: Row[] = [];
    try {
      const stream = await getMediaStream(video);
      const a = stream.getAudioTracks()[0];
      const v = stream.getVideoTracks()[0];
      out.push({ label: "Permission granted", ok: true });
      if (a) out.push({ label: "Audio track", ok: true, note: a.label || "unnamed" });
      if (video) out.push({ label: "Video track", ok: !!v, note: v?.label ?? "not found" });
      stopStream(stream);
      out.push({ label: "Tracks released", ok: true });
    } catch (err) {
      out.push({
        label: "Failed",
        ok: false,
        note: `${err instanceof DOMException ? err.name : "Error"} — ${mediaErrorMessage(err, video)}`,
      });
    }
    setMicRows(out);
    setBusy(null);
  }

  async function testIce() {
    setBusy("ice");
    const out: Row[] = [];
    try {
      const res = await fetch("/api/calls/ice");
      if (!res.ok) {
        out.push({
          label: "Fetch ICE servers",
          ok: false,
          note: `HTTP ${res.status} — are you signed in?`,
        });
        setIceRows(out);
        setBusy(null);
        return;
      }
      const { data } = (await res.json()) as {
        data: { iceServers: RTCIceServer[]; turn: boolean };
      };
      out.push({
        label: "Fetch ICE servers",
        ok: true,
        note: `${data.iceServers.length} servers, TURN: ${data.turn ? "yes" : "no"}`,
      });

      // Gather real candidates to see what this network allows
      const pc = new RTCPeerConnection({ iceServers: data.iceServers });
      pc.createDataChannel("probe");
      const kinds = new Set<string>();
      await new Promise<void>((resolve) => {
        const done = setTimeout(resolve, 6000);
        pc.onicecandidate = (e) => {
          if (!e.candidate) {
            clearTimeout(done);
            resolve();
            return;
          }
          const t = /typ (\w+)/.exec(e.candidate.candidate)?.[1];
          if (t) kinds.add(t);
        };
        pc.createOffer().then((o) => pc.setLocalDescription(o));
      });
      pc.close();

      out.push({ label: "host candidate (same network)", ok: kinds.has("host") });
      out.push({ label: "srflx candidate (STUN)", ok: kinds.has("srflx") });
      out.push({
        label: "relay candidate (TURN)",
        ok: kinds.has("relay"),
        note: kinds.has("relay")
          ? "Calls will work across different networks"
          : "No TURN relay — calls may fail across networks",
      });
    } catch (err) {
      out.push({ label: "Failed", ok: false, note: String(err) });
    }
    setIceRows(out);
    setBusy(null);
  }

  /**
   * Splits the two halves of "notifications do not work": whether this
   * device can display one at all, and whether a push from the server
   * reaches it. Chrome's "Possible spam" means the push arrived but the
   * worker failed to show anything — so testing them separately says
   * which half to fix.
   */
  async function testPush() {
    setBusy("push");
    const out: Row[] = [];

    try {
      out.push({
        label: "Notification permission",
        ok: Notification.permission === "granted",
        note: Notification.permission,
      });

      const reg = await navigator.serviceWorker.getRegistration();
      out.push({
        label: "Service worker registered",
        ok: !!reg,
        note: reg?.active ? "active" : reg ? "not active yet" : "missing",
      });

      const sub = await reg?.pushManager.getSubscription();
      out.push({
        label: "Push subscription",
        ok: !!sub,
        note: sub ? new URL(sub.endpoint).host : "none — turn notifications on first",
      });

      // Show one directly, without involving the server or the push
      // service. If this fails, nothing else can possibly work.
      if (reg && Notification.permission === "granted") {
        try {
          await reg.showNotification("Conversation", {
            body: "Shown directly by this page 💜",
            tag: "diag-local",
            icon: "/icon-192.png",
            badge: "/badge-72.png",
          });
          out.push({ label: "Show a notification locally", ok: true, note: "check your shade" });
        } catch (err) {
          out.push({
            label: "Show a notification locally",
            ok: false,
            note: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          });
        }
      }

      // Now the full path: server -> push service -> worker -> shade
      const res = await fetch("/api/push/test", { method: "POST" });
      const json = (await res.json()) as {
        message?: string;
        data?: { sent?: number; removed?: number };
      };
      out.push({
        label: "Send through the server",
        ok: res.ok && (json.data?.sent ?? 0) > 0,
        note: res.ok
          ? `${json.data?.sent ?? 0} device(s), ${json.data?.removed ?? 0} stale removed`
          : json.message ?? `HTTP ${res.status}`,
      });
    } catch (err) {
      out.push({ label: "Failed", ok: false, note: String(err) });
    }

    setPushRows(out);
    setBusy(null);
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 py-8">
      <h1 className="text-xl font-semibold text-white">Device check</h1>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        If voice notes or calls are not working, this shows where it breaks
      </p>

      <Section title="What this browser supports" rows={rows} />

      <div className="mt-6 flex flex-wrap gap-2">
        <Btn onClick={() => testMic(false)} busy={busy === "mic"}>
          🎤 Test microphone
        </Btn>
        <Btn onClick={() => testMic(true)} busy={busy === "camera"}>
          📹 Test camera
        </Btn>
        <Btn onClick={testIce} busy={busy === "ice"}>
          📞 Test call network
        </Btn>
        <Btn onClick={testPush} busy={busy === "push"}>
          🔔 Test notifications
        </Btn>
      </div>

      {micRows.length > 0 && <Section title="Microphone / camera" rows={micRows} />}
      {iceRows.length > 0 && <Section title="Call network" rows={iceRows} />}
      {pushRows.length > 0 && <Section title="Notifications" rows={pushRows} />}

      <div className="mt-8 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 text-xs leading-relaxed text-[var(--color-muted)]">
        <p className="mb-2 font-semibold text-white">Browser (user agent)</p>
        <p className="break-all font-mono text-[10px]">
          {typeof navigator !== "undefined" ? navigator.userAgent : ""}
        </p>
      </div>

      <a href="/chat" className="mt-6 inline-block text-sm text-[var(--color-accent-soft)]">
        ← Back to chat
      </a>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {title}
      </h2>
      <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]">
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-start gap-3 border-b border-[var(--color-line)] px-4 py-3 last:border-0"
          >
            <span className="mt-0.5 shrink-0">{r.ok === null ? "…" : r.ok ? "✅" : "❌"}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white">{r.label}</p>
              {r.note && (
                <p className="mt-0.5 break-words text-xs text-[var(--color-muted)]">{r.note}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Btn({
  onClick,
  busy,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-xl bg-[var(--color-panel-2)] px-4 py-2.5 text-sm text-white transition active:scale-95 disabled:opacity-50"
    >
      {busy ? "Running..." : children}
    </button>
  );
}
