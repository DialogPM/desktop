// First-run setup after creating an account (features/onboarding/SetupScreen.tsx): display
// name, username, appearance. Pending per account in this browser profile, so an app restart in
// the middle of it brings it back; finished or skipped, it never shows again.

import { create } from "zustand";

const KEY = "chatapp-setup-pending";

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function save(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export const useSetup = create<{ pending: string[] }>(() => ({ pending: load() }));

export function markSetupPending(accountId: string) {
  const pending = [...new Set([...useSetup.getState().pending, accountId])];
  save(pending);
  useSetup.setState({ pending });
}

export function finishSetup(accountId: string) {
  const pending = useSetup.getState().pending.filter((id) => id !== accountId);
  save(pending);
  useSetup.setState({ pending });
}
