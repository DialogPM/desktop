// Notices from the server operator: the pure state updates, kept apart from the store
// (store/notices.ts) so they can be unit tested without the core or a DOM.

import type { Notice, NoticeList } from "./types";

export interface NoticesState {
  /**
   * The core knows notices. False until the first list arrives, and for good when the core is
   * older than this feature: the UI then shows no entry point at all instead of an error.
   */
  supported: boolean;
  /** Newest first. */
  notices: Notice[];
  /** As counted by the core (the list here may be stale for a moment). */
  unread: number;
}

export const EMPTY_NOTICES: NoticesState = { supported: false, notices: [], unread: 0 };

const newestFirst = (a: Notice, b: Notice) => b.created_at - a.created_at || b.id - a.id;

const cleanCount = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** The answer of list_notices. */
export function fromList(list: NoticeList): NoticesState {
  return { supported: true, notices: [...(list.notices ?? [])].sort(newestFirst), unread: cleanCount(list.unread) };
}

/**
 * A `notice` event. The same notice can come again (another device synced it, or a list
 * arrived in between): it replaces the stored copy and is counted once.
 */
export function withNotice(s: NoticesState, n: Notice): NoticesState {
  const old = s.notices.find((x) => x.id === n.id);
  const notices = [n, ...s.notices.filter((x) => x.id !== n.id)].sort(newestFirst);
  let unread = s.unread;
  if (!old && !n.read) unread += 1;
  else if (old && !old.read && n.read) unread = Math.max(0, unread - 1);
  else if (old && old.read && !n.read) unread += 1;
  return { supported: true, notices, unread };
}

/** A `notices_changed` event (or the answer of mark_notices_read). */
export function withUnread(s: NoticesState, unread: number): NoticesState {
  const n = cleanCount(unread);
  // Zero means everything was read (here or on another device): the list follows.
  const notices = n === 0 && s.notices.some((x) => !x.read) ? s.notices.map((x) => (x.read ? x : { ...x, read: true })) : s.notices;
  return { ...s, notices, unread: n };
}

/** Everything read, applied at once when the notices are opened (the core confirms later). */
export function allRead(s: NoticesState): NoticesState {
  return withUnread(s, 0);
}

/** A notice deleted on this device. */
export function withoutNotice(s: NoticesState, id: number): NoticesState {
  const old = s.notices.find((x) => x.id === id);
  if (!old) return s;
  return { ...s, notices: s.notices.filter((x) => x.id !== id), unread: old.read ? s.unread : Math.max(0, s.unread - 1) };
}
