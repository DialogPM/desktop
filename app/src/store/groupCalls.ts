// Group voice and video calls: full mesh, one WebRTC peer connection per pair of participants
// (no media server; see crates/chat-core/src/engine/group_calls.rs for the signaling).
//
// The core tracks who is in the call (join / leave / heartbeats) and emits `group_call` with
// the participant list; for every other participant we keep one peer connection. The device
// with the smaller (account_id, device_id) makes the offer of a pair, so late joiners and
// people already in the call never offer to each other at the same time.

import { BRAND_NAME } from "../brand";
import { notifications } from "@mantine/notifications";
import { create } from "zustand";
import i18n from "../i18n";
import { api } from "../lib/api";
import { getAppearance } from "../lib/appearance";
import type { GroupCallInfo, GroupCallPairKind, GroupCallParticipant, GroupCallSignalEvent } from "../lib/backend";
import { cleanCandidate, MAX_REMOTE_ICE, validSdp } from "../lib/callChecks";
import { blockedByCallSettings, callsAllowed, relayCandidate, relayOnly } from "../lib/callSettings";
import { showNotification } from "../lib/platform";
import { startRingtone } from "../lib/sounds";
import { getApp } from "./app";
import { callsSupported, hasTurn, iceServers, localMedia, useCall } from "./calls";
import { audioSenders, CallVoiceFx, useCallAudioPrefs, type VoiceEffect } from "../lib/voiceFx";
import { prioritizeAudio, tuned } from "../lib/callAudio";

/** Above this many participants the UI suggests audio only (each pair carries its own video). */
export const VIDEO_SUGGESTED_MAX = 4;
const ICE_BATCH_MS = 120;
const HEARTBEAT_MS = 10_000;
const STATS_MS = 600;
/** A pair that stays down this long is rebuilt from scratch (new peer connection). Before
 *  that, the offerer restarts ICE on the same connection (an offer with `restart: true`). */
const DISCONNECT_GRACE_MS = 20_000;
/** "disconnected" often recovers by itself: the restart waits this long first. */
const RESTART_DELAY_MS = 2_000;
/** At most one ICE restart of a pair this often. */
const RESTART_EVERY_MS = 8_000;
const MAX_PAIR_RETRIES = 3;
/** Audio level (0..1) above which someone counts as speaking. */
const SPEAKING_LEVEL = 0.04;

export interface GroupPeer {
  key: string;
  accountId: string;
  deviceId: number;
  name: string;
  avatar: string | null;
  stream: MediaStream | null;
  cameraOn: boolean;
  connected: boolean;
  speaking: boolean;
}

export interface GroupCallUi {
  conversationId: string;
  groupId: string;
  callId: string;
  title: string;
  avatar: string | null;
  /** The call was started as a video call. */
  video: boolean;
  phase: "incoming" | "joining" | "active";
  startedBy: string;
  muted: boolean;
  /** Our voice effect (lib/voiceFx.ts), "none" at the start of every call. */
  voiceEffect: VoiceEffect;
  /** AI noise reduction of our microphone (starts from the setting, lib/voiceFx.ts). */
  denoise: boolean;
  cameraOn: boolean;
  localStream: MediaStream | null;
  speaking: boolean;
  peers: Record<string, GroupPeer>;
  joinedAt: number | null;
  maxParticipants: number;
}

interface GroupCallStore {
  call: GroupCallUi | null;
  /** Calls in progress by conversation (for the "Join" banner). */
  ongoing: Record<string, GroupCallInfo>;
}

export const useGroupCall = create<GroupCallStore>(() => ({ call: null, ongoing: {} }));

const setCall = (patch: Partial<GroupCallUi>) =>
  useGroupCall.setState((s) => (s.call ? { call: { ...s.call, ...patch } } : s));

const setPeer = (key: string, patch: Partial<GroupPeer>) =>
  useGroupCall.setState((s) => {
    const peer = s.call?.peers[key];
    if (!s.call || !peer) return s;
    return { call: { ...s.call, peers: { ...s.call.peers, [key]: { ...peer, ...patch } } } };
  });

