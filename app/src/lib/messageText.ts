import type { TFunction } from "i18next";
import { plainText } from "./richText";
import type { MessageKind, SystemEvent } from "./types";

/** Short text for chat list previews, notifications and quotes. */
export function kindLabel(kind: MessageKind, t: TFunction): string {
  switch (kind) {
    case "image":
      return t("kinds.photo");
    case "video":
      return t("kinds.video");
    case "file":
      return t("kinds.file");
    case "voice":
      return t("kinds.voice");
    case "location":
      return t("kinds.location");
    case "contact":
      return t("kinds.contact");
    default:
      return "";
  }
}

export function previewText(kind: MessageKind, raw: string | null, t: TFunction, viewOnce?: string | null): string {
  // Media erased by the retention period: the caption if there was one, else a placeholder.
  if (viewOnce === "expired" && !raw) return t(kind === "voice" ? "retention.voiceExpired" : "retention.mediaExpired");
  // View-once media: "View-once photo", "Voice message · view once" (never a caption: view-once messages have no text).
  if (viewOnce && (kind === "image" || kind === "video" || kind === "voice"))
    return t(kind === "voice" ? "viewOnce.voice" : kind === "video" ? "viewOnce.video" : "viewOnce.photo");
  // Previews and notifications show the text without formatting markers.
  const text = raw ? plainText(raw) : raw;
  if (kind === "text") return text ?? "";
  if (kind === "file" || kind === "location") return text || kindLabel(kind, t);
  return text ? text : kindLabel(kind, t);
}

/**
 * Wraps a name chosen by someone else in a bidi isolate (FSI…PDI), so right-to-left text in
 * it cannot reorder the sentence around it.
 */
export const isolate = (name: string): string => `\u2068${name}\u2069`;

/** The event is about us alone ("X added you"). */
const onlyYou = (list: string[]) => list.length === 1 && list[0] === "You";

function names(list: string[], t: TFunction): string {
  const mapped = list.map((n) => (n === "You" ? t("common.you") : isolate(n)));
  if (mapped.length <= 1) return mapped.join("");
  return `${mapped.slice(0, -1).join(", ")} ${t("common.and")} ${mapped[mapped.length - 1]}`;
}

/** Timers offered for disappearing messages, shortest first: [seconds, locale key]. */
export const DISAPPEARING_OPTIONS: readonly (readonly [number, string])[] = [
  [0, "off"],
  [10 * 60, "m10"],
  [3_600, "h1"],
  [3 * 3_600, "h3"],
  [6 * 3_600, "h6"],
  [12 * 3_600, "h12"],
  [86_400, "h24"],
  [7 * 86_400, "d7"],
  [90 * 86_400, "d90"],
];

export function disappearingLabel(seconds: number, t: TFunction): string {
  if (!seconds) return t("disappearing.off");
  // The smallest offered timer that is at least `seconds` (other clients may set any value).
  const key = DISAPPEARING_OPTIONS.find(([s]) => s > 0 && seconds <= s)?.[1] ?? "d90";
  return t(`disappearing.${key}`);
}

export function systemText(s: SystemEvent, t: TFunction): string {
  const actor = s.actor_name === "You" ? t("common.you") : s.actor_name != null ? isolate(s.actor_name) : t("common.someone");
  const targets = names(s.target_names, t);
  const you = s.actor_name === "You";
  switch (s.type) {
    case "group_created":
      return t(you ? "system.groupCreatedYou" : "system.groupCreated", { actor, name: isolate(s.value ?? "") });
    case "group_member_added":
      return t(onlyYou(s.target_names) ? "system.memberAddedYou" : "system.memberAdded", { actor, targets });
    case "group_member_unverified":
      return t("system.memberUnverified", { targets });
    case "group_member_removed":
      return t(onlyYou(s.target_names) ? "system.memberRemovedYou" : "system.memberRemoved", { actor, targets });
    case "group_member_joined_link":
      return t(you ? "system.joinedLinkYou" : "system.joinedLink", { actor });
    case "group_member_left":
      return t(you ? "system.memberLeftYou" : "system.memberLeft", { actor });
    case "group_renamed":
      return t("system.renamed", { actor, name: isolate(s.value ?? "") });
    case "group_avatar_changed":
      return t("system.avatarChanged", { actor });
    case "group_admin_granted":
      return t("system.adminGranted", { actor, targets });
    case "group_admin_revoked":
      return t("system.adminRevoked", { actor, targets });
    case "group_history_cleared":
      return t(you ? "system.historyClearedYou" : "system.historyCleared", { actor });
    case "disappearing_changed": {
      const secs = Number(s.value ?? 0);
      return secs
        ? t(you ? "system.disappearingOnYou" : "system.disappearingOn", { actor, duration: disappearingLabel(secs, t) })
        : t(you ? "system.disappearingOffYou" : "system.disappearingOff", { actor });
    }
    case "identity_changed":
      return t("system.identityChanged", { actor });
    case "contact_joined":
      return t("system.contactJoined", { actor });
    case "call":
      return callText(s.value, you, t);
    case "group_call":
      return groupCallText(s.value, actor, you, t);
    case "identity_mismatch":
      return t("system.identityMismatch", { actor });
    case "decryption_failed":
      return t("system.decryptionFailed", { actor });
    default:
      return "";
  }
}

/** Group call history entry: "Group call · 12:05" (joined) or "Ana started a group call". */
function groupCallText(value: string | null, actor: string, you: boolean, t: TFunction): string {
  let duration = 0;
  let joined = false;
  try {
    const v = JSON.parse(value ?? "{}") as { duration_ms?: number; joined?: boolean };
    duration = v.duration_ms ?? 0;
    joined = v.joined === true;
  } catch {
    // Unknown format: shown as a call we did not join.
  }
  if (joined) {
    const mins = Math.floor(duration / 60_000);
    const secs = Math.floor((duration % 60_000) / 1000);
    return t("groupCall.history.joined", { duration: `${mins}:${String(secs).padStart(2, "0")}` });
  }
  return you ? t("groupCall.history.startedByYou") : t("groupCall.history.missed", { actor });
}

/** Call history entry: "Outgoing voice call · 1:05", "Missed voice call", ... */
function callText(value: string | null, outgoing: boolean, t: TFunction): string {
  let status = "missed";
  let duration = 0;
  try {
    const v = JSON.parse(value ?? "{}") as { status?: string; duration_ms?: number };
    status = v.status ?? status;
    duration = v.duration_ms ?? 0;
  } catch {
    // Unknown format: show it as a missed call.
  }
  if (status === "answered") {
    const mins = Math.floor(duration / 60_000);
    const secs = Math.floor((duration % 60_000) / 1000);
    const length = `${mins}:${String(secs).padStart(2, "0")}`;
    return t(outgoing ? "call.history.outgoing" : "call.history.incoming", { duration: length });
  }
  if (outgoing) {
    if (status === "declined") return t("call.history.declinedByPeer");
    if (status === "unavailable") return t("call.history.notAccepted");
    if (status === "busy") return t("call.history.busy");
    if (status === "failed") return t("call.history.failed");
    return t("call.history.noAnswer");
  }
  if (status === "declined") return t("call.history.declinedByYou");
  if (status === "failed") return t("call.history.failed");
  return t("call.history.missed");
}
