// Opening a username link (https://dialog.pm/@name, dialog://u/name) in the desktop app.
//
// The link names an account of the official server only, so it is honoured only while signed
// in to that server: elsewhere the same name is someone else. A link comes from outside the
// app (a web page, a message, another program), so nothing happens without a question: the app
// looks the name up, shows who it found and starts the conversation only when the user agrees.
// It waits until the app is signed in and unlocked.

import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import i18n from "../i18n";
import { errorText, openDirect } from "../store/actions";
import { useApp } from "../store/app";
import { openBot } from "../features/bots/botActions";
import { looksLikeBotName } from "../features/bots/botText";
import { api, IS_TAURI } from "./api";
import { useAppLock } from "./appLock";
import { useSetup } from "./setup";
import { USER_LINK_SERVER, userLinksAvailable, usernameOfLink } from "./userLinkParse";

let pending: string | null = null;
let asking = false;

function ready(): boolean {
  const s = useApp.getState().appState;
  if (!s || s.status !== "ready" || !s.account || !s.local_protected || s.pending_mnemonic?.length) return false;
  return !useAppLock.getState().locked && !useSetup.getState().pending.includes(s.account.account_id);
}

function warn(message: string) {
  notifications.show({ color: "red", message });
}

async function open(name: string) {
  const t = i18n.t.bind(i18n);
  const at = `@${name}`;
  if (!userLinksAvailable(useApp.getState().appState?.account?.server_url)) {
    warn(t("userLink.otherServer", { server: new URL(USER_LINK_SERVER).host }));
    return;
  }
  let found;
  try {
    found = await api.findAccount({ query: at });
  } catch (e) {
    warn(errorText(e));
    return;
  }
  if (!found) {
    // Not a person: perhaps a bot. Opening it starts nothing: the bot's page asks for "Start".
    const bot = looksLikeBotName(name) ? await api.botFind({ username: name }).catch(() => null) : null;
    if (bot) await openBot(bot.id);
    else warn(t("userLink.notFound", { name: at }));
    return;
  }
  if (found.is_me) {
    notifications.show({ message: t("userLink.self") });
    return;
  }
  const account = found;
  const who = !account.display_name || account.display_name === at ? at : `${account.display_name} (${at})`;
  await new Promise<void>((done) => {
    modals.openConfirmModal({
      title: t("userLink.openTitle"),
      children: <div className="hint" style={{ fontSize: 14 }}>{t("userLink.openBody", { name: who })}</div>,
      labels: { confirm: t("userLink.open"), cancel: t("common.cancel") },
      onClose: done,
      onConfirm: () => {
        void (async () => {
          try {
            // Not a contact yet: add it from the directory first (a no-op for a contact).
            const c = await api.addContactByQuery({ query: at });
            await openDirect(c.account_id);
          } catch (e) {
            warn(errorText(e));
          }
        })();
      },
    });
  });
}

async function drain() {
  if (!pending || asking || !ready()) return;
  const name = pending;
  pending = null;
  asking = true;
  try {
    await open(name);
  } finally {
    asking = false;
  }
}

/** A link the app was asked to open (also used by previews and tests). */
export function takeUserLink(link: string) {
  const name = usernameOfLink(link);
  if (!name) return;
  pending = name;
  void drain();
}

/** Listens for links opened while the app runs and takes the one that started it. */
export function startUserLinks(): () => void {
  const stops: (() => void)[] = [useApp.subscribe(() => void drain()), useAppLock.subscribe(() => void drain()), useSetup.subscribe(() => void drain())];
  if (IS_TAURI) {
    // Listening first: the shell sends links as events from the moment it is asked for the
    // one that started the app (src-tauri/src/links.rs).
    void listen<string>("user_link", (e) => takeUserLink(e.payload))
      .then((stop) => {
        stops.push(stop);
        return invoke<string | null>("take_launch_link");
      })
      .then((link) => link && takeUserLink(link))
      .catch(() => undefined);
  }
  return () => stops.forEach((s) => s());
}
