// Message-level actions (menus, jump, selection helpers).

import { modals } from "@mantine/modals";
import { IconArrowBackUp, IconDownload, IconHistory, IconPinnedOff, IconRefresh, IconStar, IconStarOff } from "@tabler/icons-react";
import { OptionsDialog } from "../../components/OptionsDialog";
import type { TFunction } from "i18next";
import { EmojiPicker } from "../../components/EmojiPicker";
import { Icon } from "../../components/Icon";
import type { MenuAction } from "../../components/Menus";
import i18n from "../../i18n";
import { api } from "../../lib/api";
import { copyText } from "../../lib/platform";
import type { Message } from "../../lib/types";
import { attempt, notifyOk, react, toggleSelect } from "../../store/actions";
import { getApp, setApp, setComposing, upsertMessage } from "../../store/app";
import { saveAttachment } from "./attachmentActions";
import { EditHistoryList } from "./EditHistory";
import { isExpiredAttachment, useMessageDialogs } from "./uiStore";

export function openReactionPicker(m: Message) {
  modals.open({
    title: i18n.t("message.react"),
    size: "auto",
    children: (
      <EmojiPicker
        onPick={(e) => {
          modals.closeAll();
          void react(m, e);
        }}
      />
    ),
  });
}

/** Pin durations offered (seconds): 24 hours, 7 days, 30 days. */
const PIN_DURATIONS = [86_400, 604_800, 2_592_000] as const;

export function openPinDialog(m: Message) {
  const t = i18n.t.bind(i18n);
  modals.open({
    title: t("pin.title"),
    children: (
      <OptionsDialog
        description={t("pin.hint")}
        initial={String(PIN_DURATIONS[1])}
        confirmLabel={t("pin.confirm")}
        options={[
          { value: String(PIN_DURATIONS[0]), label: t("pin.h24") },
          { value: String(PIN_DURATIONS[1]), label: t("pin.d7") },
          { value: String(PIN_DURATIONS[2]), label: t("pin.d30") },
        ]}
        onConfirm={(v) => void pinMessage(m, Number(v))}
      />
    ),
  });
}

export async function pinMessage(m: Message, seconds: number | null) {
  const res = await attempt(() => api.pinMessage({ message_id: m.id, seconds }));
  if (res) upsertMessage(res);
}

export async function starMessage(m: Message, starred: boolean) {
  const res = await attempt(() => api.starMessage({ message_id: m.id, starred }));
  if (res) upsertMessage(res);
}

export function openEditHistory(m: Message) {
  modals.open({ title: i18n.t("message.editHistory"), size: "md", children: <EditHistoryList id={m.id} /> });
}

export function jumpTo(messageId: string) {
  setApp({ highlightId: messageId });
}

function canEdit(m: Message): boolean {
  return !m.view_once && m.outgoing && !m.deleted && m.kind !== "system" && m.kind !== "voice" && m.kind !== "location" && m.status !== "failed";
}

export function messageActions(m: Message, t: TFunction): MenuAction[] {
  const conversationId = m.conversation_id;
  const dialogs = useMessageDialogs.getState();
  // View-once media: never copied, forwarded, saved or edited (reply, react, delete are fine).
  const viewOnce = !!m.view_once;
  // Media erased by the retention period: nothing to forward or save (the core refuses too).
  const mediaExpired = m.attachments.some(isExpiredAttachment);
  const saveable = viewOnce || mediaExpired ? undefined : m.attachments.find((a) => a.local_path);
  return [
    {
      key: "retry",
      label: t("message.retry"),
      icon: <IconRefresh size={18} />,
      hidden: m.status !== "failed",
      onClick: () =>
        void attempt(async () => {
          upsertMessage(await api.retryMessage({ message_id: m.id }));
        }),
    },
    {
      key: "reply",
      label: t("message.reply"),
      icon: <IconArrowBackUp size={18} />,
      hidden: m.deleted,
      onClick: () => setComposing(conversationId, { replyTo: m, editing: null }),
    },
    {
      key: "copy",
      label: t("message.copy"),
      icon: <Icon name="copy" size={18} />,
      hidden: m.deleted || viewOnce || !m.text,
      onClick: () => void copyText(m.text ?? "").then((ok) => ok && notifyOk(t("common.copied"))),
    },
    {
      key: "forward",
      label: t("message.forward"),
      icon: <Icon name="forward" size={18} />,
      hidden: m.deleted || viewOnce || mediaExpired,
      onClick: () => dialogs.setForward([m.id]),
    },
    {
      key: "edit",
      label: t("message.edit"),
      icon: <Icon name="edit" size={18} />,
      hidden: !canEdit(m),
      onClick: () => setComposing(conversationId, { editing: m, replyTo: null }),
    },
    {
      key: "editHistory",
      label: t("message.editHistory"),
      icon: <IconHistory size={18} />,
      hidden: m.deleted || !m.edited_at,
      onClick: () => openEditHistory(m),
    },
    {
      key: "save",
      label: t("message.save"),
      icon: <IconDownload size={18} />,
      hidden: m.deleted || !saveable,
      onClick: () => saveable && void saveAttachment(m, saveable),
    },
    {
      key: "pin",
      label: m.pinned_until ? t("pin.unpin") : t("pin.action"),
      icon: m.pinned_until ? <IconPinnedOff size={18} /> : <Icon name="pin" size={18} />,
      hidden: m.deleted || m.kind === "system",
      onClick: () => (m.pinned_until ? void pinMessage(m, null) : openPinDialog(m)),
    },
    {
      key: "star",
      label: m.starred ? t("star.unstar") : t("star.action"),
      icon: m.starred ? <IconStarOff size={18} /> : <IconStar size={18} />,
      hidden: m.deleted || m.kind === "system",
      onClick: () => void starMessage(m, !m.starred),
    },
    {
      key: "info",
      label: t("message.info"),
      icon: <Icon name="info" size={18} />,
      hidden: !m.outgoing || m.deleted,
      onClick: () => dialogs.setInfo(m.id),
    },
    {
      key: "select",
      label: t("message.select"),
      icon: <Icon name="check" size={18} />,
      onClick: () => toggleSelect(conversationId, m.id),
    },
    {
      key: "delete",
      label: t("message.delete"),
      icon: <Icon name="trash" size={18} />,
      color: "red",
      dividerBefore: true,
      onClick: () => dialogs.setDelete({ conversationId, ids: [m.id] }),
    },
  ];
}

/** Used by the selection bar. */
export function selectedMessages(): Message[] {
  const s = getApp();
  return (s.selection?.ids ?? []).map((id) => s.messages[id]).filter((m): m is Message => !!m).sort((a, b) => a.sent_at - b.sent_at);
}