/** This device is in (or ringing for) a group call. */
export function inGroupCall(): boolean {
  return useGroupCall.getState().call !== null;
}

// --- non-reactive session state -------------------------------------------------------

interface Pair {
  key: string;
  accountId: string;
  deviceId: number;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  remoteIce: RTCIceCandidateInit[];
  remoteIceCount: number;
  localIce: RTCIceCandidateInit[];
  iceTimer: number;
  disconnectTimer: number;
  restartTimer: number;
  /** Remote candidates wait (a restart's new description is not set yet). */
  holdIce: boolean;
  lastRestart: number;
  /** We make the offer of this pair. */
  offerer: boolean;
  relay: boolean;
}

interface Session {
  conversationId: string;
  callId: string;
  me: { accountId: string; deviceId: number } | null;
  stream: MediaStream | null;
  servers: RTCIceServer[] | null;
  pairs: Map<string, Pair>;
  retries: Map<string, number>;
  heartbeat: number;
  stats: number;
  stopSound: (() => void) | null;
  ended: boolean;
  fx: CallVoiceFx;
}

let session: Session | null = null;

const keyOf = (accountId: string, deviceId: number) => `${accountId}:${deviceId}`;

/** Same rule as the core: the smaller (account, device) offers. */
export function isOfferer(a: { accountId: string; deviceId: number }, b: { accountId: string; deviceId: number }): boolean {
  if (a.accountId !== b.accountId) return a.accountId < b.accountId;
  return a.deviceId < b.deviceId;
}

function peerName(accountId: string, conversationId: string): { name: string; avatar: string | null } {
  const app = getApp();
  const member = app.groups[conversationId]?.members.find((m) => m.account_id === accountId);
  const contact = app.contacts[accountId];
  if (member?.is_me || accountId === app.appState?.account?.account_id) {
    return { name: i18n.t("common.you"), avatar: app.profile?.avatar_path ?? null };
  }
  return {
    name: contact?.display_name ?? member?.display_name ?? "",
    avatar: contact?.avatar_path ?? member?.avatar_path ?? null,
  };
}

function signal(pair: Pair, kind: GroupCallPairKind, data?: unknown) {
  const s = session;
  if (!s) return Promise.resolve();
  return api
    .groupCallSignal({
      conversation_id: s.conversationId,
      call_id: s.callId,
      account_id: pair.accountId,
      device_id: pair.deviceId,
      kind,
      data: data ?? null,
    })
    .catch((e: unknown) => console.warn(`group call signal ${kind} failed`, e));
}

function flushLocalIce(pair: Pair) {
  if (pair.localIce.length === 0) return;
  void signal(pair, "ice", { candidates: pair.localIce.splice(0) });
}

function closePair(pair: Pair) {
  window.clearTimeout(pair.iceTimer);
  window.clearTimeout(pair.disconnectTimer);
  window.clearTimeout(pair.restartTimer);
  pair.pc.onicecandidate = null;
  pair.pc.ontrack = null;
  pair.pc.onconnectionstatechange = null;
  pair.pc.close();
  pair.audio.srcObject = null;
  session?.pairs.delete(pair.key);
}

