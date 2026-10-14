import { startCall } from "../../store/calls";
import { startGroupCall } from "../../store/groupCalls";
import { ContactCards } from "./ContactCards";
import { Popover } from "@mantine/core";
import { IconBan, IconStarFilled } from "@tabler/icons-react";
import { lazy, memo, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { QUICK_REACTIONS } from "../../components/emojiData";
import { CheckBox } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { ContextMenu } from "../../components/Menus";
import { StatusTicks } from "../../components/StatusTicks";
import { UserAvatar } from "../../components/UserAvatar";
import i18n from "../../i18n";
import { hueFor } from "../../lib/appearance";
import { api } from "../../lib/api";
import { formatTime, isEmojiOnly, mapsUrl } from "../../lib/format";
import { parseBlocks, type Seg } from "../../lib/richText";
import { MarkdownBlocks } from "./Markdown";
import { useLocale, useLongPress } from "../../lib/hooks";
import { kindLabel, systemText } from "../../lib/messageText";
import { openExternal } from "../../lib/platform";
import type { Mention, Message, QuotedMessage, Reaction } from "../../lib/types";
import { attempt, react, toggleSelect } from "../../store/actions";
import { upsertMessage, useApp } from "../../store/app";
import { ExpiredMedia, FileCard, ImageGrid, VideoAttachment } from "./Attachments";
import { jumpTo, messageActions, openReactionPicker } from "./messageActions";
import { isExpiredAttachment, isImage, isVideo } from "./uiStore";
import { VoicePlayer } from "./VoicePlayer";
import { ViewOnceBody } from "./ViewOnceBubble";
import { openJoinLink } from "../groups/InviteDialogs";

const LocationMap = lazy(() => import("./maps"));

// ---------------------------------------------------------------------------
// pieces
// ---------------------------------------------------------------------------

function Segs({ segs, me }: { segs: Seg[]; me?: string }) {
  return (
    <>
      {segs.map((g, i) => {
        switch (g.t) {
          case "text":
            return <span key={i}>{g.text}</span>;
          case "link":
            return (
              <a
                key={i}
                href={g.href}
                className={g.suspicious ? "link-suspicious" : undefined}
                title={g.suspicious ? `${i18n.t("message.suspiciousLink")}\n${g.href}` : g.href}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (g.href.startsWith("chatapp://join/")) openJoinLink(g.href);
                  else void openExternal(g.href);
                }}
              >
                {g.text}
              </a>
            );
          case "mention":
            return (
              <span key={i} className="mention" data-me={g.accountId === me}>
                {g.text}
              </span>
            );
          case "code":
            return (
              <code key={i} className="fmt-code">
                {g.text}
              </code>
            );
          case "pre":
            return (
              <pre key={i} className="fmt-pre">
                {g.text}
              </pre>
            );
          case "bold":
            return (
              <strong key={i}>
                <Segs segs={g.children} me={me} />
              </strong>
            );
          case "italic":
            return (
              <em key={i}>
                <Segs segs={g.children} me={me} />
              </em>
            );
          case "strike":
            return (
              <s key={i}>
                <Segs segs={g.children} me={me} />
              </s>
            );
        }
      })}
    </>
  );
}

/** Message text with formatting, Markdown, @mentions and links. */
function RichText({ text, mentions }: { text: string; mentions?: Mention[] }) {
  const me = useApp((s) => s.details?.account.account_id);
  const blocks = useMemo(() => parseBlocks(text, mentions ?? []), [text, mentions]);
  // A plain message stays inline text, exactly as before Markdown.
  if (blocks.length === 1 && blocks[0].t === "para") return <Segs segs={blocks[0].segs} me={me} />;
  return <MarkdownBlocks blocks={blocks} inline={(segs) => <Segs segs={segs} me={me} />} />;
}

/** Quoted message inside a bubble (or above the composer). */
export function QuoteBlock({ q, onClick }: { q: QuotedMessage; onClick?: () => void }) {
  const { t } = useTranslation();
  const you = q.sender_name === "You";
  const text = q.text || kindLabel(q.kind, t) || "";
  return (
    <div
      className="reply-block"
      style={onClick ? undefined : { cursor: "default" }}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="reply-who">{you ? t("common.you") : q.sender_name}</div>
        <div className="reply-text">{text}</div>
      </div>
      {q.thumbnail && <img className="reply-thumb" src={q.thumbnail} alt="" />}
    </div>
  );
}

