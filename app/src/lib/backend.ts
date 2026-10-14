// Typed wrappers around the Tauri commands exposed by the Rust core.
// Every command that takes input receives a single `req` object whose fields are snake_case.
// This file is the contract with `app/src-tauri/src/commands.rs`.

import { invoke } from "@tauri-apps/api/core";
import { reportIfMissingCommand } from "./staleBinary";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AccountDetails,
  AccountInfo,
  AppState,
  Attachment,
  ConnectionState,
  Contact,
  ContactImportResult,
  Conversation,
  ConversationSettingsPatch,
  CallSettings,
  MediaCheck,
  MediaRetention,
  DefaultDisappearing,
  DndState,
  CreateGroupRequest,
  DeviceInfo,
  FoundAccount,
  UsernameLink,
  GroupBan,
  GroupInfo,
  InvitePreview,
  JoinRequest,
  JoinResult,
  LoginRequestInfo,
  NewDeviceAlert,
  KtAlert,
  KtContactStatus,
  KtOverview,
  HistorySyncEvent,
  LoggedOutEvent,
  Mention,
  Message,
  MessageDeletedEvent,
  MessageEvent,
  MessageInfo,
  EditVersion,
  Presence,
  PrivacySettings,
  Profile,
  ProfileCard,
  CurrentProfile,
  RegisterResult,
  SafetyNumber,
  SendMessageRequest,
  ServerInfo,
  SetProfileRequest,
  TypingEvent,
  UpdateGroupRequest,
} from "./types";

const call = <T>(cmd: string, req?: unknown): Promise<T> =>
  invoke<T>(cmd, req === undefined ? undefined : { req }).catch((e: unknown) => {
    reportIfMissingCommand(e);
    throw e;
  });