function newPair(accountId: string, deviceId: number, relay: boolean): Pair | null {
  const s = session;
  if (!s?.stream || !s.servers || !s.me) return null;
  const key = keyOf(accountId, deviceId);
  // Pairs with people who are not our contacts, and every pair with our relay-only setting on,
  // go through the relay only (no IP address leak), like one-to-one calls. Without a TURN
  // server a stranger's pair goes direct (relay-only calls are refused in `enter`).
  let iceTransportPolicy: RTCIceTransportPolicy = "all";
  if (relay || relayOnly()) {
    if (hasTurn(s.servers)) iceTransportPolicy = "relay";
    else console.warn("group call: relay-only requested but no TURN server is configured");
  }
  const pc = new RTCPeerConnection({ iceServers: s.servers, iceTransportPolicy });
  const offerer = isOfferer(s.me, { accountId, deviceId });
  for (const track of s.stream.getTracks()) pc.addTrack(track.kind === "audio" ? s.fx.outgoing(track) : track, s.stream);
  // A video call without our own camera still receives the others' video.
  if (offerer && useGroupCall.getState().call?.video && s.stream.getVideoTracks().length === 0) {
    pc.addTransceiver("video", { direction: "recvonly" });
  }
  const audio = new Audio();
  audio.autoplay = true;
  const pair: Pair = {
    key,
    accountId,
    deviceId,
    pc,
    audio,
    remoteIce: [],
    remoteIceCount: 0,
    localIce: [],
    iceTimer: 0,
    disconnectTimer: 0,
    restartTimer: 0,
    holdIce: false,
    lastRestart: 0,
    offerer,
    relay,
  };
  pc.onicecandidate = (e) => {
    if (!e.candidate || session !== s || s.pairs.get(key) !== pair) return;
    const c = e.candidate.toJSON();
    // Defense in depth: with the relay policy WebRTC gathers nothing else.
    if (iceTransportPolicy === "relay" && !relayCandidate(c)) return;
    pair.localIce.push(c);
    window.clearTimeout(pair.iceTimer);
    pair.iceTimer = window.setTimeout(() => flushLocalIce(pair), ICE_BATCH_MS);
  };
  pc.ontrack = (e) => {
    if (session !== s || s.pairs.get(key) !== pair) return;
    const remote = e.streams[0] ?? new MediaStream([e.track]);
    if (audio.srcObject !== remote) {
      audio.srcObject = remote;
      void audio.play().catch((err: unknown) => console.warn("group call audio playback", err));
    }
    setPeer(key, { stream: remote });
  };
  pc.onconnectionstatechange = () => {
    if (session !== s || s.pairs.get(key) !== pair) return;
    const state = pc.connectionState;
    if (state === "connected") {
      window.clearTimeout(pair.disconnectTimer);
      pair.disconnectTimer = 0;
      window.clearTimeout(pair.restartTimer);
      pair.restartTimer = 0;
      setPeer(key, { connected: true });
      void prioritizeAudio(pc);
    } else if (state === "disconnected" || state === "failed") {
      // An ICE restart first (the offerer makes it, the other side waits for it); the pair is
      // rebuilt if it is still down after the grace period.
      setPeer(key, { connected: false });
      if (!pair.disconnectTimer) pair.disconnectTimer = window.setTimeout(() => rebuildPair(pair), DISCONNECT_GRACE_MS);
      if (pair.offerer) {
        window.clearTimeout(pair.restartTimer);
        pair.restartTimer = window.setTimeout(() => void restartPair(pair), state === "failed" ? 0 : RESTART_DELAY_MS);
      }
    }
  };
  s.pairs.set(key, pair);
  const { name, avatar } = peerName(accountId, s.conversationId);
  useGroupCall.setState((st) =>
    st.call
      ? {
          call: {
            ...st.call,
            peers: {
              ...st.call.peers,
              [key]: {
                key,
                accountId,
                deviceId,
                name,
                avatar,
                stream: null,
                cameraOn: st.call.peers[key]?.cameraOn ?? true,
                connected: false,
                speaking: false,
              },
            },
          },
        }
      : st,
  );
  return pair;
}

/** ICE restart of a pair that went down, on the same peer connection (offerer side): an offer
 *  marked `restart`, answered in place by the other side. Retried while the pair stays down. */
