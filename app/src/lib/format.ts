import type { TFunction } from "i18next";
import type { Conversation } from "./types";

export function formatAccountNumber(n: string): string {
  return n.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

export function formatBytes(bytes: number, locale: string): string {
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 });
  return `${nf.format(v)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const DAY = 86_400_000;

export function formatTime(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(ts);
}

export function formatDateTime(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(ts);
}

function daysAgo(ts: number): number {
  return Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
}

/** Chat list: time today, "Yesterday", weekday this week, date otherwise. */
export function formatListTime(ts: number, locale: string, t: TFunction): string {
  const d = daysAgo(ts);
  if (d <= 0) return formatTime(ts, locale);
  if (d === 1) return t("time.yesterday");
  if (d < 7) return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(ts);
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(ts);
}

/** Date separator in the message list. */
export function formatDaySeparator(ts: number, locale: string, t: TFunction): string {
  const d = daysAgo(ts);
  if (d <= 0) return t("time.today");
  if (d === 1) return t("time.yesterday");
  if (d < 7) return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(ts);
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
  }).format(ts);
}

export function formatLastSeen(ts: number, locale: string, t: TFunction): string {
  const d = daysAgo(ts);
  const time = formatTime(ts, locale);
  if (d <= 0) return t("presence.lastSeenToday", { time });
  if (d === 1) return t("presence.lastSeenYesterday", { time });
  return t("presence.lastSeenDate", {
    date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(ts),
    time,
  });
}

export function isMuted(c: Pick<Conversation, "muted_until">, now = Date.now()): boolean {
  if (c.muted_until === null) return false;
  if (c.muted_until === -1) return true;
  return c.muted_until > now;
}

/**
 * Avatar initials. Names that are only an account/phone number (possibly with a suffix
 * such as "(You)") show "#"; punctuation and symbols are skipped so a word like "(You)"
 * or "@name" never yields a bracket or an "@".
 */
export function initials(name: string): string {
  // Drop parenthesized suffixes like "(You)" and a leading "@" of usernames.
  const clean = name.replace(/\([^)]*\)/g, " ").replace(/^@/, "").trim();
  if (!clean) return name.trim() ? "#" : "?";
  if (/^[\d\s+\-.]+$/.test(clean)) return "#";
  const first = (w: string) => Array.from(w).find((ch) => /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(ch)) ?? "";
  const parts = clean.split(/\s+/).filter((w) => first(w));
  if (!parts.length) return "#";
  const a = first(parts[0]);
  const b = parts.length > 1 ? first(parts[parts.length - 1]) : "";
  return (a + b).toUpperCase();
}

export const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]])/gi;

export interface TextPart {
  text: string;
  href?: string;
}

export interface SafeLink {
  /** What is opened (normalized; the host in punycode). */
  href: string;
  /** What is shown: the link as typed, with a non-ASCII host replaced by its punycode form. */
  text: string;
  /** Non-ASCII host or a user name before the host ("https://bank.com@evil.example"). */
  suspicious: boolean;
}

/**
 * A link found in a message, made safe to show and open: only http(s). A host with non-ASCII
 * characters can imitate another domain with look-alike letters (Cyrillic "а" in "аpple.com"),
 * so it is shown in punycode (xn--…), the form the browser really connects to.
 */
export function safeLink(raw: string): SafeLink | null {
  const href = /^https?:\/\//i.test(raw) ? raw : /^www\./i.test(raw) ? `https://${raw}` : null;
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const authority = href.slice(href.indexOf("//") + 2).split(/[/?#\\]/)[0];
  const host = authority.slice(authority.lastIndexOf("@") + 1).replace(/:\d*$/, "");
  // eslint-disable-next-line no-control-regex
  const nonAscii = /[^\x00-\x7f]/.test(host);
  let text = raw;
  if (nonAscii) {
    const i = raw.indexOf(host);
    text = i >= 0 ? raw.slice(0, i) + url.hostname + raw.slice(i + host.length) : url.href;
  }
  return { href: url.href, text, suspicious: nonAscii || authority.includes("@") };
}

/** Splits text into plain parts and links. */
export function linkify(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx) });
    const raw = m[0];
    const link = safeLink(raw);
    out.push(link ? { text: link.text, href: link.href } : { text: raw });
    last = idx + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** True when the text is only 1-3 emoji (rendered big, like WhatsApp). */
export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 24) return false;
  const re = /^(?:\p{Extended_Pictographic}(?:️|‍|\p{Emoji_Modifier}|\p{Extended_Pictographic})*\s*){1,3}$/u;
  return re.test(t);
}

export function mapsUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

/** Simple password strength estimate: 0 (very weak) .. 4 (strong). */
export function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 3) score++;
  if (/^(.)\1+$/.test(pw) || /^(password|123456|qwerty|parola|letmein)[\d!.]*$/i.test(pw)) score = 0;
  if (pw.length < 8) score = Math.min(score, 1);
  return Math.min(4, score);
}

/** Lower-case file extension without the dot ("" if none). */
export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}
