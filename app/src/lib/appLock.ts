// Optional app lock: a client-side setting (per account, kept in localStorage) that asks for the
// account password when the app starts and, if the user chose so, again after the app was in
// the background for a while (default: only at start, never while it keeps running).

import { create } from "zustand";

const KEY = "chatapp-app-lock:";
const RELOCK_KEY = "chatapp-app-lock-relock-ms";
/** Choices for "lock again after the app was in the background"; 0 = only when the app starts. */
export const RELOCK_CHOICES_MS = [0, 60_000, 5 * 60_000, 60 * 60_000] as const;

/** Background time after which the app locks again; 0 = never while it runs (only at start). */
export function relockAfterMs(): number {
  try {
    const v = Number(localStorage.getItem(RELOCK_KEY) ?? 0);
    return (RELOCK_CHOICES_MS as readonly number[]).includes(v) ? v : 0;
  } catch {
    return 0;
  }
}

export function setRelockAfterMs(ms: number) {
  try {
    if (ms > 0) localStorage.setItem(RELOCK_KEY, String(ms));
    else localStorage.removeItem(RELOCK_KEY);
  } catch {
    /* ignore */
  }
  useAppLock.setState({ relockMs: ms });
}

export function isLockEnabled(accountId: string | null | undefined): boolean {
  if (!accountId) return false;
  try {
    return localStorage.getItem(KEY + accountId) === "1";
  } catch {
    return false;
  }
}

export function setLockEnabled(accountId: string, enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(KEY + accountId, "1");
    else localStorage.removeItem(KEY + accountId);
  } catch {
    /* ignore */
  }
  useAppLock.setState({ enabled, locked: false });
}

interface AppLockState {
  /** Lock enabled for the signed-in account. */
  enabled: boolean;
  /** Lock screen currently shown. */
  locked: boolean;
  /** Relock after this much background time; 0 = only at app start. */
  relockMs: number;
}

export const useAppLock = create<AppLockState>()(() => ({ enabled: false, locked: false, relockMs: relockAfterMs() }));

/** Called when a session starts. `atStartup` locks right away (app launch with a saved session). */
export function initAppLock(accountId: string | null | undefined, atStartup: boolean) {
  const enabled = isLockEnabled(accountId);
  useAppLock.setState({ enabled, locked: enabled && atStartup });
}

export function unlockApp() {
  useAppLock.setState({ locked: false });
}

/** Locks again when the app comes back after being hidden for longer than the chosen relock time
 *  (never with the default "only when the app starts"). */
export function startAppLockWatcher(): () => void {
  let hiddenAt: number | null = null;
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    const { enabled, relockMs } = useAppLock.getState();
    if (hiddenAt !== null && enabled && relockMs > 0 && Date.now() - hiddenAt > relockMs) {
      useAppLock.setState({ locked: true });
    }
    hiddenAt = null;
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => document.removeEventListener("visibilitychange", onVisibility);
}
