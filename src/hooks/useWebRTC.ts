"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "pusher-js";
import { api } from "@/lib/client/api";
import type { CallState } from "@/types";

type Signal = { callId: string; from: string; payload: unknown };
type Incoming = {
  callId: string;
  video: boolean;
  caller: { id: string; displayName: string; avatarUrl: string | null };
};

/**
 * ভয়েস (ও ভিডিও) কল।
 *
 * অডিও/ভিডিও সরাসরি দুই ব্রাউজারের মধ্যে যায় (peer-to-peer) —
 * আমাদের সার্ভার দিয়ে যায় না। সার্ভার শুধু "হ্যালো, আমি এখানে"
 * বার্তাগুলো (SDP + ICE) আদান-প্রদান করায়।
 */
export function useWebRTC(opts: {
  userChannel: Channel | null;
  partner: { id: string; displayName: string; avatarUrl: string | null } | null;
  onCallEvent?: (kind: "ended" | "rejected" | "missed") => void;
}) {
  const { userChannel, partner, onCallEvent } = opts;

  const [call, setCall] = useState<CallState | null>(null);
  const [muted, setMuted] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const pendingOffer = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const callIdRef = useRef<string | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);

  /* ─────────── cleanup ─────────── */
  const teardown = useCallback(() => {
    pc.current?.getSenders().forEach((s) => s.track?.stop());
    pc.current?.close();
    pc.current = null;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    pendingOffer.current = null;
    pendingIce.current = [];
    callIdRef.current = null;
    setRemoteStream(null);
    setMuted(false);
    setCall(null);
  }, []);

  const signal = useCallback(
    (kind: "offer" | "answer" | "ice", payload: unknown) => {
      if (!callIdRef.current) return;
      api("/api/rtc", {
        method: "POST",
        json: { callId: callIdRef.current, kind, payload },
        silent401: true,
      }).catch(() => {});
    },
    [],
  );

  /* ─────────── peer connection তৈরি ─────────── */
  const buildPeer = useCallback(
    async (video: boolean) => {
      const { iceServers, turn } = await api<{ iceServers: RTCIceServer[]; turn: boolean }>(
        "/api/calls/ice",
      );
      if (!turn) {
        console.warn("[call] TURN নেই — আলাদা নেটওয়ার্কে কল নাও লাগতে পারে");
      }

      const peer = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: video ? { width: 1280, height: 720, facingMode: "user" } : false,
      });
      localStream.current = stream;
      stream.getTracks().forEach((t) => peer.addTrack(t, stream));

      peer.onicecandidate = (e) => {
        if (e.candidate) signal("ice", e.candidate.toJSON());
      };

      peer.ontrack = (e) => {
        const [incoming] = e.streams;
        setRemoteStream(incoming);
        // অডিও শোনার জন্য একটা লুকানো <audio> — ভিডিও ট্যাগ ছাড়াও কাজ করবে
        if (!remoteAudio.current) {
          const el = document.createElement("audio");
          el.autoplay = true;
          el.style.display = "none";
          document.body.appendChild(el);
          remoteAudio.current = el;
        }
        remoteAudio.current.srcObject = incoming;
        void remoteAudio.current.play().catch(() => {});
      };

      peer.onconnectionstatechange = () => {
        const s = peer.connectionState;
        if (s === "connected") {
          setCall((c) => (c ? { ...c, status: "active", startedAt: c.startedAt ?? Date.now() } : c));
        }
        if (s === "failed" || s === "disconnected" || s === "closed") {
          setCall((c) => (c && c.status === "active" ? { ...c, status: "ended" } : c));
        }
      };

      pc.current = peer;
      return peer;
    },
    [signal],
  );

  const drainIce = useCallback(async () => {
    const peer = pc.current;
    if (!peer?.remoteDescription) return;
    for (const c of pendingIce.current.splice(0)) {
      await peer.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
  }, []);

  /* ─────────── কল শুরু করা ─────────── */
  const startCall = useCallback(
    async (video = false) => {
      if (call || !partner) return;
      setError(null);
      try {
        const { callId } = await api<{ callId: string }>("/api/calls", {
          method: "POST",
          json: { video },
        });
        callIdRef.current = callId;
        setCall({
          callId,
          role: "caller",
          status: "ringing",
          video,
          peer: partner,
          startedAt: null,
        });

        const peer = await buildPeer(video);
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        signal("offer", offer);
      } catch (err) {
        console.error("[call] start failed", err);
        setError("কল শুরু করা গেল না — মাইক্রোফোনের অনুমতি দিয়েছ তো?");
        teardown();
      }
    },
    [call, partner, buildPeer, signal, teardown],
  );

  /* ─────────── কল ধরা ─────────── */
  const accept = useCallback(async () => {
    if (!call || call.role !== "callee") return;
    setError(null);
    try {
      setCall((c) => (c ? { ...c, status: "connecting" } : c));

      const peer = await buildPeer(call.video);
      if (pendingOffer.current) {
        await peer.setRemoteDescription(new RTCSessionDescription(pendingOffer.current));
        await drainIce();
      }
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      signal("answer", answer);

      await api(`/api/calls/${call.callId}`, { method: "PATCH", json: { action: "accept" } });
    } catch (err) {
      console.error("[call] accept failed", err);
      setError("কল ধরা গেল না");
      teardown();
    }
  }, [call, buildPeer, drainIce, signal, teardown]);

  /* ─────────── কাটা / রিজেক্ট ─────────── */
  const hangup = useCallback(
    async (action: "reject" | "end" = "end") => {
      const id = callIdRef.current ?? call?.callId;
      teardown();
      if (id) {
        await api(`/api/calls/${id}`, { method: "PATCH", json: { action }, silent401: true }).catch(
          () => {},
        );
      }
    },
    [call, teardown],
  );

  const toggleMute = useCallback(() => {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  /* ─────────── Pusher signaling ─────────── */
  useEffect(() => {
    if (!userChannel) return;

    const onIncoming = (data: Incoming) => {
      // ইতিমধ্যে কলে থাকলে নতুন রিং উপেক্ষা করি
      if (callIdRef.current) return;
      callIdRef.current = data.callId;
      setCall({
        callId: data.callId,
        role: "callee",
        status: "ringing",
        video: data.video,
        peer: data.caller,
        startedAt: null,
      });
    };

    const onOffer = async ({ callId, payload }: Signal) => {
      if (callId !== callIdRef.current) return;
      const offer = payload as RTCSessionDescriptionInit;
      if (pc.current) {
        await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
        await drainIce();
      } else {
        pendingOffer.current = offer; // এখনো accept করা হয়নি
      }
    };

    const onAnswer = async ({ callId, payload }: Signal) => {
      if (callId !== callIdRef.current || !pc.current) return;
      await pc.current.setRemoteDescription(
        new RTCSessionDescription(payload as RTCSessionDescriptionInit),
      );
      await drainIce();
      setCall((c) => (c ? { ...c, status: "connecting" } : c));
    };

    const onIce = async ({ callId, payload }: Signal) => {
      if (callId !== callIdRef.current) return;
      const candidate = payload as RTCIceCandidateInit;
      if (pc.current?.remoteDescription) {
        await pc.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingIce.current.push(candidate); // remote description আসার আগে জমিয়ে রাখি
      }
    };

    const onAccepted = () => setCall((c) => (c ? { ...c, status: "connecting" } : c));
    const onRejected = () => {
      teardown();
      onCallEvent?.("rejected");
    };
    const onEnded = () => {
      teardown();
      onCallEvent?.("ended");
    };

    userChannel.bind("call:incoming", onIncoming);
    userChannel.bind("webrtc:offer", onOffer);
    userChannel.bind("webrtc:answer", onAnswer);
    userChannel.bind("webrtc:ice", onIce);
    userChannel.bind("call:accepted", onAccepted);
    userChannel.bind("call:rejected", onRejected);
    userChannel.bind("call:ended", onEnded);

    return () => {
      userChannel.unbind("call:incoming", onIncoming);
      userChannel.unbind("webrtc:offer", onOffer);
      userChannel.unbind("webrtc:answer", onAnswer);
      userChannel.unbind("webrtc:ice", onIce);
      userChannel.unbind("call:accepted", onAccepted);
      userChannel.unbind("call:rejected", onRejected);
      userChannel.unbind("call:ended", onEnded);
    };
  }, [userChannel, drainIce, teardown, onCallEvent]);

  // পেজ বন্ধ হলে কল ঝুলে থাকবে না
  useEffect(() => {
    return () => {
      remoteAudio.current?.remove();
      remoteAudio.current = null;
    };
  }, []);

  return { call, muted, remoteStream, error, startCall, accept, hangup, toggleMute, localStream };
}
