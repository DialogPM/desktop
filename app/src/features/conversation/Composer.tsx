import { Popover, Tooltip } from "@mantine/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmojiPicker } from "../../components/EmojiPicker";
import { UserAvatar } from "../../components/UserAvatar";
import { Icon } from "../../components/Icon";
import { AdaptiveMenu } from "../../components/Menus";
import { api } from "../../lib/api";
import { useIsMobile, useLocale } from "../../lib/hooks";
import { collectMentions, filterCandidates, mentionQuery, picksFromMentions, wrapSelection, type MentionPick } from "../../lib/mentions";
import { disappearingLabel, kindLabel } from "../../lib/messageText";
import { pickedFromFile, pickFiles, type PickedFile } from "../../lib/platform";
import type { Conversation, Mention, OutgoingAttachment } from "../../lib/types";
import { sendMessage, sendText } from "../../store/actions";
import { getApp, setComposing, useApp } from "../../store/app";
import { memberName } from "../info/GroupInfoView";
import { ImageAnnotator } from "./ImageAnnotator";
import { LocationPicker } from "./LocationPicker";
import { imageAttachment, isImageFile, isVideoFile, rejectTooBig, releasePicked } from "./outgoingMedia";
import { ShareContactsDialog } from "./ShareContactsDialog";
import { QuoteBlock } from "./MessageBubble";
import { useComposerImages, useSendMedia } from "./uiStore";
import { VoiceRecorder } from "./VoiceRecorder";

const TYPING_REFRESH_MS = 3000;
const TYPING_IDLE_MS = 4000;
const DRAFT_DELAY_MS = 800;

const nowMs = () => Date.now();
const NO_IMAGES: PickedFile[] = [];

