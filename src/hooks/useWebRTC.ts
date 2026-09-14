"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "pusher-js";
import { api } from "@/lib/client/api";
import { getMediaStream, mediaErrorMessage, stopStream } from "@/lib/client/media";
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
 * আমাদের সার্ভার দিয়ে যায় না। সার্ভার শুধু SDP আর ICE বার্তাগুলো
 * এদিক-ওদিক পৌঁছে দেয়।
 */
export function useWebRTC(opts: {
  userChannel: Channel | null;
  partner: { id: string; displayName: string; avatarUrl: string | null } | null;
  onCallEvent?: (kind: "ended" | "rejected") => void;
}) {
  const { userChannel, partner, onCallEvent } = opts;

  const [call, setCall] = useState<CallState | null>(null);
  const [muted, setMuted] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** ব্রাউজার autoplay আটকালে ব্যবহারকারীকে একটা ট্যাপ চাইতে হয় */
  const [needsTap, setNeedsTap] = useState(false);

  const pc = useRef<RTCPeerConnection | null>(null);
  const media = useRef<MediaStream | null>(null);
  const pendingOffer = useRef<{ callId: string; sdp: RTCSessionDescriptionInit } | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const callIdRef = useRef<string | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);

  /* ─────────── cleanup ─────────── */
  const teardown = useCallback(() => {
    try {
      pc.current?.close();
    } catch {
      /* ignore */
    }
    pc.current = null;

    stopStream(media.current);
    media.current = null;

    pendingOffer.current = null;
    pendingIce.current = [];
    callIdRef.current = null;

    if (audioEl.current) audioEl.current.srcObject = null;

    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setNeedsTap(false);
    setCall(null);
  }, []);

  const signal = useCallback((kind: "offer" | "answer" | "ice", payload: unknown) => {
    if (!callIdRef.current) return;
    api("/api/rtc", {
      method: "POST",
      json: { callId: callIdRef.current, kind, payload },
      silent401: true,
    }).catch(() => {});
  }, []);

  /** রিমোট অডিও বাজানো — autoplay ব্লক হলে ট্যাপ চাইব */
  const playRemote = useCallback((stream: MediaStream) => {
    if (!audioEl.current) {
      const el = document.createElement("audio");
      el.autoplay = true;
      el.setAttribute("playsinline", "");
      el.style.display = "none";
      document.body.appendChild(el);
      audioEl.current = el;
    }
    audioEl.current.srcObject = stream;
    audioEl.current
      .play()
      .then(() => setNeedsTap(false))
      .catch((err) => {
        console.warn("[call] autoplay আটকেছে", err);
        setNeedsTap(true);
      });
  }, []);

  const resumeAudio = useCallback(() => {
    audioEl.current
      ?.play()
      .then(() => setNeedsTap(false))
      .catch(() => {});
  }, []);

  /* ─────────── peer connection ─────────── */
  const buildPeer = useCallback(
    async (stream: MediaStream) => {
      const { iceServers, turn } = await api<{ iceServers: RTCIceServer[]; turn: boolean }>(
        "/api/calls/ice",
      );
      if (!turn) console.warn("[call] TURN নেই — আলাদা নেটওয়ার্কে কল নাও লাগতে পারে");

      const peer = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });

      stream.getTracks().forEach((t) => peer.addTrack(t, stream));

      peer.onicecandidate = (e) => {
        if (e.candidate) signal("ice", e.candidate.toJSON());
      };

      peer.ontrack = (e) => {
        const incoming = e.streams[0] ?? new MediaStream([e.track]);
        setRemoteStream(incoming);
        playRemote(incoming);
      };

      peer.onconnectionstatechange = () => {
        const s = peer.connectionState;
        if (s === "connected") {
          setCall((c) => (c ? { ...c, status: "active", startedAt: c.startedAt ?? Date.now() } : c));
        } else if (s === "failed") {
          setError("সংযোগ হলো না — নেটওয়ার্ক পাল্টে আবার চেষ্টা করো");
        }
      };

      pc.current = peer;
      return peer;
    },
    [signal, playRemote],
  );

  const drainIce = useCallback(async () => {
    const peer = pc.current;
    if (!peer?.remoteDescription) return;
    for (const c of pendingIce.current.splice(0)) {
      await peer.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
  }, []);

  /* ─────────── কল শুরু ─────────── */
  const startCall = useCallback(
    async (video = false) => {
      if (call || !partner) return;
      setError(null);

      // ⚠️ সবার আগে মাইক চাই — এর আগে কোনো await নয়।
      // নেটওয়ার্ক কল মাঝে থাকলে iOS Safari অনুমতির প্রম্পট বাতিল করে দেয়।
      let stream: MediaStream;
      try {
        stream = await getMediaStream(video);
      } catch (err) {
        console.error("[call] getUserMedia", err);
        setError(mediaErrorMessage(err, video));
        return;
      }

      media.current = stream;
      setLocalStream(stream);

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

        const peer = await buildPeer(stream);
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        signal("offer", offer);
      } catch (err) {
        console.error("[call] start failed", err);
        setError("কল শুরু করা গেল না");
        teardown();
      }
    },
    [call, partner, buildPeer, signal, teardown],
  );

  /* ─────────── কল ধরা ─────────── */
  const accept = useCallback(async () => {
    if (!call || call.role !== "callee") return;
    setError(null);

    // এখানেও মাইক আগে — "Accept" ট্যাপের সাথে সাথেই
    let stream: MediaStream;
    try {
      stream = await getMediaStream(call.video);
    } catch (err) {
      console.error("[call] accept getUserMedia", err);
      setError(mediaErrorMessage(err, call.video));
      await api(`/api/calls/${call.callId}`, {
        method: "PATCH",
        json: { action: "reject" },
        silent401: true,
      }).catch(() => {});
      teardown();
      return;
    }

    media.current = stream;
    setLocalStream(stream);
    setCall((c) => (c ? { ...c, status: "connecting" } : c));

    try {
      const peer = await buildPeer(stream);

      const offer = pendingOffer.current;
      if (offer && offer.callId === call.callId) {
        await peer.setRemoteDescription(new RTCSessionDescription(offer.sdp));
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

  /* ─────────── কাটা ─────────── */
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
    const track = media.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  /* ─────────── signaling ─────────── */
  useEffect(() => {
    if (!userChannel) return;

    const onIncoming = (data: Incoming) => {
      if (callIdRef.current) return; // ইতিমধ্যে কলে আছি
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
      const sdp = payload as RTCSessionDescriptionInit;
      // offer কখনো call:incoming এর আগেও পৌঁছাতে পারে — তাই callId ধরে জমিয়ে রাখি
      if (pc.current && callId === callIdRef.current) {
        await pc.current.setRemoteDescription(new RTCSessionDescription(sdp));
        await drainIce();
      } else {
        pendingOffer.current = { callId, sdp };
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
        pendingIce.current.push(candidate);
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

  // পেজ ছাড়ার সময় মাইক ছেড়ে দাও
  useEffect(() => {
    return () => {
      stopStream(media.current);
      audioEl.current?.remove();
      audioEl.current = null;
    };
  }, []);

  return {
    call,
    muted,
    remoteStream,
    localStream,
    error,
    needsTap,
    startCall,
    accept,
    hangup,
    toggleMute,
    resumeAudio,
    clearError: () => setError(null),
  };
}
