// In-memory implementation of the `backend` API and events, used in the browser
// and when VITE_MOCK=1. It simulates latency, delivery/read receipts, typing and replies.

import { BRAND_NAME } from "../../brand";
import type { Backend, EventName, Unlisten } from "../api";
import type { EventPayloads, GroupCallInfo } from "../backend";
import type {
  AccountInfo,
  Attachment,
  CallSettings,
  MediaRetention,
  DefaultDisappearing,
  ConnectionState,
  Contact,
  Conversation,
  FoundAccount,
  GroupInfo,
  Message,
  MessageStatus,
  ProfileCard,
  SystemEvent,
} from "../types";
import { buildDb, DEFAULT_SERVER, formatNumber, ME_ID, MY_NUMBER, newId, preview, type DirectoryEntry, type MockDb } from "./data";
import { photo, WORDS } from "./media";
import { discriminatorValid } from "../username";

const SESSION_KEY = "chatapp.mock.session";

// ---------------------------------------------------------------------------
// event bus
// ---------------------------------------------------------------------------

type Handler = (payload: unknown) => void;
const listeners = new Map<string, Set<Handler>>();

export function mockOn<K extends EventName>(event: K, handler: (p: EventPayloads[K]) => void): Unlisten {
  const set = listeners.get(event) ?? new Set<Handler>();
  // Wrap so that subscribing the same function twice yields two independent subscriptions
  // (like Tauri's listen), otherwise an early unsubscribe would remove both.
  const wrapped: Handler = (p) => handler(p as EventPayloads[K]);
  set.add(wrapped);
  listeners.set(event, set);
  return () => set.delete(wrapped);
}

function emit<K extends EventName>(event: K, payload: EventPayloads[K]) {
  // Deliver asynchronously, like real Tauri events. Clone to avoid shared mutation.
  const copy = structuredClone(payload);
  setTimeout(() => listeners.get(event)?.forEach((h) => h(copy)), 0);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const latency = () => sleep(80 + Math.random() * 120);
const fail = (code: string, message: string): never => {
  throw `${code}: ${message}`;
};
const clone = <T>(v: T): T => structuredClone(v);

let db: MockDb | null = null;
let connection: ConnectionState = "offline";
let loggedIn = readSession();
let timers: number[] = [];
let mockTemporary = false;
/** Earlier versions of edited messages (see getEditHistory). */
const editHistory: Record<string, { text: string; at: number }[]> = {};

function readSession(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mock") === "fresh") localStorage.removeItem(SESSION_KEY);
    if (params.get("mock") === "ready") localStorage.setItem(SESSION_KEY, "1");
    return localStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSession(v: boolean) {
  loggedIn = v;
  try {
    if (v) localStorage.setItem(SESSION_KEY, "1");
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function data(): MockDb {
  if (!loggedIn) fail("unauthorized", "Not logged in");
  if (!db) {
    db = buildDb();
    startSession();
  }
  return db;
}

function account(): AccountInfo {
  return data().details.account;
}

function mockCallSettings(): CallSettings {
  const fallback: CallSettings = { allow_calls: true, relay_only: false };
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem("mock.callSettings") ?? "{}") as Partial<CallSettings>) };
  } catch {
    return fallback;
  }
}

function mockMediaRetention(): MediaRetention {
  const days = Number(localStorage.getItem("mock.mediaRetention") ?? 30);
  let last_check = null;
  try {
    last_check = JSON.parse(localStorage.getItem("mock.mediaCheck") ?? "null") as MediaRetention["last_check"];
  } catch {
    /* none */
  }
  return { days: [1, 7, 14, 30].includes(days) ? days : 30, options: [1, 7, 14, 30], max_days: 30, last_check };
}

const MOCK_TIMER_OPTIONS = [0, 600, 3600, 3 * 3600, 6 * 3600, 12 * 3600, 86400, 7 * 86400, 90 * 86400];

function mockDefaultTimer(): DefaultDisappearing {
  const seconds = Number(localStorage.getItem("mock.defaultTimer") ?? 0);
  return { seconds: MOCK_TIMER_OPTIONS.includes(seconds) ? seconds : 0, options: MOCK_TIMER_OPTIONS };
}

function later(ms: number, fn: () => void) {
  timers.push(window.setTimeout(fn, ms));
}

function setConnection(s: ConnectionState) {
  connection = s;
  emit("connection", s);
}

function startSession() {
  setConnection("connecting");
  later(900, () => setConnection(navigator.onLine === false ? "offline" : "online"));
  // A first incoming message a little after start, then occasionally.
  later(15_000, () => simulateIncoming("conv-luca", "Are you coming tomorrow? 🚆"));
  const loop = () => {
    later(75_000 + Math.random() * 60_000, () => {
      const pool = ["conv-hiking", "conv-maria", "conv-luca", "conv-family"];
      const lines = ["👍", "Ok!", "Call you later", "Look at this 😄", "Where are you?", "Great idea!"];
      simulateIncoming(pool[Math.floor(Math.random() * pool.length)], lines[Math.floor(Math.random() * lines.length)]);
      loop();
    });
  };
  loop();
}

if (typeof window !== "undefined") {
  window.addEventListener("offline", () => loggedIn && setConnection("offline"));
  window.addEventListener("online", () => {
    if (!loggedIn) return;
    setConnection("connecting");
    later(700, () => setConnection("online"));
  });
}

function conv(id: string): Conversation {
  return data().conversations.get(id) ?? fail("not_found", "Conversation not found");
}

function list(id: string): Message[] {
  return data().messages.get(id) ?? [];
}

function findMessage(id: string): Message {
  for (const msgs of data().messages.values()) {
    const m = msgs.find((x) => x.id === id);
    if (m) return m;
  }
  return fail("not_found", "Message not found");
}

function contactOf(id: string): Contact {
  return data().contacts.get(id) ?? fail("not_found", "Contact not found");
}

const USERNAME_RE = /^[a-z][a-z0-9_.]{2,31}$/;

/** Mock username links: handle -> username (the real core encrypts the name, see username_link.rs). */
const usernameLinks = new Map<string, string>();
let myUsernameLink: { handle: string; username: string } | null = null;
const usernameLinkUrl = (handle: string) => `chatapp://u?s=${encodeURIComponent(account().server_url)}#${handle}`;

/** Looks an account up in the mock server directory by number or username (like the core). */
function lookup(query: string): DirectoryEntry | null {
  const d = data();
  const q = query.trim();
  const digits = q.replace(/\D/g, "");
  if (/^[\d\s-]+$/.test(q)) {
    if (digits.length !== 16) return null;
    if (digits === account().number) {
      return { account_id: ME_ID, number: digits, username: d.details.username, profile_name: d.profile.name, avatar_path: d.profile.avatar_path };
    }
    const known = d.directory.find((e) => e.number === digits);
    if (known) return known;
    // Any other number "exists" unless it starts with 0 or 1111 (same rule as addContactByNumber).
    if (digits.startsWith("0") || digits.startsWith("1111")) return null;
    const found: DirectoryEntry = { account_id: `acc-${digits.slice(-6)}`, number: digits, username: null, profile_name: null, avatar_path: null };
    d.directory.push(found);
    return found;
  }
  const u = q.replace(/^@/, "").toLowerCase();
  if (!USERNAME_RE.test(u)) return null;
  if (d.details.username === u) {
    return { account_id: ME_ID, number: account().number, username: u, profile_name: d.profile.name, avatar_path: d.profile.avatar_path };
  }
  return d.directory.find((e) => e.username === u) ?? null;
}

