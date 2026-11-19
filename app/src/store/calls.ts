// One-to-one voice and video calls: WebRTC media in the webview, signaling through the core (end-to-end
// encrypted over the Signal sessions, see crates/chat-core/src/engine/calls.rs).
//
// Caller: offer to every device of the peer -> devices ring and reply "ringing" -> the first
// device that answers gets the call (its device id becomes the target of every later signal)
// and tells its sibling devices to stop ringing. ICE candidates are trickled in batches.
//
// Video: the offer carries `video: true`; both sides send a camera track on the same peer
// connection. Turning the camera off only disables the track (no renegotiation) and tells the
// peer with a "media" signal, so it shows the avatar instead of black frames.
//
// Screen sharing (desktop only; phones can watch and ask): the screen travels on the call's
// single video section. In a video call it takes the camera's place on the wire (the camera
// resumes when sharing stops); in a voice call the section is added once with a "renegotiate"
// offer and kept for later shares. "media" `{screen: bool}` tells the peer what the video is;
// "screen" `{request: true}` asks the peer to share, `{declined: true}` says no.

import { BRAND_NAME } from "../brand";
import { notifications } from "@mantine/notifications";
import { create } from "zustand";
import i18n from "../i18n";
import { api } from "../lib/api";
import { getAppearance } from "../lib/appearance";
import type { CallRecordStatus, CallSignalEvent, CallSignalKind } from "../lib/backend";
import { cleanCandidate, MAX_REMOTE_ICE, validSdp } from "../lib/callChecks";
import { blockedByCallSettings, relayCandidate, relayOnly } from "../lib/callSettings";
import { showNotification } from "../lib/platform";
import { startRingback, startRingtone } from "../lib/sounds";
import { audioSenders, CallVoiceFx, useCallAudioPrefs, type VoiceEffect } from "../lib/voiceFx";
import { prioritizeAudio, QualityMeter, tuned, VIDEO_MIN_BITRATE, type Quality } from "../lib/callAudio";
import { getApp } from "./app";
import { inGroupCall } from "./groupCalls";

/** Unanswered calls stop ringing after this long. */
const RING_TIMEOUT_MS = 45_000;
/** A connection that stays down ("disconnected" / "failed") this long is given up. In between,
 *  the caller restarts ICE (a "reoffer"): a network change or a peer whose phone was locked for
 *  a moment should not end the call. */
const DISCONNECT_GRACE_MS = 30_000;
/** "disconnected" often recovers by itself: the restart waits this long first. */
const RESTART_DELAY_MS = 2_000;
/** At most one ICE restart this often while the connection is down. */
const RESTART_EVERY_MS = 8_000;
const ICE_BATCH_MS = 120;
/** A request to see the peer's screen is given up (button enabled again) after this long. */
const ASK_TIMEOUT_MS = 30_000;

export type CallPhase = "outgoing" | "incoming" | "connecting" | "active";

export interface CallState {
  callId: string;
  conversationId: string;
  peerAccountId: string;
  peerName: string;
  peerAvatar: string | null;
  direction: "out" | "in";
  phase: CallPhase;
  /** Outgoing: the other side's device rings. */
  ringing: boolean;
  muted: boolean;
  /** Our voice effect (lib/voiceFx.ts), "none" at the start of every call. */
  voiceEffect: VoiceEffect;
  /** AI noise reduction of our microphone (starts from the setting, lib/voiceFx.ts). */
  denoise: boolean;
  /** Connection quality while active (lib/callAudio.ts). */
  quality: Quality["level"];
  qualityWho: Quality["who"];
  /** Our camera was stopped because the connection could not carry video. */
  autoCameraOff: boolean;
  /** Video call (the caller asked for video). */
  video: boolean;
  /** Our camera is sending. */
  cameraOn: boolean;
  /** The peer's camera is sending. */
  remoteCameraOn: boolean;
  /** We are sharing our screen (its video replaces the camera's on the wire). */
  screenOn: boolean;
  /** The peer's video is its screen, not its camera. */
  remoteScreenOn: boolean;
  /** The peer asked to see our screen (answered with answerScreenRequest). */
  screenRequest: boolean;
  /** We asked to see the peer's screen and wait for it. */
  screenAsked: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** Bumped when a remote track arrives: the stream object stays the same, the <video> rebinds. */
  remoteVersion: number;
  startedAt: number;
  connectedAt: number | null;
}

interface CallStore {
  call: CallState | null;
}

export const useCall = create<CallStore>(() => ({ call: null }));

const set = (patch: Partial<CallState>) =>
  useCall.setState((s) => (s.call ? { call: { ...s.call, ...patch } } : s));

