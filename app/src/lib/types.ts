// Shared data types between the Rust core (Tauri commands/events) and the React UI.
// Field names are snake_case on purpose: they mirror the serde structs in
// `app/src-tauri/src/commands.rs` 1:1. Timestamps are milliseconds since the Unix epoch.

export type Platform = "desktop" | "android" | "ios" | "web" | "cli";

export interface ServerInfo {
  url: string;
  name: string;
  version: string;
  registration_enabled: boolean;
  phone_verification_enabled: boolean;
  max_attachment_bytes: number;
  max_devices: number;
}

export interface AccountInfo {
  account_id: string;
  /** 16-digit account number, without spaces. */
  number: string;
  device_id: number;
  server_url: string;
}

export interface AppState {
  /** "locked": the local data waits for the account password (see DataLockScreen). */
  status: "no_account" | "ready" | "locked";
  account: AccountInfo | null;
  /** The built-in default server ("our" server). */
  default_server_url: string;
  /** Recovery phrase of a just-created account not yet confirmed by the user. */
  pending_mnemonic?: string[] | null;
  /** The local database is locked with the account password. */
  local_protected: boolean;
}

export interface RegisterResult {
  account: AccountInfo;
  /** 24 BIP39 words. Shown to the user exactly once. */
  mnemonic: string[];
}

export type ConnectionState = "connecting" | "online" | "offline";

export interface Profile {
  name: string;
  about: string;
  avatar_path: string | null;
}

export interface Contact {
  account_id: string;
  number: string;
  /** Name the contact chose for themselves (from their encrypted profile). */
  profile_name: string | null;
  /** Name given locally (address book import or manual rename). */
  local_name: string | null;
  /** Best name to show: local_name ?? profile_name ?? formatted number. */
  display_name: string;
  about: string | null;
  avatar_path: string | null;
  /** Phone number from the imported address book, if matched. */
  phone: string | null;
  blocked: boolean;
  /** User has compared safety numbers and marked the contact as verified. */
  verified: boolean;
}

export type ConversationKind = "direct" | "group";

export type MessageKind = "text" | "image" | "video" | "file" | "voice" | "location" | "contact" | "system";

export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export type MessageStatusReason = "no_devices" | "account_gone";

export interface MessagePreview {
  id: string;
  kind: MessageKind;
  text: string | null;
  sender_name: string | null;
  outgoing: boolean;
  status: MessageStatus;
  sent_at: number;
  deleted: boolean;
  /** For system messages: the event (chat list text). */
  system?: SystemEvent | null;
  /** View-once photo/video (the chat list shows a placeholder, never the media). */
  view_once?: boolean;
  /** The media was erased by the retention period (the chat list shows a placeholder). */
  media_expired?: boolean;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  avatar_path: string | null;
  /** direct only */
  peer_account_id: string | null;
  peer_number: string | null;
  /** group only */
  group_id: string | null;
  member_count: number | null;
  is_admin: boolean;
  /** true when we are no longer a member of the group */
  left: boolean;
  last_message: MessagePreview | null;
  unread_count: number;
  /** Unread messages that mention us. */
  unread_mentions: number;
  /** null = not muted, -1 = muted forever, otherwise ms timestamp */
  muted_until: number | null;
  archived: boolean;
  pinned: boolean;
  /** 0 = disabled */
  disappearing_seconds: number;
  blocked: boolean;
  /** Draft text kept by the core. */
  draft: string | null;
  updated_at: number;
  /**
   * false: a message request (a stranger wrote first) or a group a stranger added us to.
   * Until accepted nothing is downloaded or acknowledged and calls do not ring.
   */
  accepted: boolean;
  /** Direct chats: the peer is in our contacts (calls with anyone else are relayed). */
  peer_is_contact: boolean;
}

/** "expired": erased by the media retention (only kind, type, size and, for documents, the name remain). */
export type DownloadState = "pending" | "downloading" | "done" | "failed" | "expired";

export interface Attachment {
  id: string;
  mime: string;
  file_name: string;
  size: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  /** Normalized 0..1 amplitudes for voice notes (<= 64 values). */
  waveform: number[] | null;
  /** Tiny blurred preview (data: URL), available before download. */
  thumbnail: string | null;
  /** Decrypted local file (use convertFileSrc to display). */
  local_path: string | null;
  download_state: DownloadState;
  /** 0..1 while uploading/downloading. */
  progress: number | null;
  /** Set (ms) when the media retention erased it: show a placeholder, offer no actions. */
  expired_at?: number | null;
}

