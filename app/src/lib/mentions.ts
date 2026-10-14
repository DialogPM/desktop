// @mention helpers for the composer: finding the "@query" being typed, and turning the
// members picked from the suggestions into ranges (UTF-16, "@" included) when sending.

import type { Mention } from "./types";

export interface MentionPick {
  accountId: string;
  name: string;
}

export const MAX_SUGGESTIONS = 8;

/** The "@query" right before the caret, if the user is typing one. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s)@([\p{L}\p{N}_.\- ]{0,30})$/u.exec(text.slice(0, caret));
  if (!m) return null;
  const query = m[2];
  // A space is allowed only inside a name being typed ("@Ana M"), never twice or at the start.
  if (query.startsWith(" ") || query.includes("  ")) return null;
  return { start: caret - query.length - 1, query };
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** Candidates whose name (or any word of it) starts with the query. */
export function filterCandidates<T extends { name: string }>(list: T[], query: string): T[] {
  const q = fold(query.trim());
  const hits = list.filter((c) => {
    const n = fold(c.name);
    return !q || n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q));
  });
  return hits.slice(0, MAX_SUGGESTIONS);
}

/**
 * The mention ranges for `text`: every "@Name" of a picked member that still stands as a
 * whole word. Longer names win where names overlap ("@Ana Maria" over "@Ana").
 */
export function collectMentions(text: string, picks: MentionPick[]): Mention[] {
  const out: Mention[] = [];
  const seen = new Set<string>();
  const sorted = [...picks].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    if (!p.name || seen.has(`${p.accountId}\u0000${p.name}`)) continue;
    seen.add(`${p.accountId}\u0000${p.name}`);
    const needle = `@${p.name}`;
    let from = 0;
    for (;;) {
      const i = text.indexOf(needle, from);
      if (i < 0) break;
      from = i + needle.length;
      const before = text[i - 1];
      const after = text[i + needle.length];
      if (before && /[\p{L}\p{N}_]/u.test(before)) continue;
      if (after && /[\p{L}\p{N}_]/u.test(after)) continue;
      const end = i + needle.length;
      if (out.some((m) => i < m.start + m.length && end > m.start)) continue;
      out.push({ account_id: p.accountId, start: i, length: needle.length });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The picks behind existing mentions (editing a message keeps its mentions). */
export function picksFromMentions(text: string, mentions: Mention[]): MentionPick[] {
  return mentions
    .map((m) => ({ accountId: m.account_id, name: text.slice(m.start + 1, m.start + m.length) }))
    .filter((p) => p.name.length > 0);
}

/** Wraps the selection (or the word at the caret) with a formatting marker. */
export function wrapSelection(text: string, start: number, end: number, mark: string): { text: string; start: number; end: number } {
  if (start === end) {
    const next = text.slice(0, start) + mark + mark + text.slice(end);
    return { text: next, start: start + mark.length, end: start + mark.length };
  }
  const sel = text.slice(start, end);
  // Toggle: unwrap when the selection is already wrapped.
  if (sel.length > 2 * mark.length && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(mark.length, sel.length - mark.length);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  if (text.slice(start - mark.length, start) === mark && text.slice(end, end + mark.length) === mark) {
    return {
      text: text.slice(0, start - mark.length) + sel + text.slice(end + mark.length),
      start: start - mark.length,
      end: end - mark.length,
    };
  }
  // Markers must touch the text: keep surrounding spaces outside.
  const lead = sel.length - sel.trimStart().length;
  const trail = sel.length - sel.trimEnd().length;
  const s = start + lead;
  const e = end - trail;
  const next = text.slice(0, s) + mark + text.slice(s, e) + mark + text.slice(e);
  return { text: next, start: s + mark.length, end: e + mark.length };
}