function Meta({ m, overlay }: { m: Message; overlay?: boolean }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const failed = m.outgoing && m.status === "failed";
  return (
    <div className={`bubble-meta${overlay ? " bubble-meta-overlay" : ""}`}>
      {m.starred && (
        <span className="meta-mark" title={t("star.starred")} aria-label={t("star.starred")}>
          <IconStarFilled size={11} />
        </span>
      )}
      {m.pinned_until && (
        <span className="meta-mark" title={t("pin.pinned")} aria-label={t("pin.pinned")}>
          <Icon name="pin" size={12} />
        </span>
      )}
      {m.expires_at && (
        <span style={{ display: "flex" }} title={t("disappearing.title")}>
          <Icon name="clock" size={12} />
        </span>
      )}
      {m.edited_at && !m.deleted && <span>{t("message.edited")}</span>}
      <span>{formatTime(m.sent_at, locale)}</span>
      {m.outgoing && !m.deleted && !failed && <StatusTicks status={m.status} size={15} />}
      {failed && <span className="failed">· {t("status.failed")}</span>}
    </div>
  );
}

/** Why an outgoing message is waiting (neutral) or failed for good (no retry). */
function StatusReason({ m }: { m: Message }) {
  const { t } = useTranslation();
  const name = useApp((s) => s.conversations[m.conversation_id]?.title ?? "");
  if (m.status === "pending" && m.status_reason === "no_devices") {
    return (
      <div className="status-reason">
        <Icon name="clock" size={13} /> {t("message.noDevices", { name: name || t("message.recipient") })}
      </div>
    );
  }
  if (m.status === "failed" && m.status_reason === "account_gone") {
    return (
      <div className="status-reason status-reason-error">
        <Icon name="alert" size={13} /> {t("message.accountGone")}
      </div>
    );
  }
  return null;
}