/** Returns the contact for a directory entry, creating it when needed. */
function ensureContact(e: DirectoryEntry, name?: string): Contact {
  const d = data();
  const existing = d.contacts.get(e.account_id);
  if (existing) return existing;
  const local = name?.trim() || null;
  const c: Contact = {
    account_id: e.account_id,
    number: e.number,
    profile_name: e.profile_name,
    local_name: local,
    display_name: local ?? e.profile_name ?? formatNumber(e.number),
    about: null,
    avatar_path: e.avatar_path,
    phone: null,
    blocked: false,
    verified: false,
  };
  d.contacts.set(c.account_id, c);
  d.presence.set(c.account_id, { online: false, last_seen: Date.now() - 3_600_000 });
  if (!d.directory.some((x) => x.account_id === e.account_id)) d.directory.push(e);
  emit("contact_updated", clone(c));
  return c;
}

function refreshConversation(c: Conversation) {
  const msgs = list(c.id);
  const last = msgs[msgs.length - 1];
  c.last_message = last ? preview(last) : null;
  if (last) c.updated_at = Math.max(c.updated_at, last.sent_at);
  emit("conversation_updated", clone(c));
}

function emitMessage(m: Message, isNew = false) {
  emit("message", { conversation_id: m.conversation_id, message: clone(m), is_new_incoming: isNew });
}

function addMessage(m: Message, isNew = false) {
  const msgs = list(m.conversation_id);
  msgs.push(m);
  msgs.sort((a, b) => a.sent_at - b.sent_at);
  emitMessage(m, isNew);
  const c = conv(m.conversation_id);
  if (isNew) c.unread_count += 1;
  if (c.archived && isNew && !(c.muted_until !== null)) c.archived = false;
  refreshConversation(c);
}

function setStatus(m: Message, status: MessageStatus) {
  const order: MessageStatus[] = ["pending", "sent", "delivered", "read"];
  if (m.status === "failed" && status !== "sent") return;
  if (order.indexOf(status) <= order.indexOf(m.status) && m.status !== "failed") return;
  m.status = status;
  emitMessage(m);
  const c = conv(m.conversation_id);
  if (c.last_message?.id === m.id) refreshConversation(c);
}

function typing(convId: string, who: Contact, on: boolean) {
  emit("typing", { conversation_id: convId, account_id: who.account_id, sender_name: who.display_name, typing: on });
}

function incoming(convId: string, from: Contact, text: string): Message {
  const now = Date.now();
  return {
    id: newId(),
    conversation_id: convId,
    sender_account_id: from.account_id,
    sender_name: from.display_name,
    outgoing: false,
    kind: "text",
    text,
    attachments: [],
    location: null,
    contacts: [],
    reply_to: null,
    reactions: [],
    status: "read",
    sent_at: now,
    received_at: now,
    edited_at: null,
    deleted: false,
    forwarded: false,
    expires_at: null,
    system: null,
    mentions: [],
    mentions_me: false,
    pinned_until: null,
    starred: false,
  };
}

function peersOf(c: Conversation): Contact[] {
  const d = data();
  if (c.kind === "direct") return c.peer_account_id ? [contactOf(c.peer_account_id)] : [];
  const g = d.groups.get(c.id);
  return (g?.members ?? []).filter((m) => !m.is_me).map((m) => d.contacts.get(m.account_id)).filter((x): x is Contact => !!x);
}

function simulateIncoming(convId: string, text: string) {
  if (!db || !loggedIn || connection !== "online") return;
  const c = db.conversations.get(convId);
  if (!c || c.blocked || c.left) return;
  const peers = peersOf(c);
  const who = peers[Math.floor(Math.random() * peers.length)];
  if (!who) return;
  typing(convId, who, true);
  later(2500, () => {
    typing(convId, who, false);
    addMessage(incoming(convId, who, text), true);
  });
}

const REPLIES = ["Sounds good! 👍", "Haha 😄", "Ok, talk later", "Nice!", "Thanks!", "Perfect, see you there", "🙌"];

/** View-once media sent from here, by message id (the message itself carries no path). */
const viewOnceMedia = new Map<string, string>();

function simulateDelivery(m: Message) {
  const c = conv(m.conversation_id);
  later(350, () => setStatus(m, connection === "online" ? "sent" : "pending"));
  if (connection !== "online") return;
  later(1200, () => setStatus(m, "delivered"));
  const peers = peersOf(c);
  const presence = peers.map((p) => data().presence.get(p.account_id));
  if (presence.some((p) => p?.online)) {
    later(2600, () => setStatus(m, "read"));
    if (!c.blocked && Math.random() < 0.75) {
      const onlinePeers = peers.filter((_, i) => presence[i]?.online);
      const who = onlinePeers[Math.floor(Math.random() * onlinePeers.length)];
      later(3400, () => typing(c.id, who, true));
      later(6200, () => {
        typing(c.id, who, false);
        addMessage(incoming(c.id, who, REPLIES[Math.floor(Math.random() * REPLIES.length)]), true);
      });
    }
  }
}

function systemMessage(convId: string, system: SystemEvent): Message {
  const m = incoming(convId, { account_id: ME_ID, display_name: "You" } as Contact, "");
  return { ...m, kind: "system", text: null, system, outgoing: false };
}

function groupConv(id: string): { c: Conversation; g: GroupInfo } {
  const c = conv(id);
  const g = data().groups.get(id) ?? fail("not_found", "Group not found");
  return { c, g };
}

let mockGroupCall: GroupCallInfo | null = null;

function emitGroup(c: Conversation, g: GroupInfo) {
  c.title = g.name;
  c.avatar_path = g.avatar_path;
  c.member_count = g.members.length;
  c.is_admin = g.my_role === "admin";
  emit("group_updated", clone(g));
  refreshConversation(c);
}

function requireAdmin(g: GroupInfo) {
  if (g.my_role !== "admin") fail("forbidden", "Only admins can do that");
}

function randomNumber(): string {
  let s = String(1 + Math.floor(Math.random() * 9));
  while (s.length < 16) s += Math.floor(Math.random() * 10);
  return s;
}

function validServerUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return u;
  } catch {
    return fail("invalid_input", "Invalid server URL");
  }
}

// Accounts saved on this computer (the native shell keeps them in profiles.json).
const PROFILES_KEY = "chatapp-mock-profiles";
const MOCK_PROFILE_ID = "mock-me";
type MockProfile = ProfileCard & { hidden: boolean };

function readProfiles(): MockProfile[] {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "[]") as MockProfile[];
  } catch {
    return [];
  }
}

function writeProfiles(list: MockProfile[]) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function saveMockProfile() {
  const list = readProfiles().filter((p) => p.id !== MOCK_PROFILE_ID);
  const old = readProfiles().find((p) => p.id === MOCK_PROFILE_ID);
  list.push({
    id: MOCK_PROFILE_ID,
    label: old?.hidden ? null : (db?.profile.name ?? "Me"),
    last4: old?.hidden ? null : MY_NUMBER.slice(-4),
    server_host: old?.hidden ? null : new URL(DEFAULT_SERVER).host,
    last_used: Date.now(),
    hidden: old?.hidden ?? false,
  });
  writeProfiles(list);
}

function afterLogin() {
  saveMockProfile();
  writeSession(true);
  db = null;
  timers.forEach(clearTimeout);
  timers = [];
  data();
}

function historySync() {
  let records = 0;
  const step = () => {
    records += 40 + Math.floor(Math.random() * 60);
    const done = records > 400;
    emit("history_sync", { done, records });
    if (!done) later(500, step);
  };
  later(1200, step);
}