export const backend = {
  // --- app / onboarding -----------------------------------------------------
  getState: () => call<AppState>("get_state"),
  /** Validates a server URL and returns its info (works for default and custom servers). */
  checkServer: (url: string) => call<ServerInfo>("check_server", { url }),
  register: (req: { server_url: string; password: string; device_name: string }) =>
    call<RegisterResult>("register", req),
  login: (req: { server_url: string; number: string; password: string; device_name: string; totp?: string }) =>
    call<AccountInfo>("login", req),
  recover: (req: {
    server_url: string;
    number: string;
    mnemonic: string[];
    new_password: string;
    device_name: string;
  }) => call<AccountInfo>("recover", req),
  /** Unlinks this device on the server and wipes all local data. */
  logout: () => call<void>("logout"),
  getConnectionState: () => call<ConnectionState>("get_connection_state"),

  // --- device linking by QR code (docs/API.md §13) ---------------------------
  // New device shows the code:   linkCreate → show QR → linkWait (resolves when approved).
  // New device scans a code:     linkClaim(link) → linkWait.
  // Existing device scans:       linkInspect(link) → confirm device name → linkApprove({ link }).
  // Existing device shows code:  linkOffer → show QR → linkOfferWait (device name) → confirm → linkApprove({}).
  // linkCancel aborts a pending linkWait / linkOfferWait. Errors: "gone" = code expired/used,
  // "different_server" = the code belongs to another server.
  linkCreate: (req: { server_url: string; device_name: string }) => call<string>("link_create", req),
  linkClaim: (req: { link: string; device_name: string }) => call<void>("link_claim", req),
  linkWait: () => call<AccountInfo>("link_wait"),
  linkCancel: () => call<void>("link_cancel"),
  linkOffer: () => call<string>("link_offer"),
  linkOfferWait: () => call<string>("link_offer_wait"),
  /** Verification code both screens show (after linkClaim / linkOfferWait). */
  linkCode: () => call<string | null>("link_code"),
  linkInspect: (req: { link: string }) => call<string>("link_inspect", req),
  linkApprove: (req: { link?: string }) => call<void>("link_approve", req),
  /** Checks the account password locally (app lock). */
  verifyPassword: (req: { password: string }) => call<boolean>("verify_password", req),
  /** Opens the password-locked local database (app start). */
  unlock: (req: { password: string }) => call<void>("unlock", req),
  /** Locks the local data with the (checked) account password, or re-locks it with a new one. */
  protectLocalData: (req: { password: string }) => call<void>("protect_local_data", req),
  /**
   * Forgotten password: deletes all local data (emits logged_out with "local_reset").
   * Without a password only while the data is locked; once unlocked the core requires it.
   */
  resetLocalData: (req?: { password: string }) => call<void>("reset_local_data", req),
  /** The user confirmed the recovery phrase; the core forgets it. */
  confirmMnemonicSaved: () => call<void>("confirm_mnemonic_saved"),

  // --- accounts on this computer (native, app/src-tauri/src/profiles.rs) -----
  // Each account has its own local data; one is active at a time. The app starts on the
  // start screen; opening a profile unlocks its data with the password and makes it active
  // (the UI reloads afterwards). Errors: "invalid_password" (also for an unknown number).
  /** Accounts listed on the start screen (hidden ones are not), most recent first. */
  listProfiles: () => call<ProfileCard[]>("profiles_list"),
  openProfile: (req: { id: string; password: string }) => call<void>("profile_open", req),
  /** "Open another account on this computer": finds the profile (hidden too) by full number. */
  openProfileByNumber: (req: { number: string; password: string }) => call<void>("profile_open_by_number", req),
  /** Quick switch to an account opened with its password since the app started (error
   *  "password_required" otherwise). The UI reloads afterwards. */
  switchProfile: (req: { id: string }) => call<void>("profile_switch", req),
  /** Switch account: back to the start screen; the account stays here, locked (not logged out). */
  closeProfile: () => call<void>("profile_close"),
  /** Forgotten password: deletes a (non-active) profile's local data from this computer. */
  forgetProfile: (req: { id: string }) => call<void>("profile_forget", req),
  currentProfile: () => call<CurrentProfile>("profile_current"),
  /** Remote wipe: deletes the saved accounts this device was removed from (ids returned). */
  checkRevoked: () => call<{ wiped: string[] }>("profiles_check_revoked"),
  /** "Show this account on the start screen". */
  setProfileVisible: (req: { visible: boolean }) => call<void>("profile_set_visible", req),

  // --- account --------------------------------------------------------------
  getAccountDetails: () => call<AccountDetails>("get_account_details"),
  changePassword: (req: { old_password: string; new_password: string }) =>
    call<void>("change_password", req),
  deleteAccount: (req: { password: string }) => call<void>("delete_account", req),
  /** Shows the 24-word recovery phrase again after checking the password. */
  revealMnemonic: (req: { password: string }) => call<string[]>("reveal_mnemonic", req),
  setPrivacy: (req: Partial<PrivacySettings>) => call<PrivacySettings>("set_privacy", req),
  /** Do not disturb (synced to our other devices): `until` 0 = off. */
  getDnd: () => call<DndState>("get_dnd"),
  /** `until`: end (ms), 0 = off, DND_FOREVER = until turned off. */
  setDnd: (req: { until: number }) => call<DndState>("set_dnd", req),
  /** Call privacy: allow calls, relay-only calls (synced to our other devices). */
  getCallSettings: () => call<CallSettings>("get_call_settings"),
  /** Absent fields stay as they are. */
  setCallSettings: (req: Partial<CallSettings>) => call<CallSettings>("set_call_settings", req),
  /** Media retention period (1, 7, 14 or 30 days; synced to our other devices). */
  getMediaRetention: () => call<MediaRetention>("get_media_retention"),
  /** Applies at once: older media is erased. Other values are refused. */
  setMediaRetention: (req: { days: number }) => call<MediaRetention>("set_media_retention", req),
  /** Timer of the chats we start and groups we create (seconds, 0 = off; synced to our other devices). */
  getDefaultDisappearing: () => call<DefaultDisappearing>("get_default_disappearing"),
  /** One of the offered timers; existing chats keep their own. Other values are refused. */
  setDefaultDisappearing: (req: { seconds: number }) => call<DefaultDisappearing>("set_default_disappearing", req),
  /** Removes stray and too old media files now. */
  runMediaCheck: () => call<MediaCheck>("run_media_check"),
  /** Last time (ms) a UI reminder was shown, from the encrypted local database. */
  reminderShownAt: (name: string) => call<number | null>("reminder_shown_at", { name }),
  markReminderShown: (name: string) => call<void>("mark_reminder_shown", { name }),
  setBackupEnabled: (req: { enabled: boolean }) => call<void>("set_backup_enabled", req),
  requestPhoneCode: (req: { phone: string }) => call<void>("request_phone_code", req),
  verifyPhone: (req: { phone: string; code: string }) => call<void>("verify_phone", req),
  removePhone: () => call<void>("remove_phone"),
  setDiscoverable: (req: { discoverable: boolean }) => call<void>("set_discoverable", req),
  /** Sets or removes (null) the public username; errors: "conflict" (taken), "invalid_input". */
  setUsername: (req: { username: string | null }) => call<string | null>("set_username", req),
  /** Starts enabling two-step verification: secret (base32) and otpauth:// URI for the QR. */
  totpSetup: () => call<{ secret: string; uri: string }>("totp_setup"),
  totpEnable: (req: { code: string }) => call<void>("totp_enable", req),
  totpDisable: (req: { code: string }) => call<void>("totp_disable", req),
  listDevices: () => call<DeviceInfo[]>("list_devices"),
  unlinkDevice: (req: { device_id: number }) => call<void>("unlink_device", req),
  renameDevice: (req: { name: string }) => call<void>("rename_device", req),
  /** Devices added to the account since this one joined (event: device_alerts). */
  deviceAlerts: () => call<NewDeviceAlert[]>("device_alerts"),
  dismissDeviceAlerts: () => call<void>("dismiss_device_alerts"),
  // Login approval: `login` fails with "approval_required" when the account requires approval
  // of new logins; then loginWaitApproval resolves once another device approved (errors:
  // "login_denied", "gone" = expired/cancelled). loginCancelApproval aborts the wait.
  loginWaitApproval: () => call<AccountInfo>("login_wait_approval"),
  loginCancelApproval: () => call<void>("login_cancel_approval"),
  /** Logins waiting for approval by this account's devices (event: login_requests). */
  listLoginRequests: () => call<LoginRequestInfo[]>("list_login_requests"),
  answerLoginRequest: (req: { id: string; approve: boolean }) => call<void>("answer_login_request", req),
  setLoginApproval: (req: { enabled: boolean }) => call<void>("set_login_approval", req),
  /** Downloads, verifies (signature) and installs the update announced by update_available,
   * then restarts. Errors with "forbidden" in builds without update signing. */
  installUpdate: () => call<void>("update_install"),
  /** Reports an account for spam to the server and (by default) blocks it. */
  reportSpam: (req: { account_id: string; block?: boolean }) => call<Contact>("report_spam", req),
  // Key transparency (docs/KEY-TRANSPARENCY.md); alerts also arrive as the kt_alerts event.
  ktStatus: () => call<KtOverview>("kt_status"),
  /** Checks the contact's key against the log now when it was not verified yet. */
  ktContactStatus: (req: { account_id: string }) => call<KtContactStatus>("kt_contact_status", req),
  ktCheckNow: () => call<KtOverview>("kt_check_now"),
  ktDismissAlerts: () => call<void>("kt_dismiss_alerts"),

  // --- profile --------------------------------------------------------------
  getProfile: () => call<Profile>("get_profile"),
  setProfile: (req: SetProfileRequest) => call<Profile>("set_profile", req),

  // --- contacts -------------------------------------------------------------
  listContacts: () => call<Contact[]>("list_contacts"),
  /** Contacts I have blocked. */
  listBlocked: () => call<Contact[]>("list_blocked"),
  /** Finds an account by 16-digit number or username (with or without "@"); null if none. */
  findAccount: (req: { query: string }) => call<FoundAccount | null>("find_account", req),
  /** Adds a contact found by number or username. */
  addContactByQuery: (req: { query: string; name?: string }) => call<Contact>("add_contact_by_query", req),
  getContact: (req: { account_id: string }) => call<Contact>("get_contact", req),
  /** Looks up an account number on our server and adds it as a contact. */
  addContactByNumber: (req: { number: string; name?: string }) =>
    call<Contact>("add_contact_by_number", req),
  renameContact: (req: { account_id: string; name: string | null }) =>
    call<Contact>("rename_contact", req),
  setBlocked: (req: { account_id: string; blocked: boolean }) => call<Contact>("set_blocked", req),
  /** Imports a .vcf or .csv address book file and matches phone numbers on the server. */
  importContacts: (req: { path: string }) => call<ContactImportResult>("import_contacts", req),
  /** Payload of the "add me" QR code: chatapp://add?n=<number>&s=<server_url> */
  getMyContactLink: () => call<string>("get_my_contact_link"),
  /** Resolves a scanned/pasted contact link (number link or username link);
   *  errors with "different_server" if needed. */
  addContactFromLink: (req: { link: string }) => call<Contact>("add_contact_from_link", req),
  /** Username link / QR (chatapp://u?s=<server>#<key+handle>): carries no account number.
   *  Created on first use; null when no username is set. */
  getUsernameLink: () => call<UsernameLink | null>("get_username_link"),
  /** New username link; links shared before stop working. */
  resetUsernameLink: () => call<UsernameLink | null>("reset_username_link"),
  /** Looks up the account a username link leads to (without adding it). */
  resolveUsernameLink: (req: { link: string }) => call<FoundAccount>("resolve_username_link", req),
  getSafetyNumber: (req: { account_id: string }) => call<SafetyNumber>("get_safety_number", req),
  setVerified: (req: { account_id: string; verified: boolean }) =>
    call<Contact>("set_verified", req),
  watchPresence: (req: { account_ids: string[] }) => call<void>("watch_presence", req),

  // --- conversations --------------------------------------------------------
  listConversations: () => call<Conversation[]>("list_conversations"),
  getConversation: (req: { conversation_id: string }) =>
    call<Conversation>("get_conversation", req),
  /** Opens (or creates) the direct conversation with an account. */
  openDirectConversation: (req: { account_id: string }) =>
    call<Conversation>("open_direct_conversation", req),
  /** Accepts a message request, or joins a group we were added to by a stranger. */
  acceptConversation: (req: { conversation_id: string }) =>
    call<Conversation>("accept_conversation", req),
  setConversationSettings: (req: { conversation_id: string } & ConversationSettingsPatch) =>
    call<Conversation>("set_conversation_settings", req),
  setDraft: (req: { conversation_id: string; draft: string | null }) =>
    call<void>("set_draft", req),
  /** Deletes the local conversation and its messages (does not leave groups). */
  deleteConversation: (req: { conversation_id: string }) => call<void>("delete_conversation", req),
  clearConversation: (req: { conversation_id: string }) => call<void>("clear_conversation", req),
  /** Group admins only: clears the history for every member (the group stays). */
  clearGroupForEveryone: (req: { conversation_id: string; password: string }) => call<void>("clear_group_for_everyone", req),
  /**
   * Direct chat: deleted on both sides (the peer applies it when online). Group: our messages for everyone.
   * Destructive "for everyone" actions require the account password (checked by the core).
   */
  deleteConversationForEveryone: (req: { conversation_id: string; password: string }) =>
    call<void>("delete_conversation_for_everyone", req),
  /** Every conversation, here and for the other side of each one; local data compacted (password required). */
  wipeAllConversations: (req: { password: string }) => call<void>("wipe_all_conversations", req),
  /** Temporary mode: conversations live in memory only and are gone after a restart. */
  getTemporaryMode: () => call<boolean>("get_temporary_mode"),
  /** Turning it on moves existing chats to memory (and off disk); emits conversations_reset. */
  setTemporaryMode: (req: { enabled: boolean }) => call<void>("set_temporary_mode", req),

  // --- messages -------------------------------------------------------------
  /** Newest first when `before` is omitted; returns up to `limit` messages older than `before`. */
  getMessages: (req: { conversation_id: string; before?: number; limit?: number }) =>
    call<Message[]>("get_messages", req),
  sendMessage: (req: SendMessageRequest) => call<Message>("send_message", req),
  editMessage: (req: { message_id: string; text: string; mentions?: Mention[] }) => call<Message>("edit_message", req),
  deleteMessage: (req: { message_id: string; for_everyone: boolean }) =>
    call<void>("delete_message", req),
  react: (req: { message_id: string; emoji: string | null }) => call<Message>("react", req),
  forwardMessages: (req: { message_ids: string[]; conversation_ids: string[] }) =>
    call<void>("forward_messages", req),
  markRead: (req: { conversation_id: string }) => call<void>("mark_read", req),
  sendTyping: (req: { conversation_id: string; typing: boolean }) => call<void>("send_typing", req),

  // --- voice calls (signaling only; media is WebRTC in the UI) ---
  callSignal: (req: CallSignalRequest) => call<void>("call_signal", req),
  recordCall: (req: RecordCallRequest) => call<void>("record_call", req),
  getIceServers: () => call<{ ice_servers: RTCIceServer[]; ttl: number }>("get_ice_servers"),

  // --- group calls (full mesh; signaling only, see crates/chat-core/src/engine/group_calls.rs) ---
  /** Starts a call in a group conversation and rings the members (joins the running call if there is one). */
  groupCallStart: (req: { conversation_id: string; video: boolean }) => call<GroupCallInfo>("group_call_start", req),
  groupCallJoin: (req: { conversation_id: string; call_id: string; video: boolean }) =>
    call<GroupCallInfo>("group_call_join", req),
  groupCallLeave: (req: { conversation_id: string }) => call<void>("group_call_leave", req),
  /** Stops ringing here and on our other devices. */
  groupCallDecline: (req: { conversation_id: string }) => call<void>("group_call_decline", req),
  /** Still in the call (every few seconds); without it the core leaves after a minute. */
  groupCallHeartbeat: (req: { conversation_id: string }) => call<void>("group_call_heartbeat", req),
  /** The call in progress in a group conversation, if any. */
  groupCallState: (req: { conversation_id: string }) => call<GroupCallInfo | null>("group_call_state", req),
  /** WebRTC signaling to one participant (offers only to larger (account, device) pairs). */
  groupCallSignal: (req: GroupCallSignalRequest) => call<void>("group_call_signal", req),
  retryMessage: (req: { message_id: string }) => call<Message>("retry_message", req),
  getMessageInfo: (req: { message_id: string }) => call<MessageInfo>("get_message_info", req),
  /** Every version of an edited message, oldest first (empty if it was never edited). */
  getEditHistory: (req: { message_id: string }) => call<EditVersion[]>("get_edit_history", req),
  downloadAttachment: (req: { message_id: string; attachment_id: string }) =>
    call<void>("download_attachment", req),
  /**
   * View-once media (incoming, unopened only): downloads it if needed, marks it opened everywhere
   * and returns the attachment with its `local_path`. Fails if it was already opened.
   */
  openViewOnce: (req: { message_id: string }) => call<Attachment>("open_view_once", req),
  /** The view-once viewer closed: the local file is securely deleted. */
  viewOnceDone: (req: { message_id: string }) => call<void>("view_once_done", req),
  /** Copies a decrypted attachment to a user chosen path. */
  saveAttachment: (req: { message_id: string; attachment_id: string; dest_path: string }) =>
    call<void>("save_attachment", req),
  searchMessages: (req: { query: string; conversation_id?: string; limit?: number }) =>
    call<Message[]>("search_messages", req),
  /** Media gallery of a conversation (images/videos/files). */
  listMedia: (req: { conversation_id: string; kind: "media" | "files"; limit?: number }) =>
    call<Message[]>("list_media", req),

  // --- groups ---------------------------------------------------------------
  createGroup: (req: CreateGroupRequest) => call<Conversation>("create_group", req),
  getGroupInfo: (req: { conversation_id: string }) => call<GroupInfo>("get_group_info", req),
  updateGroup: (req: UpdateGroupRequest) => call<GroupInfo>("update_group", req),
  addGroupMembers: (req: { conversation_id: string; account_ids: string[] }) =>
    call<GroupInfo>("add_group_members", req),
  removeGroupMember: (req: { conversation_id: string; account_id: string }) =>
    call<GroupInfo>("remove_group_member", req),
  setGroupAdmin: (req: { conversation_id: string; account_id: string; admin: boolean }) =>
    call<GroupInfo>("set_group_admin", req),
  leaveGroup: (req: { conversation_id: string }) => call<void>("leave_group", req),

  // group invite links
  setGroupInvite: (req: { conversation_id: string; enabled: boolean; approval?: boolean; reset?: boolean }) =>
    call<GroupInfo>("set_group_invite", req),
  previewGroupInvite: (req: { link: string }) => call<InvitePreview>("preview_group_invite", req),
  joinGroupByLink: (req: { link: string }) => call<JoinResult>("join_group_by_link", req),
  cancelJoinRequest: (req: { group_id: string }) => call<void>("cancel_join_request", req),
  groupJoinRequests: (req: { conversation_id: string }) => call<JoinRequest[]>("group_join_requests", req),
  approveJoinRequest: (req: { conversation_id: string; account_id: string }) => call<GroupInfo>("approve_join_request", req),
  rejectJoinRequest: (req: { conversation_id: string; account_id: string }) => call<GroupInfo>("reject_join_request", req),
  /** Admins: accounts that can't rejoin by link (removed by an admin, or request rejected). */
  groupBans: (req: { conversation_id: string }) => call<GroupBan[]>("group_bans", req),
  unbanGroupMember: (req: { conversation_id: string; account_id: string }) => call<GroupInfo>("unban_group_member", req),

  // pinned and starred messages (this device only)
  /** seconds: 86400, 604800 or 2592000; null unpins. */
  pinMessage: (req: { message_id: string; seconds: number | null }) => call<Message>("pin_message", req),
  starMessage: (req: { message_id: string; starred: boolean }) => call<Message>("star_message", req),
  pinnedMessages: (req: { conversation_id: string }) => call<Message[]>("pinned_messages", req),
  starredMessages: () => call<Message[]>("starred_messages"),
};