export function Composer({ conv }: { conv: Conversation }) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const comp = useApp((s) => s.composing[conv.id]);
  const typingEnabled = useApp(
    (s) => s.details?.privacy.typing_indicators ?? true,
  );
  const openSendMedia = useSendMedia((s) => s.open);
  const locale = useLocale();
  // Pasted / dropped images waiting to be sent with the text (chips above the field).
  const images = useComposerImages((s) => s.byConv[conv.id]) ?? NO_IMAGES;
  const [annotating, setAnnotating] = useState<PickedFile | null>(null);
  const [text, setText] = useState(conv.draft ?? "");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);
  const typingTimer = useRef(0);
  const draftTimer = useRef(0);
  const latestText = useRef(text);

  // Entering / leaving edit mode swaps the input text (derived state, no effect needed).
  const editing = comp?.editing ?? null;
  const [editingId, setEditingId] = useState<string | null>(
    editing?.id ?? null,
  );
  const [beforeEdit, setBeforeEdit] = useState("");
  const [picks, setPicks] = useState<MentionPick[]>([]);
  const [beforeEditPicks, setBeforeEditPicks] = useState<MentionPick[]>([]);
  if ((editing?.id ?? null) !== editingId) {
    setEditingId(editing?.id ?? null);
    if (editing) {
      setBeforeEdit(text);
      setBeforeEditPicks(picks);
      setText(editing.text ?? "");
      setPicks(picksFromMentions(editing.text ?? "", editing.mentions ?? []));
    } else {
      setText(beforeEdit);
      setPicks(beforeEditPicks);
    }
  }
  const mention = useMentionSuggestions(conv, inputRef);
  const replyTo = comp?.replyTo ?? null;
  // Disappearing messages on: say so where the user types.
  const placeholder = conv.disappearing_seconds > 0
    ? t("composer.placeholderTimed", { duration: disappearingLabel(conv.disappearing_seconds, t) })
    : t("composer.placeholder");

  useEffect(() => {
    latestText.current = text;
  }, [text]);

  // Selection to restore right after a programmatic text change (before any further typing).
  const pendingSel = useRef<[number, number] | null>(null);

  // Auto-grow the textarea up to 6 lines (max-height in CSS).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (pendingSel.current) {
      el.focus();
      el.setSelectionRange(...pendingSel.current);
      pendingSel.current = null;
    }
  }, [text, recording]);

  useEffect(() => {
    if (replyTo || editing) inputRef.current?.focus();
  }, [replyTo, editing]);

  // Save the draft when leaving the conversation.
  useEffect(() => {
    const id = conv.id;
    return () => {
      window.clearTimeout(draftTimer.current);
      window.clearTimeout(typingTimer.current);
      if (getApp().composing[id]?.editing) return;
      const draft = latestText.current.trim() ? latestText.current : null;
      void api.setDraft({ conversation_id: id, draft }).catch(() => undefined);
      if (lastTyping.current)
        void api
          .sendTyping({ conversation_id: id, typing: false })
          .catch(() => undefined);
    };
  }, [conv.id]);

  const stopTyping = () => {
    window.clearTimeout(typingTimer.current);
    if (lastTyping.current) {
      lastTyping.current = 0;
      void api
        .sendTyping({ conversation_id: conv.id, typing: false })
        .catch(() => undefined);
    }
  };

  const onChange = (value: string) => {
    setText(value);
    if (!editing) {
      window.clearTimeout(draftTimer.current);
      draftTimer.current = window.setTimeout(() => {
        void api
          .setDraft({
            conversation_id: conv.id,
            draft: value.trim() ? value : null,
          })
          .catch(() => undefined);
      }, DRAFT_DELAY_MS);
    }
    if (!typingEnabled) return;
    const now = nowMs();
    if (value && now - lastTyping.current > TYPING_REFRESH_MS) {
      lastTyping.current = now;
      void api
        .sendTyping({ conversation_id: conv.id, typing: true })
        .catch(() => undefined);
    }
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(stopTyping, TYPING_IDLE_MS);
    if (!value) stopTyping();
  };

  const send = () => {
    const value = text.trim();
    // Editing a message changes its text only; the images wait for the next message.
    const imgs = editing ? NO_IMAGES : images;
    if (!value && !imgs.length) return;
    if (imgs.length && rejectTooBig(imgs, t, locale)) return;
    stopTyping();
    window.clearTimeout(draftTimer.current);
    // Mentions are computed on the untrimmed text, then shifted by the trimmed prefix.
    const lead = text.length - text.trimStart().length;
    const mentions = collectMentions(text, picks)
      .map((m) => ({ ...m, start: m.start - lead }))
      .filter((m) => m.start >= 0 && m.start + m.length <= value.length);
    setText("");
    setPicks([]);
    if (editing) setBeforeEdit("");
    if (imgs.length) {
      useComposerImages.getState().clear(conv.id);
      void sendImages(imgs, value, mentions);
    } else void sendText(conv.id, value, mentions);
    if (!editing)
      void api
        .setDraft({ conversation_id: conv.id, draft: null })
        .catch(() => undefined);
    inputRef.current?.focus();
  };

  // One message with all the images, the text as caption (like SendMediaModal).
  const sendImages = async (files: PickedFile[], caption: string, mentions: Mention[]) => {
    let sent = false;
    try {
      const attachments: OutgoingAttachment[] = [];
      for (const f of files) attachments.push(await imageAttachment(f));
      sent = !!(await sendMessage({
        conversation_id: conv.id,
        text: caption || undefined,
        ...(caption && mentions.length ? { mentions } : {}),
        attachments,
      }));
    } finally {
      // Not sent (the error was shown): give the images back to the composer.
      if (sent) files.forEach(releasePicked);
      else useComposerImages.getState().add(conv.id, files);
    }
  };

  const removeImage = (f: PickedFile) => {
    useComposerImages.getState().remove(conv.id, f);
    releasePicked(f);
    inputRef.current?.focus();
  };

  const closeAnnotator = () => {
    setAnnotating(null);
    inputRef.current?.focus();
  };

  const insertEmoji = (e: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + e + text.slice(end);
    pendingSel.current = [start + e.length, start + e.length];
    onChange(next);
  };

  const attach = async (kind: "media" | "files") => {
    const files = await pickFiles({
      kind: kind === "media" ? "media" : "any",
      multiple: true,
    });
    if (files.length) openSendMedia(conv.id, files, kind);
  };

  const pickMention = (c: MentionPick) => {
    const q = mention.query;
    const el = inputRef.current;
    if (!q || !el) return;
    const caret = el.selectionStart ?? text.length;
    const insert = `@${c.name} `;
    const next = text.slice(0, q.start) + insert + text.slice(caret);
    setPicks((p) => [...p.filter((x) => x.accountId !== c.accountId || x.name !== c.name), c]);
    mention.dismiss(q.start);
    const pos = q.start + insert.length;
    pendingSel.current = [pos, pos];
    onChange(next);
    mention.close();
  };

  const format = (mark: string) => {
    const el = inputRef.current;
    if (!el) return;
    const r = wrapSelection(text, el.selectionStart ?? text.length, el.selectionEnd ?? text.length, mark);
    pendingSel.current = [r.start, r.end];
    onChange(r.text);
  };

  const cancelPanel = () =>
    setComposing(conv.id, { replyTo: null, editing: null });

  return (
    <>
      {(replyTo || editing) && (
        <div className="composer-panel">
          {editing ? (
            <>
              <span style={{ color: "var(--accent-text)", display: "flex" }}>
                <Icon name="edit" size={19} />
              </span>
              <div className="reply-block">
                <div style={{ minWidth: 0 }}>
                  <div className="reply-who">{t("message.editing")}</div>
                  <div className="reply-text">{editing.text || kindLabel(editing.kind, t)}</div>
                </div>
              </div>
            </>
          ) : (
            replyTo && (
              <QuoteBlock
                q={{
                  id: replyTo.id,
                  sender_name: replyTo.outgoing ? "You" : replyTo.sender_name,
                  kind: replyTo.kind,
                  text: replyTo.text ?? replyTo.location?.name ?? null,
                  thumbnail: replyTo.attachments[0]?.thumbnail ?? null,
                }}
              />
            )
          )}
          <button type="button" className="icon-btn" data-tone="muted" onClick={cancelPanel} aria-label={t("common.cancel")}>
            <Icon name="x" size={19} />
          </button>
        </div>
      )}
      {images.length > 0 && !editing && !recording && (
        <div className="composer-chips" role="list" aria-label={t("composer.pastedImages")}>
          {images.map((f, i) => (
            <div key={f.url} className="composer-chip" role="listitem">
              <Tooltip label={t("composer.editImage")} openDelay={400}>
                <button type="button" className="composer-chip-img" onClick={() => setAnnotating(f)} aria-label={t("composer.openImage", { n: i + 1 })}>
                  <img src={f.url} alt="" draggable={false} />
                </button>
              </Tooltip>
              <button type="button" className="composer-chip-x" onClick={() => removeImage(f)} aria-label={t("composer.removeImage")}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="composer">
        {recording ? (
          <VoiceRecorder
            onCancel={() => setRecording(false)}
            onSend={(att, viewOnce) => {
              setRecording(false);
              void sendMessage({ conversation_id: conv.id, attachments: [att], ...(viewOnce ? { view_once: true } : {}) });
            }}
          />
        ) : (
          <>
            <AdaptiveMenu
              position="top-start"
              target={
                <button type="button" className="composer-round" aria-label={t("composer.attach")}>
                  <Icon name="clip" size={20} />
                </button>
              }
              actions={[
                { key: "media", label: t("composer.photos"), icon: <Icon name="image" size={18} />, onClick: () => void attach("media") },
                { key: "file", label: t("composer.document"), icon: <Icon name="file" size={18} />, onClick: () => void attach("files") },
                { key: "location", label: t("composer.location"), icon: <Icon name="mappin" size={18} />, onClick: () => setLocationOpen(true) },
                { key: "contact", label: t("composer.contact"), icon: <Icon name="user" size={18} />, onClick: () => setContactsOpen(true) },
              ]}
            />
            <div className="composer-field">
              {mention.items.length > 0 && (
                <div className="mention-popup" role="listbox" aria-label={t("mention.suggestions")}>
                  {mention.items.map((c, i) => (
                    <button
                      key={c.accountId}
                      type="button"
                      role="option"
                      aria-selected={i === mention.active}
                      className="mention-option"
                      data-active={i === mention.active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => mention.setActive(i)}
                      onClick={() => pickMention(c)}
                    >
                      <UserAvatar name={c.name} path={c.avatar} seed={c.accountId} size={28} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={inputRef}
                rows={1}
                placeholder={placeholder}
                value={text}
                aria-label={placeholder}
                onChange={(e) => {
                  onChange(e.currentTarget.value);
                  mention.refresh();
                }}
                onSelect={mention.refresh}
                onBlur={() => window.setTimeout(mention.close, 150)}
                onKeyDown={(e) => {
                  if (mention.items.length && !e.nativeEvent.isComposing) {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      mention.move(e.key === "ArrowDown" ? 1 : -1);
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      pickMention(mention.items[mention.active]);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      if (mention.query) mention.dismiss(mention.query.start);
                      return;
                    }
                  }
                  const mod = e.ctrlKey || e.metaKey;
                  if (mod && !e.altKey) {
                    const k = e.key.toLowerCase();
                    const mark = k === "b" && !e.shiftKey ? "*" : k === "i" && !e.shiftKey ? "_" : k === "x" && e.shiftKey ? "~" : k === "m" && e.shiftKey ? "`" : null;
                    if (mark) {
                      e.preventDefault();
                      format(mark);
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey && !mobile && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  } else if (e.key === "Escape" && emojiOpen) {
                    e.stopPropagation();
                    setEmojiOpen(false);
                  } else if (e.key === "Escape" && (replyTo || editing)) {
                    e.stopPropagation();
                    cancelPanel();
                  } else if (e.key === "ArrowUp" && !text) {
                    // Edit the last own text message, like desktop messengers.
                    const s = getApp();
                    const ids = s.convMessages[conv.id]?.ids ?? [];
                    for (let i = ids.length - 1; i >= 0; i--) {
                      const m = s.messages[ids[i]];
                      if (m?.outgoing && m.kind === "text" && !m.deleted) {
                        e.preventDefault();
                        setComposing(conv.id, { editing: m, replyTo: null });
                        break;
                      }
                    }
                  }
                }}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.files);
                  if (!files.length) return;
                  e.preventDefault();
                  const picked = files.map(pickedFromFile);
                  // Images become chips here (not while editing a message); anything else opens the dialog.
                  const imgs = editing ? [] : picked.filter(isImageFile);
                  const rest = picked.filter((f) => !imgs.includes(f));
                  if (imgs.length) useComposerImages.getState().add(conv.id, imgs);
                  if (rest.length) openSendMedia(conv.id, rest, rest.every((f) => isImageFile(f) || isVideoFile(f)) ? "media" : "files");
                }}
              />
              <Popover opened={emojiOpen} onChange={setEmojiOpen} position="top-end" withinPortal>
                <Popover.Target>
                  <button type="button" className="composer-emoji" onClick={() => setEmojiOpen((o) => !o)} aria-label={t("composer.emoji")}>
                    <Icon name="smile" size={20} />
                  </button>
                </Popover.Target>
                <Popover.Dropdown p={0}>
                  <EmojiPicker onPick={insertEmoji} />
                </Popover.Dropdown>
              </Popover>
            </div>
            {text.trim() || editing || images.length ? (
              <Tooltip label={editing ? t("common.save") : t("composer.send")}>
                <button type="button" className="composer-send" onClick={send} disabled={!text.trim() && (!!editing || !images.length)} aria-label={editing ? t("common.save") : t("composer.send")}>
                  <Icon name={editing ? "check" : "send"} size={19} />
                </button>
              </Tooltip>
            ) : (
              <Tooltip label={t("voice.record")}>
                <button type="button" className="composer-send" onClick={() => setRecording(true)} aria-label={t("voice.record")}>
                  <Icon name="mic" size={19} />
                </button>
              </Tooltip>
            )}
          </>
        )}
      </div>
      {locationOpen && <LocationPicker conversationId={conv.id} onClose={() => setLocationOpen(false)} />}
      {contactsOpen && <ShareContactsDialog conversationId={conv.id} onClose={() => setContactsOpen(false)} />}
      {annotating && (
        <ImageAnnotator
          file={annotating}
          onClose={closeAnnotator}
          onSave={(edited) => {
            useComposerImages.getState().replace(conv.id, annotating, edited);
            releasePicked(annotating);
            closeAnnotator();
          }}
        />
      )}
    </>
  );
}

interface Candidate extends MentionPick {
  avatar: string | null;
}

/** The @mention suggestion popup state (groups only). */
function useMentionSuggestions(conv: Conversation, inputRef: React.RefObject<HTMLTextAreaElement | null>) {
  const { t } = useTranslation();
  const group = useApp((s) => (conv.kind === "group" ? s.groups[conv.id] : undefined));
  const contacts = useApp((s) => s.contacts);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [active, setActive] = useState(0);

  const candidates = useMemo<Candidate[]>(() => {
    if (!group) return [];
    const firstNames = group.settings.member_names === "first_name";
    const out = new Map<string, Candidate>();
    for (const m of group.members) {
      if (m.is_me) continue;
      const contact = contacts[m.account_id];
      const name = firstNames ? memberName(m.display_name, t) : (contact?.display_name ?? m.display_name);
      out.set(m.account_id, { accountId: m.account_id, name, avatar: contact?.avatar_path ?? m.avatar_path });
    }
    // Hidden member list: suggest the people who wrote in the loaded history.
    if (group.members_hidden) {
      const s = getApp();
      for (const id of s.convMessages[conv.id]?.ids ?? []) {
        const msg = s.messages[id];
        if (!msg || msg.outgoing || msg.system || out.has(msg.sender_account_id)) continue;
        out.set(msg.sender_account_id, { accountId: msg.sender_account_id, name: msg.sender_name, avatar: null });
      }
    }
    return [...out.values()].filter((c) => c.name.trim()).sort((a, b) => a.name.localeCompare(b.name));
  }, [group, contacts, conv.id, t]);

  const items = query && query.start !== dismissed ? filterCandidates(candidates, query.query) : [];

  const refresh = () => {
    const el = inputRef.current;
    if (el && !el.value) setDismissed(null);
    if (!el || !candidates.length) return setQuery(null);
    const caret = el.selectionStart ?? 0;
    const q = el.selectionStart === el.selectionEnd ? mentionQuery(el.value, caret) : null;
    setQuery((old) => {
      if (old?.start !== q?.start || old?.query !== q?.query) setActive(0);
      return q;
    });
  };

  return {
    query,
    items,
    active: Math.min(active, Math.max(0, items.length - 1)),
    setActive,
    move: (d: number) => setActive((a) => (a + d + items.length) % items.length),
    dismiss: (start: number) => setDismissed(start),
    close: () => setQuery(null),
    refresh,
  };
}
