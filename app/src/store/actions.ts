// High level actions: call the core and update the store.

import { connectionEventCount } from "./events";
import { notifications } from "@mantine/notifications";
import i18n from "../i18n";
import { api, parseError } from "../lib/api";
import { initAppLock } from "../lib/appLock";
import { takeJustOpened } from "../lib/profiles";
import { loadCallSettings } from "../lib/callSettings";
import { loadMediaRetention } from "../lib/mediaRetention";
import { loadDefaultTimer } from "../lib/defaultTimer";
import { loadDnd } from "../lib/dnd";
import { ensureNotificationPermission } from "../lib/platform";
import type { Conversation, ConversationSettingsPatch, LoggedOutEvent, Mention, Message } from "../lib/types";
import {
  addMessagePage,
  getApp,
  resetSession,
  setApp,
  setComposing,
  setConvLoading,
  upsertContact,
  upsertConversation,
  upsertMessage,
  type SettingsSection,
} from "./app";

const PAGE = 40;

export function errorText(err: unknown): string {
  const { code, message } = parseError(err);
  return i18n.t(`errors.${code}`, { defaultValue: message || i18n.t("errors.internal") });
}

export function notifyError(err: unknown) {
  console.error(err);
  notifications.show({ color: "red", title: i18n.t("errors.title"), message: errorText(err) });
}

export function notifyOk(message: string) {
  notifications.show({ color: "teal", message });
}

/** Runs an async action and shows an error notification on failure. */
export async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    notifyError(e);
    return undefined;
  }
}

export async function bootstrap() {
  try {
    const appState = await api.getState();
    setApp({ appState });
    // Opened from the start screen with the password just now (lib/profiles.ts).
    const justOpened = takeJustOpened();
    if (appState.status === "ready") {
      // A saved session opened at app start: honour the app lock.
      initAppLock(appState.account?.account_id, !justOpened);
      await loadSession();
    }
  } catch (e) {
    notifyError(e);
    setApp({ appState: { status: "no_account", account: null, default_server_url: "", local_protected: false } });
  }
}

export async function loadSession() {
  const eventsBefore = connectionEventCount();
  const [details, profile, contacts, conversations, connection, temporaryMode] = await Promise.all([
    api.getAccountDetails(),
    api.getProfile(),
    api.listContacts(),
    api.listConversations(),
    api.getConnectionState(),
    api.getTemporaryMode().catch(() => false),
  ]);
  setApp({
    details,
    temporaryMode,
    profile,
    // A connection event that arrived while we waited is newer than this answer.
    ...(connectionEventCount() === eventsBefore ? { connection } : {}),
    contacts: Object.fromEntries(contacts.map((c) => [c.account_id, c])),
    conversations: Object.fromEntries(conversations.map((c) => [c.id, c])),
  });
  api
    .checkServer(details.account.server_url)
    .then((serverInfo) => setApp({ serverInfo }))
    .catch(() => undefined);
  void loadDnd();
  void loadCallSettings();
  void loadMediaRetention();
  void loadDefaultTimer();
  void ensureNotificationPermission();
}

/** Called after register/login/recover. */
export async function enterApp() {
  const appState = await api.getState();
  setApp({ appState, loggedOutReason: null });
  initAppLock(appState.account?.account_id, false);
  await loadSession();
}

export async function logout() {
  await api.logout();
  signedOut(null);
}

/** Returns to onboarding, optionally explaining why. */
export function signedOut(reason: LoggedOutEvent["reason"] | null) {
  const defaultServer = getApp().appState?.default_server_url ?? "";
  resetSession();
  setApp({
    loggedOutReason: reason,
    appState: { status: "no_account", account: null, default_server_url: defaultServer, local_protected: false },
  });
}

// ---------------------------------------------------------------------------
// navigation
// ---------------------------------------------------------------------------

export function openConversation(id: string | null) {
  const s = getApp();
  if (s.activeId === id) return;
  setApp({ activeId: id, infoOpen: false, selection: null, highlightId: null });
  if (!id) return;
  const c = s.conversations[id];
  if (!s.convMessages[id]?.loaded) void loadMessages(id);
  if (c?.unread_count) void api.markRead({ conversation_id: id }).catch(() => undefined);
  if (c?.kind === "direct" && c.peer_account_id) {
    void api.watchPresence({ account_ids: [c.peer_account_id] }).catch(() => undefined);
  }
  if (c?.kind === "group") void loadGroup(id);
}

export function openSettings(section: SettingsSection | null = null) {
  setApp({ sidebar: "settings", settingsSection: section });
}

export async function openDirect(accountId: string) {
  const c = await attempt(() => api.openDirectConversation({ account_id: accountId }));
  if (!c) return;
  upsertConversation(c);
  setApp({ sidebar: "chats", chatFilter: c.archived ? "archived" : getApp().chatFilter === "archived" ? "all" : getApp().chatFilter });
  openConversation(c.id);
}

// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------

export async function loadMessages(conversationId: string) {
  setConvLoading(conversationId, true);
  try {
    const page = await api.getMessages({ conversation_id: conversationId, limit: PAGE });
    addMessagePage(conversationId, page, page.length >= PAGE, true);
  } catch (e) {
    setConvLoading(conversationId, false);
    notifyError(e);
  }
}

