// "Block screenshots" privacy option: always on; the user can only pause it, for PAUSE_MS, after
// which the window is protected again on its own (also after a restart: the end of the pause is
// kept in localStorage). Applied to the window at startup and whenever it changes (platform.ts).

import { create } from "zustand";
import { setWindowContentProtected } from "./platform";

const KEY = "chatapp-content-protected-paused-until";
/** Key of the old on/off switch, removed: protection is no longer something to turn off for good. */
const LEGACY_KEY = "chatapp-content-protected";
export const PAUSE_MS = 60 * 60_000;

function loadPausedUntil(): number {
  try {
    localStorage.removeItem(LEGACY_KEY);
    const until = Number(localStorage.getItem(KEY) ?? 0);
    return Number.isFinite(until) && until > Date.now() ? until : 0;
  } catch {
    return 0;
  }
}

interface ScreenProtectionStore {
  /** Protection is on, i.e. not paused. */
  enabled: boolean;
  /** When the pause ends (ms since epoch), 0 when protected. */
  pausedUntil: number;
  /** Pauses the protection for PAUSE_MS. */
  pause: () => void;
  /** Ends a pause early. */
  resume: () => void;
}

let timer = 0;

export const useScreenProtection = create<ScreenProtectionStore>()((set) => {
  const apply = (pausedUntil: number) => {
    try {
      if (pausedUntil) localStorage.setItem(KEY, String(pausedUntil));
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    window.clearTimeout(timer);
    if (pausedUntil) timer = window.setTimeout(() => apply(0), pausedUntil - Date.now());
    set({ pausedUntil, enabled: !pausedUntil });
  };
  const initial = loadPausedUntil();
  if (initial && typeof window !== "undefined") timer = window.setTimeout(() => apply(0), initial - Date.now());
  return {
    enabled: !initial,
    pausedUntil: initial,
    pause: () => apply(Date.now() + PAUSE_MS),
    resume: () => apply(0),
  };
});

if (typeof window !== "undefined") {
  if (useScreenProtection.getState().enabled) void setWindowContentProtected(true);
  useScreenProtection.subscribe((s, prev) => {
    if (s.enabled !== prev.enabled) void setWindowContentProtected(s.enabled);
  });
}