/** A contact card shared in a message. `name` is the person's own profile name. */
export interface SharedContact {
  account_id: string;
  number: string;
  name: string;
}

export interface Location {
  lat: number;
  lng: number;
  name: string | null;
  address: string | null;
}

export interface Reaction {
  emoji: string;
  account_id: string;
  sender_name: string;
  is_me: boolean;
}

export interface QuotedMessage {
  id: string;
  sender_name: string;
  kind: MessageKind;
  text: string | null;
  /** thumbnail of the first attachment, if any */
  thumbnail: string | null;
}

export type SystemEventType =
  | "group_created"
  | "group_member_added"
  | "group_member_unverified"
  | "group_member_removed"
  | "group_member_left"
  | "group_renamed"
  | "group_avatar_changed"
  | "group_admin_granted"
  | "group_admin_revoked"
  | "group_member_joined_link"
  | "group_history_cleared"
  | "disappearing_changed"
  | "identity_changed"
  | "contact_joined"
  | "call"
  | "group_call"
  | "identity_mismatch"
  | "decryption_failed";

export interface SystemEvent {
  type: SystemEventType;
  actor_name: string | null;
  target_names: string[];
  value: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_account_id: string;
  sender_name: string;
  outgoing: boolean;
  kind: MessageKind;
  text: string | null;
  attachments: Attachment[];
  location: Location | null;
  contacts: SharedContact[];
  reply_to: QuotedMessage | null;
  reactions: Reaction[];
  status: MessageStatus;
  /**
   * Outgoing only: why the message is still pending or failed. "no_devices": the recipient has
   * no connected device right now (status "pending"; sent when they are back). "account_gone":
   * the recipient account was deleted (status "failed").
   */
  status_reason?: MessageStatusReason | null;
  sent_at: number;
  received_at: number;
  edited_at: number | null;
  /** "This message was deleted" */
  deleted: boolean;
  forwarded: boolean;
  /** Disappearing message expiry (ms) or null. */
  expires_at: number | null;
  system: SystemEvent | null;
  /** @mentions inside `text` (UTF-16 ranges). */
  mentions: Mention[];
  /** We are mentioned. */
  mentions_me: boolean;
  /** Pinned in its chat (this device only) until this time (ms). */
  pinned_until: number | null;
  /** Starred (this device only, for a week). */
  starred: boolean;
  /**
   * View-once media (one image or video): null for an ordinary message. Such messages never
   * carry `local_path` or `thumbnail`; the media is shown only through `openViewOnce`.
   */
  view_once?: ViewOnceState | null;
}

export type ViewOnceState = "unopened" | "opened" | "expired";

export interface MessageReceipt {
  account_id: string;
  display_name: string;
  avatar_path: string | null;
  status: MessageStatus;
  delivered_at: number | null;
  read_at: number | null;
}

export interface MessageInfo {
  message: Message;
  receipts: MessageReceipt[];
}

/** One version of an edited message (oldest first; the last one is the current text). */
export interface EditVersion {
  text: string;
  at: number;
}

export interface GroupSettings {
  only_admins_send: boolean;
  only_admins_edit: boolean;
  /** Disappearing timer of the whole group (admins only), 0 = off. */
  disappearing_seconds: number;
  /** Members (not admins) see only how many members there are. */
  hide_members: boolean;
  /** "first_name": profile name required, only its first word is shown (no account numbers). */
  member_names: "number" | "first_name";
}

export interface GroupMember {
  account_id: string;
  number: string;
  display_name: string;
  avatar_path: string | null;
  role: "admin" | "member";
  is_me: boolean;
  /** Confirmed end to end by an admin (false: only the server lists this member). */
  verified?: boolean;
}

export interface GroupInfo {
  conversation_id: string;
  group_id: string;
  name: string;
  description: string;
  avatar_path: string | null;
  /** Only ourselves when the member list is hidden from us. */
  members: GroupMember[];
  member_count: number;
  members_hidden: boolean;
  my_role: "admin" | "member" | null;
  settings: GroupSettings;
  created_by: string | null;
  created_at: number;
  /** The invite link (admins only; null when there is none). */
  invite_link: string | null;
  /** Joining with the link needs an admin's approval. */
  invite_approval: boolean;
  /** Pending join requests (admins only). */
  join_requests: number;
}

