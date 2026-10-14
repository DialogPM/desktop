// Detects a native (Rust) side that is older than the web UI: e.g. a second instance started
// from an old build while the UI comes from the dev server. Commands added since then fail
// with "Command <name> not found"; tell the user once instead of failing silently.

import { notifications } from "@mantine/notifications";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";

// Not imported from ./api: backend.ts imports this module, and api.ts imports backend.ts.
const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let reported = false;

export function isMissingCommand(err: unknown): boolean {
  return /Command \S+ not found/i.test(String(err));
}

export function reportIfMissingCommand(err: unknown): void {
  if (reported || !isMissingCommand(err)) return;
  reported = true;
  console.error(`native app is older than the UI: ${String(err)}`);
  notifications.show({
    color: "red",
    autoClose: false,
    title: i18n.t("errors.staleBinaryTitle"),
    message: i18n.t("errors.staleBinary"),
  });
}

// Probe one of the newest commands at startup (an empty path is rejected by the command
// itself, so any other error means it exists).
if (IS_TAURI) {
  window.setTimeout(() => {
    invoke("read_media", { path: "" }).catch(reportIfMissingCommand);
  }, 1500);
}
