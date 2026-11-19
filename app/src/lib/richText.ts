// Message text rendering model: WhatsApp-style formatting (*bold*, _italic_, ~strike~,
// `code`, ```code block```), @mentions (ranges from the message) and links, plus Markdown
// (parseBlocks: headings, lists, quotes, tables, fenced code with a language, **bold**,
// [label](url)). Formatting is display-only: the text travels as typed, and no HTML in a message
// is ever interpreted. Mobile has the WhatsApp-style rules (mobile/lib/util/rich_text.dart).

import { safeLink, URL_RE } from "./format";
import type { Mention } from "./types";

export type Seg =
  | { t: "text"; text: string }
  | { t: "link"; text: string; href: string; suspicious?: boolean }
  | { t: "mention"; text: string; accountId: string }
  | { t: "code"; text: string }
  | { t: "pre"; text: string }
  | { t: "bold" | "italic" | "strike"; children: Seg[] };

// Mentions and links are replaced by private-use characters before parsing, so formatting
// markers inside them (e.g. "_" in a URL) are left alone.
const PH = 0xe000;
const INVITE_RE = /chatapp:\/\/join\/[A-Za-z0-9_-]{22}(?![A-Za-z0-9_-])/g;
const MAX_TOKENS = 6000;

type Token = { seg: Seg; raw: string };

const MARKS: Record<string, "bold" | "italic" | "strike"> = { "*": "bold", _: "italic", "~": "strike" };

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
const isSpace = (c: string | undefined) => !!c && /\s/.test(c);

function protect(text: string, mentions: Mention[]): { s: string; tokens: Token[] } {
  const ranges: { start: number; end: number; seg: Seg }[] = [];
  for (const m of [...mentions].sort((a, b) => a.start - b.start)) {
    const end = m.start + m.length;
    if (m.length <= 0 || end > text.length || ranges.some((r) => r.end > m.start)) continue;
    const raw = text.slice(m.start, end);
    ranges.push({ start: m.start, end, seg: { t: "mention", text: raw, accountId: m.account_id } });
  }
  // Group invite links (chatapp://join/...) open the join dialog.
  for (const m of text.matchAll(INVITE_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (ranges.some((r) => start < r.end && end > r.start)) continue;
    ranges.push({ start, end, seg: { t: "link", text: m[0], href: m[0] } });
  }
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (ranges.some((r) => start < r.end && end > r.start)) continue;
    // Only http(s); look-alike (non-ASCII) hosts are shown in punycode (see safeLink).
    const link = safeLink(m[0]);
    if (!link) continue;
    ranges.push({ start, end, seg: { t: "link", text: link.text, href: link.href, suspicious: link.suspicious } });
  }
  ranges.sort((a, b) => a.start - b.start);
  const tokens: Token[] = [];
  let s = "";
  let last = 0;
  for (const r of ranges.slice(0, MAX_TOKENS)) {
    s += text.slice(last, r.start) + String.fromCharCode(PH + tokens.length);
    tokens.push({ seg: r.seg, raw: text.slice(r.start, r.end) });
    last = r.end;
  }
  return { s: s + text.slice(last), tokens };
}

/** Restores the original characters of protected tokens (inside code). */
function restore(s: string, tokens: Token[]): string {
  return s.replace(/[-]/g, (c) => tokens[c.charCodeAt(0) - PH]?.raw ?? c);
}

function leaves(s: string, tokens: Token[]): Seg[] {
  const out: Seg[] = [];
  let buf = "";
  for (const c of s) {
    const tok = tokens[c.charCodeAt(0) - PH];
    if (c.charCodeAt(0) >= PH && tok) {
      if (buf) out.push({ t: "text", text: buf });
      buf = "";
      out.push(tok.seg);
    } else {
      buf += c;
    }
  }
  if (buf) out.push({ t: "text", text: buf });
  return out;
}

/** Host of a link, lower case ("" if none). */
function hostOf(href: string): string {
  try {
    return new URL(href).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// [label](url) and ![alt](url): the url is a protected link token. Images never load (an
// image from a URL would tell its server who reads the message): they become links.
const MD_LINK_RE = /(!?)\[([^\]\n]{1,300})\]\(\s*([\ue000-\uf8ff])\s*\)/;

/** A Markdown link whose label names another domain than the target is marked suspicious. */
function markdownLink(label: string, tok: Token | undefined, image: boolean): Seg | null {
  if (!tok || tok.seg.t !== "link" || tok.seg.href.startsWith("chatapp://")) return null;
  const href = tok.seg.href;
  const named = /(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})/i.exec(label)?.[1]?.toLowerCase();
  const host = hostOf(href);
  const mismatch = !!named && !!host && named !== host && !host.endsWith(`.${named}`);
  return { t: "link", text: image ? `🖼 ${label}` : label, href, suspicious: tok.seg.suspicious || mismatch };
}

