import { useCallSettings } from "../../lib/callSettings";
import { startCall, useCall } from "../../store/calls";
import { startGroupCall, useGroupCall, VIDEO_SUGGESTED_MAX } from "../../store/groupCalls";
import { Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { AdaptiveMenu } from "../../components/Menus";
import { UserAvatar } from "../../components/UserAvatar";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useIsMobile, useLocale } from "../../lib/hooks";
import { disappearingLabel, previewText } from "../../lib/messageText";
import type { Conversation, Message } from "../../lib/types";
import { goBack } from "../../store/actions";
import { setApp, useApp } from "../../store/app";
import { Highlighted } from "../chats/Sidebar";
import { headerActions } from "../chats/dialogs";
import { useSubtitle } from "./subtitle";
import { useChatSearch } from "./uiStore";

/** Search field that replaces the title while searching inside the conversation. */
function ChatSearch({ conv, onClose }: { conv: Conversation; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query.trim(), 250);
  const [results, setResults] = useState<Message[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (debounced.length < 2) {
      queueMicrotask(() => !cancelled && setResults(null));
      return;
    }
    api
      .searchMessages({ query: debounced, conversation_id: conv.id, limit: 40 })
      .then((r) => !cancelled && setResults(r))
      .catch(() => !cancelled && setResults([]));
    return () => {
      cancelled = true;
    };
  }, [debounced, conv.id]);

  return (
    <div className="chat-search">
      <div className="search-box">
        <Icon name="search" size={17} />
        <input
          ref={inputRef}
          value={query}
          placeholder={t("chat.searchIn")}
          aria-label={t("chat.searchIn")}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
          }}
        />
      </div>
      {results && (
        <div className="chat-search-results">
          {results.length === 0 && <div className="list-empty" style={{ padding: 16 }}>{t("chats.noResults")}</div>}
          {results.map((m) => (
            <button
              type="button"
              key={m.id}
              className="chat-search-item"
              onClick={() => {
                setApp({ highlightId: m.id });
                onClose();
              }}
            >
              <span className="chat-search-meta">
                {m.outgoing ? t("common.you") : m.sender_name} · {formatDateTime(m.sent_at, locale)}
              </span>
              <span className="chat-search-text">
                <Highlighted text={previewText(m.kind, m.text, t)} query={debounced} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatHeader({ conv }: { conv: Conversation }) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const sub = useSubtitle(conv);
  const infoOpen = useApp((s) => s.infoOpen);
  const verified = useApp((s) => (conv.peer_account_id ? (s.contacts[conv.peer_account_id]?.verified ?? false) : false));
  const blocked = useApp((s) => (conv.peer_account_id ? (s.contacts[conv.peer_account_id]?.blocked ?? conv.blocked) : conv.blocked));
  const searching = useChatSearch((s) => s.conversationId === conv.id);
  const inOneToOne = useCall((s) => s.call !== null);
  const inGroupCallNow = useGroupCall((s) => s.call !== null);
  const inCall = inOneToOne || inGroupCallNow;
  const groupCallable = conv.kind === "group" && !conv.left;
  // Calls turned off in Settings → Privacy: the buttons stay clickable to explain why.
  const callsOff = !useCallSettings((s) => s.allow_calls);
  const callLabel = (label: string) => (callsOff ? t("call.callsOffHint") : label);
  const bigGroup = (conv.member_count ?? 0) > VIDEO_SUGGESTED_MAX;
  const setSearch = useChatSearch((s) => s.setSearch);
  const setSearching = (on: boolean) => setSearch(on ? conv.id : null);

  return (
    <div className="chat-head">
      {mobile && (
        <button type="button" className="icon-btn" data-size="40" onClick={searching ? () => setSearching(false) : goBack} aria-label={t("common.back")}>
          <Icon name="back" size={21} />
        </button>
      )}
      {searching ? (
        <ChatSearch conv={conv} onClose={() => setSearching(false)} />
      ) : (
        <button
          type="button"
          className="chat-head-main"
          onClick={() => setApp({ infoOpen: true })}
          aria-label={conv.kind === "group" ? t("group.info") : t("contact.info")}
        >
          <UserAvatar name={conv.title} path={conv.avatar_path} seed={conv.id} size={42} group={conv.kind === "group"} />
          <div style={{ minWidth: 0 }}>
            <div className="chat-head-name">
              <span className="truncate">{conv.title}</span>
              {verified && (
                <span className="shield-mark" aria-label={t("safety.verified")}>
                  <Icon name="shield" size={15} />
                </span>
              )}
              {conv.disappearing_seconds > 0 && (
                <span className="timer-chip" title={t("disappearing.title")} aria-label={`${t("disappearing.title")}: ${disappearingLabel(conv.disappearing_seconds, t)}`}>
                  <Icon name="timer" size={13} />
                  {disappearingLabel(conv.disappearing_seconds, t)}
                </span>
              )}
            </div>
            <div className="chat-head-status" data-accent={sub.accent}>
              {sub.text}
            </div>
          </div>
        </button>
      )}
      <div className="chat-head-actions">
        {searching ? (
          !mobile && (
            <button type="button" className="icon-btn" data-size="40" data-tone="muted" onClick={() => setSearching(false)} aria-label={t("common.close")}>
              <Icon name="x" size={19} />
            </button>
          )
        ) : (
          <>
            {conv.kind === "direct" && conv.peer_account_id && !conv.blocked && (
              <Tooltip label={callLabel(t("call.start"))}>
                <button
                  type="button"
                  className="icon-btn"
                  data-size="40"
                  data-tone="muted"
                  onClick={() => void startCall(conv.id)}
                  disabled={inCall}
                  aria-disabled={callsOff}
                  aria-label={t("call.start")}
                >
                  <Icon name="phone" size={19} />
                </button>
              </Tooltip>
            )}
            {conv.kind === "direct" && conv.peer_account_id && !conv.blocked && (
              <Tooltip label={callLabel(t("call.startVideo"))}>
                <button
                  type="button"
                  className="icon-btn"
                  data-size="40"
                  data-tone="muted"
                  onClick={() => void startCall(conv.id, { video: true })}
                  disabled={inCall}
                  aria-disabled={callsOff}
                  aria-label={t("call.startVideo")}
                >
                  <Icon name="video" size={20} />
                </button>
              </Tooltip>
            )}
            {groupCallable && (
              <Tooltip label={callLabel(t("groupCall.start"))}>
                <button
                  type="button"
                  className="icon-btn"
                  data-size="40"
                  data-tone="muted"
                  onClick={() => void startGroupCall(conv.id)}
                  disabled={inCall}
                  aria-disabled={callsOff}
                  aria-label={t("groupCall.start")}
                >
                  <Icon name="phone" size={19} />
                </button>
              </Tooltip>
            )}
            {groupCallable && (
              <Tooltip label={callLabel(bigGroup ? t("groupCall.videoHint", { count: VIDEO_SUGGESTED_MAX }) : t("groupCall.startVideo"))}>
                <button
                  type="button"
                  className="icon-btn"
                  data-size="40"
                  data-tone="muted"
                  onClick={() => void startGroupCall(conv.id, { video: true })}
                  disabled={inCall}
                  aria-disabled={callsOff}
                  aria-label={t("groupCall.startVideo")}
                >
                  <Icon name="video" size={20} />
                </button>
              </Tooltip>
            )}
            {!mobile && (
              <Tooltip label={t("chat.searchIn")}>
                <button type="button" className="icon-btn" data-size="40" data-tone="muted" onClick={() => setSearching(true)} aria-label={t("chat.searchIn")}>
                  <Icon name="search" size={19} />
                </button>
              </Tooltip>
            )}
            {!mobile && (
              <Tooltip label={conv.kind === "group" ? t("group.info") : t("contact.info")}>
                <button
                  type="button"
                  className="icon-btn"
                  data-size="40"
                  data-tone="muted"
                  data-active={infoOpen}
                  onClick={() => setApp({ infoOpen: !infoOpen })}
                  aria-label={conv.kind === "group" ? t("group.info") : t("contact.info")}
                  aria-pressed={infoOpen}
                >
                  <Icon name="panel" size={19} />
                </button>
              </Tooltip>
            )}
            <AdaptiveMenu
              target={
                <button type="button" className="icon-btn" data-size="40" data-tone="muted" aria-label={t("common.more")}>
                  <Icon name="more" size={19} />
                </button>
              }
              actions={[
                ...(mobile
                  ? [{ key: "search", label: t("chat.searchIn"), icon: <Icon name="search" size={18} />, onClick: () => setSearching(true) }]
                  : []),
                ...headerActions(conv, t, blocked),
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}