/** Event names emitted by the Rust core. */
export const EVENTS = {
  conversationUpdated: "conversation_updated", // payload: Conversation
  conversationRemoved: "conversation_removed", // payload: { conversation_id: string }
  message: "message", // payload: MessageEvent
  messageDeleted: "message_deleted", // payload: MessageDeletedEvent (removed from the list)
  typing: "typing", // payload: TypingEvent
  presence: "presence", // payload: Presence
  connection: "connection", // payload: ConnectionState
  contactUpdated: "contact_updated", // payload: Contact
  profileUpdated: "profile_updated", // payload: Profile
  devicesChanged: "devices_changed", // payload: null
  groupUpdated: "group_updated", // payload: GroupInfo
  historySync: "history_sync", // payload: HistorySyncEvent
  loggedOut: "logged_out", // payload: LoggedOutEvent
} as const;

export interface EventPayloads {
  conversation_updated: Conversation;
  conversation_removed: { conversation_id: string };
  message: MessageEvent;
  message_deleted: MessageDeletedEvent;
  typing: TypingEvent;
  presence: Presence;
  connection: ConnectionState;
  contact_updated: Contact;
  profile_updated: Profile;
  devices_changed: null;
  group_updated: GroupInfo;
  history_sync: HistorySyncEvent;
  logged_out: LoggedOutEvent;
  message_send_error: MessageSendErrorEvent;
  call_signal: CallSignalEvent;
  /** State of a group call (also its end: `ended`). */
  group_call: GroupCallInfo;
  group_call_signal: GroupCallSignalEvent;
  identity_conflict: IdentityConflictEvent;
  /** The conversation list was replaced wholesale (temporary mode toggled). */
  conversations_reset: null;
  /** The pinned messages of a conversation changed (pinned, unpinned, expired, deleted). */
  pins_changed: { conversation_id: string };
  /** Current list of new-device alerts (empty after dismissing). */
  device_alerts: NewDeviceAlert[];
  /** Current list of logins waiting for approval. */
  login_requests: LoginRequestInfo[];
  /** Current key transparency alerts (empty after dismissing). */
  kt_alerts: KtAlert[];
  /** Do not disturb changed (here, on another device, or synced). */
  dnd_changed: DndState;
  /** Call privacy settings changed (here, on another device, or synced). */
  call_settings_changed: CallSettings;
  /** The media retention period changed (here, on another device, or synced). */
  media_retention_changed: MediaRetention;
  /** The default disappearing timer changed (here, on another device, or synced). */
  default_disappearing_changed: DefaultDisappearing;
  /** A media check ran (at start, after each retention pass, or on demand). */
  media_check: MediaCheck;
  /** A signed update of the desktop app is available (only in builds with updates enabled). */
  update_available: { version: string; notes: string | null };
}