async function restartPair(pair: Pair) {
  pair.restartTimer = 0;
  const s = session;
  if (!s || s.pairs.get(pair.key) !== pair || !pair.offerer || !pair.pc.remoteDescription) return;
  if (pair.pc.connectionState === "connected") return;
  const wait = pair.lastRestart + RESTART_EVERY_MS - Date.now();
  if (wait > 0) {
    pair.restartTimer = window.setTimeout(() => void restartPair(pair), wait);
    return;
  }
  pair.lastRestart = Date.now();
  try {
    const offer = tuned(await pair.pc.createOffer({ iceRestart: true }));
    if (session !== s || s.pairs.get(pair.key) !== pair) return;
    await pair.pc.setLocalDescription(offer);
    if (session !== s || s.pairs.get(pair.key) !== pair) return;
    pair.holdIce = true;
    pair.remoteIce = [];
    pair.remoteIceCount = 0;
    await signal(pair, "offer", { sdp: offer.sdp, video: useGroupCall.getState().call?.video ?? false, restart: true });
  } catch (e) {
    console.warn("group call: ICE restart failed", e);
  }
  if (session === s && s.pairs.get(pair.key) === pair && pair.disconnectTimer) {
    window.clearTimeout(pair.restartTimer);
    pair.restartTimer = window.setTimeout(() => void restartPair(pair), RESTART_EVERY_MS);
  }
}

/** Answers an ICE restart offer on the existing peer connection; false if it could not be
 *  applied (the caller then replaces the pair). */
async function answerRestart(s: Session, pair: Pair, sdp: string): Promise<boolean> {
  // The offerer restarts at most every RESTART_EVERY_MS: anything faster is not ours.
  if (Date.now() - pair.lastRestart < 4_000) return true;
  pair.lastRestart = Date.now();
  pair.holdIce = true;
  pair.remoteIce = [];
  pair.remoteIceCount = 0;
  try {
    await pair.pc.setRemoteDescription({ type: "offer", sdp });
    const answer = tuned(await pair.pc.createAnswer());
    if (session !== s || s.pairs.get(pair.key) !== pair) return true;
    await pair.pc.setLocalDescription(answer);
    if (session !== s || s.pairs.get(pair.key) !== pair) return true;
    pair.holdIce = false;
    await signal(pair, "answer", { sdp: answer.sdp });
  } catch (e) {
    console.warn("group call: restart offer rejected", e);
    pair.holdIce = false;
    return false;
  }
  await applyRemoteIce(pair);
  flushLocalIce(pair);
  return true;
}

/** A failed pair starts over: the offerer offers again (a few times at most); the other side
 * asks it to. */
function rebuildPair(pair: Pair) {
  const s = session;
  if (!s || s.pairs.get(pair.key) !== pair) return;
  closePair(pair);
  setPeer(pair.key, { connected: false, stream: null });
  if (!pair.offerer) {
    void signal(pair, "hangup", { reason: "restart" });
    return;
  }
  reoffer(s, pair);
}

function reoffer(s: Session, pair: Pair) {
  const retries = s.retries.get(pair.key) ?? 0;
  if (retries >= MAX_PAIR_RETRIES) return;
  s.retries.set(pair.key, retries + 1);
  window.setTimeout(() => {
    if (session !== s || s.pairs.has(pair.key)) return;
    const next = newPair(pair.accountId, pair.deviceId, pair.relay);
    if (next) void makeOffer(next);
  }, 1500);
}

async function makeOffer(pair: Pair) {
  const s = session;
  const offer = tuned(await pair.pc.createOffer());
  await pair.pc.setLocalDescription(offer);
  if (session !== s || s?.pairs.get(pair.key) !== pair) return;
  await signal(pair, "offer", { sdp: offer.sdp, video: useGroupCall.getState().call?.video ?? false });
  const call = useGroupCall.getState().call;
  if (call?.video && !call.cameraOn) void signal(pair, "media", { camera: false });
}

async function applyRemoteIce(pair: Pair) {
  if (!pair.pc.remoteDescription || pair.holdIce) return;
  for (const c of pair.remoteIce.splice(0)) {
    await pair.pc.addIceCandidate(c).catch((e: unknown) => console.warn("bad ICE candidate", e));
  }
}

