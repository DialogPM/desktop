// Media retention: photos, videos, voice messages and files are deleted from every device after
// 1, 7, 14 or 30 days (30 is the default and the longest allowed). The period lives in the core
// (crates/chat-core/src/engine/retention.rs) and is synced to our other devices; this store
// mirrors it, with the last media check, for Settings → Privacy.

import { create } from "zustand";
import { api } from "./api";
import type { MediaCheck, MediaRetention } from "./types";

export const DEFAULT_MEDIA_RETENTION: MediaRetention = { days: 30, options: [1, 7, 14, 30], max_days: 30, last_check: null };

export const useMediaRetention = create<MediaRetention>(() => ({ ...DEFAULT_MEDIA_RETENTION }));

export function applyMediaRetention(r: MediaRetention) {
  useMediaRetention.setState({ ...r });
}

export function applyMediaCheck(c: MediaCheck) {
  useMediaRetention.setState({ last_check: c });
}

export async function setMediaRetention(days: number) {
  applyMediaRetention(await api.setMediaRetention({ days }));
}

export async function runMediaCheck() {
  applyMediaCheck(await api.runMediaCheck());
}

export async function loadMediaRetention() {
  try {
    applyMediaRetention(await api.getMediaRetention());
  } catch {
    /* older core: the defaults */
  }
}
