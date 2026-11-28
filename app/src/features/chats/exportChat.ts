// The transcript of an exported conversation: readable text, one entry per message, with the
// date, the time, the sender and what the conversation shows for that message.
// The core writes it to the file the user chose and adds the media (engine/export.rs).

import type { TFunction } from "i18next";
import { BRAND_NAME } from "../../brand";
import { formatAccountNumber } from "../../lib/format";
import { kindLabel, previewText, systemText } from "../../lib/messageText";
import type { Attachment, Conversation, Message, MessageKind } from "../../lib/types";

/** An attachment that goes into the archive, under the name the transcript mentions. */
export interface ExportMediaItem {
  message_id: string;
  attachment_id: string;
  name: string;
}

export interface Transcript {
  text: string;
  media: ExportMediaItem[];
  /** Messages written (system notes included). */
  count: number;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** "2026-11-28 14:03" in local time: the same in every language, and it sorts. */
export function exportTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MIME_EXT: Record<string, string> = { jpeg: "jpg", quicktime: "mov", plain: "txt", mpeg: "mp3", "x-wav": "wav", "svg+xml": "svg" };

function extOfMime(mime: string): string {
  const sub = (mime.split("/")[1] ?? "").split(";")[0].trim().toLowerCase();
  if (MIME_EXT[sub]) return MIME_EXT[sub];
  return /^[a-z0-9]{2,5}$/.test(sub) ? sub : "bin";
}

/**
 * A file name every system accepts: no path, no reserved characters, not hidden, of a sane
 * length (the extension survives the cut).
 */
export function safeFileName(name: string, fallback = "file"): string {
  // eslint-disable-next-line no-control-regex
  let s = name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_").replace(/\s+/g, " ").trim().replace(/^\.+/, "").replace(/[. ]+$/, "");
  if (!s) s = fallback;
  if (s.length > 100) {
    const dot = s.lastIndexOf(".");
    const ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : "";
    s = s.slice(0, 100 - ext.length).trimEnd() + ext;
  }
  return s;
}

/** What an attachment is, for its label: photos, videos and voice notes by type, the rest are documents. */
function attachmentKind(m: Message, a: Attachment): MessageKind {
  if (a.mime.startsWith("image/")) return "image";
  if (a.mime.startsWith("video/")) return "video";
  if (a.mime.startsWith("audio/") && m.kind === "voice") return "voice";
  return "file";
}

/** Names chosen by other people carry invisible direction marks in the UI; a text file reads better without. */
const plain = (s: string) => s.replace(/[\u2066-\u2069]/g, "");

const oneLine = (s: string, max = 80) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** File name of the export, without extension: "Dialog - Ana Pop". */
export function exportBaseName(conv: Pick<Conversation, "title">): string {
  return safeFileName(`${BRAND_NAME} - ${conv.title}`, BRAND_NAME);
}

/**
 * Builds the transcript from the messages of a conversation, oldest first.
 * Only what the conversation shows is written: a deleted message is its "deleted" note,
 * view-once media is named but never included, expired messages are skipped.
 */
export function buildTranscript(
  conv: Conversation,
  messages: Message[],
  t: TFunction,
  opts: { withMedia: boolean; now?: number },
): Transcript {
  const now = opts.now ?? Date.now();
  const media: ExportMediaItem[] = [];
  const lines: string[] = [];
  let count = 0;

  for (const m of messages) {
    if (m.expires_at !== null && m.expires_at <= now) continue;
    const at = `[${exportTimestamp(m.sent_at)}]`;
    count++;
    if (m.kind === "system") {
      lines.push(`${at} ${plain((m.system && systemText(m.system, t)) || t("message.groupEvent"))}`);
      continue;
    }
    const sender = m.outgoing ? t("common.you") : m.sender_name || conv.title;
    if (m.deleted) {
      lines.push(`${at} ${sender}: ${t(m.outgoing ? "message.deletedByYou" : "message.deleted")}`);
      continue;
    }
    const parts: string[] = [];
    if (m.reply_to) {
      const q = m.reply_to;
      // The core names us "You" in quotes (as the conversation's QuoteBlock expects).
      const who = q.sender_name === "You" ? t("common.you") : q.sender_name;
      parts.push(`> ${who}: ${oneLine(q.text || kindLabel(q.kind, t))}`);
    }
    if (m.forwarded) parts.push(`(${t("message.forwarded")})`);
    for (const a of m.attachments) {
      const kind = attachmentKind(m, a);
      if (m.view_once) {
        parts.push(`[${previewText(kind, null, t, "view_once")}]`);
        continue;
      }
      if (a.download_state === "expired" || a.expired_at) {
        parts.push(`[${t(kind === "voice" ? "retention.voiceExpired" : "retention.mediaExpired")}]`);
        continue;
      }
      const label = kindLabel(kind, t);
      if (!opts.withMedia) {
        // Documents are known by their name; a photo's file name says nothing.
        parts.push(kind === "file" && a.file_name ? `[${label}: ${a.file_name}]` : `[${label}]`);
      } else if (a.local_path) {
        const name = `${pad(media.length + 1, 4)}-${safeFileName(a.file_name, `${kind}.${extOfMime(a.mime)}`)}`;
        media.push({ message_id: m.id, attachment_id: a.id, name });
        parts.push(`[${label}: ${name}]`);
      } else {
        const what = kind === "file" && a.file_name ? `${label}: ${a.file_name}` : label;
        parts.push(`[${what} (${t("chat.export.notIncluded")})]`);
      }
    }
    if (m.location) {
      const place = [m.location.name, m.location.address].filter(Boolean).join(", ");
      parts.push(`[${t("kinds.location")}: ${place ? `${place}, ` : ""}${m.location.lat}, ${m.location.lng}]`);
    }
    for (const c of m.contacts) parts.push(`[${t("kinds.contact")}: ${c.name}, ${formatAccountNumber(c.number)}]`);
    if (m.text) parts.push(m.edited_at ? `${m.text} (${t("message.edited")})` : m.text);
    lines.push(`${at} ${sender}: ${parts.join("\n")}`);
  }

  const header = [
    t("chat.export.header", { app: BRAND_NAME, name: conv.title }),
    t("chat.export.exportedOn", { date: exportTimestamp(now) }),
    t("chat.export.messageCount", { count }),
    "",
  ];
  return { text: `${[...header, ...lines].join("\n")}\n`, media, count };
}