export interface InvitePreview {
  group_id: string;
  name: string;
  description: string;
  member_count: number;
  approval: boolean;
  is_member: boolean;
  /** We already asked to join. */
  requested: boolean;
  /** An admin removed us (or rejected our request): joining by link is refused. */
  banned?: boolean;
  conversation_id: string | null;
}

export interface JoinResult {
  status: "joined" | "requested" | "member";
  conversation_id: string | null;
  group_id: string;
}

export interface JoinRequest {
  account_id: string;
  name: string;
  avatar_path: string | null;
  requested_at: number;
}

/** An account an admin removed (or whose join request was rejected): it can't rejoin by link. */
export interface GroupBan {
  account_id: string;
  display_name: string;
  avatar_path: string | null;
  banned_by: string;
  banned_at: number;
}

/** A device that joined the account after this one (shown until dismissed). */
export interface NewDeviceAlert {
  device_id: number;
  name: string;
  platform: string;
  created_at: number;
}

/** Key transparency: an inconsistency in the server's public key log (shown until dismissed). */
export interface KtAlert {
  kind: "split_view" | "fork" | "rollback" | "bad_signature" | "key_mismatch" | "own_key_mismatch" | "log_mismatch" | "log_key_changed";
  account_id?: string | null;
  detail: string;
  at: number;
  evidence?: unknown;
}

export type KtStatus = "verified" | "pending" | "alert" | "unavailable";

/** Key transparency state of this account and of the log. */
export interface KtOverview {
  enabled: boolean;
  tree_size: number | null;
  checked_at: number | null;
  own_status: KtStatus;
  monitored: number;
  alerts: KtAlert[];
}

/** Key transparency state of one contact's security key. */
export interface KtContactStatus {
  account_id: string;
  status: KtStatus;
  tree_size: number | null;
  checked_at: number | null;
}

/** A password login waiting for approval by one of our devices (expires after 10 minutes). */
export interface LoginRequestInfo {
  id: string;
  name: string;
  platform: string;
  created_at: number;
  expires_at: number;
}

export interface DeviceInfo {
  device_id: number;
  name: string;
  platform: Platform;
  created_at: number;
  last_seen_at: number;
  current: boolean;
}

/** Do not disturb: incoming calls do not ring, messages make no sound or notification. */
/** Call privacy settings (synced to our other devices). */
export interface CallSettings {
  /** Calls ring and can be placed (default on). */
  allow_calls: boolean;
  /** Every call goes through the TURN relay only, hiding our IP address (default off). */
  relay_only: boolean;
}

/** Media retention period (crates/chat-core/src/engine/retention.rs), synced to our devices. */
export interface MediaRetention {
  /** One of `options` (1, 7, 14, 30); 30 is the default and the longest allowed. */
  days: number;
  options: number[];
  max_days: number;
  /** The last media check (null: none yet). */
  last_check: MediaCheck | null;
}

/**
 * Default disappearing timer (crates/chat-core/src/engine/default_timer.rs), synced to our
 * devices: chats we start and groups we create get it from the start.
 */
export interface DefaultDisappearing {
  /** One of `options` (seconds); 0 = off (the default). */
  seconds: number;
  options: number[];
}

/** Result of a media check: files removed and when it ran (ms). */
export interface MediaCheck {
  removed: number;
  checked_at: number;
}

export interface DndState {
  /** End (ms); 0 = off; DND_FOREVER (or more) = until turned off. */
  until: number;
}

/** `until` of "until I turn it off" (the core takes anything this far out as i64::MAX). */
export const DND_FOREVER = Number.MAX_SAFE_INTEGER;

export interface PrivacySettings {
  /** Server-enforced. */
  last_seen: "everyone" | "nobody";
  /** Client-side: send read receipts (and see others' when enabled, like WhatsApp). */
  read_receipts: boolean;
  typing_indicators: boolean;
}

export interface AccountDetails {
  account: AccountInfo;
  /** Optional public username (lowercase, without "@"). */
  username: string | null;
  phone: string | null;
  phone_verified: boolean;
  discoverable_by_phone: boolean;
  privacy: PrivacySettings;
  /** Encrypted history backup to the server vault (enables history on new devices). */
  backup_enabled: boolean;
  /** Two-step verification (TOTP) is required at login. */
  totp_enabled: boolean;
  /** New password logins must be approved on one of the account's devices. */
  login_approval: boolean;
  /** Password changed on another device; the local lock still uses the old one. */
  local_password_outdated: boolean;
  /** The password is below the current rules: ask to change it. */
  password_weak: boolean;
}