/** WebRTC and microphone are available in this webview. */
export function callsSupported(): boolean {
  return typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** This webview can capture the screen (desktop webviews; a phone cannot share its screen). */
export function screenShareSupported(): boolean {
  return typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

// --- non-reactive session state ---------------------------------------------------------

interface Session {
  callId: string;
  pc: RTCPeerConnection | null;
  stream: MediaStream | null;
  audio: HTMLAudioElement;
  /** Device of the peer we talk to (known after the offer / answer). */
  peerDevice: number | null;
  /** Remote offer of an incoming call, kept until accepted. */
  offerSdp: string | null;
  /** Remote candidates received before the remote description was set. */
  remoteIce: RTCIceCandidateInit[];
  /** Remote candidates accepted so far (capped at MAX_REMOTE_ICE per call). */
  remoteIceCount: number;
  /** Media only through our TURN relay: the peer must not learn our IP address. */
  relay: boolean;
  /** Our relay-only setting: never fall back to a direct connection. */
  relayStrict: boolean;
  /** Local candidates waiting to be sent (caller: until the answer names the device). */
  localIce: RTCIceCandidateInit[];
  iceTimer: number;
  ringTimer: number;
  disconnectTimer: number;
  restartTimer: number;
  /** Caller: an ICE restart offer is waiting for its answer. */
  restartPending: boolean;
  /** Remote candidates wait (a restart's new description is not set yet). */
  holdIce: boolean;
  lastRestart: number;
  stopSound: (() => void) | null;
  ended: boolean;
  fx: CallVoiceFx;
  qualityTimer: number;
  meter: QualityMeter;
  /** Consecutive samples with too little bandwidth for video. */
  lowBitrate: number;
  /** The screen capture while we share it. */
  screen: MediaStream | null;
  /** Our renegotiation offer waits for its answer. */
  renegotiatePending: boolean;
  renegotiateTimer: number;
  askTimer: number;
}

let session: Session | null = null;

function newSession(callId: string): Session {
  const audio = new Audio();
  audio.autoplay = true;
  const s: Session = {
    callId,
    pc: null,
    stream: null,
    audio,
    peerDevice: null,
    offerSdp: null,
    remoteIce: [],
    remoteIceCount: 0,
    relay: false,
    relayStrict: false,
    localIce: [],
    iceTimer: 0,
    ringTimer: 0,
    disconnectTimer: 0,
    restartTimer: 0,
    restartPending: false,
    holdIce: false,
    lastRestart: 0,
    stopSound: null,
    ended: false,
    fx: new CallVoiceFx(
      () => s.stream?.getAudioTracks()[0],
      () => audioSenders(s.pc),
    ),
    qualityTimer: 0,
    meter: new QualityMeter(),
    lowBitrate: 0,
    screen: null,
    renegotiatePending: false,
    renegotiateTimer: 0,
    askTimer: 0,
  };
  return s;
}

function myAccountId(): string {
  return getApp().appState?.account?.account_id ?? "";
}

function signal(kind: CallSignalKind, data?: unknown, opts: { toOwnDevices?: boolean } = {}) {
  const call = useCall.getState().call;
  if (!call || !session) return Promise.resolve();
  return api
    .callSignal({
      account_id: call.peerAccountId,
      call_id: call.callId,
      kind,
      data: data ?? null,
      target_device: opts.toOwnDevices ? null : session.peerDevice,
      to_own_devices: opts.toOwnDevices ?? false,
    })
    .catch((e: unknown) => console.warn(`call signal ${kind} failed`, e));
}

function stopSound() {
  session?.stopSound?.();
  if (session) session.stopSound = null;
}

export async function iceServers(): Promise<RTCIceServer[]> {
  try {
    return (await api.getIceServers()).ice_servers;
  } catch (e) {
    console.warn("ICE servers unavailable", e);
    return [];
  }
}

const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const VIDEO: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" };

/** Microphone, plus the camera for a video call. Without a camera the call goes on audio-only. */
export async function localMedia(video: boolean): Promise<MediaStream | null> {
  if (video) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: VIDEO });
    } catch (e) {
      console.warn("camera unavailable for call", e);
      notifications.show({ color: "orange", message: i18n.t("call.cameraError") });
    }
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
  } catch (e) {
    console.warn("microphone unavailable for call", e);
    notifications.show({ color: "red", message: i18n.t("voice.micError") });
    return null;
  }
}

function flushLocalIce() {
  const s = session;
  if (!s || s.localIce.length === 0) return;
  // The caller waits for the answer: until then it does not know which device to talk to.
  const call = useCall.getState().call;
  if (call?.direction === "out" && s.peerDevice === null) return;
  const candidates = s.localIce.splice(0);
  void signal("ice", { candidates });
}

export function hasTurn(servers: RTCIceServer[]): boolean {
  return servers.some((srv) => (Array.isArray(srv.urls) ? srv.urls : [srv.urls]).some((u) => /^turns?:/.test(u)));
}

/** Relay-only calls (our setting) need a TURN server: without one the call is refused. */
function relayUnavailable(s: Session, servers: RTCIceServer[]): boolean {
  if (!s.relayStrict || hasTurn(servers)) return false;
  notifications.show({ color: "red", message: i18n.t("call.relayUnavailable") });
  return true;
}