export async function loadOlder(conversationId: string): Promise<number> {
  const s = getApp();
  const cm = s.convMessages[conversationId];
  if (!cm || cm.loading || !cm.hasMore) return 0;
  // The core pages by received_at (arrival order), the same order the list is shown in.
  const oldest = cm.ids.length ? s.messages[cm.ids[0]]?.received_at : undefined;
  setConvLoading(conversationId, true);
  try {
    const page = await api.getMessages({ conversation_id: conversationId, before: oldest, limit: PAGE });
    addMessagePage(conversationId, page, page.length >= PAGE);
    return page.length;
  } catch (e) {
    setConvLoading(conversationId, false);
    notifyError(e);
    return 0;
  }
}

export async function sendText(conversationId: string, text: string, mentions: Mention[] = []) {
  const comp = getApp().composing[conversationId];
  if (comp?.editing) {
    const edited = await attempt(() => api.editMessage({ message_id: comp.editing!.id, text, mentions }));
    if (edited) upsertMessage(edited);
    setComposing(conversationId, { editing: null });
    return;
  }
  const replyTo = comp?.replyTo?.id;
  setComposing(conversationId, { replyTo: null });
  const m = await attempt(() => api.sendMessage({ conversation_id: conversationId, text, reply_to: replyTo, mentions }));
  if (m) upsertMessage(m);
}

export async function sendMessage(req: Parameters<typeof api.sendMessage>[0]) {
  const comp = getApp().composing[req.conversation_id];
  const reply_to = req.reply_to ?? comp?.replyTo?.id;
  setComposing(req.conversation_id, { replyTo: null });
  const m = await attempt(() => api.sendMessage({ ...req, reply_to }));
  if (m) upsertMessage(m);
  return m;
}

export async function react(m: Message, emoji: string | null) {
  const res = await attempt(() => api.react({ message_id: m.id, emoji }));
  if (res) upsertMessage(res);
}

export async function deleteMessages(ids: string[], forEveryone: boolean) {
  for (const id of ids) {
    await attempt(() => api.deleteMessage({ message_id: id, for_everyone: forEveryone }));
  }
}

// ---------------------------------------------------------------------------
// conversations
// ---------------------------------------------------------------------------

export async function patchConversation(conversationId: string, patch: ConversationSettingsPatch) {
  const c = await attempt(() => api.setConversationSettings({ conversation_id: conversationId, ...patch }));
  if (c) upsertConversation(c);
  return c;
}

export async function loadGroup(conversationId: string) {
  try {
    const g = await api.getGroupInfo({ conversation_id: conversationId });
    setApp((s) => ({ groups: { ...s.groups, [conversationId]: g } }));
    return g;
  } catch (e) {
    notifyError(e);
    return undefined;
  }
}

export async function setBlocked(accountId: string, blocked: boolean) {
  const c = await attempt(() => api.setBlocked({ account_id: accountId, blocked }));
  if (c) upsertContact(c);
}

export async function reloadConversations() {
  const list = await attempt(() => api.listConversations());
  if (list) setApp({ conversations: Object.fromEntries(list.map((c: Conversation) => [c.id, c])) });
}

// ---------------------------------------------------------------------------
// back navigation (mobile back button, Escape key)
// ---------------------------------------------------------------------------

/** How many "back" steps are available from the current screen. */
export function navDepth(): number {
  const s = getApp();
  if (s.sidebar === "settings") return s.settingsSection === "blocked" ? 3 : s.settingsSection ? 2 : 1;
  if (s.sidebar !== "chats") return 1;
  if (s.activeId) return s.infoOpen || s.selection ? 2 : 1;
  return 0;
}

/** Goes one step back. Returns false when there is nothing to go back to. */
export function goBack(): boolean {
  const s = getApp();
  if (s.selection) {
    setApp({ selection: null });
    return true;
  }
  if (s.sidebar === "settings") {
    if (s.settingsSection === "blocked") setApp({ settingsSection: "privacy" });
    else if (s.settingsSection && window.matchMedia("(max-width: 767px)").matches) setApp({ settingsSection: null });
    else setApp({ sidebar: "chats", settingsSection: null });
    return true;
  }
  if (s.sidebar !== "chats") {
    setApp({ sidebar: "chats" });
    return true;
  }
  if (s.infoOpen) {
    setApp({ infoOpen: false });
    return true;
  }
  if (s.activeId) {
    openConversation(null);
    return true;
  }
  return false;
}

export function toggleSelect(conversationId: string, messageId: string) {
  const sel = getApp().selection;
  if (!sel || sel.conversationId !== conversationId) {
    setApp({ selection: { conversationId, ids: [messageId] } });
    return;
  }
  const ids = sel.ids.includes(messageId) ? sel.ids.filter((x) => x !== messageId) : [...sel.ids, messageId];
  setApp({ selection: ids.length ? { conversationId, ids } : null });
}

export async function refreshDetails() {
  const details = await attempt(() => api.getAccountDetails());
  if (details) setApp({ details });
}

export async function reloadContacts() {
  const list = await attempt(() => api.listContacts());
  if (list) setApp({ contacts: Object.fromEntries(list.map((c) => [c.account_id, c])) });
}