/** A device with a security key that does not belong to the account was refused. */
export interface IdentityConflictEvent {
  account_id: string;
  /** The foreign device claims to be one of ours. */
  own_account: boolean;
  conversation_id: string | null;
}

/** "reoffer": ICE restart of the call in progress (caller -> the device it talks to). */
export type CallSignalKind = "offer" | "answer" | "ice" | "ringing" | "hangup" | "busy" | "media" | "reoffer";

export interface CallSignalRequest {
  /** Peer account (ignored with to_own_devices). */
  account_id: string;
  call_id: string;
  kind: CallSignalKind;
  data?: unknown;
  /** Only this device of the recipient handles the signal. */
  target_device?: number | null;
  /** Send to our own other devices (answered / declined elsewhere). */
  to_own_devices?: boolean;
}

/** "unavailable": the callee does not accept calls. */
export type CallRecordStatus = "answered" | "missed" | "declined" | "busy" | "failed" | "cancelled" | "unavailable";

export interface RecordCallRequest {
  conversation_id: string;
  call_id: string;
  caller_account_id: string;
  status: CallRecordStatus;
  duration_ms: number;
  started_at: number;
}

export interface GroupCallParticipant {
  account_id: string;
  device_id: number;
  /** This very device. */
  me: boolean;
  /** Not a contact, or our relay-only setting: the pair goes through the TURN relay only. */
  relay: boolean;
}