// Bounds on the work one piece of text may cost, whoever wrote it: a message is parsed on
// every render of its bubble, of the chat list and of search results, and a crash here would
// take the whole UI down on every start as long as the message is the last one.
/// Formatted spans per piece; the rest of the piece is shown as plain text.
const MAX_SPANS = 500;
/// How far past an opening marker its closing marker is looked for.
const MAX_SPAN_LEN = 1000;

/** The first formatted span of `s`: the plain text before it, the span, and the rest. */
function firstSpan(s: string, tokens: Token[], depth: number): { before: string; seg: Seg; after: string } | null {
  for (let i = 0; i < s.length; i++) {
    // Markdown **bold** (and __bold__).
    if ((s[i] === "*" || s[i] === "_") && s[i + 1] === s[i] && !isWordChar(s[i - 1]) && s[i + 2] && !isSpace(s[i + 2])) {
      const limit = Math.min(s.length - 1, i + 3 + MAX_SPAN_LEN);
      let close = -1;
      for (let j = i + 3; j < limit; j++) {
        if (s[j] === "\n") break;
        if (s[j] === s[i] && s[j + 1] === s[i]) {
          close = j;
          break;
        }
      }
      if (close > i + 2 && !isSpace(s[close - 1])) {
        return {
          before: s.slice(0, i),
          seg: { t: "bold", children: inline(s.slice(i + 2, close), tokens, depth + 1) },
          after: s.slice(close + 2),
        };
      }
    }
    const kind = MARKS[s[i]];
    if (!kind) continue;
    // Opening marker: at the start or after a non-word character, followed by a non-space.
    if (isWordChar(s[i - 1]) || isSpace(s[i + 1]) || i + 1 >= s.length || s[i + 1] === s[i]) continue;
    const limit = Math.min(s.length, i + 2 + MAX_SPAN_LEN);
    for (let j = i + 2; j < limit; j++) {
      if (s[j] === "\n") break;
      // Closing marker: after a non-space, followed by the end or a non-word character.
      if (s[j] === s[i] && !isSpace(s[j - 1]) && !isWordChar(s[j + 1])) {
        return {
          before: s.slice(0, i),
          seg: { t: kind, children: inline(s.slice(i + 1, j), tokens, depth + 1) },
          after: s.slice(j + 1),
        };
      }
    }
  }
  return null;
}

/**
 * Inline formatting of one piece without code spans. Iterative over the piece (a message
 * with thousands of spans must not grow the stack); nesting is bounded by `depth`.
 */
function inline(s: string, tokens: Token[], depth: number): Seg[] {
  const out: Seg[] = [];
  let rest = s;
  let spans = 0;
  while (rest) {
    if (depth > 4 || spans >= MAX_SPANS) {
      out.push(...leaves(rest, tokens));
      break;
    }
    spans++;
    const md = MD_LINK_RE.exec(rest);
    if (md) {
      const link = markdownLink(restore(md[2], tokens), tokens[md[3].charCodeAt(0) - PH], md[1] === "!");
      if (link) {
        // The text before the first link holds no link: this call only formats marks.
        out.push(...inline(rest.slice(0, md.index), tokens, depth), link);
        rest = rest.slice(md.index + md[0].length);
        continue;
      }
    }
    const span = firstSpan(rest, tokens, depth);
    if (!span) {
      out.push(...leaves(rest, tokens));
      break;
    }
    out.push(...leaves(span.before, tokens), span.seg);
    rest = span.after;
  }
  return out;
}

/** Parses a message text into display segments. */
export function parseRich(text: string, mentions: Mention[] = []): Seg[] {
  return guarded(text, () => {
    const { s, tokens } = protect(text, mentions);
    return richProtected(s, tokens);
  }, (t) => [{ t: "text", text: t }]);
}

/**
 * Runs a parser; whatever it throws, the message is shown as plain text instead of taking
 * the whole UI down (the chat list parses the last message of every conversation on each
 * render, so an exception there would repeat at every start).
 */
function guarded<T>(text: string, parse: () => T, fallback: (text: string) => T): T {
  try {
    return parse();
  } catch (e) {
    console.warn("message formatting failed; showing the text unformatted", (e as Error)?.name);
    return fallback(text);
  }
}