function createPeerConnection(servers: RTCIceServer[], stream: MediaStream): RTCPeerConnection {
  const s = session!;
  // Calls with someone we have not accepted, and every call with our relay-only setting on, go
  // through the relay only, so the peer cannot learn our IP address. Without a TURN server a
  // stranger's call would never connect: it then goes direct (relay-only calls are refused
  // before getting here, see relayUnavailable).
  let iceTransportPolicy: RTCIceTransportPolicy = "all";
  if (s.relay || s.relayStrict) {
    if (hasTurn(servers)) iceTransportPolicy = "relay";
    else console.warn("call: relay-only requested but no TURN server is configured; connecting directly");
  }
  const pc = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy });
  for (const track of stream.getTracks()) pc.addTrack(track.kind === "audio" ? s.fx.outgoing(track) : track, stream);
  // A video call without our own camera still receives the peer's video.
  if (useCall.getState().call?.video && stream.getVideoTracks().length === 0) {
    pc.addTransceiver("video", { direction: "recvonly" });
  }
  pc.onicecandidate = (e) => {
    if (!e.candidate || session !== s) return;
    const c = e.candidate.toJSON();
    // Defense in depth: with the relay policy WebRTC gathers nothing else.
    if (iceTransportPolicy === "relay" && !relayCandidate(c)) return;
    s.localIce.push(c);
    window.clearTimeout(s.iceTimer);
    s.iceTimer = window.setTimeout(flushLocalIce, ICE_BATCH_MS);
  };
  pc.ontrack = (e) => {
    if (session !== s) return;
    const remote = e.streams[0] ?? new MediaStream([e.track]);
    // Audio plays through the hidden element; the (muted) video element only draws frames.
    // A video track added later (the peer's screen) comes in the same stream: the element
    // keeps playing, the state only tells the UI that the stream changed.
    if (s.audio.srcObject !== remote && remote.getAudioTracks().length > 0) {
      s.audio.srcObject = remote;
      void s.audio.play().catch((err: unknown) => console.warn("remote audio playback", err));
    }
    set({ remoteStream: remote, remoteVersion: (useCall.getState().call?.remoteVersion ?? 0) + 1 });
  };
  pc.onconnectionstatechange = () => {
    if (session !== s) return;
    const state = pc.connectionState;
    if (state === "connected") {
      window.clearTimeout(s.disconnectTimer);
      s.disconnectTimer = 0;
      window.clearTimeout(s.restartTimer);
      s.restartTimer = 0;
      const call = useCall.getState().call;
      if (call && call.phase !== "active") set({ phase: "active", connectedAt: call.connectedAt ?? Date.now() });
      void prioritizeAudio(pc);
      if (!s.qualityTimer) s.qualityTimer = window.setInterval(() => void checkQuality(s), QUALITY_EVERY_MS);
    } else if (state === "disconnected") {
      connectionLost(s);
      window.clearTimeout(s.restartTimer);
      s.restartTimer = window.setTimeout(() => void restartIce(s), RESTART_DELAY_MS);
    } else if (state === "failed") {
      // One more chance (ICE restart) before the call is given up.
      connectionLost(s);
      window.clearTimeout(s.restartTimer);
      s.restartTimer = 0;
      void restartIce(s);
    }
  };
  return pc;
}

const QUALITY_EVERY_MS = 2_000;

/** Updates the "weak connection" notice; in a video call, stops our camera when the
 *  connection cannot carry it any more (6 s below VIDEO_MIN_BITRATE), so the voice stays clear. */
async function checkQuality(s: Session) {
  const pc = s.pc;
  if (session !== s || s.ended || !pc || pc.connectionState !== "connected") return;
  let q: Quality;
  try {
    q = await s.meter.sample(pc);
  } catch {
    return;
  }
  const call = useCall.getState().call;
  if (session !== s || !call) return;
  if (call.quality !== q.level || call.qualityWho !== q.who) set({ quality: q.level, qualityWho: q.who });
  s.lowBitrate = q.outBitrate !== null && q.outBitrate < VIDEO_MIN_BITRATE && q.level !== "good" ? s.lowBitrate + 1 : 0;
  // While the screen is shared the camera is not on the wire: nothing to stop.
  if (call.video && call.cameraOn && !call.screenOn && s.lowBitrate >= 3) {
    s.lowBitrate = 0;
    toggleCamera();
    set({ autoCameraOff: true });
  }
}

/** The connection went down: the call ends unless it is back within DISCONNECT_GRACE_MS. */
function connectionLost(s: Session) {
  if (s.disconnectTimer) return;
  s.disconnectTimer = window.setTimeout(() => {
    if (session === s) void endCall("failed", true);
  }, DISCONNECT_GRACE_MS);
}

/** ICE restart by the side that made the original offer (the caller), on the same peer
 *  connection and call id: a "reoffer" to the device we talk to, answered with an "answer".
 *  The callee waits for it. Retried while the connection stays down. */
async function restartIce(s: Session) {
  s.restartTimer = 0;
  const call = useCall.getState().call;
  const pc = s.pc;
  if (session !== s || s.ended || !call || call.direction !== "out" || !pc || s.peerDevice === null) return;
  if (call.phase !== "connecting" && call.phase !== "active") return;
  if (!pc.remoteDescription && !s.restartPending) return;
  if (pc.connectionState === "connected") return;
  const wait = s.lastRestart + RESTART_EVERY_MS - Date.now();
  if (wait > 0) {
    s.restartTimer = window.setTimeout(() => void restartIce(s), wait);
    return;
  }
  s.lastRestart = Date.now();
  try {
    const offer = tuned(await pc.createOffer({ iceRestart: true }));
    if (session !== s || s.ended) return;
    await pc.setLocalDescription(offer);
    if (session !== s || s.ended) return;
    // Candidates of the old generation are of no use any more; new ones wait for the answer.
    s.restartPending = true;
    s.holdIce = true;
    s.remoteIce = [];
    s.remoteIceCount = 0;
    await signal("reoffer", { sdp: offer.sdp });
  } catch (e) {
    console.warn("call: ICE restart failed", e);
  }
  // Still down at the next slot: another attempt (the grace timer ends the call eventually).
  if (session === s && !s.ended && s.disconnectTimer) {
    window.clearTimeout(s.restartTimer);
    s.restartTimer = window.setTimeout(() => void restartIce(s), RESTART_EVERY_MS);
  }
}

