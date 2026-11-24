import { describe, expect, it } from "vitest";
import { allRead, EMPTY_NOTICES, fromList, withNotice, withoutNotice, withUnread } from "./notices";
import type { Notice } from "./types";

const notice = (id: number, read = false, created_at = id * 1000): Notice => ({
  id,
  title: `Notice ${id}`,
  body: "Line 1\nLine 2",
  created_at,
  received_at: created_at,
  read,
});

describe("notices", () => {
  it("starts unsupported and empty: an older core shows nothing", () => {
    expect(EMPTY_NOTICES).toEqual({ supported: false, notices: [], unread: 0 });
  });

  it("takes the list newest first and the core's unread count", () => {
    const s = fromList({ notices: [notice(1, true), notice(3), notice(2)], unread: 2 });
    expect(s.supported).toBe(true);
    expect(s.notices.map((n) => n.id)).toEqual([3, 2, 1]);
    expect(s.unread).toBe(2);
    // Garbage counts are not shown as a badge.
    expect(fromList({ notices: [], unread: -4 }).unread).toBe(0);
    expect(fromList({ notices: [], unread: Number.NaN }).unread).toBe(0);
  });

  it("counts a new notice once, even when it arrives twice", () => {
    let s = fromList({ notices: [notice(1, true)], unread: 0 });
    s = withNotice(s, notice(2));
    expect(s.unread).toBe(1);
    expect(s.notices.map((n) => n.id)).toEqual([2, 1]);
    s = withNotice(s, notice(2));
    expect(s.unread).toBe(1);
    expect(s.notices).toHaveLength(2);
    // The same notice, now read on another device.
    s = withNotice(s, notice(2, true));
    expect(s.unread).toBe(0);
    // A notice that arrives already read does not count.
    s = withNotice(s, notice(5, true));
    expect(s.unread).toBe(0);
    expect(s.notices[0].id).toBe(5);
  });

  it("follows notices_changed; zero marks the list read", () => {
    let s = fromList({ notices: [notice(2), notice(1)], unread: 2 });
    s = withUnread(s, 1);
    expect(s.unread).toBe(1);
    expect(s.notices.every((n) => !n.read)).toBe(true);
    s = withUnread(s, 0);
    expect(s.unread).toBe(0);
    expect(s.notices.every((n) => n.read)).toBe(true);
  });

  it("opening the view reads everything", () => {
    const s = allRead(fromList({ notices: [notice(2), notice(1)], unread: 2 }));
    expect(s.unread).toBe(0);
    expect(s.notices.every((n) => n.read)).toBe(true);
  });

  it("deleting an unread notice lowers the count, a read one does not", () => {
    let s = fromList({ notices: [notice(3), notice(2, true), notice(1)], unread: 2 });
    s = withoutNotice(s, 2);
    expect(s.unread).toBe(2);
    s = withoutNotice(s, 3);
    expect(s.unread).toBe(1);
    expect(s.notices.map((n) => n.id)).toEqual([1]);
    // Unknown ids change nothing.
    expect(withoutNotice(s, 42)).toBe(s);
  });
});