/** Code spans and blocks, then inline formatting, of an already protected text. */
function richProtected(s: string, tokens: Token[]): Seg[] {
  const out: Seg[] = [];
  // Code first: ```blocks``` (may span lines), then `inline`.
  const re = /```([\s\S]+?)```|`([^`\n]+)`/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    const idx = m.index ?? 0;
    out.push(...inline(s.slice(last, idx), tokens, 0));
    if (m[1] !== undefined) out.push({ t: "pre", text: restore(m[1].replace(/^\n|\n$/g, ""), tokens) });
    else out.push({ t: "code", text: restore(m[2], tokens) });
    last = idx + m[0].length;
  }
  out.push(...inline(s.slice(last), tokens, 0));
  return out;
}

/** Text without formatting markers (previews, notifications, copying). */
export function plainText(text: string, mentions: Mention[] = []): string {
  const flat = (segs: Seg[]): string =>
    segs.map((g) => ("children" in g ? flat(g.children) : g.text)).join("");
  return guarded(text, () => flat(parseRich(text, mentions)), (t) => t);
}

// ---------------------------------------------------------------------------------------
// Markdown blocks

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { t: "para"; segs: Seg[] }
  | { t: "heading"; level: number; segs: Seg[] }
  | { t: "code"; lang: string; text: string }
  | { t: "list"; ordered: boolean; start: number; items: Seg[][] }
  | { t: "quote"; segs: Seg[] }
  | { t: "table"; align: Align[]; head: Seg[][]; rows: Seg[][][] }
  | { t: "hr" };

const FENCE_RE = /^\s{0,3}```\s*([\w+#.-]*)\s*$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const UL_RE = /^\s{0,3}[-*+]\s+(.*)$/;
const OL_RE = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const MAX_TABLE_COLS = 20;

function cells(line: string): string[] {
  let l = line.trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|")) l = l.slice(0, -1);
  return l.split("|").map((c) => c.trim()).slice(0, MAX_TABLE_COLS);
}

/**
 * Parses a message as Markdown blocks (inline formatting, mentions and links as in
 * parseRich). A message without Markdown gives one paragraph, rendered as before.
 */
export function parseBlocks(text: string, mentions: Mention[] = []): Block[] {
  return guarded(text, () => parseBlocksUnguarded(text, mentions), (t) => [{ t: "para", segs: [{ t: "text", text: t }] }]);
}

function parseBlocksUnguarded(text: string, mentions: Mention[]): Block[] {
  const { s, tokens } = protect(text, mentions);
  const lines = s.split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "para", segs: richProtected(para.join("\n"), tokens) });
    para = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = FENCE_RE.exec(line);
    if (fence) {
      // Fenced code block; an unclosed one runs to the end of the message.
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s{0,3}```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ t: "code", lang: fence[1].toLowerCase(), text: restore(body.join("\n"), tokens) });
      continue;
    }
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      blocks.push({ t: "heading", level: heading[1].length, segs: richProtected(heading[2], tokens) });
      i++;
      continue;
    }
    if (HR_RE.test(line)) {
      flush();
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const align: Align[] = cells(lines[i + 1]).map((c) =>
        c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null,
      );
      i += 2;
      const rows: Seg[][][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(cells(lines[i++]).map((c) => richProtected(c, tokens)));
      }
      blocks.push({ t: "table", align, head: head.map((c) => richProtected(c, tokens)), rows });
      continue;
    }
    if (QUOTE_RE.test(line)) {
      flush();
      const body: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) body.push(QUOTE_RE.exec(lines[i++])![1]);
      blocks.push({ t: "quote", segs: richProtected(body.join("\n"), tokens) });
      continue;
    }
    const ul = UL_RE.exec(line);
    const ol = OL_RE.exec(line);
    if (ul || ol) {
      flush();
      const ordered = !ul;
      const re = ordered ? OL_RE : UL_RE;
      const items: string[] = [];
      const start = ordered ? Number(ol![1]) : 1;
      while (i < lines.length) {
        const m = re.exec(lines[i]);
        if (m) items.push(ordered ? m[2] : m[1]);
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1] += "\n" + lines[i].trim();
        else break;
        i++;
      }
      blocks.push({ t: "list", ordered, start, items: items.map((it) => richProtected(it, tokens)) });
      continue;
    }
    para.push(line);
    i++;
  }
  flush();
  return blocks;
}