/** A new offer for the media of the call in progress (the screen's video section), on the same
 *  peer connection, from either side; answered with a plain "answer". Waits for a stable
 *  signaling state (an ICE restart in flight) and gives up after a few tries. */
async function renegotiate(s: Session, attempt = 0) {
  s.renegotiateTimer = 0;
  const pc = s.pc;
  if (session !== s || s.ended || !pc || s.peerDevice === null) return;
  if (pc.signalingState !== "stable" || s.restartPending) {
    if (attempt < 5) s.renegotiateTimer = window.setTimeout(() => void renegotiate(s, attempt + 1), 1_000);
    return;
  }
  try {
    const offer = tuned(await pc.createOffer());
    if (session !== s || s.ended) return;
    await pc.setLocalDescription(offer);
    if (session !== s || s.ended) return;
    s.renegotiatePending = true;
    await signal("renegotiate", { sdp: offer.sdp });
  } catch (e) {
    console.warn("call: renegotiation failed", e);
  }
}

/** The peer's offer arrived while ours waits for its answer (both sides changed the call at
 *  once). The callee gives way: it withdraws its offer, answers, and offers again afterwards.
 *  The caller keeps its offer and ignores the peer's (false), which the callee then answers. */
async function yieldToOffer(s: Session, pc: RTCPeerConnection): Promise<boolean> {
  if (pc.signalingState !== "have-local-offer") return true;
  if (useCall.getState().call?.direction === "out") return false;
  await pc.setLocalDescription({ type: "rollback" });
  if (s.renegotiatePending) {
    s.renegotiatePending = false;
    window.clearTimeout(s.renegotiateTimer);
    s.renegotiateTimer = window.setTimeout(() => void renegotiate(s), 500);
  }
  return true;
}

async function applyRemoteIce() {
  const s = session;
  if (!s?.pc?.remoteDescription || s.holdIce) return;
  for (const c of s.remoteIce.splice(0)) {
    await s.pc.addIceCandidate(c).catch((e: unknown) => console.warn("bad ICE candidate", e));
  }
}

function cleanup() {
  const s = session;
  if (!s) return;
  s.ended = true;
  stopSound();
  window.clearTimeout(s.iceTimer);
  window.clearTimeout(s.ringTimer);
  window.clearTimeout(s.disconnectTimer);
  window.clearTimeout(s.restartTimer);
  window.clearTimeout(s.renegotiateTimer);
  window.clearTimeout(s.askTimer);
  window.clearInterval(s.qualityTimer);
  s.fx.stop();
  s.stream?.getTracks().forEach((t) => t.stop());
  s.screen?.getTracks().forEach((t) => {
    t.onended = null;
    t.stop();
  });
  s.pc?.close();
  s.audio.srcObject = null;
  session = null;
  useCall.setState({ call: null });
}

/** Ends the current call, records it in the conversation and optionally tells the peer. */
async function endCall(status: CallRecordStatus, notifyPeer: boolean, reason?: string) {
  const call = useCall.getState().call;
  if (!call || !session || session.ended) return;
  if (notifyPeer) await signal("hangup", { reason: reason ?? status });
  const duration = call.connectedAt ? Date.now() - call.connectedAt : 0;
  const finalStatus: CallRecordStatus = call.connectedAt ? "answered" : status;
  cleanup();
  await api
    .recordCall({
      conversation_id: call.conversationId,
      call_id: call.callId,
      caller_account_id: call.direction === "out" ? myAccountId() : call.peerAccountId,
      status: finalStatus,
      duration_ms: duration,
      started_at: call.startedAt,
    })
    .catch((e: unknown) => console.warn("record call failed", e));
}

// --- public actions ---------------------------------------------------------------------

function hasCamera(stream: MediaStream): boolean {
  return stream.getVideoTracks().length > 0;
}

