import { Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconArchive, IconLink, IconMoonStars, IconStar } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";
import { Icon } from "../../components/Icon";
import { AdaptiveMenu } from "../../components/Menus";
import { UserAvatar } from "../../components/UserAvatar";
import { api } from "../../lib/api";
import { formatListTime } from "../../lib/format";
import { useIsMobile, useLocale } from "../../lib/hooks";
import { isolate, previewText } from "../../lib/messageText";
import type { Conversation, Message } from "../../lib/types";
import { openConversation, openSettings } from "../../store/actions";
import { setApp, useApp, type ChatFilter } from "../../store/app";
import { accountQueryKind } from "./accountLookup";
import { AccountLookupRow } from "./AccountLookupRow";
import { ChatListItem } from "./ChatListItem";
import { openMyQr } from "./MyQrModal";
import { NewChatPane } from "./NewChatPane";
import { NewGroupPane } from "./NewGroupPane";
import { StarredPane } from "./StarredPane";
import { openJoinLink } from "../groups/InviteDialogs";
import { isRequest } from "../conversation/requestActions";
import { dndUntilText, useDnd } from "../../lib/dnd";
import { toggleDnd } from "../settings/dndDialog";

/** Left pane: the chat list, or the "new chat" / "new group" flows. */
export function Sidebar() {
  const sidebar = useApp((s) => s.sidebar);
  if (sidebar === "new_chat") return <NewChatPane />;
  if (sidebar === "new_group") return <NewGroupPane />;
  if (sidebar === "starred") return <StarredPane />;
  return <ChatsPane />;
}

function sortConversations(list: Conversation[]): Conversation[] {
  return list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const ta = a.last_message?.sent_at ?? a.updated_at;
    const tb = b.last_message?.sent_at ?? b.updated_at;
    return tb - ta;
  });
}

function ChatsPane() {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const conversations = useApp((s) => s.conversations);
  const activeId = useApp((s) => s.activeId);
  const filter = useApp((s) => s.chatFilter);
  const temporary = useApp((s) => s.temporaryMode);
  const dndUntil = useDnd((s) => s.until);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const counts = useMemo(() => {
    const all = Object.values(conversations);
    return {
      archived: all.filter((c) => c.archived).length,
      unread: all.filter((c) => !c.archived && c.unread_count > 0).length,
      requests: all.filter(isRequest).length,
    };
  }, [conversations]);

  const list = useMemo(() => {
    const all = Object.values(conversations);
    let out: Conversation[];
    const digits = /^[\d\s-]+$/.test(q) ? q.replace(/\D/g, "") : "";
    if (q) out = all.filter((c) => c.title.toLowerCase().includes(q) || (!!digits && !!c.peer_number?.includes(digits)));
    else if (filter === "archived") out = all.filter((c) => c.archived);
    else if (filter === "unread") out = all.filter((c) => !c.archived && c.unread_count > 0);
    else if (filter === "groups") out = all.filter((c) => !c.archived && c.kind === "group");
    else if (filter === "requests") out = all.filter(isRequest);
    else out = all.filter((c) => !c.archived);
    return sortConversations(out);
  }, [conversations, filter, q]);

  const filters: { key: ChatFilter; count?: number }[] = [
    { key: "all" },
    { key: "unread", count: counts.unread },
    { key: "groups" },
    { key: "archived", count: counts.archived },
  ];
  // Message requests get their own filter while there are any (they also stay in "all").
  if (counts.requests > 0 || filter === "requests") filters.splice(1, 0, { key: "requests", count: counts.requests });

  return (
    <>
      <div className="list-head">
        <div className="list-title">
          {t("chats.title")}
          {temporary && (
            <Tooltip label={t("temporary.badgeHint")}>
              <span className="temp-pill" onClick={() => openSettings("privacy")}>
                {t("temporary.badge")}
              </span>
            </Tooltip>
          )}
          {dndUntil > 0 && (
            <Tooltip label={`${t("dnd.on")} · ${dndUntilText(dndUntil)}`}>
              <button type="button" className="dnd-pill" onClick={() => openSettings("notifications")} aria-label={t("dnd.on")}>
                <IconMoonStars size={13} />
                {t("dnd.badge")}
              </button>
            </Tooltip>
          )}
        </div>
        <div className="list-head-actions">
          <Tooltip label={t("newChat.title")}>
            <button type="button" className="icon-btn" onClick={() => setApp({ sidebar: "new_chat" })} aria-label={t("newChat.title")}>
              <Icon name="edit" size={19} />
            </button>
          </Tooltip>
          <AdaptiveMenu
            target={
              <button type="button" className="icon-btn" aria-label={t("common.more")}>
                <Icon name="more" size={19} />
              </button>
            }
            actions={[
              { key: "group", label: t("newGroup.title"), icon: <Icon name="users" size={18} />, onClick: () => setApp({ sidebar: "new_group" }) },
              { key: "qr", label: t("qr.myCode"), icon: <Icon name="qr" size={18} />, onClick: () => openMyQr() },
              { key: "scan", label: t("qr.scan"), icon: <Icon name="scan" size={18} />, onClick: () => openMyQr("scan") },
              { key: "join", label: t("invite.joinTitle"), icon: <IconLink size={18} />, onClick: () => openJoinLink() },
              {
                key: "dnd",
                label: dndUntil > 0 ? t("dnd.turnOff") : t("dnd.menu"),
                icon: <IconMoonStars size={18} />,
                onClick: toggleDnd,
              },
              { key: "starred", label: t("star.title"), icon: <IconStar size={18} />, onClick: () => setApp({ sidebar: "starred" }) },
              {
                key: "archived",
                label: t("chats.filter.archived"),
                icon: <IconArchive size={18} />,
                onClick: () => setApp({ chatFilter: "archived" }),
              },
              { key: "settings", label: t("settings.title"), icon: <Icon name="gear" size={18} />, onClick: () => openSettings(mobile ? null : "account") },
            ]}
          />
        </div>
      </div>
      <div className="list-search">
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            placeholder={t("chats.search")}
            value={query}
            aria-label={t("chats.search")}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          />
          {query && (
            <button type="button" className="icon-btn" onClick={() => setQuery("")} aria-label={t("common.clear")}>
              <Icon name="x" size={15} />
            </button>
          )}
        </div>
      </div>
      {!q && (
        <div className="filters" role="tablist">
          {filters.map(({ key, count }) => (
            <button
              type="button"
              key={key}
              role="tab"
              aria-selected={filter === key}
              className="chip"
              data-active={filter === key}
              onClick={() => setApp({ chatFilter: key })}
            >
              {t(`chats.filter.${key}`)}
              {!!count && <span className="chip-count">{count}</span>}
            </button>
          ))}
        </div>
      )}
      {q && <div style={{ height: 8 }} />}
      <div className="list-body">
        {q ? (
          <SearchResults query={q} raw={query.trim()} conversations={list} activeId={activeId} onClear={() => setQuery("")} />
        ) : list.length === 0 ? (
          <EmptyList filter={filter} />
        ) : (
          <Virtuoso
            style={{ height: "100%" }}
            data={list}
            computeItemKey={(_, c) => c.id}
            itemContent={(_, c) => <ChatListItem conv={c} active={c.id === activeId && !mobile} />}
            components={{ Footer: ListFooter }}
          />
        )}
      </div>
    </>
  );
}