/** Brings the peer connections in line with the participant list from the core. */
function syncParticipants(info: GroupCallInfo) {
  const s = session;
  if (!s || !s.stream || info.call_id !== s.callId) return;
  const me = info.participants.find((p) => p.me);
  if (me) s.me = { accountId: me.account_id, deviceId: me.device_id };
  if (!s.me) return;
  const present = new Set<string>();
  for (const p of info.participants) {
    if (p.me) continue;
    const key = keyOf(p.account_id, p.device_id);
    present.add(key);
    if (s.pairs.has(key)) continue;
    // Only the offerer opens the pair; the other side waits for its offer.
    if (isOfferer(s.me, { accountId: p.account_id, deviceId: p.device_id })) {
      const pair = newPair(p.account_id, p.device_id, p.relay);
      if (pair) void makeOffer(pair);
    }
  }
  for (const pair of [...s.pairs.values()]) {
    if (!present.has(pair.key)) closePair(pair);
  }
  useGroupCall.setState((st) => {
    if (!st.call) return st;
    const peers = Object.fromEntries(Object.entries(st.call.peers).filter(([k]) => present.has(k)));
    // Tiles for everyone in the call, also before their connection is up.
    for (const p of info.participants) {
      const key = keyOf(p.account_id, p.device_id);
      if (p.me || peers[key]) continue;
      const { name, avatar } = peerName(p.account_id, info.conversation_id);
      peers[key] = { key, accountId: p.account_id, deviceId: p.device_id, name, avatar, stream: null, cameraOn: info.video, connected: false, speaking: false };
    }
    return { call: { ...st.call, peers } };
  });
}

function stopSound() {
  session?.stopSound?.();
  if (session) session.stopSound = null;
}

function cleanup() {
  const s = session;
  if (!s) return;
  s.ended = true;
  stopSound();
  window.clearInterval(s.heartbeat);
  window.clearInterval(s.stats);
  for (const pair of [...s.pairs.values()]) closePair(pair);
  s.fx.stop();
  s.stream?.getTracks().forEach((t) => t.stop());
  session = null;
  useGroupCall.setState({ call: null });
}

function newSession(conversationId: string, callId: string): Session {
  const s: Session = {
    conversationId,
    callId,
    me: null,
    stream: null,
    servers: null,
    pairs: new Map(),
    retries: new Map(),
    heartbeat: 0,
    stats: 0,
    stopSound: null,
    ended: false,
    fx: new CallVoiceFx(
      () => s.stream?.getAudioTracks()[0],
      () => [...s.pairs.values()].flatMap((p) => audioSenders(p.pc)),
    ),
  };
  return s;
}

function uiFor(info: GroupCallInfo, phase: GroupCallUi["phase"]): GroupCallUi {
  const conv = getApp().conversations[info.conversation_id];
  return {
    conversationId: info.conversation_id,
    groupId: info.group_id,
    callId: info.call_id,
    title: conv?.title ?? "",
    avatar: conv?.avatar_path ?? null,
    video: info.video,
    phase,
    startedBy: info.started_by,
    muted: false,
    voiceEffect: "none",
    denoise: false,
    cameraOn: info.video,
    localStream: null,
    speaking: false,
    peers: {},
    joinedAt: null,
    maxParticipants: info.max_participants,
  };
}

/** Audio levels from the stats: who is speaking right now. */
async function pollSpeaking(s: Session) {
  const call = useGroupCall.getState().call;
  if (!call || session !== s) return;
  const speaking: Record<string, boolean> = {};
  let me = false;
  for (const pair of s.pairs.values()) {
    try {
      const stats = await pair.pc.getStats();
      stats.forEach((r: RTCStats & { kind?: string; audioLevel?: number }) => {
        if (r.kind !== "audio" || typeof r.audioLevel !== "number") return;
        if (r.type === "inbound-rtp") speaking[pair.key] = r.audioLevel > SPEAKING_LEVEL;
        if (r.type === "media-source" && r.audioLevel > SPEAKING_LEVEL) me = true;
      });
    } catch {
      // Closed meanwhile.
    }
  }
  if (session !== s) return;
  useGroupCall.setState((st) => {
    if (!st.call) return st;
    let changed = st.call.speaking !== (me && !st.call.muted);
    const peers = { ...st.call.peers };
    for (const [k, p] of Object.entries(peers)) {
      const now = speaking[k] ?? false;
      if (p.speaking !== now) {
        peers[k] = { ...p, speaking: now };
        changed = true;
      }
    }
    return changed ? { call: { ...st.call, peers, speaking: me && !st.call.muted } } : st;
  });
}

