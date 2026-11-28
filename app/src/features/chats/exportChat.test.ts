import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import type { Attachment, Conversation, Message } from "../../lib/types";
import { buildTranscript, exportBaseName, exportTimestamp, safeFileName } from "./exportChat";

/** The English texts, with {{placeholders}} filled in (what i18next does in the app). */
const t = ((key: string, vars: Record<string, unknown> = {}) => {
  const text = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en);
  if (typeof text !== "string") throw new Error(`missing text: ${key}`);
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k]));
}) as unknown as TFunction;

const at = (hour: number, minute: number) => new Date(2026, 10, 27, hour, minute).getTime();
const NOW = new Date(2026, 10, 28, 9, 30).getTime();

const conv = (over: Partial<Conversation> = {}): Conversation =>
  ({ id: "c1", kind: "direct", title: "Ana Pop", peer_account_id: "ana", bot: null, ...over }) as Conversation;

let seq = 0;
const msg = (over: Partial<Message>): Message => ({
  id: `m${++seq}`,
  conversation_id: "c1",
  sender_account_id: "ana",
  sender_name: "Ana Pop",
  outgoing: false,
  kind: "text",
  text: null,
  attachments: [],
  location: null,
  contacts: [],
  reply_to: null,
  reactions: [],
  status: "read",
  sent_at: at(14, 3),
  received_at: at(14, 3),
  edited_at: null,
  deleted: false,
  forwarded: false,
  expires_at: null,
  system: null,
  mentions: [],
  mentions_me: false,
  pinned_until: null,
  starred: false,
  view_once: null,
  ...over,
});

const file = (over: Partial<Attachment>): Attachment => ({
  id: `a${++seq}`,
  mime: "image/jpeg",
  file_name: "IMG_0001.jpg",
  size: 1000,
  width: null,
  height: null,
  duration_ms: null,
  waveform: null,
  thumbnail: null,
  local_path: "/media/x.jpg",
  download_state: "done",
  progress: null,
  ...over,
});

const body = (text: string) => text.split("\n").slice(4).join("\n");