function ListFooter() {
  const { t } = useTranslation();
  return (
    <div className="list-footer lock-note">
      <Icon name="lock" size={13} />
      {t("chats.e2eFooter")}
    </div>
  );
}

function EmptyList({ filter }: { filter: ChatFilter }) {
  const { t } = useTranslation();
  return (
    <div className="list-empty">
      <span>{t(`chats.empty.${filter}`)}</span>
      {filter !== "all" && (
        <button type="button" className="link-btn" onClick={() => setApp({ chatFilter: "all" })}>
          {t("chats.showAll")}
        </button>
      )}
    </div>
  );
}

function SearchResults({
  query,
  raw,
  conversations,
  activeId,
  onClear,
}: {
  query: string;
  raw: string;
  conversations: Conversation[];
  activeId: string | null;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const convs = useApp((s) => s.conversations);
  const [debounced] = useDebouncedValue(query, 250);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (debounced.length < 2) {
      queueMicrotask(() => !cancelled && setMessages([]));
      return;
    }
    api
      .searchMessages({ query: debounced, limit: 50 })
      .then((res) => !cancelled && setMessages(res))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <div className="pane-scroll" style={{ height: "100%" }}>
      <AccountLookupRow query={raw} onOpened={onClear} />
      {conversations.length > 0 && <div className="section-label">{t("chats.searchChats")}</div>}
      {conversations.map((c) => (
        <ChatListItem key={c.id} conv={c} active={c.id === activeId} />
      ))}
      {messages.length > 0 && <div className="section-label">{t("chats.searchMessages")}</div>}
      {messages.map((m) => {
        const c = convs[m.conversation_id];
        if (!c) return null;
        return (
          <button
            type="button"
            key={m.id}
            className="chat-row"
            onClick={() => {
              openConversation(c.id);
              setApp({ highlightId: m.id });
            }}
          >
            <UserAvatar name={c.title} path={c.avatar_path} seed={c.id} size={50} group={c.kind === "group"} />
            <div className="chat-row-body">
              <div className="chat-row-top">
                <span className="chat-row-name">{c.title}</span>
                <span className="chat-row-time">{formatListTime(m.sent_at, locale, t)}</span>
              </div>
              <div className="chat-row-bottom">
                <span className="chat-row-preview">
                  {m.outgoing ? `${t("common.you")}: ` : c.kind === "group" ? `${isolate(m.sender_name)}: ` : ""}
                  <Highlighted text={previewText(m.kind, m.text, t)} query={query} />
                </span>
              </div>
            </div>
          </button>
        );
      })}
      {conversations.length === 0 && messages.length === 0 && !(accountQueryKind(raw) === "number" || accountQueryKind(raw) === "phone" || raw.startsWith("@")) && (
        <div className="list-empty">{t("chats.noResults")}</div>
      )}
    </div>
  );
}

export function Highlighted({ text, query }: { text: string; query: string }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}
