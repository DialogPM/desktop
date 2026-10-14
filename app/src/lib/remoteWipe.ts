// Remote wipe (crates/chat-core/src/revocation.rs): asks the server, for every account saved on
// this computer, whether this device was removed from it, and deletes those accounts' data,
// even while they are locked. Runs at startup, every few minutes and when the window comes back.
// The active account's UI goes to the start screen through the "logged_out" event; accounts
// removed from the start screen are reported here.

import { notifications } from "@mantine/notifications";
import { create } from "zustand";
import i18n from "../i18n";
import { api } from "./api";

const EVERY_MS = 10 * 60_000;
const MIN_GAP_MS = 60_000;

/** Bumped when saved accounts were wiped (the start screen reloads its list). */
export const useRemoteWipe = create<{ version: number }>(() => ({ version: 0 }));

let last = 0;
let running = false;

async function check() {
  if (running || Date.now() - last < MIN_GAP_MS) return;
  running = true;
  last = Date.now();
  try {
    const { wiped } = await api.checkRevoked();
    if (wiped.length > 0) {
      useRemoteWipe.setState((s) => ({ version: s.version + 1 }));
      notifications.show({ color: "orange", autoClose: false, message: i18n.t("profiles.remoteWiped", { count: wiped.length }) });
    }
  } catch (e) {
    console.debug("remote wipe check", e);
  } finally {
    running = false;
  }
}

export function startRemoteWipeWatcher(): () => void {
  void check();
  const timer = window.setInterval(() => void check(), EVERY_MS);
  const onFocus = () => void check();
  window.addEventListener("focus", onFocus);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", onFocus);
  };
}