function QuickReactions({ m, onDone }: { m: Message; onDone: () => void }) {
  const { t } = useTranslation();
  const mine = m.reactions.find((r) => r.is_me)?.emoji;
  return (
    <div className="quick-reactions">
      {QUICK_REACTIONS.map((e) => (
        <button
          type="button"
          key={e}
          data-mine={mine === e}
          onClick={() => {
            onDone();
            void react(m, mine === e ? null : e);
          }}
          aria-label={e}
        >
          {e}
        </button>
      ))}
      <button
        type="button"
        className="more"
        onClick={() => {
          onDone();
          openReactionPicker(m);
        }}
        aria-label={t("message.moreReactions")}
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

/** Reaction pill hanging off the bottom right corner of the bubble ("👍 2"). */
function Reactions({ m }: { m: Message }) {
  const { t } = useTranslation();
  const groups = new Map<string, Reaction[]>();
  for (const r of m.reactions) groups.set(r.emoji, [...(groups.get(r.emoji) ?? []), r]);
  if (!groups.size) return null;
  const total = m.reactions.length;
  return (
    <Popover position="bottom" withinPortal>
      <Popover.Target>
        <button
          type="button"
          className="reactions-pill"
          data-mine={m.reactions.some((r) => r.is_me)}
          onClick={(e) => e.stopPropagation()}
          aria-label={t("message.reactions")}
        >
          <span>{[...groups.keys()].join("")}</span>
          {total > 1 && <span>{total}</span>}
        </button>
      </Popover.Target>
      <Popover.Dropdown p={8} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 210 }}>
          {m.reactions.map((r) => (
            <div key={r.account_id + r.emoji} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 4px" }}>
              <UserAvatar name={r.sender_name} seed={r.account_id} size={28} />
              <div className="flex1">
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.is_me ? t("common.you") : r.sender_name}</div>
                {r.is_me && (
                  <button type="button" className="link-btn" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }} onClick={() => void react(m, null)}>
                    {t("message.tapToRemove")}
                  </button>
                )}
              </div>
              <span style={{ fontSize: 20 }}>{r.emoji}</span>
            </div>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

function LocationBody({ m }: { m: Message }) {
  const { t } = useTranslation();
  const loc = m.location!;
  // Map tiles come from a third-party server, which would learn the area (and our IP):
  // only load them when asked.
  const [showMap, setShowMap] = useState(false);
  return (
    <div className="location-card">
      <div className="location-map">
        {showMap ? (
          <Suspense fallback={null}>
            <LocationMap lat={loc.lat} lng={loc.lng} />
          </Suspense>
        ) : (
          <button
            type="button"
            className="location-map-load"
            title={t("location.mapPrivacy")}
            onClick={(e) => {
              e.stopPropagation();
              setShowMap(true);
            }}
          >
            <Icon name="mappin" size={22} />
            <span>{t("location.showMap")}</span>
          </button>
        )}
      </div>
      <div className="location-info">
        <div className="location-title">{loc.name || t("kinds.location")}</div>
        <div className="location-sub">{loc.address || `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`}</div>
        <button
          type="button"
          className="location-open"
          onClick={(e) => {
            e.stopPropagation();
            void openExternal(mapsUrl(loc.lat, loc.lng));
          }}
        >
          <Icon name="external" size={15} />
          {t("location.openInMaps")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// row
// ---------------------------------------------------------------------------

interface RowProps {
  id: string;
  /** First message of a run from the same sender (larger gap, shows the sender name). */
  first: boolean;
  group: boolean;
  selecting: boolean;
  selected: boolean;
  highlighted: boolean;
}

export const MessageRow = memo(function MessageRow({ id, first, group, selecting, selected, highlighted }: RowProps) {
  const { t } = useTranslation();
  const m = useApp((s) => s.messages[id]);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [reactOpen, setReactOpen] = useState(false);
  const long = useLongPress((x, y) => {
    if (!selecting) setMenu({ x, y });
  });

  if (!m) return null;

  if (m.kind === "system" && m.system) {
    if (m.system.type === "group_call") {
      // Group call history: tap to call the group.
      const missed = !/"joined":true/.test(m.system.value ?? "");
      return (
        <div className="sys-row" style={{ paddingBottom: 6 }}>
          <button type="button" className="sys-note sys-call" data-missed={missed} onClick={() => void startGroupCall(m.conversation_id)}>
            <span>
              <Icon name="users" size={13} />
            </span>
            <span>{systemText(m.system, t)}</span>
          </button>
        </div>
      );
    }
    if (m.system.type === "call") {
      // Call history: tap to call back.
      const missed = m.system.actor_name !== "You" && !/"status":"answered"/.test(m.system.value ?? "");
      return (
        <div className="sys-row" style={{ paddingBottom: 6 }}>
          <button type="button" className="sys-note sys-call" data-missed={missed} onClick={() => void startCall(m.conversation_id)}>
            <span>
              <Icon name="phone" size={13} />
            </span>
            <span>{systemText(m.system, t)}</span>
          </button>
        </div>
      );
    }
    const alert = m.system.type === "identity_mismatch";
    return (
      <div className="sys-row" style={{ paddingBottom: 6 }}>
        <div className="sys-note" data-alert={alert}>
          <span>
            <Icon name={alert ? "alert" : m.system.type === "disappearing_changed" ? "clock" : "lock"} size={13} />
          </span>
          <span>{systemText(m.system, t)}</span>
        </div>
      </div>
    );
  }

  const out = m.outgoing;
  // Media erased by the retention period: one placeholder, no media and no actions.
  const expired = m.attachments.filter(isExpiredAttachment);
  const live = m.attachments.filter((a) => !isExpiredAttachment(a));
  const images = live.filter(isImage);
  const videos = live.filter(isVideo);
  const voice = m.kind === "voice" ? live[0] : undefined;
  const files = live.filter((a) => !isImage(a) && !isVideo(a) && a !== voice);
  const emojiOnly = m.kind === "text" && !m.deleted && !m.reply_to && !!m.text && isEmojiOnly(m.text);
  const media = !m.deleted && !m.view_once && (images.length > 0 || videos.length > 0 || m.kind === "location");
  const showName = group && !out && first;
  const overlayMeta = media && !m.text && m.kind !== "location";
  const hasReactions = !m.deleted && m.reactions.length > 0;

  const onRowClick = () => {
    if (long.consumeClick()) return;
    if (selecting) toggleSelect(m.conversation_id, m.id);
  };

  let body: React.ReactNode;
  if (m.deleted) {
    body = (
      <>
        <div className="bubble-deleted">
          <IconBan size={15} />
          {out ? t("message.deletedByYou") : t("message.deleted")}
        </div>
        <Meta m={m} />
      </>
    );
  } else if (m.view_once) {
    // View-once media: a placeholder, never the media itself (ViewOnceBubble.tsx).
    body = (
      <>
        {m.reply_to && <QuoteBlock q={m.reply_to} onClick={selecting ? undefined : () => jumpTo(m.reply_to!.id)} />}
        <ViewOnceBody m={m} selecting={selecting} />
        <div className="bpad">
          <Meta m={m} />
        </div>
      </>
    );
  } else {
    body = (
      <>
        {m.reply_to && (
          <div className={media ? "bpad" : undefined}>
            <QuoteBlock q={m.reply_to} onClick={selecting ? undefined : () => jumpTo(m.reply_to!.id)} />
          </div>
        )}
        {images.length > 0 && <ImageGrid message={m} attachments={images} locale={i18n.language} />}
        {videos.map((a) => (
          <VideoAttachment key={a.id} message={m} a={a} />
        ))}
        {voice && <VoicePlayer message={m} a={voice} />}
        {expired.length > 0 && (
          <div className="bpad" style={{ paddingTop: 6 }}>
            <ExpiredMedia attachments={expired} voice={m.kind === "voice"} />
          </div>
        )}
        {files.map((a) => (
          <FileCard key={a.id} message={m} a={a} />
        ))}
        {m.kind === "location" && m.location && <LocationBody m={m} />}
        {m.contacts.length > 0 && <ContactCards contacts={m.contacts} />}
        {m.text && (
          <div className={`bubble-text bpad${emojiOnly ? " bubble-text-emoji" : ""}`}>
            <RichText text={m.text} mentions={m.mentions} />
          </div>
        )}
        {overlayMeta ? (
          <Meta m={m} overlay />
        ) : (
          <div className="bpad">
            <Meta m={m} />
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className="msg-row"
      data-out={out}
      data-cont={!first}
      data-reacted={hasReactions}
      data-selectable={selecting}
      data-selected={selected}
      data-highlight={highlighted}
      data-message-id={m.id}
      onClick={onRowClick}
      onContextMenu={(e) => {
        if (selecting) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      {...long.handlers}
    >
      {selecting && (
        <span className="msg-check" aria-label={t("message.select")}>
          <CheckBox on={selected} round />
        </span>
      )}
      <div className="bubble-wrap">
        <div className="bubble" data-out={out} data-media={media} data-emoji={emojiOnly}>
          {showName && (
            <div className="bubble-sender name-color bpad" style={{ ["--h" as string]: hueFor(m.sender_account_id) }}>
              {m.sender_name}
            </div>
          )}
          {m.forwarded && !m.deleted && (
            <div className="bubble-forwarded bpad">
              <Icon name="forward" size={13} /> {t("message.forwarded")}
            </div>
          )}
          {body}
          {hasReactions && <Reactions m={m} />}
          {!selecting && !m.deleted && (
            <div className="bubble-actions" onClick={(e) => e.stopPropagation()}>
              <Popover opened={reactOpen} onChange={setReactOpen} position="top" withinPortal radius={999}>
                <Popover.Target>
                  <button type="button" className="icon-btn" onClick={() => setReactOpen((o) => !o)} aria-label={t("message.react")}>
                    <Icon name="smile" size={16} />
                  </button>
                </Popover.Target>
                <Popover.Dropdown p={4}>
                  <QuickReactions m={m} onDone={() => setReactOpen(false)} />
                </Popover.Dropdown>
              </Popover>
              <button
                type="button"
                className="icon-btn"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenu({ x: r.left, y: r.bottom });
                }}
                aria-label={t("common.more")}
              >
                <Icon name="more" size={16} />
              </button>
            </div>
          )}
        </div>
        {out && <StatusReason m={m} />}
        {m.status === "failed" && out && m.status_reason !== "account_gone" && (
          <button
            type="button"
            className="retry-link"
            onClick={(e) => {
              e.stopPropagation();
              void attempt(async () => upsertMessage(await api.retryMessage({ message_id: m.id })));
            }}
          >
            <Icon name="alert" size={13} /> {t("message.notSent")}
          </button>
        )}
      </div>
      {menu && (
        <ContextMenu
          position={menu}
          onClose={() => setMenu(null)}
          header={!m.deleted ? <QuickReactions m={m} onDone={() => setMenu(null)} /> : undefined}
          actions={messageActions(m, t)}
        />
      )}
    </div>
  );
});
