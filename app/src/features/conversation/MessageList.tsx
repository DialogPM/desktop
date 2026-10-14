// Virtualized, bottom-anchored message list with upward infinite scroll.

import { Center, Loader } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { Icon } from "../../components/Icon";
import { dayKey, formatDaySeparator } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import type { Message } from "../../lib/types";
import { loadOlder } from "../../store/actions";
import { getApp, setApp, useApp } from "../../store/app";
import { MessageRow } from "./MessageBubble";

type Row =
  | { type: "e2e"; key: string }
  | { type: "day"; key: string; ts: number }
  | { type: "msg"; key: string; first: boolean };

const BASE_INDEX = 1_000_000;
const GROUP_GAP_MS = 10 * 60_000;

function buildRows(ids: string[], messages: Record<string, Message>, complete: boolean): Row[] {
  const rows: Row[] = [];
  if (complete && ids.length === 0) rows.push({ type: "e2e", key: "e2e" });
  let prev: Message | null = null;
  for (const id of ids) {
    const m = messages[id];
    if (!m) continue;
    const newDay = !prev || dayKey(prev.sent_at) !== dayKey(m.sent_at);
    if (newDay) rows.push({ type: "day", key: `day-${m.id}`, ts: m.sent_at });
    // The encryption notice sits under the first date, at the very start of the history.
    if (!prev && complete) rows.push({ type: "e2e", key: "e2e" });
    const first =
      newDay ||
      !prev ||
      prev.kind === "system" ||
      prev.sender_account_id !== m.sender_account_id ||
      prev.outgoing !== m.outgoing ||
      m.sent_at - prev.sent_at > GROUP_GAP_MS;
    rows.push({ type: "msg", key: m.id, first });
    prev = m;
  }
  return rows;
}

