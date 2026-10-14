// Call privacy settings: "allow calls" and "calls only through the Dialog server" (relay-only,
// hides our IP address). They live in the core (crates/chat-core/src/engine/call_settings.rs)
// and are synced to our other devices; this store mirrors them for the call buttons and the
// call stores.

import { notifications } from "@mantine/notifications";
import { create } from "zustand";
import i18n from "../i18n";
import { api } from "./api";
import type { CallSettings } from "./types";

export const DEFAULT_CALL_SETTINGS: CallSettings = { allow_calls: true, relay_only: false };

export const useCallSettings = create<CallSettings>(() => ({ ...DEFAULT_CALL_SETTINGS }));

export function applyCallSettings(s: CallSettings) {
  useCallSettings.setState({ allow_calls: s.allow_calls, relay_only: s.relay_only });
}

export function callsAllowed(): boolean {
  return useCallSettings.getState().allow_calls;
}

/** Every call of ours goes through the TURN relay only. */
export function relayOnly(): boolean {
  return useCallSettings.getState().relay_only;
}

export async function setCallSettings(patch: Partial<CallSettings>) {
  applyCallSettings(await api.setCallSettings(patch));
}

export async function loadCallSettings() {
  try {
    applyCallSettings(await api.getCallSettings());
  } catch {
    /* older core: the defaults */
  }
}

/** Calls are turned off here: explains where to turn them on. True when the call must not start. */
export function blockedByCallSettings(): boolean {
  if (callsAllowed()) return false;
  notifications.show({ color: "orange", message: i18n.t("call.callsOffHint") });
  return true;
}

/** Keeps only relay candidates (relay-only calls; the core filters them again). */
export function relayCandidate(c: RTCIceCandidateInit): boolean {
  return / typ relay( |$)/.test(c.candidate ?? "");
}