export async function startCall(conversationId: string, opts: { video?: boolean } = {}) {
  const video = opts.video === true;
  if (useCall.getState().call || inGroupCall()) return;
  const conv = getApp().conversations[conversationId];
  if (!conv || conv.kind !== "direct" || !conv.peer_account_id) return;
  if (!callsSupported()) {
    notifications.show({ color: "red", message: i18n.t("call.unsupported") });
    return;
  }
  if (blockedByCallSettings()) return;
  const callId = crypto.randomUUID();
  session = newSession(callId);
  const s = session;
  s.relay = strangerPeer(conv);
  s.relayStrict = relayOnly();
  useCall.setState({
    call: {
      callId,
      conversationId,
      peerAccountId: conv.peer_account_id,
      peerName: conv.title,
      peerAvatar: conv.avatar_path,
      direction: "out",
      phase: "outgoing",
      ringing: false,
      muted: false,
      voiceEffect: "none",
      denoise: false,
      quality: "good",
      qualityWho: null,
      autoCameraOff: false,
      video,
      cameraOn: video,
      remoteCameraOn: video,
      screenOn: false,
      remoteScreenOn: false,
      screenRequest: false,
      screenAsked: false,
      localStream: null,
      remoteStream: null,
      remoteVersion: 0,
      startedAt: Date.now(),
      connectedAt: null,
    },
  });
  const stream = await localMedia(video);
  if (session !== s) {
    stream?.getTracks().forEach((t) => t.stop());
    return;
  }
  if (!stream) {
    cleanup();
    return;
  }
  s.stream = stream;
  // The noise reduction setting applies from the start (before the peer connection exists).
  if (useCallAudioPrefs.getState().denoise) await setVoiceEffect({ denoise: true });
  set({ localStream: stream, cameraOn: hasCamera(stream) });
  const servers = await iceServers();
  if (session !== s) return;
  if (relayUnavailable(s, servers)) {
    cleanup();
    return;
  }
  const pc = createPeerConnection(servers, stream);
  s.pc = pc;
  const offer = tuned(await pc.createOffer());
  await pc.setLocalDescription(offer);
  if (session !== s) return;
  await signal("offer", { sdp: offer.sdp, video });
  s.stopSound = startRingback();
  s.ringTimer = window.setTimeout(() => void endCall("missed", true, "timeout"), RING_TIMEOUT_MS);
}

export async function acceptCall() {
  const call = useCall.getState().call;
  const s = session;
  if (!call || !s || call.phase !== "incoming" || !s.offerSdp) return;
  stopSound();
  window.clearTimeout(s.ringTimer);
  set({ phase: "connecting" });
  const stream = await localMedia(call.video);
  if (session !== s) {
    stream?.getTracks().forEach((t) => t.stop());
    return;
  }
  if (!stream) {
    await endCall("failed", true, "no_microphone");
    return;
  }
  s.stream = stream;
  // The noise reduction setting applies from the start (before the peer connection exists).
  if (useCallAudioPrefs.getState().denoise) await setVoiceEffect({ denoise: true });
  set({ localStream: stream, cameraOn: hasCamera(stream) });
  const servers = await iceServers();
  if (session !== s) return;
  if (relayUnavailable(s, servers)) {
    await endCall("failed", true, "relay_unavailable");
    return;
  }
  const pc = createPeerConnection(servers, stream);
  s.pc = pc;
  await pc.setRemoteDescription({ type: "offer", sdp: s.offerSdp });
  const answer = tuned(await pc.createAnswer());
  await pc.setLocalDescription(answer);
  if (session !== s) return;
  await signal("answer", { sdp: answer.sdp });
  if (call.video && !hasCamera(stream)) void signal("media", { camera: false });
  // Our other devices stop ringing.
  void signal("hangup", { reason: "answered_elsewhere" }, { toOwnDevices: true });
  await applyRemoteIce();
  flushLocalIce();
}

export async function declineCall() {
  const call = useCall.getState().call;
  if (!call || call.phase !== "incoming") return;
  void signal("hangup", { reason: "declined_elsewhere" }, { toOwnDevices: true });
  await endCall("declined", true, "declined");
}

export async function hangUp() {
  const call = useCall.getState().call;
  if (!call) return;
  if (call.phase === "incoming") return declineCall();
  await endCall(call.direction === "out" && !call.connectedAt ? "cancelled" : "answered", true);
}

export function toggleMute() {
  const call = useCall.getState().call;
  if (!call || !session?.stream) return;
  const muted = !call.muted;
  session.stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  set({ muted });
}

/** Switches our voice effect during the call (the other side hears it at once). */
export async function setVoiceEffect(change: { effect?: VoiceEffect; denoise?: boolean }) {
  const s = session;
  if (!s || !useCall.getState().call || s.ended) return;
  try {
    if ((await s.fx.set(change)) && session === s) set({ voiceEffect: s.fx.effect, denoise: s.fx.denoise });
  } catch (e) {
    console.warn("voice effect unavailable", e);
    notifications.show({ color: "red", message: i18n.t("voiceFx.error") });
    await s.fx.set({ effect: "none", denoise: false }).catch(() => undefined);
    if (session === s) set({ voiceEffect: "none", denoise: false });
  }
}

export function toggleCamera() {
  const call = useCall.getState().call;
  const track = session?.stream?.getVideoTracks()[0];
  if (!call || !track) return;
  const cameraOn = !call.cameraOn;
  track.enabled = cameraOn;
  set({ cameraOn, autoCameraOff: false });
  // Before the answer the peer device is unknown: the state is sent once it answers.
  if (session?.peerDevice !== null && call.phase !== "incoming") void signal("media", { camera: cameraOn });
}

const SCREEN: MediaTrackConstraints = { frameRate: { ideal: 15, max: 30 } };

function inProgress(call: CallState): boolean {
  return call.phase === "connecting" || call.phase === "active";
}