/** Microphone (and camera), ICE servers, then into the call through the core. */
async function enter(s: Session, conversationId: string, video: boolean, join: () => Promise<GroupCallInfo>) {
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
  // The noise reduction setting applies from the start (before any peer connection).
  if (useCallAudioPrefs.getState().denoise) await setGroupVoiceEffect({ denoise: true });
  setCall({ localStream: stream, cameraOn: stream.getVideoTracks().length > 0 });
  s.servers = await iceServers();
  if (session !== s) return;
  if (relayOnly() && !hasTurn(s.servers)) {
    // Relay-only calls never fall back to a direct connection.
    notifications.show({ color: "red", message: i18n.t("call.relayUnavailable") });
    cleanup();
    return;
  }
  let info: GroupCallInfo;
  try {
    info = await join();
  } catch (e) {
    console.warn("group call join failed", e);
    notifications.show({ color: "red", message: i18n.t("groupCall.joinFailed") });
    cleanup();
    return;
  }
  if (session !== s) {
    void api.groupCallLeave({ conversation_id: conversationId }).catch(() => undefined);
    return;
  }
  s.callId = info.call_id;
  setCall({ callId: info.call_id, phase: "active", joinedAt: Date.now(), startedBy: info.started_by });
  useGroupCall.setState((st) => ({ ongoing: { ...st.ongoing, [conversationId]: info } }));
  s.heartbeat = window.setInterval(() => {
    void api.groupCallHeartbeat({ conversation_id: conversationId }).catch(() => undefined);
  }, HEARTBEAT_MS);
  s.stats = window.setInterval(() => void pollSpeaking(s), STATS_MS);
  syncParticipants(info);
}

// --- public actions ---------------------------------------------------------------------

function canCall(): boolean {
  if (useCall.getState().call || useGroupCall.getState().call) return false;
  if (!callsSupported()) {
    notifications.show({ color: "red", message: i18n.t("call.unsupported") });
    return false;
  }
  return !blockedByCallSettings();
}

/** Starts a call in a group conversation (or joins the one in progress). */
export async function startGroupCall(conversationId: string, opts: { video?: boolean } = {}) {
  const conv = getApp().conversations[conversationId];
  if (!conv || conv.kind !== "group" || !canCall()) return;
  const ongoing = useGroupCall.getState().ongoing[conversationId];
  if (ongoing && !ongoing.ended) return joinGroupCall(conversationId, opts);
  const video = opts.video === true;
  session = newSession(conversationId, "");
  const s = session;
  useGroupCall.setState({
    call: uiFor(
      {
        group_id: conv.group_id ?? "",
        conversation_id: conversationId,
        call_id: "",
        started_by: "",
        started_at: Date.now(),
        video,
        participants: [],
        joined: false,
        ringing: false,
        ended: false,
        max_participants: 8,
      },
      "joining",
    ),
  });
  await enter(s, conversationId, video, () => api.groupCallStart({ conversation_id: conversationId, video }));
}

/** Joins the call in progress in a group conversation (from the banner or the ring screen). */
export async function joinGroupCall(conversationId: string, opts: { video?: boolean } = {}) {
  const current = useGroupCall.getState().call;
  const ringing = current?.phase === "incoming" && current.conversationId === conversationId;
  if (ringing && !callsAllowed()) {
    cleanup();
    blockedByCallSettings();
    return;
  }
  if (!ringing && !canCall()) return;
  const info = useGroupCall.getState().ongoing[conversationId];
  if (!info || info.ended) {
    if (ringing) cleanup();
    return;
  }
  const video = opts.video ?? info.video;
  if (ringing) stopSound();
  else session = newSession(conversationId, info.call_id);
  const s = session!;
  useGroupCall.setState({ call: { ...uiFor(info, "joining"), video: info.video } });
  await enter(s, conversationId, video, () =>
    api.groupCallJoin({ conversation_id: conversationId, call_id: info.call_id, video }),
  );
}

