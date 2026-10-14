// Normalized application state, kept up to date by core events (see events.ts).

import { create } from "zustand";
import { useAppLock } from "../lib/appLock";
import { applyCallSettings, DEFAULT_CALL_SETTINGS } from "../lib/callSettings";
import { applyDnd } from "../lib/dnd";
import type {
  AccountDetails,
  AppState,
  ConnectionState,
  Contact,
  Conversation,
  GroupInfo,
  HistorySyncEvent,
  LoggedOutEvent,
  Message,
  Presence,
  Profile,
  ServerInfo,
} from "../lib/types";

export type ChatFilter = "all" | "unread" | "groups" | "archived" | "requests";
export type SidebarView = "chats" | "settings" | "new_chat" | "new_group" | "starred";
export type SettingsSection =
  | "profile"
  | "account"
  | "privacy"
  | "notifications"
  | "devices"
  | "chats"
  | "appearance"
  | "language"
  | "about"
  /** Blocked contacts, a sub-page of "privacy". */
  | "blocked";

export interface ConversationMessages {
  /** Message ids sorted oldest -> newest. */
  ids: string[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
}

export interface TypingEntry {
  name: string;
  at: number;
}

export interface Composing {
  replyTo: Message | null;
  editing: Message | null;
}

export interface AppStore {
  // session
  appState: AppState | null;
  profile: Profile | null;
  details: AccountDetails | null;
  serverInfo: ServerInfo | null;
  connection: ConnectionState;
  historySync: HistorySyncEvent | null;
  /** Temporary mode: nothing about conversations survives a restart. */
  temporaryMode: boolean;
  loggedOutReason: LoggedOutEvent["reason"] | null;

  // data
  conversations: Record<string, Conversation>;
  messages: Record<string, Message>;
  convMessages: Record<string, ConversationMessages>;
  contacts: Record<string, Contact>;
  groups: Record<string, GroupInfo>;
  typing: Record<string, Record<string, TypingEntry>>;
  presence: Record<string, Presence>;

  // ui
  activeId: string | null;
  infoOpen: boolean;
  sidebar: SidebarView;
  settingsSection: SettingsSection | null;
  chatFilter: ChatFilter;
  composing: Record<string, Composing>;
  selection: { conversationId: string; ids: string[] } | null;
  highlightId: string | null;
  /** Bumped by the devices_changed event. */
  devicesVersion: number;
  /** Bumped when pinned messages change (pins_changed). */
  pinsVersion: number;
}

export const initialData = {
  profile: null,
  details: null,
  serverInfo: null,
  connection: "connecting" as ConnectionState,
  historySync: null,
  temporaryMode: false,
  conversations: {},
  messages: {},
  convMessages: {},
  contacts: {},
  groups: {},
  typing: {},
  presence: {},
  activeId: null,
  infoOpen: false,
  sidebar: "chats" as SidebarView,
  settingsSection: null,
  chatFilter: "all" as ChatFilter,
  composing: {},
  selection: null,
  highlightId: null,
  devicesVersion: 0,
  pinsVersion: 0,
};

export const useApp = create<AppStore>()(() => ({
  appState: null,
  loggedOutReason: null,
  ...initialData,
}));

export const getApp = useApp.getState;
export const setApp = useApp.setState;

// ---------------------------------------------------------------------------
// pure state updaters
// ---------------------------------------------------------------------------

export function upsertConversation(c: Conversation) {
  setApp((s) => ({ conversations: { ...s.conversations, [c.id]: c } }));
}

export function removeConversation(id: string) {
  setApp((s) => {
    const conversations = { ...s.conversations };
    delete conversations[id];
    const convMessages = { ...s.convMessages };
    delete convMessages[id];
    return {
      conversations,
      convMessages,
      activeId: s.activeId === id ? null : s.activeId,
      infoOpen: s.activeId === id ? false : s.infoOpen,
    };
  });
}

function insertSorted(ids: string[], msg: Message, all: Record<string, Message>): string[] {
  if (ids.includes(msg.id)) return ids;
  const out = ids.slice();
  let i = out.length;
  // Arrival order (received_at, this device's clock), like the core's list: sent_at is the
  // sender's clock and would interleave messages wrongly when a peer's clock is off.
  while (i > 0 && (all[out[i - 1]]?.received_at ?? 0) > msg.received_at) i--;
  out.splice(i, 0, msg.id);
  return out;
}

export function upsertMessage(m: Message) {
  setApp((s) => {
    const messages = { ...s.messages, [m.id]: m };
    const cm = s.convMessages[m.conversation_id];
    if (!cm?.loaded) return { messages };
    return {
      messages,
      convMessages: { ...s.convMessages, [m.conversation_id]: { ...cm, ids: insertSorted(cm.ids, m, messages) } },
    };
  });
}

export function removeMessage(conversationId: string, messageId: string) {
  setApp((s) => {
    const messages = { ...s.messages };
    delete messages[messageId];
    const cm = s.convMessages[conversationId];
    return {
      messages,
      convMessages: cm
        ? { ...s.convMessages, [conversationId]: { ...cm, ids: cm.ids.filter((x) => x !== messageId) } }
        : s.convMessages,
    };
  });
}

/** Adds a page of messages (any order) to a conversation. */
export function addMessagePage(conversationId: string, page: Message[], hasMore: boolean, reset = false) {
  setApp((s) => {
    const messages = { ...s.messages };
    for (const m of page) messages[m.id] = m;
    const prev = reset ? [] : (s.convMessages[conversationId]?.ids ?? []);
    const set = new Set(prev);
    for (const m of page) set.add(m.id);
    const ids = [...set].sort((a, b) => (messages[a]?.received_at ?? 0) - (messages[b]?.received_at ?? 0));
    return {
      messages,
      convMessages: {
        ...s.convMessages,
        [conversationId]: { ids, hasMore, loading: false, loaded: true },
      },
    };
  });
}

export function setConvLoading(conversationId: string, loading: boolean) {
  setApp((s) => {
    const cm = s.convMessages[conversationId] ?? { ids: [], hasMore: true, loading: false, loaded: false };
    return { convMessages: { ...s.convMessages, [conversationId]: { ...cm, loading } } };
  });
}

export function upsertContact(c: Contact) {
  setApp((s) => ({ contacts: { ...s.contacts, [c.account_id]: c } }));
}

export function setTyping(conversationId: string, accountId: string, name: string, typing: boolean) {
  setApp((s) => {
    const cur = { ...(s.typing[conversationId] ?? {}) };
    if (typing) cur[accountId] = { name, at: Date.now() };
    else delete cur[accountId];
    return { typing: { ...s.typing, [conversationId]: cur } };
  });
}

export function setComposing(conversationId: string, patch: Partial<Composing>) {
  setApp((s) => {
    const cur = s.composing[conversationId] ?? { replyTo: null, editing: null };
    return { composing: { ...s.composing, [conversationId]: { ...cur, ...patch } } };
  });
}

export function resetSession() {
  setApp({ ...initialData });
  useAppLock.setState({ enabled: false, locked: false });
  applyDnd(0);
  applyCallSettings(DEFAULT_CALL_SETTINGS);
}
