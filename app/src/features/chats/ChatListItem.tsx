import { IconBan } from "@tabler/icons-react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { ContextMenu } from "../../components/Menus";
import { UserAvatar } from "../../components/UserAvatar";
import { formatListTime, isMuted } from "../../lib/format";
import { useLocale, useLongPress } from "../../lib/hooks";
import { previewText, systemText } from "../../lib/messageText";
import type { Conversation } from "../../lib/types";
import { openConversation } from "../../store/actions";
import { useApp } from "../../store/app";
import { listActions } from "./dialogs";
import { isRequest } from "../conversation/requestActions";
import { disappearingLabel } from "../../lib/messageText";

function useTypingText(conv: Conversation): string | null {
  const { t } = useTranslation();
  const typing = useApp((s) => s.typing[conv.id]);
  const names = typing ? Object.values(typing).map((x) => x.name) : [];
  if (!names.length) return null;
  if (conv.kind === "direct") return t("presence.typing");
  if (names.length === 1) return t("presence.typingName", { name: names[0] });
  return t("presence.typingMany", { count: names.length });
}

export const ChatListItem = memo(function ChatListItem({ conv, active }: { conv: Conversation; active: boolean }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const verified = useApp((s) => (conv.peer_account_id ? (s.contacts[conv.peer_account_id]?.verified ?? false) : false));
  const typing = useTypingText(conv);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const long = useLongPress((x, y) => setMenu({ x, y }));
  const muted = isMuted(conv);
  const last = conv.last_message;
  // View-once state: from the preview when the core sends it, else from the loaded message.
  const lastViewOnce = useApp((s) => !!last && (last.view_once === true || !!s.messages[last.id]?.view_once));
  const unread = conv.unread_count;

  let preview: React.ReactNode = null;
  let lead: React.ReactNode = null;
  if (typing) {
    preview = <span className="typing">{typing}</span>;
  } else if (conv.draft && !active) {
    preview = (
      <>
        <span className="draft-label">{t("chat.draft")}</span> {conv.draft}
      </>
    );
  } else if (last) {
    const text = last.deleted
      ? last.outgoing
        ? t("message.deletedByYou")
        : t("message.deleted")
      : last.kind === "system"
        ? (last.system && systemText(last.system, t)) || t("message.groupEvent")
        : previewText(last.kind, last.text, t, lastViewOnce ? "view_once" : last.media_expired ? "expired" : null);
    const prefix =
      conv.kind === "group" && !last.deleted && last.kind !== "system" && !last.outgoing && last.sender_name
        ? `${last.sender_name.split(" ")[0]}: `
        : "";
    if (last.outgoing && !last.deleted && last.kind !== "system") {
      if (last.status === "failed") {
        lead = (
          <span className="chat-row-icon" style={{ color: "var(--danger)" }} aria-label={t("status.failed")}>
            <Icon name="alert" size={15} />
          </span>
        );
      } else {
        lead = (
          <span className="chat-row-icon" style={{ color: last.status === "read" ? "var(--accent-text)" : "var(--faint)" }} aria-label={t(`status.${last.status}`)}>
            <Icon name={last.status === "pending" ? "clock" : last.status === "sent" ? "check" : "checks"} size={last.status === "pending" ? 14 : 16} />
          </span>
        );
      }
    }
    preview = (
      <span style={last.deleted ? { fontStyle: "italic" } : undefined}>
        {prefix && <span className="chat-row-prefix">{prefix}</span>}
        {text}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="chat-row"
        data-active={active}
        onClick={() => {
          if (long.consumeClick()) return;
          openConversation(conv.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        {...long.handlers}
      >
        <span className="chat-row-avatar">
          <UserAvatar name={conv.title} path={conv.avatar_path} seed={conv.id} size={50} group={conv.kind === "group"} />
          {conv.disappearing_seconds > 0 && (
            <span className="timer-badge" title={disappearingLabel(conv.disappearing_seconds, t)} aria-label={t("disappearing.title")}>
              <Icon name="timer" size={12} />
            </span>
          )}
        </span>
        <div className="chat-row-body">
          <div className="chat-row-top">
            <span className="chat-row-name">{conv.title}</span>
            {verified && (
              <span className="shield-mark" aria-label={t("safety.verified")}>
                <Icon name="shield" size={14} />
              </span>
            )}
            {last && (
              <span className="chat-row-time" data-unread={unread > 0}>
                {formatListTime(last.sent_at, locale, t)}
              </span>
            )}
          </div>
          <div className="chat-row-bottom">
            {lead}
            {isRequest(conv) && (
              <span className="request-pill">{t(conv.kind === "group" ? "request.groupBadge" : "request.badge")}</span>
            )}
            <span className="chat-row-preview">{preview}</span>
            {conv.blocked && (
              <span className="chat-row-icon" aria-label={t("chat.block.blocked")}>
                <IconBan size={15} />
              </span>
            )}
            {muted && (
              <span className="chat-row-icon" aria-label={t("chat.muted")}>
                <Icon name="mute" size={15} />
              </span>
            )}
            {conv.pinned && !conv.archived && (
              <span className="chat-row-icon" aria-label={t("chat.pinned")}>
                <Icon name="pin" size={15} />
              </span>
            )}
            {unread > 0 && conv.unread_mentions > 0 && (
              <span className="unread-badge mention-badge" aria-label={t("mention.unread")}>
                @
              </span>
            )}
            {unread > 0 && (
              <span className="unread-badge" data-muted={muted}>
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
      </button>
      {menu && <ContextMenu position={menu} onClose={() => setMenu(null)} actions={listActions(conv, t)} title={conv.title} />}
    </>
  );
});