export interface SafetyNumber {
  /** 60 digits in 12 groups of 5, separated by spaces. */
  digits: string;
  /** Base64 scannable fingerprint (to be rendered as a QR code). */
  qr_payload: string;
  verified: boolean;
}

export interface ContactImportResult {
  total: number;
  with_phone: number;
  matched: number;
}

export interface Presence {
  account_id: string;
  online: boolean;
  last_seen: number | null;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface OutgoingAttachment {
  /** Either a local file path (from the file dialog) ... */
  path?: string;
  /** ... or inline bytes (paste, voice recording). */
  data_base64?: string;
  file_name: string;
  mime: string;
  kind: "image" | "video" | "file" | "voice";
  duration_ms?: number;
  waveform?: number[];
  width?: number;
  height?: number;
}

export interface SendMessageRequest {
  conversation_id: string;
  text?: string;
  /** @mentions inside `text`. */
  mentions?: Mention[];
  reply_to?: string;
  attachments?: OutgoingAttachment[];
  location?: Location;
  /** Account ids to share as contact cards. */
  contact_ids?: string[];
  /** View-once media: exactly one image or video attachment, no text/location/contacts. */
  view_once?: boolean;
}

export interface ConversationSettingsPatch {
  muted_until?: number | null;
  archived?: boolean;
  pinned?: boolean;
  disappearing_seconds?: number;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  member_account_ids: string[];
  avatar_path?: string;
  /** Initial group rules. */
  settings?: Partial<GroupSettings>;
}

export interface UpdateGroupRequest {
  conversation_id: string;
  name?: string;
  description?: string;
  /** "" removes the avatar */
  avatar_path?: string;
  /** Only the given fields change. */
  settings?: Partial<GroupSettings>;
}

export interface SetProfileRequest {
  name?: string;
  about?: string;
  /** Path to a new avatar image; "" removes the avatar. */
  avatar_path?: string;
  /** New avatar as image bytes (e.g. a camera snapshot), alternative to avatar_path. */
  avatar_data_base64?: string;
}

/** Shareable username link (see backend.getUsernameLink). */
export interface UsernameLink {
  link: string;
  username: string;
}

/** An account found in the directory by account number or username. */
export interface FoundAccount {
  account_id: string;
  number: string;
  username: string | null;
  display_name: string;
  avatar_path: string | null;
  is_me: boolean;
}

// ---------------------------------------------------------------------------
// Events (Rust -> UI), see `events` in backend.ts
// ---------------------------------------------------------------------------

export interface MessageEvent {
  conversation_id: string;
  message: Message;
  /** true only the first time an incoming message is stored (use for notifications). */
  is_new_incoming: boolean;
}

export interface MessageDeletedEvent {
  conversation_id: string;
  message_id: string;
}

export interface TypingEvent {
  conversation_id: string;
  account_id: string;
  sender_name: string;
  typing: boolean;
}

/** An account saved on this computer, as listed on the start screen (app/src-tauri/src/profiles.rs). */
export interface ProfileCard {
  id: string;
  /** Profile name; null shows as "Account". */
  label: string | null;
  last4: string | null;
  server_host: string | null;
  /** Unix ms. */
  last_used: number;
  /** Opened with its password since the app started: switching to it needs no password. */
  unlocked?: boolean;
  /** The account in use now. */
  active?: boolean;
}

/** The active profile: saved on this computer (registered) and listed on the start screen. */
export interface CurrentProfile {
  registered: boolean;
  visible: boolean;
}

export interface LoggedOutEvent {
  reason: "device_removed" | "account_deleted" | "logout" | "local_reset";
}

export interface HistorySyncEvent {
  done: boolean;
  records: number;
}

/** Errors thrown by invoke() are strings of the form "<code>: <message>". */
export type ErrorCode =
  | "network"
  | "unauthorized"
  | "invalid_password"
  | "invalid_mnemonic"
  | "not_found"
  | "too_many_devices"
  | "registration_disabled"
  | "rate_limited"
  | "forbidden"
  | "invalid_input"
  | "different_server"
  | "banned"
  | "internal";

/** An @mention: `text.slice(start, start + length)` names `account_id`. */
export interface Mention {
  account_id: string;
  start: number;
  length: number;
}