export async function declineGroupCall() {
  const call = useGroupCall.getState().call;
  if (!call || call.phase !== "incoming") return;
  cleanup();
  await api.groupCallDecline({ conversation_id: call.conversationId }).catch(() => undefined);
}

export async function leaveGroupCall() {
  const call = useGroupCall.getState().call;
  if (!call) return;
  if (call.phase === "incoming") return declineGroupCall();
  const s = session;
  if (s) {
    for (const pair of s.pairs.values()) void signal(pair, "hangup", { reason: "left" });
  }
  cleanup();
  await api.groupCallLeave({ conversation_id: call.conversationId }).catch((e: unknown) => console.warn("group call leave", e));
}

export function toggleGroupMute() {
  const call = useGroupCall.getState().call;
  if (!call || !session?.stream) return;
  const muted = !call.muted;
  session.stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  setCall({ muted, speaking: false });
}

/** Switches our voice effect for everyone in the call. */
export async function setGroupVoiceEffect(change: { effect?: VoiceEffect; denoise?: boolean }) {
  const s = session;
  if (!s || !useGroupCall.getState().call || s.ended) return;
  try {
    if ((await s.fx.set(change)) && session === s) setCall({ voiceEffect: s.fx.effect, denoise: s.fx.denoise });
  } catch (e) {
    console.warn("voice effect unavailable", e);
    notifications.show({ color: "red", message: i18n.t("voiceFx.error") });
    await s.fx.set({ effect: "none", denoise: false }).catch(() => undefined);
    if (session === s) setCall({ voiceEffect: "none", denoise: false });
  }
}

export function toggleGroupCamera() {
  const call = useGroupCall.getState().call;
  const track = session?.stream?.getVideoTracks()[0];
  if (!call || !track || !session) return;
  const cameraOn = !call.cameraOn;
  track.enabled = cameraOn;
  setCall({ cameraOn });
  for (const pair of session.pairs.values()) void signal(pair, "media", { camera: cameraOn });
}

/** Loads the call in progress of a conversation (for the banner when it is opened). */
export async function refreshGroupCall(conversationId: string) {
  try {
    const info = await api.groupCallState({ conversation_id: conversationId });
    useGroupCall.setState((st) => {
      const ongoing = { ...st.ongoing };
      if (info && !info.ended) ongoing[conversationId] = info;
      else delete ongoing[conversationId];
      return { ongoing };
    });
  } catch {
    // Not a group, or logged out.
  }
}

// --- events from the core ------------------------------------------------------------------

export function handleGroupCall(info: GroupCallInfo) {
  useGroupCall.setState((st) => {
    const ongoing = { ...st.ongoing };
    if (info.ended) delete ongoing[info.conversation_id];
    else ongoing[info.conversation_id] = info;
    return { ongoing };
  });
  const call = useGroupCall.getState().call;
  if (call && call.conversationId === info.conversation_id) {
    if (call.phase === "incoming") {
      // Answered or declined on another device, the ring timed out, or everyone left.
      if (info.ended || !info.ringing || info.call_id !== call.callId) cleanup();
      return;
    }
    if (call.phase === "active" && session && info.call_id !== session.callId && !info.ended) {
      // Two calls were started at once and ours lost: move over to the other one.
      const video = call.video;
      cleanup();
      void joinGroupCall(info.conversation_id, { video });
      return;
    }
    if (call.phase === "active") syncParticipants(info);
    return;
  }
  if (!info.ringing || info.ended || call || useCall.getState().call || !callsSupported() || !callsAllowed()) return;
  // Incoming ring.
  session = newSession(info.conversation_id, info.call_id);
  const s = session;
  useGroupCall.setState({ call: uiFor(info, "incoming") });
  s.stopSound = startRingtone();
  if (!document.hasFocus()) {
    const title = getApp().conversations[info.conversation_id]?.title ?? "";
    if (getAppearance().notifPreview) void showNotification(i18n.t("groupCall.incomingTitle"), title);
    else void showNotification(BRAND_NAME, i18n.t("groupCall.incomingTitle"));
  }
}

