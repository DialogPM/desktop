// Realistic sample data for the mock backend.

import { BRAND_NAME } from "../../brand";
import type {
  AccountDetails,
  Attachment,
  Contact,
  Conversation,
  DeviceInfo,
  GroupInfo,
  Location,
  Message,
  MessageStatus,
  Profile,
  QuotedMessage,
  Reaction,
  SystemEvent,
} from "../types";
import { avatarPic, groupPic, photo, rng, textFile, thumb, voiceWav, waveform } from "./media";

export const DEFAULT_SERVER = "https://chat.example.org";
export const ME_ID = "acc-me";
export const MY_NUMBER = "4821093755128830";

export interface MockDb {
  profile: Profile;
  details: AccountDetails;
  contacts: Map<string, Contact>;
  conversations: Map<string, Conversation>;
  /** conversation id -> messages sorted by sent_at ascending */
  messages: Map<string, Message[]>;
  groups: Map<string, GroupInfo>;
  devices: DeviceInfo[];
  /** account_id -> [online, last_seen] */
  presence: Map<string, { online: boolean; last_seen: number | null }>;
  /** Server directory: accounts that can be found by number or username (contacts included). */
  directory: DirectoryEntry[];
}

export interface DirectoryEntry {
  account_id: string;
  number: string;
  username: string | null;
  profile_name: string | null;
  avatar_path: string | null;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function contact(
  id: string,
  number: string,
  profile_name: string | null,
  extra: Partial<Contact> = {},
): Contact {
  const c: Contact = {
    account_id: id,
    number,
    profile_name,
    local_name: null,
    display_name: profile_name ?? number,
    about: null,
    avatar_path: null,
    phone: null,
    blocked: false,
    verified: false,
    ...extra,
  };
  c.display_name = c.local_name ?? c.profile_name ?? formatNumber(number);
  return c;
}

/** "1234 5678 9012 3456", like the core's number label for contacts without a name. */
export function formatNumber(n: string): string {
  return n.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function preview(m: Message): Conversation["last_message"] {
  return {
    id: m.id,
    kind: m.kind,
    text:
      m.kind === "system"
        ? null
        : (m.text ?? (m.kind === "file" ? (m.attachments[0]?.file_name ?? null) : m.location?.name ?? null)),
    sender_name: m.outgoing ? null : m.sender_name,
    outgoing: m.outgoing,
    status: m.status,
    sent_at: m.sent_at,
    deleted: m.deleted,
    view_once: !!m.view_once,
  };
}

let seq = 0;
export const newId = (p = "m") => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function buildDb(): MockDb {
  const now = Date.now();
  const contacts = new Map<string, Contact>();
  const add = (c: Contact) => contacts.set(c.account_id, c);

  const maria = contact("acc-maria", "5102334876210094", "Maria Popescu", {
    about: "Coffee first ☕",
    avatar_path: avatarPic(0),
    phone: "+40 721 555 014",
    verified: true,
  });
  const luca = contact("acc-luca", "7734012299841156", "Luca Rossi", {
    about: "In viaggio 🌍",
    avatar_path: avatarPic(1),
    phone: "+39 333 555 0192",
  });
  const sarah = contact("acc-sarah", "3390155720468812", "Sarah Chen", { about: "Available" });
  const andrei = contact("acc-andrei", "6018840035527719", "Andrei", {
    local_name: "Andrei Ionescu",
    about: `Hey there! I am using ${BRAND_NAME}.`,
  });
  const giulia = contact("acc-giulia", "2287719304456621", "Giulia Bianchi", {
    avatar_path: avatarPic(2),
    about: "Designer · Milano",
  });
  const tom = contact("acc-tom", "9901238847756630", "Tom Becker", { blocked: true });
  const elena = contact("acc-elena", "1456098834472210", "Elena Dumitru", {
    avatar_path: avatarPic(4),
    about: "🏔️ mountains > beaches",
  });
  const david = contact("acc-david", "8823410067715549", "David Kim", { about: "Busy" });
  const noah = contact("acc-noah", "3312987765540021", "Noah Williams", { avatar_path: avatarPic(5) });
  // Someone who wrote first and has no profile name yet: shown by number until renamed.
  const unnamed = contact("acc-unnamed", "2045118830917743", null);
  [maria, luca, sarah, andrei, giulia, tom, elena, david, noah, unnamed].forEach(add);

  const conversations = new Map<string, Conversation>();
  const messages = new Map<string, Message[]>();
  const groups = new Map<string, GroupInfo>();

  const direct = (c: Contact, extra: Partial<Conversation> = {}): Conversation => {
    const conv: Conversation = {
      id: `conv-${c.account_id.slice(4)}`,
      kind: "direct",
      title: c.display_name,
      avatar_path: c.avatar_path,
      peer_account_id: c.account_id,
      peer_number: c.number,
      group_id: null,
      member_count: null,
      is_admin: false,
      left: false,
      last_message: null,
      unread_count: 0,
      unread_mentions: 0,
      muted_until: null,
      archived: false,
      pinned: false,
      disappearing_seconds: 0,
      blocked: c.blocked,
      draft: null,
      updated_at: now,
      accepted: true,
      peer_is_contact: true,
      ...extra,
    };
    conversations.set(conv.id, conv);
    messages.set(conv.id, []);
    return conv;
  };

  const group = (
    id: string,
    name: string,
    members: { c: Contact; admin?: boolean }[],
    opts: { meAdmin: boolean; description: string; avatar: string | null; createdBy: Contact | null; createdAgo: number },
    extra: Partial<Conversation> = {},
  ): Conversation => {
    const conv: Conversation = {
      id: `conv-${id}`,
      kind: "group",
      title: name,
      avatar_path: opts.avatar,
      peer_account_id: null,
      peer_number: null,
      group_id: `grp-${id}`,
      member_count: members.length + 1,
      is_admin: opts.meAdmin,
      left: false,
      last_message: null,
      unread_count: 0,
      unread_mentions: 0,
      muted_until: null,
      archived: false,
      pinned: false,
      disappearing_seconds: 0,
      blocked: false,
      draft: null,
      updated_at: now,
      accepted: true,
      peer_is_contact: false,
      ...extra,
    };
    conversations.set(conv.id, conv);
    messages.set(conv.id, []);
    groups.set(conv.id, {
      conversation_id: conv.id,
      group_id: conv.group_id!,
      name,
      description: opts.description,
      avatar_path: opts.avatar,
      members: [
        {
          account_id: ME_ID,
          number: MY_NUMBER,
          display_name: "You",
          avatar_path: null,
          role: opts.meAdmin ? "admin" : "member",
          is_me: true,
        },
        ...members.map(({ c, admin }) => ({
          account_id: c.account_id,
          number: c.number,
          display_name: c.display_name,
          avatar_path: c.avatar_path,
          role: admin ? ("admin" as const) : ("member" as const),
          is_me: false,
        })),
      ],
      member_count: members.length + 1,
      members_hidden: false,
      my_role: opts.meAdmin ? "admin" : "member",
      settings: { only_admins_send: false, only_admins_edit: id === "aurora", disappearing_seconds: 0, hide_members: false, member_names: "number" },
      created_by: opts.createdBy?.account_id ?? ME_ID,
      created_at: now - opts.createdAgo,
      invite_link: null,
      invite_approval: false,
      join_requests: 0,
    });
    return conv;
  };

  // --- message helpers -------------------------------------------------------
  let photoSeed = 0;
  const image = (w = 1200, h = 800, done = true): Attachment => {
    const s = photoSeed++;
    return {
      id: newId("att"),
      mime: "image/jpeg",
      file_name: `IMG_20${2400 + s}.jpg`,
      size: 180_000 + s * 23_000,
      width: w,
      height: h,
      duration_ms: null,
      waveform: null,
      thumbnail: thumb(s),
      local_path: done ? photo(s, w, h) : null,
      download_state: done ? "done" : "pending",
      progress: null,
    };
  };
  const voice = (seed: number, ms: number): Attachment => {
    const wave = waveform(seed);
    return {
      id: newId("att"),
      mime: "audio/wav",
      file_name: "voice-note.wav",
      size: Math.round(ms * 16),
      width: null,
      height: null,
      duration_ms: ms,
      waveform: wave,
      thumbnail: null,
      local_path: voiceWav(wave, ms),
      download_state: "done",
      progress: null,
    };
  };
  const file = (name: string, mime: string, size: number, done: boolean): Attachment => ({
    id: newId("att"),
    mime,
    file_name: name,
    size,
    width: null,
    height: null,
    duration_ms: null,
    waveform: null,
    thumbnail: null,
    local_path: done ? textFile(`Sample file: ${name}\n`, mime) : null,
    download_state: done ? "done" : "pending",
    progress: null,
  });

  interface MsgInput {
    from: Contact | "me";
    at: number;
    text?: string;
    kind?: Message["kind"];
    attachments?: Attachment[];
    location?: Location;
    reply?: Message;
    reactions?: [string, Contact | "me"][];
    status?: MessageStatus;
    edited?: boolean;
    deleted?: boolean;
    forwarded?: boolean;
    system?: SystemEvent;
    expires?: number;
  }
  const quote = (m: Message): QuotedMessage => ({
    id: m.id,
    sender_name: m.outgoing ? "You" : m.sender_name,
    kind: m.kind,
    text: m.text ?? (m.kind === "location" ? (m.location?.name ?? null) : null),
    thumbnail: m.attachments[0]?.thumbnail ?? null,
  });
  const push = (conv: Conversation, p: MsgInput): Message => {
    const outgoing = p.from === "me";
    const sender = p.from === "me" ? null : p.from;
    const kind: Message["kind"] =
      p.kind ?? (p.system ? "system" : p.location ? "location" : p.attachments?.length ? "image" : "text");
    const m: Message = {
      id: newId(),
      conversation_id: conv.id,
      sender_account_id: sender?.account_id ?? ME_ID,
      sender_name: sender?.display_name ?? "You",
      outgoing,
      kind,
      text: p.deleted ? null : (p.text ?? null),
      attachments: p.deleted ? [] : (p.attachments ?? []),
      location: p.location ?? null,
      contacts: [],
      reply_to: p.reply ? quote(p.reply) : null,
      reactions: (p.reactions ?? []).map(
        ([emoji, who]): Reaction => ({
          emoji,
          account_id: who === "me" ? ME_ID : who.account_id,
          sender_name: who === "me" ? "You" : who.display_name,
          is_me: who === "me",
        }),
      ),
      status: p.status ?? (outgoing ? "read" : "read"),
      sent_at: p.at,
      received_at: p.at + 800,
      edited_at: p.edited ? p.at + 2 * MIN : null,
      deleted: p.deleted ?? false,
      forwarded: p.forwarded ?? false,
      expires_at: p.expires ?? null,
      system: p.system ?? null,
      mentions: [],
      mentions_me: false,
      pinned_until: null,
      starred: false,
    };
    messages.get(conv.id)!.push(m);
    return m;
  };
  const sys = (conv: Conversation, at: number, system: SystemEvent) => push(conv, { from: "me", at, system, kind: "system" });

  // --- Maria: the showcase conversation ---------------------------------------
  const cMaria = direct(maria, { pinned: true });
  const r = rng(7);
  const fillers = [
    "Did you see the news?",
    "Haha yes 😂",
    "Let me check and get back to you",
    "Sure, no problem",
    "What time works for you?",
    "Sounds good!",
    "I'll bring the charger",
    "Thanks a lot 🙏",
    "On my way",
    "Can you send me the address?",
    "Perfect 👌",
    "See you then!",
  ];
  for (let i = 0; i < 70; i++) {
    const at = now - 30 * DAY + i * 9.5 * HOUR + Math.floor(r() * HOUR);
    push(cMaria, { from: r() > 0.5 ? "me" : maria, at, text: fillers[Math.floor(r() * fillers.length)] });
  }
  const y = now - DAY - 3 * HOUR;
  const m1 = push(cMaria, { from: maria, at: y, text: "Hey! Are we still on for the trip to Sinaia this weekend? 🏔️" });
  push(cMaria, { from: "me", at: y + 4 * MIN, text: "Absolutely! I already booked the cabin.", reply: m1, reactions: [["❤️", maria]] });
  push(cMaria, { from: maria, at: y + 6 * MIN, text: "Here's the trail I was talking about: https://www.openstreetmap.org/relation/1234567" });
  push(cMaria, { from: "me", at: y + 9 * MIN, text: "This message was deleted", deleted: true });
  push(cMaria, { from: maria, at: y + 12 * MIN, text: "Photos from last time 📸", attachments: [image(), image(800, 1100), image(), image()] });
  push(cMaria, { from: "me", at: y + 15 * MIN, text: "😍🔥", reactions: [["😂", maria]] });
  const t = now - 2 * HOUR;
  const loc = push(cMaria, {
    from: "me",
    at: t,
    location: { lat: 45.3497, lng: 25.5511, name: "Cabana Piatra Arsă", address: "Bucegi Mountains, Romania" },
  });
  push(cMaria, { from: maria, at: t + 3 * MIN, kind: "voice", attachments: [voice(3, 9_000)], reply: loc });
  push(cMaria, { from: "me", at: t + 5 * MIN, text: "I'll leave around 7 so we avoid traffic", edited: true, reactions: [["👍", maria], ["👍", "me"]] });
  push(cMaria, { from: "me", at: t + 6 * MIN, kind: "voice", attachments: [voice(9, 4_000)], status: "read" });
  push(cMaria, { from: maria, at: t + 20 * MIN, text: "Forwarding this from the hiking group", forwarded: true, attachments: [image()] });
  // View-once photo: no thumbnail or path until opened (see mock openViewOnce).
  const viewOnce = push(cMaria, {
    from: maria,
    at: t + 22 * MIN,
    attachments: [{ ...image(), thumbnail: null, local_path: null, download_state: "pending" }],
  });
  viewOnce.view_once = "unopened";
  push(cMaria, { from: maria, at: now - 25 * MIN, text: "Also: don't forget warm clothes, it's going to be −5°C at night 🥶" });
  push(cMaria, { from: maria, at: now - 24 * MIN, text: "And the headlamp!" });
  cMaria.unread_count = 2;

  // --- Weekend hiking group --------------------------------------------------
  const cHike = group(
    "hiking",
    "Weekend hiking 🥾",
    [{ c: luca, admin: true }, { c: maria }, { c: elena }, { c: noah }],
    { meAdmin: false, description: "Trips, gear and photos. Be nice!", avatar: groupPic(0), createdBy: luca, createdAgo: 40 * DAY },
    { pinned: false },
  );
  sys(cHike, now - 40 * DAY, { type: "group_created", actor_name: "Luca Rossi", target_names: [], value: "Weekend hiking 🥾" });
  sys(cHike, now - 40 * DAY + MIN, { type: "group_member_added", actor_name: "Luca Rossi", target_names: ["You", "Maria Popescu"], value: null });
  sys(cHike, now - 10 * DAY, { type: "group_member_added", actor_name: "Maria Popescu", target_names: ["Elena Dumitru", "Noah Williams"], value: null });
  const h1 = push(cHike, { from: luca, at: now - 3 * DAY, text: "Who's in for Saturday? Forecast looks great ☀️" });
  push(cHike, { from: elena, at: now - 3 * DAY + 5 * MIN, text: "Me! 🙋‍♀️", reply: h1 });
  push(cHike, { from: noah, at: now - 3 * DAY + 9 * MIN, text: "Count me in", reactions: [["🔥", luca], ["🔥", elena]] });
  push(cHike, { from: "me", at: now - 3 * DAY + 20 * MIN, text: "Same here. Should we meet at the station?", status: "read" });
  push(cHike, {
    from: luca,
    at: now - 2 * DAY,
    location: { lat: 45.4318, lng: 25.5574, name: "Gara Bușteni", address: "Bușteni, Prahova" },
  });
  push(cHike, { from: elena, at: now - 5 * HOUR, text: "View from the top last week", attachments: [image(1200, 800, false)] });
  push(cHike, { from: noah, at: now - 4 * HOUR, text: "Wow 😮" });
  push(cHike, { from: luca, at: now - 40 * MIN, text: "Packing list: water 2L, snacks, rain jacket, first aid kit." });
  push(cHike, { from: elena, at: now - 12 * MIN, kind: "voice", attachments: [voice(5, 14_000)] });
  cHike.unread_count = 5;

  // --- Luca ------------------------------------------------------------------
  const cLuca = direct(luca);
  push(cLuca, { from: luca, at: now - 6 * DAY, text: "Ciao! I sent you the itinerary." });
  push(cLuca, { from: luca, at: now - 6 * DAY + MIN, kind: "file", attachments: [file("Itinerario_Dolomiti.pdf", "application/pdf", 2_457_600, false)] });
  push(cLuca, { from: "me", at: now - 6 * DAY + 30 * MIN, text: "Grazie! Looks amazing." });
  push(cLuca, { from: luca, at: now - 5 * HOUR, text: "Do you have the budget spreadsheet?" });
  push(cLuca, { from: "me", at: now - 3 * HOUR, kind: "file", attachments: [file("Budget_2026.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 48_300, true)], status: "read" });

  // --- Project Aurora (I'm admin, muted) --------------------------------------
  const cAurora = group(
    "aurora",
    "Project Aurora",
    [{ c: sarah }, { c: david, admin: true }, { c: giulia }, { c: andrei }],
    { meAdmin: true, description: "Release planning for v2. Weekly sync on Mondays.", avatar: null, createdBy: null, createdAgo: 90 * DAY },
    { muted_until: -1 },
  );
  sys(cAurora, now - 90 * DAY, { type: "group_created", actor_name: "You", target_names: [], value: "Project Aurora" });
  sys(cAurora, now - 20 * DAY, { type: "group_admin_granted", actor_name: "You", target_names: ["David Kim"], value: null });
  push(cAurora, { from: sarah, at: now - 2 * DAY, text: "Draft of the release notes is ready for review." });
  push(cAurora, { from: sarah, at: now - 2 * DAY + MIN, kind: "file", attachments: [file("Release_notes_v2.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 88_000, true)] });
  push(cAurora, { from: david, at: now - 1 * DAY, text: "LGTM, small comments inline" });
  push(cAurora, { from: giulia, at: now - 7 * HOUR, text: "New icons 🎨", attachments: [image(1000, 1000)] });
  push(cAurora, { from: "me", at: now - 6 * HOUR, text: "Love them. Shipping on Thursday?", status: "delivered" });
  push(cAurora, { from: andrei, at: now - 55 * MIN, text: "Thursday works for backend 👍" });
  cAurora.unread_count = 1;

  // --- Sarah: failed message ---------------------------------------------------
  const cSarah = direct(sarah);
  push(cSarah, { from: sarah, at: now - 26 * HOUR, text: "Can you review my PR when you have a minute?" });
  push(cSarah, { from: "me", at: now - 90 * MIN, text: "Done, left a few comments", status: "failed" });

  // --- Andrei: disappearing messages --------------------------------------------
  const cAndrei = direct(andrei, { disappearing_seconds: 7 * 86_400 });
  push(cAndrei, { from: andrei, at: now - 4 * DAY, text: "Salut! Ce faci?" });
  sys(cAndrei, now - 3 * DAY, { type: "disappearing_changed", actor_name: "Andrei Ionescu", target_names: [], value: String(7 * 86_400) });
  push(cAndrei, { from: "me", at: now - 30 * HOUR, text: "Bine, mulțumesc! Ne vedem mâine?", status: "delivered", expires: now + 6 * DAY });

  // --- Family (pinned group) ------------------------------------------------
  const cFamily = group(
    "family",
    "Family ❤️",
    [{ c: elena, admin: true }, { c: andrei }],
    { meAdmin: true, description: "", avatar: groupPic(1), createdBy: elena, createdAgo: 200 * DAY },
    { pinned: true },
  );
  push(cFamily, { from: elena, at: now - 8 * HOUR, text: "Dinner on Sunday at 6?" });
  push(cFamily, { from: "me", at: now - 7 * HOUR, text: "Yes! I'll bring dessert 🍰", status: "read", reactions: [["❤️", elena], ["❤️", andrei]] });

  // --- Giulia (archived) --------------------------------------------------------
  const cGiulia = direct(giulia, { archived: true });
  push(cGiulia, { from: giulia, at: now - 12 * DAY, text: "Thanks for the feedback on the mockups!" });

  // --- Tom (blocked) -------------------------------------------------------
  const cTom = direct(tom);
  push(cTom, { from: tom, at: now - 20 * DAY, text: "Hi, is this still available?" });

  // --- unnamed account (only a number) ------------------------------------------
  // A message request: a stranger wrote first.
  const cUnnamed = direct(unnamed, { accepted: false, peer_is_contact: false });
  push(cUnnamed, { from: unnamed, at: now - 4 * DAY, text: `Hi! We met at the conference, this is my ${BRAND_NAME}.` });

  // finalize previews
  for (const conv of conversations.values()) {
    const list = messages.get(conv.id)!;
    list.sort((a, b) => a.sent_at - b.sent_at);
    const last = list[list.length - 1];
    if (last) {
      conv.last_message = preview(last);
      conv.updated_at = last.sent_at;
    }
  }

  const presence = new Map<string, { online: boolean; last_seen: number | null }>([
    [maria.account_id, { online: true, last_seen: now }],
    [luca.account_id, { online: false, last_seen: now - 12 * MIN }],
    [sarah.account_id, { online: false, last_seen: now - 3 * HOUR }],
    [andrei.account_id, { online: false, last_seen: now - 26 * HOUR }],
    [giulia.account_id, { online: true, last_seen: now }],
    [tom.account_id, { online: false, last_seen: null }],
    [elena.account_id, { online: false, last_seen: now - 2 * DAY }],
    [david.account_id, { online: false, last_seen: now - 5 * HOUR }],
    [noah.account_id, { online: true, last_seen: now }],
    [unnamed.account_id, { online: false, last_seen: now - 7 * HOUR }],
  ]);

  const directory: DirectoryEntry[] = [
    ...[...contacts.values()].map((c) => ({
      account_id: c.account_id,
      number: c.number,
      username: ({ "acc-maria": "maria.popescu", "acc-luca": "luca_rossi", "acc-sarah": "sarah" } as Record<string, string>)[c.account_id] ?? null,
      profile_name: c.profile_name,
      avatar_path: c.avatar_path,
    })),
    { account_id: "acc-irina", number: "7700112233445566", username: "irina.v", profile_name: "Irina Vasile", avatar_path: avatarPic(3) },
    { account_id: "acc-marco", number: "6655443322110099", username: "marco", profile_name: "Marco Esposito", avatar_path: null },
  ];

  return {
    profile: { name: "Alex Morgan", about: "Private by default 🔒", avatar_path: null },
    details: {
      account: { account_id: ME_ID, number: MY_NUMBER, device_id: 1, server_url: DEFAULT_SERVER },
      username: null,
      phone: null,
      phone_verified: false,
      discoverable_by_phone: false,
      privacy: { last_seen: "everyone", read_receipts: true, typing_indicators: true },
      backup_enabled: true,
      totp_enabled: false,
      login_approval: false,
      local_password_outdated: false,
      password_weak: false,
    },
    contacts,
    conversations,
    messages,
    groups,
    devices: [
      { device_id: 1, name: "Linux desktop", platform: "desktop", created_at: now - 120 * DAY, last_seen_at: now, current: true },
      { device_id: 2, name: "Pixel 8", platform: "android", created_at: now - 60 * DAY, last_seen_at: now - 2 * HOUR, current: false },
      { device_id: 3, name: "Work laptop", platform: "desktop", created_at: now - 14 * DAY, last_seen_at: now - 3 * DAY, current: false },
    ],
    presence,
    directory,
  };
}
