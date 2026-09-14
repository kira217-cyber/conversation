"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "pusher-js";
import { api } from "@/lib/client/api";
import {
  cameraConstraints,
  checkSupport,
  getMediaStream,
  mediaErrorMessage,
  stopStream,
  tuneOpusForVoice,
} from "@/lib/client/media";
import type { CallState } from "@/types";

type Signal = { callId: string; from: string; payload: unknown };
type Incoming = {
  callId: string;
  video: boolean;
  caller: { id: string; displayName: string; avatarUrl: string | null };
};

/**
 * Voice and video calls.
 *
 * The media itself goes straight between the two browsers; our server only
 * carries the SDP and ICE messages that let them find each other.
 */
export function useWebRTC(opts: {
  userChannel: Channel | null;
  partner: { id: string; displayName: string; avatarUrl: string | null } | null;
  onCallEvent?: (kind: "ended" | "rejected") => void;
}) {
  const { userChannel, partner, onCallEvent } = opts;

  const [call, setCall] = useState<CallState | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** the browser blocked autoplay and wants a tap before it will make sound */
  const [needsTap, setNeedsTap] = useState(false);

  const pc = useRef<RTCPeerConnection | null>(null);
  const media = useRef<MediaStream | null>(null);
  /** the camera track parked while the screen is being shared */
  const cameraTrack = useRef<MediaStreamTrack | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const pendingOffer = useRef<{ callId: string; sdp: RTCSessionDescriptionInit } | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const callIdRef = useRef<string | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);

  const canShareScreen = typeof window !== "undefined" && checkSupport().screenShare;

  /* ─────────── cleanup ─────────── */
  const teardown = useCallback(() => {
    try {
      pc.current?.close();
    } catch {
      /* ignore */
    }
    pc.current = null;

    stopStream(media.current);
    stopStream(screenStream.current);
    cameraTrack.current?.stop();
    media.current = null;
    screenStream.current = null;
    cameraTrack.current = null;

    pendingOffer.current = null;
    pendingIce.current = [];
    callIdRef.current = null;

    if (audioEl.current) audioEl.current.srcObject = null;

    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    setSharingScreen(false);
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

  /**
   * Remote sound plays through exactly one element — this hidden <audio>.
   *
   * It used to also play through the <video> tag on a video call. Two
   * copies a few milliseconds apart sound like a metallic echo, and the
   * duplicate output defeats echo cancellation, which then lets the
   * speaker feed back into the microphone. That was the noise.
   */
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
        console.warn("[call] autoplay blocked", err);
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
      if (!turn) console.warn("[call] no TURN — calls may fail across networks");

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
          setError("Could not connect — try a different network");
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

  /* ─────────── start a call ─────────── */
  const startCall = useCallback(
    async (video = false) => {
      if (call || !partner) return;
      setError(null);

      // ⚠️ Microphone first, before any await on the network. iOS Safari
      // dismisses the permission prompt if a request comes in between.
      let stream: MediaStream;
      try {
        stream = await getMediaStream(video, "user");
      } catch (err) {
        console.error("[call] getUserMedia", err);
        setError(mediaErrorMessage(err, video));
        return;
      }

      media.current = stream;
      setLocalStream(stream);
      setFacing("user");

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
        signal("offer", { ...offer, sdp: tuneOpusForVoice(offer.sdp ?? "") });
      } catch (err) {
        console.error("[call] start failed", err);
        setError("Could not start the call");
        teardown();
      }
    },
    [call, partner, buildPeer, signal, teardown],
  );

  /* ─────────── answer ─────────── */
  const accept = useCallback(async () => {
    if (!call || call.role !== "callee") return;
    setError(null);

    let stream: MediaStream;
    try {
      stream = await getMediaStream(call.video, "user");
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
    setFacing("user");
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
      signal("answer", { ...answer, sdp: tuneOpusForVoice(answer.sdp ?? "") });

      await api(`/api/calls/${call.callId}`, { method: "PATCH", json: { action: "accept" } });
    } catch (err) {
      console.error("[call] accept failed", err);
      setError("Could not answer the call");
      teardown();
    }
  }, [call, buildPeer, drainIce, signal, teardown]);

  /* ─────────── hang up ─────────── */
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

  const toggleCamera = useCallback(() => {
    const track = media.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
  }, []);

  /** Front ↔ back. replaceTrack swaps it without renegotiating. */
  const switchCamera = useCallback(async () => {
    if (!call?.video || sharingScreen) return;
    const next = facing === "user" ? "environment" : "user";

    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: cameraConstraints(next),
        audio: false,
      });
      const track = fresh.getVideoTracks()[0];
      track.contentHint = "motion";

      const sender = pc.current?.getSenders().find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(track);

      const old = media.current?.getVideoTracks()[0];
      if (old && media.current) {
        media.current.removeTrack(old);
        old.stop();
        media.current.addTrack(track);
        setLocalStream(new MediaStream(media.current.getTracks()));
      }
      setFacing(next);
    } catch (err) {
      console.error("[call] camera switch failed", err);
      setError("Could not switch camera");
    }
  }, [call?.video, facing, sharingScreen]);

  /**
   * Screen sharing swaps the outgoing video track. No renegotiation is
   * needed for a like-for-like swap, so it only works during a video call
   * — an audio call has no video sender to replace.
   */
  const startScreenShare = useCallback(async () => {
    if (!call?.video || !pc.current) return;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = display.getVideoTracks()[0];
      // "detail" keeps text sharp at the cost of frame rate, which is the
      // right trade for a screen
      track.contentHint = "detail";

      const sender = pc.current.getSenders().find((s) => s.track?.kind === "video");
      if (!sender) {
        stopStream(display);
        return;
      }

      cameraTrack.current = media.current?.getVideoTracks()[0] ?? null;
      screenStream.current = display;
      await sender.replaceTrack(track);
      setSharingScreen(true);
      setLocalStream(display);

      // The browser's own "Stop sharing" bar bypasses our button
      track.addEventListener("ended", () => void stopScreenShare());
    } catch (err) {
      // Cancelling the picker throws NotAllowedError; that is not a failure
      if ((err as DOMException)?.name !== "NotAllowedError") {
        console.error("[call] screen share failed", err);
        setError("Could not share the screen");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.video]);

  const stopScreenShare = useCallback(async () => {
    const sender = pc.current?.getSenders().find((s) => s.track?.kind === "video");
    const camera = cameraTrack.current;

    stopStream(screenStream.current);
    screenStream.current = null;

    if (sender && camera && camera.readyState === "live") {
      await sender.replaceTrack(camera);
    } else if (sender && call?.video) {
      // The camera track died while sharing — open a fresh one
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({
          video: cameraConstraints(facing),
          audio: false,
        });
        const t = fresh.getVideoTracks()[0];
        t.contentHint = "motion";
        await sender.replaceTrack(t);
        cameraTrack.current = t;
      } catch {
        /* nothing more to try */
      }
    }

    setSharingScreen(false);
    if (media.current) setLocalStream(new MediaStream(media.current.getTracks()));
  }, [call?.video, facing]);

  /* ─────────── signalling ─────────── */
  useEffect(() => {
    if (!userChannel) return;

    const onIncoming = (data: Incoming) => {
      if (callIdRef.current) return; // already on a call
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
      // The offer can arrive before call:incoming, so keep it by callId
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

  // Release the microphone when the page goes away
  useEffect(() => {
    return () => {
      stopStream(media.current);
      stopStream(screenStream.current);
      audioEl.current?.remove();
      audioEl.current = null;
    };
  }, []);

  return {
    call,
    muted,
    cameraOff,
    sharingScreen,
    facing,
    canShareScreen,
    remoteStream,
    localStream,
    error,
    needsTap,
    startCall,
    accept,
    hangup,
    toggleMute,
    toggleCamera,
    switchCamera,
    startScreenShare,
    stopScreenShare,
    resumeAudio,
    clearError: () => setError(null),
  };
}