export interface GroupCallInfo {
  group_id: string;
  conversation_id: string;
  call_id: string;
  started_by: string;
  started_at: number;
  video: boolean;
  participants: GroupCallParticipant[];
  /** This device is in the call. */
  joined: boolean;
  /** This device should ring (accepted, unmuted group; not joined or declined yet). */
  ringing: boolean;
  /** The call is over. */
  ended: boolean;
  max_participants: number;
}

export type GroupCallPairKind = "offer" | "answer" | "ice" | "hangup" | "media";

export interface GroupCallSignalRequest {
  conversation_id: string;
  call_id: string;
  account_id: string;
  device_id: number;
  kind: GroupCallPairKind;
  data?: unknown;
}

export interface GroupCallSignalEvent {
  group_id: string;
  conversation_id: string;
  call_id: string;
  account_id: string;
  device_id: number;
  kind: GroupCallPairKind;
  data: Record<string, unknown> | null;
  relay: boolean;
}

export interface CallSignalEvent {
  account_id: string;
  device_id: number;
  /** Direct conversation with the caller (null for signals from our own devices). */
  conversation_id: string | null;
  call_id: string;
  kind: CallSignalKind;
  data: Record<string, unknown> | null;
  from_me: boolean;
  /** The caller is not a contact, or our relay-only setting is on: use iceTransportPolicy
   * "relay" (hides our IP address). */
  relay: boolean;
}

/** A message could not be sent (yet); `final` means it is now marked as failed. */
export interface MessageSendErrorEvent {
  message_id: string;
  error: string;
  attempt: number;
  final: boolean;
}

export function on<K extends keyof EventPayloads>(
  event: K,
  handler: (payload: EventPayloads[K]) => void,
): Promise<UnlistenFn> {
  return listen<EventPayloads[K]>(event, (e) => handler(e.payload));
}

/** Parses "<code>: <message>" errors thrown by commands. */
export function parseError(err: unknown): { code: string; message: string } {
  const s = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
  const idx = s.indexOf(":");
  if (idx > 0 && /^[a-z_]+$/.test(s.slice(0, idx))) {
    return { code: s.slice(0, idx), message: s.slice(idx + 1).trim() };
  }
  return { code: "internal", message: s };
}