// ---------------------------------------------------------------------------
// the API
// ---------------------------------------------------------------------------

let linkCancelled = false;

export const mockBackend: Backend = {
  async getState() {
    await latency();
    return {
      status: loggedIn ? "ready" : "no_account",
      account: loggedIn ? account() : null,
      default_server_url: DEFAULT_SERVER,
      local_protected: true,
    };
  },
  async confirmMnemonicSaved() {
    await latency();
  },
  async listProfiles() {
    await latency();
    return readProfiles()
      .filter((p) => !p.hidden)
      .sort((a, b) => b.last_used - a.last_used)
      .map(({ hidden: _hidden, ...card }) => card);
  },
  async openProfile(req) {
    await sleep(500);
    if (!readProfiles().some((p) => p.id === req.id)) fail("not_found", "No such profile");
    if (req.password.length < 8) fail("invalid_password", "Wrong password");
    writeSession(true);
    saveMockProfile();
  },
  async openProfileByNumber(req) {
    await sleep(500);
    const found = req.number.replace(/\D/g, "") === MY_NUMBER && readProfiles().some((p) => p.id === MOCK_PROFILE_ID);
    if (!found || req.password.length < 8) fail("invalid_password", "Wrong account number or password");
    writeSession(true);
    saveMockProfile();
  },
  async closeProfile() {
    await latency();
    writeSession(false);
    timers.forEach(clearTimeout);
    timers = [];
    db = null;
    connection = "offline";
  },
  async forgetProfile(req) {
    await latency();
    writeProfiles(readProfiles().filter((p) => p.id !== req.id));
  },
  async switchProfile() {
    fail("password_required", "open this account with its password first");
  },
  async checkRevoked() {
    return { wiped: [] };
  },
  async currentProfile() {
    const p = loggedIn ? readProfiles().find((x) => x.id === MOCK_PROFILE_ID) : undefined;
    return { registered: !!p, visible: p ? !p.hidden : true };
  },
  async setProfileVisible(req) {
    await latency();
    writeProfiles(readProfiles().map((p) => (p.id === MOCK_PROFILE_ID ? { ...p, hidden: !req.visible } : p)));
    saveMockProfile();
  },
  async checkServer(url) {
    await sleep(500 + Math.random() * 400);
    const u = validServerUrl(url);
    if (/offline|invalid|down/.test(u.hostname)) fail("network", `Could not connect to ${u.hostname}`);
    const isDefault = url.replace(/\/$/, "") === DEFAULT_SERVER;
    return {
      url: url.replace(/\/$/, ""),
      name: isDefault ? BRAND_NAME : `${BRAND_NAME} @ ${u.hostname}`,
      version: isDefault ? "1.0.0" : "0.9.4",
      registration_enabled: !/closed|private/.test(u.hostname),
      phone_verification_enabled: isDefault,
      max_attachment_bytes: 100 * 1024 * 1024,
      max_devices: 6,
    };
  },
  async register(req) {
    await sleep(900);
    if (req.password.length < 8) fail("invalid_input", "Password too short");
    const u = validServerUrl(req.server_url);
    if (/closed|private/.test(u.hostname)) fail("registration_disabled", "Registration is closed on this server");
    afterLogin();
    const d = data();
    d.details.account = { account_id: ME_ID, number: randomNumber(), device_id: 1, server_url: req.server_url };
    d.devices[0].name = req.device_name;
    const mnemonic = Array.from({ length: 24 }, () => WORDS[Math.floor(Math.random() * WORDS.length)]);
    return { account: clone(d.details.account), mnemonic };
  },
  async login(req) {
    await sleep(800);
    if (!/^\d{16}$/.test(req.number)) fail("invalid_input", "Account number must have 16 digits");
    if (req.password === "wrong" || req.number === "0000000000000000") fail("invalid_password", "Wrong account number or password");
    afterLogin();
    const d = data();
    d.details.account = { account_id: ME_ID, number: req.number, device_id: 4, server_url: req.server_url };
    historySync();
    return clone(d.details.account);
  },
  // Device linking by QR (mock): codes resolve after a short delay.
  async linkCreate(req) {
    await latency();
    linkCancelled = false;
    return `chatapp://link?id=${"a".repeat(32)}&k=${"b".repeat(43)}&s=${encodeURIComponent(req.server_url)}`;
  },
  async linkClaim(req) {
    await latency();
    if (!req.link.startsWith("chatapp://link?")) fail("invalid_input", "This is not a device link code");
    linkCancelled = false;
  },
  async linkWait() {
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      if (linkCancelled) fail("gone", "cancelled");
    }
    afterLogin();
    const d = data();
    d.details.account = { account_id: ME_ID, number: "4821093755128830", device_id: 5, server_url: DEFAULT_SERVER };
    historySync();
    return clone(d.details.account);
  },
  async linkCancel() {
    linkCancelled = true;
  },
  async linkOffer() {
    await latency();
    linkCancelled = false;
    return `chatapp://link?id=${"c".repeat(32)}&k=${"d".repeat(43)}&s=${encodeURIComponent(DEFAULT_SERVER)}`;
  },
  async linkCode() {
    return "123 456";
  },
  async linkOfferWait() {
    for (let i = 0; i < 15; i++) {
      await sleep(200);
      if (linkCancelled) fail("gone", "cancelled");
    }
    return "Pixel 8";
  },
  async linkInspect(req) {
    await latency();
    if (!req.link.startsWith("chatapp://link?")) fail("invalid_input", "This is not a device link code");
    return "Ubuntu Desktop";
  },
  async linkApprove() {
    await latency();
  },
  async verifyPassword(req) {
    await latency();
    return req.password.length >= 8 && req.password !== "wrong password";
  },
  async recover(req) {
    await sleep(1000);
    if (req.mnemonic.length !== 24 || req.mnemonic.some((w) => !/^[a-z]{3,8}$/.test(w))) {
      fail("invalid_mnemonic", "The recovery phrase is not valid");
    }
    afterLogin();
    const d = data();
    d.details.account = { account_id: ME_ID, number: req.number, device_id: 4, server_url: req.server_url };
    historySync();
    return clone(d.details.account);
  },
  async logout() {
    await sleep(300);
    writeProfiles(readProfiles().filter((p) => p.id !== MOCK_PROFILE_ID));
    writeSession(false);
    timers.forEach(clearTimeout);
    timers = [];
    db = null;
    connection = "offline";
  },
  async getConnectionState() {
    return connection;
  },

  // --- account ---------------------------------------------------------------
  async getAccountDetails() {
    await latency();
    return clone(data().details);
  },
  async changePassword(req) {
    await sleep(600);
    if (req.old_password === "wrong") fail("invalid_password", "Current password is wrong");
    if (req.new_password.length < 8) fail("invalid_input", "Password too short");
  },
  async revealMnemonic(req) {
    await latency();
    if (req.password.length < 8) fail("invalid_password", "Wrong password");
    return "alter exist increase spice exchange point video silver doctor shield rapid mean sniff destroy dinosaur question hair suffer charge lobster hen orbit canyon velvet".split(" ");
  },
  async deleteAccount(req) {
    await sleep(700);
    if (req.password === "wrong") fail("invalid_password", "Wrong password");
    await mockBackend.logout();
  },
  async setPrivacy(req) {
    await latency();
    const d = data();
    d.details.privacy = { ...d.details.privacy, ...req };
    return clone(d.details.privacy);
  },
  async getDnd() {
    await latency();
    const until = Number(localStorage.getItem("mock.dnd") ?? 0);
    return { until: until > Date.now() ? until : 0 };
  },
  async setDnd({ until }) {
    await latency();
    const v = until > Date.now() ? until : 0;
    localStorage.setItem("mock.dnd", String(v));
    emit("dnd_changed", { until: v });
    return { until: v };
  },
  async getCallSettings() {
    await latency();
    return mockCallSettings();
  },
  async setCallSettings(req) {
    await latency();
    const v = { ...mockCallSettings(), ...req };
    localStorage.setItem("mock.callSettings", JSON.stringify(v));
    emit("call_settings_changed", v);
    return v;
  },
  async getMediaRetention() {
    await latency();
    return mockMediaRetention();
  },
  async setMediaRetention({ days }) {
    await latency();
    if (![1, 7, 14, 30].includes(days)) throw new Error("invalid_input: media retention must be 1, 7, 14 or 30 days");
    localStorage.setItem("mock.mediaRetention", String(days));
    const v = mockMediaRetention();
    emit("media_retention_changed", v);
    return v;
  },
  async getDefaultDisappearing() {
    await latency();
    return mockDefaultTimer();
  },
  async setDefaultDisappearing({ seconds }) {
    await latency();
    if (!MOCK_TIMER_OPTIONS.includes(seconds)) throw new Error("invalid_input: invalid default disappearing timer");
    localStorage.setItem("mock.defaultTimer", String(seconds));
    const v = mockDefaultTimer();
    emit("default_disappearing_changed", v);
    return v;
  },
  async runMediaCheck() {
    await latency();
    const v = { removed: 0, checked_at: Date.now() };
    localStorage.setItem("mock.mediaCheck", JSON.stringify(v));
    emit("media_check", v);
    return v;
  },
  async reminderShownAt(name) {
    const v = localStorage.getItem(`mock.reminder.${name}`);
    return v ? Number(v) : null;
  },
  async markReminderShown(name) {
    localStorage.setItem(`mock.reminder.${name}`, String(Date.now()));
  },
  async setBackupEnabled(req) {
    await latency();
    data().details.backup_enabled = req.enabled;
  },
  async requestPhoneCode(req) {
    await sleep(600);
    if (!/^\+?[\d\s-]{7,}$/.test(req.phone)) fail("invalid_input", "Invalid phone number");
  },
  async verifyPhone(req) {
    await sleep(600);
    if (req.code !== "123456") fail("invalid_input", "Wrong code (use 123456 in mock mode)");
    const d = data();
    d.details.phone = req.phone;
    d.details.phone_verified = true;
  },
  async removePhone() {
    await latency();
    const d = data();
    d.details.phone = null;
    d.details.phone_verified = false;
    d.details.discoverable_by_phone = false;
  },
  async setDiscoverable(req) {
    await latency();
    const d = data();
    if (req.discoverable && !d.details.phone_verified) fail("invalid_input", "Verify a phone number first");
    d.details.discoverable_by_phone = req.discoverable;
  },
  async totpSetup() {
    await latency();
    return { secret: "JBSWY3DPEHPK3PXP", uri: `otpauth://totp/${encodeURIComponent(BRAND_NAME)}:demo?secret=JBSWY3DPEHPK3PXP&issuer=${encodeURIComponent(BRAND_NAME)}` };
  },
  async totpEnable() {
    await latency();
    data().details.totp_enabled = true;
  },
  async totpDisable() {
    await latency();
    data().details.totp_enabled = false;
  },
  async setUsername(req) {
    await sleep(350);
    const d = data();
    if (req.username === null || req.username.trim() === "") {
      d.details.username = null;
      return null;
    }
    const u = req.username.trim().replace(/^@/, "").toLowerCase();
    if (!USERNAME_RE.test(u)) fail("invalid_input", "Invalid username");
    if (!discriminatorValid(u)) fail("invalid_input", "Invalid username number");
    // "admin" and "support" are reserved, directory names belong to other accounts.
    if (["admin", "support", "chatapp"].includes(u) || d.directory.some((e) => e.username === u && e.account_id !== ME_ID)) {
      fail("conflict", "This username is already taken");
    }
    d.details.username = u;
    return u;
  },
  async listDevices() {
    await latency();
    return clone(data().devices);
  },
  async unlinkDevice(req) {
    await latency();
    const d = data();
    d.devices = d.devices.filter((x) => x.device_id !== req.device_id);
    emit("devices_changed", null);
  },
  async renameDevice(req) {
    await latency();
    const cur = data().devices.find((x) => x.current);
    if (cur) cur.name = req.name;
    emit("devices_changed", null);
  },
  async deviceAlerts() {
    await latency();
    return [];
  },
  async dismissDeviceAlerts() {
    await latency();
    emit("device_alerts", []);
  },
  async loginWaitApproval() {
    await latency();
    return fail("gone", "no login is waiting for approval");
  },
  async loginCancelApproval() {
    await latency();
  },
  async listLoginRequests() {
    await latency();
    return [];
  },
  async answerLoginRequest() {
    await latency();
    emit("login_requests", []);
  },
  async setLoginApproval(req) {
    await latency();
    data().details.login_approval = req.enabled;
  },
  async installUpdate() {
    await latency();
    return fail("forbidden", "updates are not configured in this build");
  },
  async reportSpam(req) {
    await latency();
    return mockBackend.setBlocked({ account_id: req.account_id, blocked: req.block ?? true });
  },
  async ktStatus() {
    await latency();
    return { enabled: true, tree_size: 42, checked_at: Date.now(), own_status: "verified", monitored: 42, alerts: [] };
  },
  async ktContactStatus(req) {
    await latency();
    return { account_id: req.account_id, status: "verified", tree_size: 42, checked_at: Date.now() };
  },
  async ktCheckNow() {
    await latency();
    return mockBackend.ktStatus();
  },
  async ktDismissAlerts() {
    await latency();
    emit("kt_alerts", []);
  },

  // --- profile ---------------------------------------------------------------
  async getProfile() {
    await latency();
    return clone(data().profile);
  },
  async setProfile(req) {
    await latency();
    const p = data().profile;
    if (req.name !== undefined) p.name = req.name;
    if (req.about !== undefined) p.about = req.about;
    if (req.avatar_path !== undefined) p.avatar_path = req.avatar_path || null;
    if (req.avatar_data_base64) {
      const b64 = req.avatar_data_base64;
      p.avatar_path = b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`;
    }
    emit("profile_updated", clone(p));
    return clone(p);
  },

  // --- contacts ------------------------------------------------------------
  async listContacts() {
    await latency();
    return clone([...data().contacts.values()]);
  },
  async listBlocked() {
    await latency();
    return clone([...data().contacts.values()].filter((c) => c.blocked));
  },
  async findAccount(req): Promise<FoundAccount | null> {
    await sleep(250 + Math.random() * 200);
    const e = lookup(req.query);
    if (!e) return null;
    const known = data().contacts.get(e.account_id);
    const isMe = e.account_id === ME_ID;
    return {
      account_id: e.account_id,
      number: e.number,
      username: e.username,
      display_name: isMe ? `${e.profile_name || formatNumber(e.number)} (You)` : (known?.display_name ?? (e.username ? `@${e.username}` : formatNumber(e.number))),
      avatar_path: known?.avatar_path ?? e.avatar_path,
      is_me: isMe,
    };
  },
  async addContactByQuery(req) {
    await sleep(400);
    const e = lookup(req.query);
    if (!e) return fail("not_found", "No account found");
    if (e.account_id === ME_ID) fail("invalid_input", "That is your own account");
    return clone(ensureContact(e, req.name));
  },
  async getContact(req) {
    await latency();
    return clone(contactOf(req.account_id));
  },
  async addContactByNumber(req) {
    await sleep(500);
    if (!/^\d{16}$/.test(req.number)) fail("invalid_input", "Account number must have 16 digits");
    if (req.number === account().number) fail("invalid_input", "That is your own account number");
    const d = data();
    const existing = [...d.contacts.values()].find((c) => c.number === req.number);
    if (existing) return clone(existing);
    if (req.number.startsWith("0") || req.number.startsWith("1111")) fail("not_found", "No account with this number");
    const c: Contact = {
      account_id: `acc-${req.number.slice(-6)}`,
      number: req.number,
      profile_name: "New contact",
      local_name: req.name || null,
      display_name: req.name || "New contact",
      about: null,
      avatar_path: null,
      phone: null,
      blocked: false,
      verified: false,
    };
    d.contacts.set(c.account_id, c);
    d.presence.set(c.account_id, { online: false, last_seen: Date.now() - 3_600_000 });
    emit("contact_updated", clone(c));
    return clone(c);
  },
  async renameContact(req) {
    await latency();
    const c = contactOf(req.account_id);
    c.local_name = req.name?.trim() || null;
    c.display_name = c.local_name ?? c.profile_name ?? c.number;
    emit("contact_updated", clone(c));
    for (const cv of data().conversations.values()) {
      if (cv.peer_account_id === c.account_id) {
        cv.title = c.display_name;
        refreshConversation(cv);
      }
    }
    return clone(c);
  },
  async setBlocked(req) {
    await latency();
    const c = contactOf(req.account_id);
    c.blocked = req.blocked;
    emit("contact_updated", clone(c));
    for (const cv of data().conversations.values()) {
      if (cv.peer_account_id === c.account_id) {
        cv.blocked = req.blocked;
        refreshConversation(cv);
      }
    }
    return clone(c);
  },
  async importContacts() {
    await sleep(1200);
    return { total: 184, with_phone: 152, matched: 7 };
  },
  async getMyContactLink() {
    await latency();
    const a = account();
    return `chatapp://add?n=${a.number}&s=${encodeURIComponent(a.server_url)}`;
  },
  async addContactFromLink(req) {
    await sleep(400);
    if (req.link.trim().startsWith("chatapp://u")) {
      const found = await mockBackend.resolveUsernameLink(req);
      return mockBackend.addContactByQuery({ query: found.username ?? "" });
    }
    let url: URL;
    try {
      url = new URL(req.link.trim());
    } catch {
      return fail("invalid_input", `This is not a ${BRAND_NAME} contact link`);
    }
    const n = url.searchParams.get("n") ?? "";
    const s = url.searchParams.get("s") ?? "";
    if (url.protocol !== "chatapp:" || !/^\d{16}$/.test(n)) fail("invalid_input", `This is not a ${BRAND_NAME} contact link`);
    if (s && s.replace(/\/$/, "") !== account().server_url.replace(/\/$/, "")) {
      fail("different_server", `This contact uses another server (${s})`);
    }
    return mockBackend.addContactByNumber({ number: n });
  },
  async getUsernameLink() {
    await latency();
    const u = data().details.username;
    if (!u) return null;
    if (!myUsernameLink || myUsernameLink.username !== u) return mockBackend.resetUsernameLink();
    return { link: usernameLinkUrl(myUsernameLink.handle), username: u };
  },
  async resetUsernameLink() {
    await latency();
    const u = data().details.username;
    if (!u) return null;
    if (myUsernameLink) usernameLinks.delete(myUsernameLink.handle);
    myUsernameLink = { handle: newId(), username: u };
    usernameLinks.set(myUsernameLink.handle, u);
    return { link: usernameLinkUrl(myUsernameLink.handle), username: u };
  },
  async resolveUsernameLink(req) {
    await sleep(300);
    const handle = req.link.trim().split("#")[1] ?? "";
    const u = usernameLinks.get(handle);
    if (!req.link.trim().startsWith("chatapp://u") || !handle) return fail("invalid_input", "Not a username link");
    if (!u || u !== data().details.username) return fail("not_found", "This username link is no longer valid");
    const found = await mockBackend.findAccount({ query: u });
    return found ?? fail("not_found", "This username link is no longer valid");
  },
  async getSafetyNumber(req) {
    await latency();
    const c = contactOf(req.account_id);
    let h = 0;
    for (const ch of c.account_id + MY_NUMBER) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const groups: string[] = [];
    for (let i = 0; i < 12; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      groups.push(String(h % 100000).padStart(5, "0"));
    }
    return { digits: groups.join(" "), qr_payload: btoa(`safety:${c.account_id}:${groups.join("")}`), verified: c.verified };
  },
  async setVerified(req) {
    await latency();
    const c = contactOf(req.account_id);
    c.verified = req.verified;
    emit("contact_updated", clone(c));
    return clone(c);
  },
  async watchPresence(req) {
    const d = data();
    for (const id of req.account_ids) {
      const p = d.presence.get(id);
      if (p) {
        const hidden = d.details.privacy.last_seen === "nobody";
        emit("presence", { account_id: id, online: p.online, last_seen: hidden ? null : p.last_seen });
      }
    }
  },

  // --- conversations ---------------------------------------------------------
  async listConversations() {
    await latency();
    return clone([...data().conversations.values()]);
  },
  async getConversation(req) {
    await latency();
    return clone(conv(req.conversation_id));
  },
  async openDirectConversation(req) {
    await latency();
    const d = data();
    const existing = [...d.conversations.values()].find((c) => c.peer_account_id === req.account_id);
    if (existing) return clone(existing);
    // An account found in the directory (by number or username) becomes a contact when opened.
    const entry = d.directory.find((e) => e.account_id === req.account_id);
    const ct = d.contacts.get(req.account_id) ?? (entry ? ensureContact(entry) : contactOf(req.account_id));
    const c: Conversation = {
      id: `conv-${ct.account_id.slice(4)}`,
      kind: "direct",
      title: ct.display_name,
      avatar_path: ct.avatar_path,
      peer_account_id: ct.account_id,
      peer_number: ct.number,
      group_id: null,
      member_count: null,
      is_admin: false,
      left: false,
      last_message: null,
      unread_count: 0,
      unread_mentions: 0,
      muted_until: null,
      archived: false,
      pinned: false,
      disappearing_seconds: mockDefaultTimer().seconds,
      blocked: ct.blocked,
      draft: null,
      updated_at: Date.now(),
      accepted: true,
      peer_is_contact: d.contacts.has(ct.account_id),
    };
    d.conversations.set(c.id, c);
    d.messages.set(c.id, []);
    emit("conversation_updated", clone(c));
    return clone(c);
  },
  async acceptConversation(req) {
    await latency();
    const c = conv(req.conversation_id);
    c.accepted = true;
    emit("conversation_updated", clone(c));
    return clone(c);
  },
  async setConversationSettings(req) {
    await latency();
    const c = conv(req.conversation_id);
    const { conversation_id: _id, ...patch } = req;
    if (patch.disappearing_seconds !== undefined && patch.disappearing_seconds !== c.disappearing_seconds) {
      const m = systemMessage(c.id, {
        type: "disappearing_changed",
        actor_name: "You",
        target_names: [],
        value: String(patch.disappearing_seconds),
      });
      Object.assign(c, patch);
      addMessage(m);
    }
    Object.assign(c, patch);
    refreshConversation(c);
    return clone(c);
  },
  async setDraft(req) {
    const c = data().conversations.get(req.conversation_id);
    if (c && c.draft !== req.draft) {
      c.draft = req.draft;
      refreshConversation(c);
    }
  },
  async deleteConversation(req) {
    await latency();
    const d = data();
    const c = d.conversations.get(req.conversation_id);
    // An active group is never removed (we would lose it): only cleared.
    if (c?.kind === "group" && !c.left) return this.clearConversation(req);
    d.conversations.delete(req.conversation_id);
    d.messages.delete(req.conversation_id);
    emit("conversation_removed", { conversation_id: req.conversation_id });
  },
  async deleteConversationForEveryone(req) {
    if (!(await this.verifyPassword({ password: req.password }))) fail("invalid_password", "Wrong password");
    await this.deleteConversation(req);
  },
  async unlock() {
    await latency();
  },
  async protectLocalData() {
    await latency();
  },
  async resetLocalData() {
    await latency();
  },
  async getTemporaryMode() {
    return mockTemporary;
  },
  async setTemporaryMode(req) {
    await latency();
    mockTemporary = req.enabled;
    emit("conversations_reset", null);
  },
  async wipeAllConversations(req) {
    if (!(await this.verifyPassword({ password: req.password }))) fail("invalid_password", "Wrong password");
    for (const id of [...data().conversations.keys()]) await this.deleteConversation({ conversation_id: id });
  },
  async clearGroupForEveryone(req) {
    const g = data().groups.get(req.conversation_id);
    if (!(await this.verifyPassword({ password: req.password }))) fail("invalid_password", "Wrong password");
    if (g?.my_role !== "admin") fail("forbidden", "Only group admins can clear the history for everyone");
    await this.clearConversation(req);
  },
  async clearConversation(req) {
    await latency();
    const c = conv(req.conversation_id);
    data().messages.set(c.id, []);
    c.unread_count = 0;
    refreshConversation(c);
  },

  // --- messages ----------------------------------------------------------------
  async getMessages(req) {
    await latency();
    const limit = req.limit ?? 50;
    const all = list(req.conversation_id);
    const older = req.before === undefined ? all : all.filter((m) => m.sent_at < req.before!);
    return clone(older.slice(-limit).reverse());
  },
  async sendMessage(req) {
    await latency();
    const c = conv(req.conversation_id);
    if (c.blocked) fail("forbidden", "You blocked this contact");
    const g = data().groups.get(c.id);
    if (c.left) fail("forbidden", "You are not a member of this group");
    if (g?.settings.only_admins_send && g.my_role !== "admin") fail("forbidden", "Only admins can send messages");
    const now = Date.now();
    const attachments: Attachment[] = (req.attachments ?? []).map((a) => ({
      id: newId("att"),
      mime: a.mime,
      file_name: a.file_name,
      size: a.data_base64 ? Math.floor((a.data_base64.length * 3) / 4) : 250_000,
      width: a.width ?? null,
      height: a.height ?? null,
      duration_ms: a.duration_ms ?? null,
      waveform: a.waveform ?? null,
      thumbnail: null,
      local_path: a.data_base64 ? `data:${a.mime};base64,${a.data_base64}` : (a.path ?? null),
      download_state: "done",
      progress: null,
    }));
    const contacts = (req.contact_ids ?? []).map((id) => {
      const ct = data().contacts.get(id) ?? fail("not_found", "Contact not found");
      return { account_id: ct.account_id, number: ct.number, name: ct.profile_name ?? ct.display_name };
    });
    const kind: Message["kind"] = req.location
      ? "location"
      : req.attachments?.length
        ? req.attachments[0].kind
        : contacts.length
          ? "contact"
          : "text";
    if (req.view_once) {
      const k = req.attachments?.[0]?.kind;
      if (req.attachments?.length !== 1 || (k !== "image" && k !== "video" && k !== "voice") || req.text?.trim() || req.location || contacts.length)
        fail("invalid_input", "view-once needs exactly one photo, video or voice message and no text");
    }
    const reply = req.reply_to ? findMessage(req.reply_to) : null;
    const m: Message = {
      id: newId(),
      conversation_id: c.id,
      sender_account_id: ME_ID,
      sender_name: "You",
      outgoing: true,
      kind,
      text: req.text?.trim() ? req.text : null,
      attachments,
      location: req.location ?? null,
      contacts,
      reply_to: reply
        ? {
            id: reply.id,
            sender_name: reply.outgoing ? "You" : reply.sender_name,
            kind: reply.kind,
            text: reply.text ?? reply.location?.name ?? null,
            thumbnail: reply.attachments[0]?.thumbnail ?? (reply.kind === "image" ? (reply.attachments[0]?.local_path ?? null) : null),
          }
        : null,
      reactions: [],
      status: "pending",
      sent_at: now,
      received_at: now,
      edited_at: null,
      deleted: false,
      forwarded: false,
      expires_at: c.disappearing_seconds ? now + c.disappearing_seconds * 1000 : null,
      system: null,
      mentions: req.mentions ?? [],
      mentions_me: false,
      pinned_until: null,
      starred: false,
    };
    if (req.view_once) {
      // The sender keeps no viewable copy.
      m.view_once = "unopened";
      for (const a of m.attachments) {
        a.local_path = null;
        a.thumbnail = null;
      }
    }
    c.draft = null;
    addMessage(m);
    simulateDelivery(m);
    if (m.view_once) {
      later(6000, () => {
        if (m.status !== "read" || m.deleted) return;
        m.view_once = "opened";
        emitMessage(m);
        refreshConversation(conv(m.conversation_id));
      });
    }
    return clone(m);
  },
  async editMessage(req) {
    await latency();
    const m = findMessage(req.message_id);
    if (!m.outgoing) fail("forbidden", "Only your own messages can be edited");
    const history = (editHistory[m.id] ??= []);
    if (history.length >= 10) fail("invalid_input", "this message cannot be edited again");
    history.push({ text: m.text ?? "", at: m.edited_at ?? m.sent_at });
    m.text = req.text;
    m.mentions = req.mentions ?? [];
    m.edited_at = Date.now();
    emitMessage(m);
    refreshConversation(conv(m.conversation_id));
    return clone(m);
  },
  async deleteMessage(req) {
    await latency();
    const m = findMessage(req.message_id);
    if (req.for_everyone) {
      m.deleted = true;
      m.text = null;
      m.attachments = [];
      m.location = null;
      m.reactions = [];
      emitMessage(m);
    } else {
      const msgs = list(m.conversation_id);
      msgs.splice(msgs.indexOf(m), 1);
      emit("message_deleted", { conversation_id: m.conversation_id, message_id: m.id });
    }
    refreshConversation(conv(m.conversation_id));
  },
  async setGroupInvite(req) {
    await latency();
    const { g } = groupConv(req.conversation_id);
    if (g.my_role !== "admin") fail("forbidden", "Only admins can manage the invite link");
    g.invite_approval = req.approval ?? g.invite_approval;
    g.invite_link = req.enabled ? (req.reset || !g.invite_link ? `chatapp://join/${newId("inv").slice(-22).padEnd(22, "x")}` : g.invite_link) : null;
    return clone(g);
  },
  async previewGroupInvite() {
    return fail("not_found", "Invite links are not available in the demo");
  },
  async joinGroupByLink() {
    return fail("not_found", "Invite links are not available in the demo");
  },
  async cancelJoinRequest() {},
  async groupJoinRequests() {
    return [];
  },
  async approveJoinRequest(req) {
    return clone(groupConv(req.conversation_id).g);
  },
  async rejectJoinRequest(req) {
    return clone(groupConv(req.conversation_id).g);
  },
  async groupBans() {
    return [];
  },
  async unbanGroupMember(req) {
    return clone(groupConv(req.conversation_id).g);
  },
  async pinMessage(req) {
    await latency();
    const m = findMessage(req.message_id);
    m.pinned_until = req.seconds ? Date.now() + req.seconds * 1000 : null;
    const pinned = list(m.conversation_id)
      .filter((x) => x.pinned_until && x.pinned_until > Date.now())
      .sort((a, b) => (b === m ? 1 : 0) - (a === m ? 1 : 0));
    for (const old of pinned.slice(3)) {
      old.pinned_until = null;
      emitMessage(old);
    }
    emitMessage(m);
    emit("pins_changed", { conversation_id: m.conversation_id });
    return clone(m);
  },
  async starMessage(req) {
    await latency();
    const m = findMessage(req.message_id);
    m.starred = req.starred;
    emitMessage(m);
    return clone(m);
  },
  async pinnedMessages(req) {
    return clone(list(req.conversation_id).filter((m) => m.pinned_until && m.pinned_until > Date.now()));
  },
  async starredMessages() {
    const all = [...data().messages.values()].flat().filter((m) => m.starred);
    return clone(all.sort((a, b) => b.sent_at - a.sent_at));
  },
  async react(req) {
    await latency();
    const m = findMessage(req.message_id);
    m.reactions = m.reactions.filter((r) => !r.is_me);
    if (req.emoji) m.reactions.push({ emoji: req.emoji, account_id: ME_ID, sender_name: "You", is_me: true });
    emitMessage(m);
    return clone(m);
  },
  async forwardMessages(req) {
    await latency();
    const src = req.message_ids.map(findMessage).sort((a, b) => a.sent_at - b.sent_at);
    if (src.some((m) => m.view_once)) fail("invalid_input", "view-once media cannot be forwarded");
    for (const cid of req.conversation_ids) {
      for (const s of src) {
        const now = Date.now();
        const m: Message = {
          ...clone(s),
          id: newId(),
          conversation_id: cid,
          sender_account_id: ME_ID,
          sender_name: "You",
          outgoing: true,
          reply_to: null,
          reactions: [],
          status: "pending",
          sent_at: now,
          received_at: now,
          edited_at: null,
          forwarded: true,
        };
        addMessage(m);
        simulateDelivery(m);
      }
    }
  },
  async markRead(req) {
    const c = data().conversations.get(req.conversation_id);
    if (c && c.unread_count > 0) {
      c.unread_count = 0;
      refreshConversation(c);
    }
  },
  async sendTyping() {
    /* nothing to simulate */
  },
  async retryMessage(req) {
    await latency();
    const m = findMessage(req.message_id);
    m.status = "pending";
    emitMessage(m);
    refreshConversation(conv(m.conversation_id));
    later(300, () => {
      m.status = "sent";
      emitMessage(m);
      simulateDelivery(m);
    });
    return clone(m);
  },
  async getEditHistory(req) {
    await latency();
    const m = findMessage(req.message_id);
    if (m.deleted || !m.edited_at) return [];
    return [...(editHistory[m.id] ?? []), { text: m.text ?? "", at: m.edited_at }];
  },
  async getMessageInfo(req) {
    await latency();
    const m = findMessage(req.message_id);
    const c = conv(m.conversation_id);
    const receipts = peersOf(c).map((p, i) => {
      const st: MessageStatus = m.status === "read" ? (i % 3 === 2 ? "delivered" : "read") : m.status;
      return {
        account_id: p.account_id,
        display_name: p.display_name,
        avatar_path: p.avatar_path,
        status: st,
        delivered_at: st === "delivered" || st === "read" ? m.sent_at + 1500 + i * 700 : null,
        read_at: st === "read" ? m.sent_at + 60_000 + i * 45_000 : null,
      };
    });
    return { message: clone(m), receipts };
  },
  async downloadAttachment(req) {
    const m = findMessage(req.message_id);
    const a = m.attachments.find((x) => x.id === req.attachment_id) ?? fail("not_found", "Attachment not found");
    a.download_state = "downloading";
    a.progress = 0;
    emitMessage(m);
    for (let p = 0.2; p <= 1.0001; p += 0.2) {
      await sleep(250);
      a.progress = Math.min(1, p);
      emitMessage(m);
    }
    a.download_state = "done";
    a.progress = null;
    a.local_path =
      a.mime.startsWith("image/") && a.thumbnail
        ? a.thumbnail.replace('viewBox="0 0 12 8"', 'viewBox="0 0 12 8" width="1200" height="800"')
        : `data:${a.mime};charset=utf-8,${encodeURIComponent(`Sample file: ${a.file_name}\n`)}`;
    emitMessage(m);
  },
  async openViewOnce(req) {
    await sleep(600);
    const m = findMessage(req.message_id);
    if (!m.view_once || m.outgoing) fail("invalid_input", "not an incoming view-once message");
    if (m.view_once !== "unopened") fail("invalid_input", "this view-once media was already opened");
    const a = m.attachments[0] ?? fail("not_found", "Attachment not found");
    m.view_once = "opened";
    emitMessage(m);
    refreshConversation(conv(m.conversation_id));
    const path = viewOnceMedia.get(m.id) ?? photo(m.sent_at % 7, a.width ?? 1200, a.height ?? 800);
    viewOnceMedia.set(m.id, path);
    return clone({ ...a, local_path: path, download_state: "done" as const, progress: null });
  },
  async viewOnceDone(req) {
    await latency();
    viewOnceMedia.delete(req.message_id);
  },
  async saveAttachment(req) {
    await latency();
    const m = findMessage(req.message_id);
    const a = m.attachments.find((x) => x.id === req.attachment_id) ?? fail("not_found", "Attachment not found");
    if (!a.local_path) fail("not_found", "Attachment not downloaded");
    if (req.dest_path.startsWith("browser-download:")) {
      const link = document.createElement("a");
      link.href = a.local_path!;
      link.download = req.dest_path.slice("browser-download:".length);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  },
  async searchMessages(req) {
    await latency();
    const q = req.query.toLowerCase();
    const out: Message[] = [];
    for (const [cid, msgs] of data().messages) {
      if (req.conversation_id && cid !== req.conversation_id) continue;
      for (const m of msgs) if (!m.deleted && m.text?.toLowerCase().includes(q)) out.push(m);
    }
    return clone(out.sort((a, b) => b.sent_at - a.sent_at).slice(0, req.limit ?? 50));
  },
  async listMedia(req) {
    await latency();
    const msgs = list(req.conversation_id).filter((m) =>
      !m.deleted && !m.view_once && (req.kind === "media" ? m.kind === "image" || m.kind === "video" : m.kind === "file"),
    );
    return clone(msgs.reverse().slice(0, req.limit ?? 100));
  },

  // --- groups ------------------------------------------------------------------
  async createGroup(req) {
    await sleep(400);
    const d = data();
    const id = newId("grp");
    const c: Conversation = {
      id: `conv-${id}`,
      kind: "group",
      title: req.name,
      avatar_path: req.avatar_path ?? null,
      peer_account_id: null,
      peer_number: null,
      group_id: id,
      member_count: req.member_account_ids.length + 1,
      is_admin: true,
      left: false,
      last_message: null,
      unread_count: 0,
      unread_mentions: 0,
      muted_until: null,
      archived: false,
      pinned: false,
      disappearing_seconds: req.settings?.disappearing_seconds ?? mockDefaultTimer().seconds,
      blocked: false,
      draft: null,
      updated_at: Date.now(),
      accepted: true,
      peer_is_contact: false,
    };
    d.conversations.set(c.id, c);
    d.messages.set(c.id, []);
    d.groups.set(c.id, {
      conversation_id: c.id,
      group_id: id,
      name: req.name,
      description: req.description ?? "",
      avatar_path: req.avatar_path ?? null,
      members: [
        { account_id: ME_ID, number: account().number, display_name: "You", avatar_path: null, role: "admin", is_me: true },
        ...req.member_account_ids.map((aid) => {
          const ct = contactOf(aid);
          return { account_id: aid, number: ct.number, display_name: ct.display_name, avatar_path: ct.avatar_path, role: "member" as const, is_me: false };
        }),
      ],
      member_count: req.member_account_ids.length + 1,
      members_hidden: false,
      my_role: "admin",
      settings: { only_admins_send: false, only_admins_edit: false, disappearing_seconds: 0, hide_members: false, member_names: "number", ...req.settings },
      created_by: ME_ID,
      created_at: Date.now(),
      invite_link: null,
      invite_approval: false,
      join_requests: 0,
    });
    addMessage(systemMessage(c.id, { type: "group_created", actor_name: "You", target_names: [], value: req.name }));
    return clone(c);
  },
  async getGroupInfo(req) {
    await latency();
    return clone(groupConv(req.conversation_id).g);
  },
  async updateGroup(req) {
    await latency();
    const { c, g } = groupConv(req.conversation_id);
    if (g.settings.only_admins_edit && g.my_role !== "admin" && (req.name || req.description !== undefined || req.avatar_path !== undefined)) {
      fail("forbidden", "Only admins can edit group info");
    }
    if (req.settings) {
      requireAdmin(g);
      g.settings = { ...g.settings, ...req.settings };
    }
    if (req.name !== undefined && req.name !== g.name) {
      g.name = req.name;
      addMessage(systemMessage(c.id, { type: "group_renamed", actor_name: "You", target_names: [], value: req.name }));
    }
    if (req.description !== undefined) g.description = req.description;
    if (req.avatar_path !== undefined) {
      g.avatar_path = req.avatar_path || null;
      addMessage(systemMessage(c.id, { type: "group_avatar_changed", actor_name: "You", target_names: [], value: null }));
    }
    emitGroup(c, g);
    return clone(g);
  },
  async addGroupMembers(req) {
    await latency();
    const { c, g } = groupConv(req.conversation_id);
    requireAdmin(g);
    const added = req.account_ids.filter((id) => !g.members.some((m) => m.account_id === id)).map(contactOf);
    for (const ct of added) {
      g.members.push({ account_id: ct.account_id, number: ct.number, display_name: ct.display_name, avatar_path: ct.avatar_path, role: "member", is_me: false });
    }
    if (added.length) {
      addMessage(systemMessage(c.id, { type: "group_member_added", actor_name: "You", target_names: added.map((a) => a.display_name), value: null }));
    }
    emitGroup(c, g);
    return clone(g);
  },
  async removeGroupMember(req) {
    await latency();
    const { c, g } = groupConv(req.conversation_id);
    requireAdmin(g);
    const mem = g.members.find((m) => m.account_id === req.account_id) ?? fail("not_found", "Member not found");
    g.members = g.members.filter((m) => m !== mem);
    addMessage(systemMessage(c.id, { type: "group_member_removed", actor_name: "You", target_names: [mem.display_name], value: null }));
    emitGroup(c, g);
    return clone(g);
  },
  async setGroupAdmin(req) {
    await latency();
    const { c, g } = groupConv(req.conversation_id);
    requireAdmin(g);
    const mem = g.members.find((m) => m.account_id === req.account_id) ?? fail("not_found", "Member not found");
    mem.role = req.admin ? "admin" : "member";
    addMessage(
      systemMessage(c.id, {
        type: req.admin ? "group_admin_granted" : "group_admin_revoked",
        actor_name: "You",
        target_names: [mem.display_name],
        value: null,
      }),
    );
    emitGroup(c, g);
    return clone(g);
  },
  async leaveGroup(req) {
    await latency();
    const { c, g } = groupConv(req.conversation_id);
    g.members = g.members.filter((m) => !m.is_me);
    g.my_role = null;
    c.left = true;
    c.is_admin = false;
    addMessage(systemMessage(c.id, { type: "group_member_left", actor_name: "You", target_names: [], value: null }));
    emitGroup(c, g);
  },

  // Voice calls need a real peer: the mock only records history.
  async callSignal() {
    await latency();
  },
  async recordCall(req) {
    await latency();
    const c = data().conversations.get(req.conversation_id) ?? fail("not_found", "Conversation not found");
    addMessage(
      systemMessage(c.id, {
        type: "call",
        actor_name: req.caller_account_id === ME_ID ? "You" : c.title,
        target_names: [],
        value: JSON.stringify({ status: req.status, duration_ms: req.duration_ms }),
      }),
    );
  },
  async getIceServers() {
    return { ice_servers: [], ttl: 0 };
  },
  // Group calls: the mock has no other participants; joining shows a call with only us.
  async groupCallStart(req) {
    await latency();
    const c = data().conversations.get(req.conversation_id) ?? fail("not_found", "Conversation not found");
    if (!c.group_id) fail("invalid", "not a group");
    mockGroupCall = {
      group_id: c.group_id ?? "",
      conversation_id: c.id,
      call_id: newId(),
      started_by: ME_ID,
      started_at: Date.now(),
      video: req.video,
      participants: [{ account_id: ME_ID, device_id: 1, me: true, relay: false }],
      joined: true,
      ringing: false,
      ended: false,
      max_participants: 8,
    };
    emit("group_call", mockGroupCall);
    return clone(mockGroupCall);
  },
  async groupCallJoin(req) {
    await latency();
    if (!mockGroupCall || mockGroupCall.call_id !== req.call_id) return fail("not_found", "this call is over");
    return clone(mockGroupCall);
  },
  async groupCallLeave(req) {
    await latency();
    const call = mockGroupCall;
    if (!call || call.conversation_id !== req.conversation_id) return;
    mockGroupCall = null;
    emit("group_call", { ...call, participants: [], joined: false, ended: true });
    addMessage(
      systemMessage(call.conversation_id, {
        type: "group_call",
        actor_name: "You",
        target_names: [],
        value: JSON.stringify({ duration_ms: Date.now() - call.started_at, joined: true }),
      }),
    );
  },
  async groupCallDecline() {
    await latency();
  },
  async groupCallHeartbeat() {},
  async groupCallState(req) {
    return mockGroupCall?.conversation_id === req.conversation_id ? clone(mockGroupCall) : null;
  },
  async groupCallSignal() {
    await latency();
  },
};

// Debug helpers for manual testing in the browser console.
if (typeof window !== "undefined") {
  (window as unknown as { __chatappMock: unknown }).__chatappMock = {
    emit,
    incoming: simulateIncoming,
    loggedOut: (reason: "device_removed" | "account_deleted" | "logout" = "device_removed") => {
      writeSession(false);
      timers.forEach(clearTimeout);
      timers = [];
      db = null;
      emit("logged_out", { reason });
    },
  };
}