/** Shares our screen with the peer (the system asks which screen or window). In a video call the
 *  screen takes the camera's place on the wire; in a voice call a video section is added once. */
export async function startScreenShare() {
  const call = useCall.getState().call;
  const s = session;
  if (!call || !s || s.ended || !s.pc || call.screenOn || !inProgress(call)) return;
  if (!screenShareSupported()) {
    notifications.show({ color: "red", message: i18n.t("call.screenError") });
    return;
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: SCREEN, audio: false });
  } catch (e) {
    // Cancelled in the system's picker: nothing to say.
    if (!(e instanceof DOMException && e.name === "NotAllowedError")) {
      console.warn("screen share", e);
      notifications.show({ color: "red", message: i18n.t("call.screenError") });
    }
    return;
  }
  const track = stream.getVideoTracks()[0];
  const pc = s.pc;
  if (session !== s || s.ended || !pc || !track || useCall.getState().call?.screenOn) {
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  // Text stays sharp: resolution before frame rate when bandwidth is short.
  track.contentHint = "detail";
  s.screen = stream;
  // Ended from the system's own "stop sharing" control.
  track.onended = () => {
    if (session === s && s.screen === stream) void stopScreenShare();
  };
  let needOffer = false;
  const videoTx = pc.getTransceivers().find((t) => t.receiver.track.kind === "video");
  try {
    if (videoTx) {
      await videoTx.sender.replaceTrack(track);
      // A video call without our camera only receives: the section now sends too.
      if (videoTx.direction === "recvonly" || videoTx.direction === "inactive") {
        videoTx.direction = "sendrecv";
        needOffer = true;
      }
    } else {
      // Voice call: the video section, in our stream (the peer sees one stream).
      pc.addTrack(track, s.stream ?? stream);
      needOffer = true;
    }
  } catch (e) {
    console.warn("screen share", e);
    s.screen = null;
    stream.getTracks().forEach((t) => t.stop());
    notifications.show({ color: "red", message: i18n.t("call.screenError") });
    return;
  }
  set({ screenOn: true, screenRequest: false });
  void signal("media", { screen: true });
  if (needOffer) void renegotiate(s);
}

/** Stops sharing our screen; in a video call the camera is back on the wire. */
export async function stopScreenShare() {
  const call = useCall.getState().call;
  const s = session;
  if (!call || !s || !call.screenOn) return;
  const stream = s.screen;
  s.screen = null;
  stream?.getTracks().forEach((t) => {
    t.onended = null;
    t.stop();
  });
  set({ screenOn: false });
  const pc = s.pc;
  if (!pc || s.ended) return;
  // The video section stays (sending nothing in a voice call) for a later share.
  const videoTx = pc.getTransceivers().find((t) => t.receiver.track.kind === "video");
  const camera = s.stream?.getVideoTracks()[0] ?? null;
  await videoTx?.sender.replaceTrack(camera).catch((e: unknown) => console.warn("call: camera back after screen share", e));
  void signal("media", { screen: false });
}

/** Asks the peer to share its screen (a phone answers that it cannot). */
export function askForScreen() {
  const call = useCall.getState().call;
  const s = session;
  if (!call || !s || s.peerDevice === null || call.screenAsked || call.remoteScreenOn || !inProgress(call)) return;
  set({ screenAsked: true });
  void signal("screen", { request: true });
  window.clearTimeout(s.askTimer);
  s.askTimer = window.setTimeout(() => {
    if (session === s) set({ screenAsked: false });
  }, ASK_TIMEOUT_MS);
}

/** Answers the peer's request to see our screen: shares it, or says no (also when the system's
 *  picker was cancelled). */
export async function answerScreenRequest(share: boolean) {
  if (!useCall.getState().call?.screenRequest) return;
  set({ screenRequest: false });
  if (share) await startScreenShare();
  if (!useCall.getState().call?.screenOn) void signal("screen", { declined: true });
}

// --- incoming signals -------------------------------------------------------------------

/** Well-formed remote candidates, within the per-call budget of `s`. */
function candidatesOf(s: Session, data: Record<string, unknown> | null): RTCIceCandidateInit[] {
  const list = data?.candidates;
  if (!Array.isArray(list)) return [];
  const out: RTCIceCandidateInit[] = [];
  for (const raw of list) {
    if (s.remoteIceCount >= MAX_REMOTE_ICE) break;
    const c = cleanCandidate(raw);
    if (!c) continue;
    s.remoteIceCount++;
    out.push(c);
  }
  return out;
}

function sdpOf(data: Record<string, unknown> | null): string | null {
  if (typeof data?.sdp !== "string") return null;
  if (!validSdp(data.sdp)) {
    console.warn("call: remote SDP rejected");
    return null;
  }
  return data.sdp;
}

/** The peer is not one of our contacts (an older core without the field: unknown, false). */
function strangerPeer(conv: object | undefined): boolean {
  return (conv as { peer_is_contact?: boolean } | undefined)?.peer_is_contact === false;
}

/** The core asks for a relay-only connection (caller not accepted); missing = false. */
function relayRequested(ev: CallSignalEvent): boolean {
  return (ev as CallSignalEvent & { relay?: boolean }).relay === true;
}

