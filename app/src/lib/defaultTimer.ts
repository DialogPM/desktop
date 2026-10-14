// Default disappearing timer: chats the user starts and groups they create get it from the start
// (existing chats and chats started by others keep their own). The setting lives in the core
// (crates/chat-core/src/engine/default_timer.rs) and is synced to our other devices; this store
// mirrors it for Settings → Privacy and the new group screen.

import { create } from "zustand";
import { api } from "./api";
import { DISAPPEARING_OPTIONS } from "./messageText";
import type { DefaultDisappearing } from "./types";

export const DEFAULT_DISAPPEARING: DefaultDisappearing = { seconds: 0, options: DISAPPEARING_OPTIONS.map(([s]) => s) };

export const useDefaultTimer = create<DefaultDisappearing>(() => ({ ...DEFAULT_DISAPPEARING }));

export function applyDefaultTimer(d: DefaultDisappearing) {
  useDefaultTimer.setState({ ...d });
}

export async function setDefaultTimer(seconds: number) {
  applyDefaultTimer(await api.setDefaultDisappearing({ seconds }));
}

export async function loadDefaultTimer() {
  try {
    applyDefaultTimer(await api.getDefaultDisappearing());
  } catch {
    /* older core: off */
  }
}
