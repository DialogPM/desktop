// The signed self-update of the desktop app (src-tauri/src/updater.rs): what the last check
// found and how far an installation is. Only copies that can replace themselves have it (the
// Windows setup program, the AppImage, the macOS app outside the App Store); everywhere else
// `enabled` stays false and the app points at the download page instead.

import { create } from "zustand";
import { api, onEvent } from "./api";
import { downloadPercent } from "./updateProgress";

export interface AvailableUpdate {
  version: string;
  notes: string | null;
}

export interface UpdateStatus {
  enabled: boolean;
  available: AvailableUpdate | null;
}

interface UpdaterState extends UpdateStatus {
  /** An installation is running (download, signature check, install; then the app restarts). */
  installing: boolean;
  /** Download progress in percent; null while the size is unknown or before the first data. */
  percent: number | null;
}

export const useUpdater = create<UpdaterState>(() => ({
  enabled: false,
  available: null,
  installing: false,
  percent: null,
}));

let started = false;

/** Reads the state once and follows the events. Safe to call from several components. */
export function startUpdater(): void {
  if (started) return;
  started = true;
  void onEvent("update_available", (u) => useUpdater.setState({ enabled: true, available: u }));
  void onEvent("update_progress", (p) => useUpdater.setState({ percent: downloadPercent(p.downloaded, p.total) }));
  // The check at start may have finished before the window existed.
  void api.updateStatus().then(
    (s) => useUpdater.setState({ enabled: s.enabled, available: s.available ?? useUpdater.getState().available }),
    () => undefined,
  );
}

/** Looks for an update now; resolves with what was found. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const s = await api.checkUpdate();
  useUpdater.setState({ enabled: s.enabled, available: s.available });
  return s.available;
}

/** Downloads, verifies and installs the update; the app restarts when it succeeds. */
export async function installUpdate(): Promise<void> {
  if (useUpdater.getState().installing) return;
  useUpdater.setState({ installing: true, percent: null });
  try {
    await api.installUpdate();
  } finally {
    useUpdater.setState({ installing: false, percent: null });
  }
}
