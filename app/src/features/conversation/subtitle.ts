import { useTranslation } from "react-i18next";
import { formatLastSeen } from "../../lib/format";
import { useLocale, useNow } from "../../lib/hooks";
import type { Conversation } from "../../lib/types";
import { useApp } from "../../store/app";

/** Status line under a conversation title: typing, online / last seen, or the group members. */
export function useSubtitle(conv: Conversation): { text: string; accent: boolean } {
  const { t } = useTranslation();
  const locale = useLocale();
  useNow(60_000);
  const typing = useApp((s) => s.typing[conv.id]);
  const presence = useApp((s) => (conv.peer_account_id ? s.presence[conv.peer_account_id] : undefined));
  const group = useApp((s) => s.groups[conv.id]);
  const names = typing ? Object.values(typing).map((x) => x.name) : [];

  if (names.length) {
    if (conv.kind === "direct") return { text: t("presence.typing"), accent: true };
    if (names.length === 1) return { text: t("presence.typingName", { name: names[0] }), accent: true };
    return { text: t("presence.typingMany", { count: names.length }), accent: true };
  }
  if (conv.kind === "group") {
    if (conv.left) return { text: t("group.notMember"), accent: false };
    if (group?.members_hidden) return { text: t("group.members", { count: group.member_count }), accent: false };
    if (group) {
      // Others first, "You" last (like the design: "Luca, Elena, Maria, Tu").
      const list = group.members
        .slice()
        .sort((a, b) => Number(a.is_me) - Number(b.is_me))
        .map((m) => (m.is_me ? t("common.you") : m.display_name === "Member" ? t("groupRules.unnamed") : m.display_name.split(" ")[0]));
      return { text: list.join(", "), accent: false };
    }
    return { text: t("group.members", { count: conv.member_count ?? 0 }), accent: false };
  }
  if (conv.blocked) return { text: t("chat.block.blocked"), accent: false };
  if (presence?.online) return { text: t("presence.online"), accent: true };
  if (presence?.last_seen) return { text: formatLastSeen(presence.last_seen, locale, t), accent: false };
  return { text: t("chat.tapForInfo"), accent: false };
}
