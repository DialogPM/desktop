// Subscribes to core events and keeps the store in sync. Also drives desktop
// notifications and the unread counter in the document title.

import { BRAND_NAME } from "../brand";
import { notifications } from "@mantine/notifications";
import i18n from "../i18n";
import { api, onEvent, type Unlisten } from "../lib/api";
import { getAppearance } from "../lib/appearance";
import { applyCallSettings } from "../lib/callSettings";
import { applyDnd, dndActive } from "../lib/dnd";
import { applyMediaCheck, applyMediaRetention } from "../lib/mediaRetention";
import { applyDefaultTimer } from "../lib/defaultTimer";
import { isMuted } from "../lib/format";
import { previewText } from "../lib/messageText";
import { getNotifyPrefs } from "../lib/notifyPrefs";
import { setAppBadge, showNotification } from "../lib/platform";
import { playInChat, playIncoming } from "../lib/sounds";
import { reloadConversations } from "./actions";
import { handleCallSignal } from "./calls";
import { handleGroupCall, handleGroupCallSignal } from "./groupCalls";
import {
  getApp,
  removeConversation,
  removeMessage,
  resetSession,
  setApp,
  setTyping,
  upsertContact,
  upsertConversation,
  upsertMessage,
  useApp,
} from "./app";

/** Counts "connection" events, so a slower state query never overwrites a newer event. */
let connectionEvents = 0;
export function connectionEventCount(): number {
  return connectionEvents;
}

const typingTimers = new Map<string, number>();
/** Accounts already warned about this session (identity_conflict). */
const warnedConflicts = new Set<string>();

function windowFocused() {
  return document.visibilityState === "visible" && document.hasFocus();
}

function markActiveRead() {
  const { activeId, conversations } = getApp();
  if (activeId && conversations[activeId]?.unread_count && windowFocused()) {
    void api.markRead({ conversation_id: activeId }).catch(() => undefined);
  }
}

// Store updates from core events are applied together, a few milliseconds late: the core can
// send hundreds in a row (deleting a long chat, history sync), and a render per event made React
// give up ("Maximum update depth exceeded", a blank window). Order is kept: one queue for all.
const queued: (() => void)[] = [];
let flushTimer = 0;

function later(op: () => void) {
  queued.push(op);
  if (!flushTimer) flushTimer = window.setTimeout(flushQueued, 16);
}

function flushQueued() {
  flushTimer = 0;
  // Updates made in one task are rendered together.
  for (const op of queued.splice(0)) op();
}

