"use client";

import { useEffect, useState } from "react";
import { checkSupport, getMediaStream, mediaErrorMessage, stopStream } from "@/lib/client/media";

type Row = { label: string; ok: boolean | null; note?: string };

/**
 * /diagnostics — মাইক বা কল কাজ না করলে এখানে এসে দেখলে
 * ঠিক কোন ধাপে আটকাচ্ছে সেটা বোঝা যায়।
 */
export default function Diagnostics() {
  const [rows, setRows] = useState<Row[]>([]);
  const [micRows, setMicRows] = useState<Row[]>([]);
  const [iceRows, setIceRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const s = checkSupport();
    setRows([
      { label: "HTTPS / secure context", ok: s.secure, note: s.secure ? "" : "http:// দিয়ে খুলেছ — মাইক কাজ করবে না" },
      { label: "getUserMedia (মাইক নেওয়া)", ok: s.getUserMedia },
      { label: "MediaRecorder (ভয়েস নোট)", ok: s.mediaRecorder },
      { label: "RTCPeerConnection (কল)", ok: s.webrtc },
      { label: "AudioContext (waveform)", ok: s.audioContext, note: s.audioContext ? "" : "waveform ছাড়াই রেকর্ড হবে" },
    ]);
  }, []);

  async function testMic(video: boolean) {
    setBusy(video ? "camera" : "mic");
    const out: Row[] = [];
    try {
      const stream = await getMediaStream(video);
      const a = stream.getAudioTracks()[0];
      const v = stream.getVideoTracks()[0];
      out.push({ label: "অনুমতি পাওয়া গেছে", ok: true });
      if (a) out.push({ label: "অডিও ট্র্যাক", ok: true, note: a.label || "নাম নেই" });
      if (video) out.push({ label: "ভিডিও ট্র্যাক", ok: !!v, note: v?.label ?? "পাওয়া যায়নি" });
      stopStream(stream);
      out.push({ label: "ট্র্যাক বন্ধ করা হলো", ok: true });
    } catch (err) {
      out.push({
        label: "ব্যর্থ",
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
        out.push({ label: "ICE server আনা", ok: false, note: `HTTP ${res.status} — লগইন করা আছে তো?` });
        setIceRows(out);
        setBusy(null);
        return;
      }
      const { data } = (await res.json()) as {
        data: { iceServers: RTCIceServer[]; turn: boolean };
      };
      out.push({ label: "ICE server আনা", ok: true, note: `${data.iceServers.length} টা, TURN: ${data.turn ? "আছে" : "নেই"}` });

      // সত্যিকারের candidate জোগাড় হয় কিনা দেখি
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

      out.push({ label: "host candidate (একই নেটওয়ার্ক)", ok: kinds.has("host") });
      out.push({ label: "srflx candidate (STUN)", ok: kinds.has("srflx") });
      out.push({
        label: "relay candidate (TURN)",
        ok: kinds.has("relay"),
        note: kinds.has("relay") ? "আলাদা নেটওয়ার্কেও কল হবে" : "TURN relay পাওয়া যায়নি",
      });
    } catch (err) {
      out.push({ label: "ব্যর্থ", ok: false, note: String(err) });
    }
    setIceRows(out);
    setBusy(null);
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 py-8">
      <h1 className="text-xl font-semibold text-white">যন্ত্রপাতি পরীক্ষা</h1>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        ভয়েস বা কল কাজ না করলে এখানে দেখো কোথায় আটকাচ্ছে
      </p>

      <Section title="ব্রাউজার কী কী পারে" rows={rows} />

      <div className="mt-6 flex flex-wrap gap-2">
        <Btn onClick={() => testMic(false)} busy={busy === "mic"}>
          🎤 মাইক পরীক্ষা
        </Btn>
        <Btn onClick={() => testMic(true)} busy={busy === "camera"}>
          📹 ক্যামেরা পরীক্ষা
        </Btn>
        <Btn onClick={testIce} busy={busy === "ice"}>
          📞 কলের নেটওয়ার্ক
        </Btn>
      </div>

      {micRows.length > 0 && <Section title="মাইক / ক্যামেরা" rows={micRows} />}
      {iceRows.length > 0 && <Section title="কলের নেটওয়ার্ক" rows={iceRows} />}

      <div className="mt-8 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 text-xs leading-relaxed text-[var(--color-muted)]">
        <p className="mb-2 font-semibold text-white">ব্রাউজার (user agent)</p>
        <p className="break-all font-mono text-[10px]">
          {typeof navigator !== "undefined" ? navigator.userAgent : ""}
        </p>
      </div>

      <a href="/chat" className="mt-6 inline-block text-sm text-[var(--color-accent-soft)]">
        ← চ্যাটে ফিরে যাও
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
              {r.note && <p className="mt-0.5 break-words text-xs text-[var(--color-muted)]">{r.note}</p>}
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
      {busy ? "চলছে..." : children}
    </button>
  );
}