export async function handleCallSignal(ev: CallSignalEvent) {
  const call = useCall.getState().call;
  const s = session;
  const current = call && s && call.callId === ev.call_id ? call : null;

  if (ev.from_me) {
    // Answered or declined on another of our devices: stop ringing here.
    if (current?.phase === "incoming" && (ev.kind === "hangup" || ev.kind === "answer")) cleanup();
    return;
  }

  switch (ev.kind) {
    case "offer": {
      const sdp = sdpOf(ev.data);
      if (!sdp || !ev.conversation_id) return;
      // The same offer again (resent, or delivered twice): we are already handling it.
      if (call?.callId === ev.call_id) return;
      // Glare: we are calling this peer while they call us. Both sides decide the same way:
      // the lower call id wins. The winner ignores the other offer (the peer switches to it);
      // the loser drops its own call silently and rings for the winner's.
      if (call && s && call.direction === "out" && call.phase === "outgoing" && call.peerAccountId === ev.account_id) {
        if (call.callId < ev.call_id) return;
        // Stops the peer's other devices from ringing for our call; the device that called us
        // ignores it (another call id).
        await signal("hangup", { reason: "glare" });
        if (session === s) cleanup();
      }
      if (useCall.getState().call || inGroupCall()) {
        // Already in a call: tell the caller we are busy.
        await api
          .callSignal({ account_id: ev.account_id, call_id: ev.call_id, kind: "busy", target_device: ev.device_id })
          .catch(() => undefined);
        await api
          .recordCall({
            conversation_id: ev.conversation_id,
            call_id: ev.call_id,
            caller_account_id: ev.account_id,
            status: "missed",
            duration_ms: 0,
            started_at: Date.now(),
          })
          .catch(() => undefined);
        return;
      }
      if (!callsSupported()) {
        await api
          .recordCall({
            conversation_id: ev.conversation_id,
            call_id: ev.call_id,
            caller_account_id: ev.account_id,
            status: "missed",
            duration_ms: 0,
            started_at: Date.now(),
          })
          .catch(() => undefined);
        return;
      }
      const conv = getApp().conversations[ev.conversation_id];
      const contact = getApp().contacts[ev.account_id];
      session = newSession(ev.call_id);
      const ns = session;
      ns.peerDevice = ev.device_id;
      ns.offerSdp = sdp;
      ns.relay = relayRequested(ev) || strangerPeer(conv);
      ns.relayStrict = relayOnly();
      const video = ev.data?.video === true;
      const peerName = conv?.title ?? contact?.display_name ?? "";
      useCall.setState({
        call: {
          callId: ev.call_id,
          conversationId: ev.conversation_id,
          peerAccountId: ev.account_id,
          peerName,
          peerAvatar: conv?.avatar_path ?? contact?.avatar_path ?? null,
          direction: "in",
          phase: "incoming",
          ringing: true,
          muted: false,
      voiceEffect: "none",
      denoise: false,
      quality: "good",
      qualityWho: null,
      autoCameraOff: false,
          video,
          cameraOn: video,
          remoteCameraOn: video,
          screenOn: false,
          remoteScreenOn: false,
          screenRequest: false,
          screenAsked: false,
          localStream: null,
          remoteStream: null,
          remoteVersion: 0,
          startedAt: Date.now(),
          connectedAt: null,
        },
      });
      void signal("ringing");
      ns.stopSound = startRingtone();
      ns.ringTimer = window.setTimeout(() => void endCall("missed", false), RING_TIMEOUT_MS);
      if (!document.hasFocus()) {
        // "Notification preview" off: the OS may show it on the lock screen or keep it in its
        // history, so not who is calling.
        if (getAppearance().notifPreview) {
          void showNotification(i18n.t(video ? "call.incomingVideoTitle" : "call.incomingTitle"), peerName);
        } else {
          void showNotification(BRAND_NAME, i18n.t("call.incomingTitle"));
        }
      }
      return;
    }
    case "ringing":
      if (current?.direction === "out") set({ ringing: true });
      return;
    case "answer": {
      if (current && s?.pc && s.renegotiatePending && !s.restartPending && ev.device_id === s.peerDevice && inProgress(current)) {
        // Answer to our renegotiation (the screen's video section).
        const sdp = sdpOf(ev.data);
        if (!sdp) return;
        s.renegotiatePending = false;
        try {
          await s.pc.setRemoteDescription({ type: "answer", sdp });
        } catch (e) {
          console.warn("call: renegotiation answer rejected", e);
        }
        return;
      }
      if (current?.direction === "out" && s?.restartPending && s.pc && ev.device_id === s.peerDevice) {
        // Answer to our ICE restart.
        const sdp = sdpOf(ev.data);
        if (!sdp) return;
        s.restartPending = false;
        try {
          await s.pc.setRemoteDescription({ type: "answer", sdp });
        } catch (e) {
          console.warn("call: restart answer rejected", e);
          return;
        }
        s.holdIce = false;
        await applyRemoteIce();
        flushLocalIce();
        return;
      }
      if (!current || current.direction !== "out" || current.phase !== "outgoing" || !s) return;
      const sdp = sdpOf(ev.data);
      if (!sdp || !s.pc) return;
      s.peerDevice = ev.device_id;
      stopSound();
      window.clearTimeout(s.ringTimer);
      set({ phase: "connecting" });
      if (current.video && !useCall.getState().call?.cameraOn) void signal("media", { camera: false });
      await s.pc.setRemoteDescription({ type: "answer", sdp });
      await applyRemoteIce();
      flushLocalIce();
      return;
    }
    case "reoffer": {
      // The caller restarts ICE on the call in progress (same peer connection).
      if (!current || !s || current.direction !== "in" || ev.device_id !== s.peerDevice || !s.pc) return;
      if (current.phase !== "connecting" && current.phase !== "active") return;
      const sdp = sdpOf(ev.data);
      if (!sdp) return;
      // The caller restarts at most every RESTART_EVERY_MS: anything faster is not ours.
      if (Date.now() - s.lastRestart < 4_000) return;
      s.lastRestart = Date.now();
      // New candidates (with a fresh budget) wait until the new description is set.
      s.holdIce = true;
      s.remoteIce = [];
      s.remoteIceCount = 0;
      const pc = s.pc;
      try {
        await yieldToOffer(s, pc);
        await pc.setRemoteDescription({ type: "offer", sdp });
        const answer = tuned(await pc.createAnswer());
        if (session !== s || s.ended) return;
        await pc.setLocalDescription(answer);
        if (session !== s || s.ended) return;
        s.holdIce = false;
        await signal("answer", { sdp: answer.sdp });
      } catch (e) {
        console.warn("call: restart offer rejected", e);
        s.holdIce = false;
        return;
      }
      await applyRemoteIce();
      flushLocalIce();
      return;
    }
    case "renegotiate": {
      // The media of the call in progress changed (the peer's screen): a new offer from the
      // device we talk to, on the same peer connection.
      if (!current || !s || ev.device_id !== s.peerDevice || !s.pc || !inProgress(current)) return;
      const sdp = sdpOf(ev.data);
      if (!sdp) return;
      const pc = s.pc;
      try {
        if (!(await yieldToOffer(s, pc))) return;
        await pc.setRemoteDescription({ type: "offer", sdp });
        const answer = tuned(await pc.createAnswer());
        if (session !== s || s.ended) return;
        await pc.setLocalDescription(answer);
        if (session !== s || s.ended) return;
        await signal("answer", { sdp: answer.sdp });
      } catch (e) {
        console.warn("call: renegotiation offer rejected", e);
        return;
      }
      await applyRemoteIce();
      flushLocalIce();
      return;
    }
    case "ice": {
      if (!current || !s) return;
      // Before the answer, only candidates from the device we will talk to matter.
      if (s.peerDevice !== null && ev.device_id !== s.peerDevice) return;
      s.remoteIce.push(...candidatesOf(s, ev.data));
      await applyRemoteIce();
      return;
    }
    case "media": {
      if (!current || !s || ev.device_id !== s.peerDevice) return;
      if (typeof ev.data?.camera === "boolean") set({ remoteCameraOn: ev.data.camera });
      if (typeof ev.data?.screen === "boolean") {
        set({ remoteScreenOn: ev.data.screen });
        if (ev.data.screen && current.screenAsked) {
          window.clearTimeout(s.askTimer);
          set({ screenAsked: false });
        }
      }
      return;
    }
    case "screen": {
      if (!current || !s || ev.device_id !== s.peerDevice || !inProgress(current)) return;
      if (ev.data?.request === true) {
        if (current.screenOn) return;
        if (!screenShareSupported()) {
          void signal("screen", { declined: true, unsupported: true });
          return;
        }
        set({ screenRequest: true });
      } else if (ev.data?.declined === true && current.screenAsked) {
        window.clearTimeout(s.askTimer);
        set({ screenAsked: false });
        const key = ev.data.unsupported === true ? "call.screenUnsupported" : "call.screenDeclined";
        notifications.show({ color: "orange", message: i18n.t(key, { name: current.peerName }) });
      }
      return;
    }
    case "busy":
      if (current?.direction === "out" && current.phase === "outgoing") {
        notifications.show({ message: i18n.t("call.busy", { name: current.peerName }) });
        await endCall("busy", false);
      }
      return;
    case "hangup": {
      if (!current || !s) return;
      // Once connected, only the device we talk to can end the call.
      if (s.peerDevice !== null && ev.device_id !== s.peerDevice && current.phase !== "incoming") return;
      const reason = typeof ev.data?.reason === "string" ? ev.data.reason : "";
      if (current.direction === "out" && current.phase === "outgoing" && reason === "calls_disabled") {
        // The callee turned calls off (no device of theirs rings).
        notifications.show({ color: "orange", message: i18n.t("call.callsDisabledBy", { name: current.peerName }) });
        if (!document.hasFocus()) void showNotification(i18n.t("call.title"), i18n.t("call.callsDisabledBy", { name: current.peerName }));
        await endCall("unavailable", false);
        return;
      }
      const status: CallRecordStatus =
        current.direction === "out" ? (reason === "declined" ? "declined" : "missed") : current.phase === "incoming" ? "missed" : "answered";
      await endCall(status, false);
      return;
    }
  }
}