export function startEventBridge(): () => void {
  const subs: Promise<Unlisten>[] = [
    onEvent("conversation_updated", (c) => later(() => upsertConversation(c))),
    onEvent("conversation_removed", (p) => later(() => removeConversation(p.conversation_id))),
    onEvent("message", (ev) => later(() => {
      upsertMessage(ev.message);
      if (!ev.is_new_incoming) return;
      const s = getApp();
      const prefs = getNotifyPrefs();
      const conv = s.conversations[ev.conversation_id];
      // Muted chats still notify when we are @mentioned (like WhatsApp).
      // Do not disturb silences everything (the message still arrives and counts as unread).
      const muted = dndActive() || (!!conv && isMuted(conv) && !ev.message.mentions_me);
      const active = s.activeId === ev.conversation_id;
      if (active && windowFocused()) {
        void api.markRead({ conversation_id: ev.conversation_id }).catch(() => undefined);
        if (!muted && prefs.soundInChat) playInChat();
        return;
      }
      if (muted) return;
      if (prefs.sound) playIncoming();
      if (!prefs.desktop) return;
      const m = ev.message;
      const t = i18n.t.bind(i18n);
      // "Notification preview" off: neither the content nor who sent it (sender or group name)
      // goes into the notification, which the OS may show on the lock screen or keep in its history.
      if (!getAppearance().notifPreview) {
        void showNotification(BRAND_NAME, t("notifications.hidden"));
        return;
      }
      const body = m.deleted ? t("message.deleted") : previewText(m.kind, m.text, t, m.view_once);
      const title = conv?.kind === "group" ? `${m.sender_name} @ ${conv.title}` : (conv?.title ?? m.sender_name);
      void showNotification(title, body);
    })),
    onEvent("message_deleted", (p) => later(() => removeMessage(p.conversation_id, p.message_id))),
    onEvent("typing", (p) => {
      const key = `${p.conversation_id}/${p.account_id}`;
      window.clearTimeout(typingTimers.get(key));
      setTyping(p.conversation_id, p.account_id, p.sender_name, p.typing);
      if (p.typing) {
        // Safety net in case the "stopped typing" event never arrives.
        typingTimers.set(key, window.setTimeout(() => setTyping(p.conversation_id, p.account_id, "", false), 8000));
      }
    }),
    onEvent("presence", (p) => setApp((s) => ({ presence: { ...s.presence, [p.account_id]: p } }))),
    onEvent("connection", (connection) => {
      connectionEvents++;
      setApp({ connection });
    }),
    onEvent("contact_updated", upsertContact),
    onEvent("profile_updated", (profile) => setApp({ profile })),
    onEvent("dnd_changed", (p) => applyDnd(p.until)),
    onEvent("call_settings_changed", applyCallSettings),
    onEvent("media_retention_changed", applyMediaRetention),
    onEvent("media_check", applyMediaCheck),
    onEvent("default_disappearing_changed", applyDefaultTimer),
    onEvent("devices_changed", () => setApp((s) => ({ devicesVersion: s.devicesVersion + 1 }))),
    onEvent("pins_changed", () => setApp((s) => ({ pinsVersion: s.pinsVersion + 1 }))),
    onEvent("group_updated", (g) => setApp((s) => ({ groups: { ...s.groups, [g.conversation_id]: g } }))),
    onEvent("history_sync", (p) => {
      setApp({ historySync: p });
      if (p.done) {
        void reloadConversations();
        window.setTimeout(() => setApp({ historySync: null }), 2500);
      }
    }),
    onEvent("conversations_reset", () =>
      later(() => {
        setApp({ convMessages: {}, messages: {}, activeId: null, infoOpen: false, selection: null });
        void reloadConversations();
      }),
    ),
    onEvent("call_signal", (p) => void handleCallSignal(p)),
    onEvent("group_call", (p) => handleGroupCall(p)),
    onEvent("group_call_signal", (p) => void handleGroupCallSignal(p)),
    onEvent("identity_conflict", (p) => {
      // Shown once per session and account; the conversation keeps a permanent notice.
      if (warnedConflicts.has(p.account_id)) return;
      warnedConflicts.add(p.account_id);
      notifications.show({
        color: "red",
        autoClose: false,
        title: i18n.t("security.conflictTitle"),
        message: i18n.t(p.own_account ? "security.conflictOwn" : "security.conflictPeer", {
          name: p.conversation_id ? (getApp().conversations[p.conversation_id]?.title ?? "") : "",
        }),
      });
    }),
    onEvent("message_send_error", (p) => {
      // Show the real reason once per message (and again when it finally fails).
      if (p.attempt !== 1 && !p.final) return;
      // Explained by the identity_conflict notification and the notice in the chat.
      if (p.error.startsWith("untrusted_identity")) return;
      // Explained under the message itself ("has no connected device... will be sent later");
      // these waits are retried quietly, so a toast on every retry would only be noise.
      if (p.error.startsWith("no_devices") && !p.final) return;
      console.warn(`send failed (attempt ${p.attempt}${p.final ? ", giving up" : ""}): ${p.error}`);
      notifications.show({
        color: "red",
        autoClose: p.final ? false : 10_000,
        title: i18n.t(p.final ? "message.sendFailed" : "message.sendRetrying"),
        message: p.error,
      });
    }),
    onEvent("logged_out", (p) => {
      resetSession();
      setApp((s) => ({
        loggedOutReason: p.reason,
        appState: { status: "no_account", account: null, default_server_url: s.appState?.default_server_url ?? "", local_protected: false },
      }));
    }),
  ];

  const onFocus = () => markActiveRead();
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);

  // Unread count in the document title.
  const updateTitle = () => {
    const convs = Object.values(getApp().conversations);
    const unread = convs.filter((c) => !c.archived && !isMuted(c)).reduce((n, c) => n + c.unread_count, 0);
    const title = unread > 0 ? `(${unread}) ${BRAND_NAME}` : BRAND_NAME;
    if (document.title !== title) document.title = title;
    void setAppBadge(getNotifyPrefs().badge ? unread : 0);
  };
  updateTitle();
  const unsubTitle = useApp.subscribe((s, prev) => {
    if (s.conversations !== prev.conversations) updateTitle();
  });

  return () => {
    // Updates of this session must not land in the next one (account switch, logout).
    window.clearTimeout(flushTimer);
    flushTimer = 0;
    queued.length = 0;
    subs.forEach((p) => void p.then((un) => un()));
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onFocus);
    unsubTitle();
  };
}