function TypingFooter({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const typing = useApp((s) => s.typing[conversationId]);
  const kind = useApp((s) => s.conversations[conversationId]?.kind);
  const names = typing ? Object.values(typing).map((x) => x.name) : [];
  let text = t("presence.typing");
  if (kind === "group" && names.length === 1) text = t("presence.typingName", { name: names[0] });
  else if (kind === "group" && names.length > 1) text = t("presence.typingMany", { count: names.length });
  return (
    <div className="msg-lane" style={{ paddingBottom: 22 }}>
      {names.length > 0 && (
        <div className="typing-bubble" aria-live="polite">
          {text}
        </div>
      )}
    </div>
  );
}

export function MessageList({ conversationId, group }: { conversationId: string; group: boolean }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const cm = useApp((s) => s.convMessages[conversationId]);
  const messages = useApp((s) => s.messages);
  const selection = useApp((s) => s.selection);
  const highlightId = useApp((s) => s.highlightId);
  const unread = useApp((s) => s.conversations[conversationId]?.unread_count ?? 0);
  const virtuoso = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  // Whether the view should stay pinned to the newest message. Updated only by scroll events,
  // which content growth (images, maps loading) does not trigger, so late-growing rows keep
  // the list at the bottom unless the user scrolled up.
  const stickRef = useRef(true);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!scroller) return;
    const onScroll = () => {
      stickRef.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [scroller]);
  useEffect(() => {
    stickRef.current = true;
  }, [conversationId]);
  const [flash, setFlash] = useState<string | null>(null);

  const ids = cm?.ids;
  const complete = !!cm?.loaded && !cm.hasMore;
  const rows = useMemo(() => buildRows(ids ?? [], messages, complete), [ids, messages, complete]);

  // Keep the scroll position stable when older pages are prepended: Virtuoso needs
  // firstItemIndex to decrease by the number of rows inserted at the top.
  const firstMsg = rows.find((r) => r.type === "msg")?.key ?? null;
  const firstMsgIndex = firstMsg ? rows.findIndex((r) => r.key === firstMsg) : -1;
  const [anchor, setAnchor] = useState({ key: firstMsg, index: firstMsgIndex, first: BASE_INDEX - rows.length });
  if (anchor.key !== firstMsg || anchor.index !== firstMsgIndex) {
    const moved = anchor.key ? rows.findIndex((r) => r.key === anchor.key) : -1;
    const delta = moved >= 0 && anchor.index >= 0 ? moved - anchor.index : 0;
    setAnchor({ key: firstMsg, index: firstMsgIndex, first: anchor.first - Math.max(0, delta) });
  }

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const startReached = useCallback(() => {
    void loadOlder(conversationId);
  }, [conversationId]);

  // Jump to a message (reply quote click, search result): load older pages until it is found.
  useEffect(() => {
    if (!highlightId) return;
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < 25 && !cancelled; i++) {
        const s = getApp();
        const list = s.convMessages[conversationId];
        if (!list?.loaded) {
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }
        if (list.ids.includes(highlightId)) {
          // Give React a moment to render the rows of the page that was just loaded.
          await new Promise((r) => setTimeout(r, 60));
          const idx = rowsRef.current.findIndex((r) => r.key === highlightId);
          if (idx >= 0) virtuoso.current?.scrollToIndex({ index: idx, align: "center", behavior: "auto" });
          setFlash(highlightId);
          window.setTimeout(() => !cancelled && setFlash(null), 1800);
          break;
        }
        if (!list.hasMore) break;
        const n = await loadOlder(conversationId);
        if (n === 0 && !getApp().convMessages[conversationId]?.hasMore) break;
      }
      setApp({ highlightId: null });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [highlightId, conversationId]);

  if (!cm?.loaded) {
    return (
      <Center className="message-list">
        <Loader />
      </Center>
    );
  }

  const selecting = selection?.conversationId === conversationId;
  const selectedIds = selecting ? selection.ids : [];

  return (
    <div className="message-list">
      <Virtuoso
        ref={virtuoso}
        style={{ height: "100%" }}
        data={rows}
        firstItemIndex={anchor.first}
        initialTopMostItemIndex={Math.max(0, rows.length - 1)}
        alignToBottom
        followOutput={(bottom) => (bottom ? "smooth" : false)}
        atBottomStateChange={setAtBottom}
        scrollerRef={(el) => setScroller(el instanceof HTMLElement ? el : null)}
        totalListHeightChanged={() => {
          if (stickRef.current) virtuoso.current?.scrollToIndex({ index: "LAST", align: "end" });
        }}
        atBottomThreshold={80}
        startReached={startReached}
        increaseViewportBy={{ top: 800, bottom: 400 }}
        computeItemKey={(_, row) => row.key}
        components={{
          Header: () =>
            cm.loading && cm.hasMore ? (
              <Center py="sm">
                <Loader size="sm" />
              </Center>
            ) : (
              <div style={{ height: 8 }} />
            ),
          Footer: () => <TypingFooter conversationId={conversationId} />,
        }}
        itemContent={(_, row) => {
          if (row.type === "e2e") {
            return (
              <div className="msg-lane">
                <div className="sys-row" data-e2e="true">
                  <div className="sys-note">
                    <span>
                      <Icon name="lock" size={13} />
                    </span>
                    <span>{t("chat.e2eNotice")}</span>
                  </div>
                </div>
              </div>
            );
          }
          if (row.type === "day") {
            return (
              <div className="msg-lane">
                <div className="day-row">
                  <span className="day-pill">{formatDaySeparator(row.ts, locale, t)}</span>
                </div>
              </div>
            );
          }
          return (
            <div className="msg-lane">
              <MessageRow
                id={row.key}
                first={row.first}
                group={group}
                selecting={selecting}
                selected={selectedIds.includes(row.key)}
                highlighted={flash === row.key}
              />
            </div>
          );
        }}
      />
      {!atBottom && (
        <button
          type="button"
          className="scroll-bottom-btn"
          onClick={() => virtuoso.current?.scrollToIndex({ index: rows.length - 1, align: "end", behavior: "smooth" })}
          aria-label={t("chat.scrollToBottom")}
        >
          <Icon name="chevron" size={20} style={{ transform: "rotate(90deg)" }} />
          {unread > 0 && <span className="unread-badge">{unread}</span>}
        </button>
      )}
    </div>
  );
}
