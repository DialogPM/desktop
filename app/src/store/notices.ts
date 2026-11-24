// Notices from the operator of our server (signed; the core stores only those that pass the
// signature check). The state updates themselves are in lib/notices.ts.

import { create } from "zustand";
import { api } from "../lib/api";
import { allRead, EMPTY_NOTICES, fromList, withNotice, withoutNotice, withUnread, type NoticesState } from "../lib/notices";
import type { Notice } from "../lib/types";

interface Store extends NoticesState {
  /** The notices view is on screen (new ones are read as they arrive). */
  viewOpen: boolean;
}

export const useNotices = create<Store>()(() => ({ ...EMPTY_NOTICES, viewOpen: false }));

const state = (): NoticesState => {
  const { supported, notices, unread } = useNotices.getState();
  return { supported, notices, unread };
};

/** Loaded with the session. Any error (above all an older core without notices) means "none". */
export async function loadNotices() {
  try {
    useNotices.setState(fromList(await api.listNotices()));
  } catch (e) {
    console.info("notices unavailable", e);
    useNotices.setState({ ...EMPTY_NOTICES });
  }
}

export function resetNotices() {
  useNotices.setState({ ...EMPTY_NOTICES, viewOpen: false });
}

export function applyNotice(n: Notice) {
  useNotices.setState(withNotice(state(), n));
}

export function applyNoticesUnread(unread: number) {
  // A core that sends events knows notices, even if the first list failed (e.g. still offline).
  useNotices.setState({ ...withUnread(state(), unread), supported: true });
}

/** Opening the view reads everything; the core's answer (and notices_changed) confirms it. */
export function markNoticesRead() {
  if (state().unread === 0) return;
  useNotices.setState(allRead(state()));
  api
    .markNoticesRead()
    .then((r) => useNotices.setState(withUnread(state(), r?.unread ?? 0)))
    .catch((e) => console.warn("mark notices read", e));
}

/** Throws when the core refuses (the caller shows the error: the view only exists with a core that knows notices). */
export async function deleteNotice(id: number): Promise<void> {
  await api.deleteNotice({ id });
  useNotices.setState(withoutNotice(state(), id));
}

export function setNoticesViewOpen(viewOpen: boolean) {
  useNotices.setState({ viewOpen });
}