describe("chat export", () => {
  it("writes a header and one dated line per message, oldest first", () => {
    const r = buildTranscript(
      conv(),
      [
        msg({ text: "Salut! Ce faci?" }),
        msg({ outgoing: true, sender_name: "Me", text: "Bine.\nTu?", sent_at: at(14, 5), edited_at: at(14, 6) }),
      ],
      t,
      { withMedia: false, now: NOW },
    );
    expect(r.text).toBe(
      [
        "Dialog · chat export: Ana Pop",
        "Exported on 2026-11-28 09:30",
        "Messages: 2",
        "",
        "[2026-11-27 14:03] Ana Pop: Salut! Ce faci?",
        "[2026-11-27 14:05] You: Bine.",
        "Tu? (edited)",
        "",
      ].join("\n"),
    );
    expect(r.count).toBe(2);
    expect(r.media).toEqual([]);
  });

  it("names the sender of each message in a group, and words the group's events", () => {
    const r = buildTranscript(
      conv({ kind: "group", title: "Echipa", peer_account_id: null }),
      [
        msg({ kind: "system", sender_name: "", system: { type: "group_created", actor_name: "Ana Pop", target_names: [], value: "Echipa" } }),
        msg({ sender_name: "Bogdan", text: "Bună", sent_at: at(14, 4) }),
        msg({ sender_name: "Ana Pop", text: "Bună, Bogdan", sent_at: at(14, 5), reply_to: { id: "x", sender_name: "Bogdan", kind: "text", text: "Bună", thumbnail: null } }),
        msg({ sender_name: "Bogdan", sent_at: at(14, 6), text: "ok", reply_to: { id: "y", sender_name: "You", kind: "image", text: null, thumbnail: null } }),
      ],
      t,
      { withMedia: false, now: NOW },
    );
    expect(body(r.text)).toBe(
      [
        `[2026-11-27 14:03] ${t("system.groupCreated", { actor: "Ana Pop", name: "Echipa" })}`,
        "[2026-11-27 14:04] Bogdan: Bună",
        "[2026-11-27 14:05] Ana Pop: > Bogdan: Bună",
        "Bună, Bogdan",
        "[2026-11-27 14:06] Bogdan: > You: Photo",
        "ok",
        "",
      ].join("\n"),
    );
    // No invisible direction marks around names in a plain text file.
    expect(r.text).not.toMatch(/[\u2066-\u2069]/);
  });

  it("exports a chat with a bot like any other", () => {
    const r = buildTranscript(
      conv({ title: "Weather", bot: { id: "b1" } as Conversation["bot"] }),
      [
        msg({ kind: "system", sender_name: "", system: { type: "bot_started", actor_name: null, target_names: [], value: null } }),
        msg({ sender_name: "Weather", text: "Rain at 5 pm", buttons: [[{ text: "More", data: "more" }]] }),
        msg({ outgoing: true, text: "/status" }),
        // A message whose sender has no name of its own takes the chat's.
        msg({ sender_name: "", text: "Sunny" }),
      ],
      t,
      { withMedia: false, now: NOW },
    );
    expect(body(r.text)).toBe(
      [
        `[2026-11-27 14:03] ${t("system.botStarted")}`,
        "[2026-11-27 14:03] Weather: Rain at 5 pm",
        "[2026-11-27 14:03] You: /status",
        "[2026-11-27 14:03] Weather: Sunny",
        "",
      ].join("\n"),
    );
  });

  it("text only: media is named, never listed for the archive", () => {
    const r = buildTranscript(
      conv(),
      [
        msg({ kind: "image", text: "la mare", attachments: [file({})] }),
        msg({ kind: "file", attachments: [file({ mime: "application/pdf", file_name: "contract.pdf" })] }),
        msg({ kind: "voice", attachments: [file({ mime: "audio/webm", file_name: "voice.webm" })] }),
      ],
      t,
      { withMedia: false, now: NOW },
    );
    expect(body(r.text)).toBe(
      ["[2026-11-27 14:03] Ana Pop: [Photo]", "la mare", "[2026-11-27 14:03] Ana Pop: [Document: contract.pdf]", "[2026-11-27 14:03] Ana Pop: [Voice message]", ""].join("\n"),
    );
    expect(r.media).toEqual([]);
  });

  it("with media: downloaded files get numbered names the transcript points to", () => {
    const photo = file({ file_name: "../../etc/passwd" });
    const doc = file({ mime: "application/pdf", file_name: "contract.pdf" });
    const unnamed = file({ mime: "video/quicktime", file_name: "" });
    const missing = file({ mime: "application/zip", file_name: "big.zip", local_path: null, download_state: "pending" });
    const m1 = msg({ kind: "image", attachments: [photo, doc] });
    const m2 = msg({ kind: "video", attachments: [unnamed, missing] });
    const r = buildTranscript(conv(), [m1, m2], t, { withMedia: true, now: NOW });
    expect(r.media).toEqual([
      { message_id: m1.id, attachment_id: photo.id, name: "0001-_.._etc_passwd" },
      { message_id: m1.id, attachment_id: doc.id, name: "0002-contract.pdf" },
      { message_id: m2.id, attachment_id: unnamed.id, name: "0003-video.mov" },
    ]);
    expect(body(r.text)).toBe(
      [
        "[2026-11-27 14:03] Ana Pop: [Photo: 0001-_.._etc_passwd]",
        "[Document: 0002-contract.pdf]",
        "[2026-11-27 14:03] Ana Pop: [Video: 0003-video.mov]",
        "[Document: big.zip (not included)]",
        "",
      ].join("\n"),
    );
    // Every name is a plain file name: nothing can leave the archive's media folder.
    for (const m of r.media) expect(m.name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("holds no more than the conversation shows", () => {
    const secret = msg({ kind: "image", view_once: "opened", attachments: [file({ local_path: null })] });
    const erased = msg({ kind: "image", attachments: [file({ local_path: null, download_state: "expired", expired_at: at(10, 0), file_name: "" })] });
    const r = buildTranscript(
      conv(),
      [
        msg({ deleted: true, text: null }),
        msg({ outgoing: true, deleted: true, text: null }),
        secret,
        erased,
        // A disappearing message past its time is not written at all; one still showing is.
        msg({ text: "gone already", expires_at: NOW - 1 }),
        msg({ text: "still here", expires_at: NOW + 60_000 }),
      ],
      t,
      { withMedia: true, now: NOW },
    );
    expect(body(r.text)).toBe(
      [
        `[2026-11-27 14:03] Ana Pop: ${t("message.deleted")}`,
        `[2026-11-27 14:03] You: ${t("message.deletedByYou")}`,
        `[2026-11-27 14:03] Ana Pop: [${t("viewOnce.photo")}]`,
        `[2026-11-27 14:03] Ana Pop: [${t("retention.mediaExpired")}]`,
        "[2026-11-27 14:03] Ana Pop: still here",
        "",
      ].join("\n"),
    );
    expect(r.media).toEqual([]);
    expect(r.count).toBe(5);
    expect(r.text).not.toContain("gone already");
  });

  it("writes locations, contact cards and forwarded messages", () => {
    const r = buildTranscript(
      conv(),
      [
        msg({ kind: "location", location: { lat: 44.4268, lng: 26.1025, name: "Bucharest", address: null } }),
        msg({ kind: "contact", contacts: [{ account_id: "x", number: "1234567890123456", name: "Dan" }] }),
        msg({ text: "see this", forwarded: true }),
      ],
      t,
      { withMedia: false, now: NOW },
    );
    expect(body(r.text)).toBe(
      [
        "[2026-11-27 14:03] Ana Pop: [Location: Bucharest, 44.4268, 26.1025]",
        "[2026-11-27 14:03] Ana Pop: [Contact: Dan, 1234 5678 9012 3456]",
        "[2026-11-27 14:03] Ana Pop: (Forwarded)",
        "see this",
        "",
      ].join("\n"),
    );
  });

  it("makes file names every system accepts", () => {
    expect(exportTimestamp(new Date(2026, 0, 5, 7, 9).getTime())).toBe("2026-01-05 07:09");
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
    expect(safeFileName("  .hidden  ")).toBe("hidden");
    expect(safeFileName("...", "photo.jpg")).toBe("photo.jpg");
    expect(safeFileName("tab\there\nnow")).toBe("tab_here_now");
    const long = safeFileName(`${"x".repeat(300)}.jpeg`);
    expect(long.length).toBe(100);
    expect(long.endsWith(".jpeg")).toBe(true);
    expect(exportBaseName({ title: "Ana / Pop?" })).toBe("Dialog - Ana _ Pop_");
    expect(exportBaseName({ title: "" })).toBe("Dialog -");
  });
});