function sdpOf(data: Record<string, unknown> | null): string | null {
  if (typeof data?.sdp !== "string" || !validSdp(data.sdp)) return null;
  return data.sdp;
}

function participantRelay(ev: GroupCallSignalEvent): boolean {
  const info = useGroupCall.getState().ongoing[ev.conversation_id];
  const p: GroupCallParticipant | undefined = info?.participants.find(
    (x) => x.account_id === ev.account_id && x.device_id === ev.device_id,
  );
  return ev.relay || (p?.relay ?? false);
}

export async function handleGroupCallSignal(ev: GroupCallSignalEvent) {
  const s = session;
  const call = useGroupCall.getState().call;
  if (!s || !call || call.phase !== "active" || ev.call_id !== s.callId || !s.me) return;
  const key = keyOf(ev.account_id, ev.device_id);
  let pair = s.pairs.get(key);
  switch (ev.kind) {
    case "offer": {
      const sdp = sdpOf(ev.data);
      if (!sdp || isOfferer(s.me, { accountId: ev.account_id, deviceId: ev.device_id })) return;
      // ICE restart of a pair that is up (or was): answered on the same peer connection.
      if (pair && pair.pc.remoteDescription && ev.data?.restart === true) {
        if (await answerRestart(s, pair, sdp)) return;
        if (s.pairs.get(key) !== pair) return;
      }
      // A new offer replaces the pair (the other side rebuilt it).
      if (pair) closePair(pair);
      pair = newPair(ev.account_id, ev.device_id, participantRelay(ev)) ?? undefined;
      if (!pair) return;
      await pair.pc.setRemoteDescription({ type: "offer", sdp });
      const answer = tuned(await pair.pc.createAnswer());
      await pair.pc.setLocalDescription(answer);
      if (session !== s || s.pairs.get(key) !== pair) return;
      await signal(pair, "answer", { sdp: answer.sdp });
      if (call.video && !useGroupCall.getState().call?.cameraOn) void signal(pair, "media", { camera: false });
      await applyRemoteIce(pair);
      flushLocalIce(pair);
      return;
    }
    case "answer": {
      const sdp = sdpOf(ev.data);
      if (!sdp || !pair || !pair.offerer || pair.pc.signalingState !== "have-local-offer") return;
      try {
        await pair.pc.setRemoteDescription({ type: "answer", sdp });
      } catch (e) {
        // An answer from a new peer connection (an older app rebuilt the pair instead of
        // restarting ICE) does not fit: rebuild here too.
        console.warn("group call: answer rejected", e);
        if (pair.holdIce) rebuildPair(pair);
        return;
      }
      pair.holdIce = false;
      await applyRemoteIce(pair);
      flushLocalIce(pair);
      return;
    }
    case "ice": {
      if (!pair) return;
      const list = ev.data?.candidates;
      if (!Array.isArray(list)) return;
      for (const raw of list) {
        if (pair.remoteIceCount >= MAX_REMOTE_ICE) break;
        const c = cleanCandidate(raw);
        if (!c) continue;
        pair.remoteIceCount++;
        pair.remoteIce.push(c);
      }
      await applyRemoteIce(pair);
      return;
    }
    case "media":
      if (typeof ev.data?.camera === "boolean") setPeer(key, { cameraOn: ev.data.camera });
      return;
    case "hangup":
      if (!pair) return;
      closePair(pair);
      setPeer(key, { connected: false, stream: null });
      // The other side lost the connection and is still in the call: offer again.
      if (pair.offerer && ev.data?.reason === "restart") reoffer(s, pair);
      return;
  }
}
