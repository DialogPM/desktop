// Dialogs and menu actions that apply to a whole conversation.
// Shared by the chat list (context menu) and the conversation header.

import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArchive, IconArchiveOff, IconBan, IconEraser, IconPinnedOff } from "@tabler/icons-react";
import { Icon } from "../../components/Icon";
import type { TFunction } from "i18next";
import type { MenuAction } from "../../components/Menus";
import { OptionsDialog } from "../../components/OptionsDialog";
import { askPassword } from "../../components/PasswordPrompt";
import i18n from "../../i18n";
import { api } from "../../lib/api";
import { isMuted } from "../../lib/format";
import type { Conversation } from "../../lib/types";
import { attempt, loadMessages, notifyOk, patchConversation, setBlocked } from "../../store/actions";
import { getApp, setApp, upsertContact } from "../../store/app";
import { RenameContactForm } from "./RenameContactForm";
import { DISAPPEARING_OPTIONS } from "../../lib/messageText";

const HOUR = 3_600_000;

/** Opens the "Edit name" dialog: a local name for a contact (only visible to us). */
export async function openRenameContact(accountId: string) {
  const contact = getApp().contacts[accountId] ?? (await attempt(() => api.getContact({ account_id: accountId })));
  if (!contact) return;
  upsertContact(contact);
  modals.open({ title: i18n.t("contact.rename"), children: <RenameContactForm contact={contact} />, size: 440 });
}

/** True when the conversation is a direct chat with someone else (a contact that can be renamed). */
export function canRename(conv: Conversation): boolean {
  return conv.kind === "direct" && !!conv.peer_account_id && conv.peer_account_id !== getApp().details?.account.account_id;
}

export function openMuteDialog(conv: Conversation) {
  const t = i18n.t.bind(i18n);
  modals.open({
    title: t("chat.mute.title"),
    children: (
      <OptionsDialog
        description={t("chat.mute.description")}
        initial="8h"
        options={[
          { value: "8h", label: t("chat.mute.h8") },
          { value: "1w", label: t("chat.mute.w1") },
          { value: "always", label: t("chat.mute.always") },
        ]}
        onConfirm={(v) => {
          const until = v === "always" ? -1 : Date.now() + (v === "8h" ? 8 * HOUR : 7 * 24 * HOUR);
          void patchConversation(conv.id, { muted_until: until });
        }}
      />
    ),
  });
}

export function openDisappearingDialog(conv: Conversation) {
  const t = i18n.t.bind(i18n);
  modals.open({
    title: t("disappearing.title"),
    children: (
      <OptionsDialog
        description={t("disappearing.description")}
        initial={String(conv.disappearing_seconds)}
        options={DISAPPEARING_OPTIONS.map(([s, key]) => ({ value: String(s), label: t(`disappearing.${key}`) }))}
        onConfirm={(v) => void patchConversation(conv.id, { disappearing_seconds: Number(v) })}
      />
    ),
  });
}

export function confirmDeleteChat(conv: Conversation) {
  const t = i18n.t.bind(i18n);
  const group = conv.kind === "group";
  // An active group can only be cleared: deleting it would lose the group.
  if (group && !conv.left) return confirmClearChat(conv);
  const self = conv.kind === "direct" && conv.peer_account_id === getApp().details?.account.account_id;
  const remove = async (everyone: boolean) => {
    // Deleting on the other side too cannot be undone: the account password confirms it.
    const password = everyone
      ? await askPassword({ title: t("chat.delete.title", { name: conv.title }), confirmLabel: t("chat.delete.confirm") })
      : null;
    if (everyone && password === null) return;
    await attempt(async () => {
      if (password !== null) await api.deleteConversationForEveryone({ conversation_id: conv.id, password });
      else await api.deleteConversation({ conversation_id: conv.id });
      if (getApp().activeId === conv.id) setApp({ activeId: null, infoOpen: false });
    });
  };
  // Left groups and notes to self have nobody else to delete for.
  if ((group && conv.left) || self) {
    modals.openConfirmModal({
      title: t("chat.delete.title", { name: conv.title }),
      children: <Text size="sm" c="dimmed">{t("chat.delete.body")}</Text>,
      labels: { confirm: t("chat.delete.confirm"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => void remove(false),
    });
    return;
  }
  modals.open({
    title: t("chat.delete.title", { name: conv.title }),
    children: (
      <OptionsDialog
        initial="me"
        danger
        confirmLabel={t("chat.delete.confirm")}
        options={[
          { value: "me", label: t("chat.delete.forMe"), hint: t("chat.delete.body") },
          {
            value: "everyone",
            label: t("chat.delete.forBoth", { name: conv.title }),
            hint: t("chat.delete.forBothHint", { name: conv.title }),
          },
        ]}
        onConfirm={(v) => void remove(v === "everyone")}
      />
    ),
  });
}

export function confirmClearChat(conv: Conversation) {
  const t = i18n.t.bind(i18n);
  const clear = async (everyone: boolean) => {
    const password = everyone ? await askPassword({ title: t("chat.clear.title"), confirmLabel: t("chat.clear.confirm") }) : null;
    if (everyone && password === null) return;
    await attempt(async () => {
      if (password !== null) await api.clearGroupForEveryone({ conversation_id: conv.id, password });
      else await api.clearConversation({ conversation_id: conv.id });
      // Clearing for everyone leaves a notice: reload instead of emptying the view.
      setApp((s) => ({
        convMessages: { ...s.convMessages, [conv.id]: { ids: [], hasMore: false, loading: false, loaded: !everyone } },
      }));
      if (everyone) await loadMessages(conv.id);
    });
  };
  const group = conv.kind === "group" && !conv.left;
  // Group admins can also clear the history for every member.
  if (group && getApp().groups[conv.id]?.my_role === "admin") {
    modals.open({
      title: t("chat.clear.title"),
      children: (
        <OptionsDialog
          initial="me"
          danger
          confirmLabel={t("chat.clear.confirm")}
          options={[
            { value: "me", label: t("chat.clear.forMe"), hint: t("chat.clear.groupBody") },
            { value: "everyone", label: t("chat.clear.forGroup"), hint: t("chat.clear.forGroupHint") },
          ]}
          onConfirm={(v) => void clear(v === "everyone")}
        />
      ),
    });
    return;
  }
  modals.openConfirmModal({
    title: t("chat.clear.title"),
    children: <Text size="sm" c="dimmed">{t(group ? "chat.clear.groupBody" : "chat.clear.body")}</Text>,
    labels: { confirm: t("chat.clear.confirm"), cancel: t("common.cancel") },
    confirmProps: { color: "red" },
    onConfirm: () => void clear(false),
  });
}

export function confirmBlock(accountId: string, name: string, block: boolean) {
  const t = i18n.t.bind(i18n);
  if (!block) {
    void setBlocked(accountId, false);
    return;
  }
  modals.openConfirmModal({
    title: t("chat.block.title", { name }),
    children: <Text size="sm" c="dimmed">{t("chat.block.body")}</Text>,
    labels: { confirm: t("chat.block.confirm"), cancel: t("common.cancel") },
    confirmProps: { color: "red" },
    onConfirm: () => void setBlocked(accountId, true),
  });
}

/** Reports the account to the server for review and blocks it. */
export function confirmReportSpam(accountId: string) {
  const t = i18n.t.bind(i18n);
  modals.openConfirmModal({
    title: t("security.reportTitle"),
    children: <Text size="sm" c="dimmed">{t("security.reportBody")}</Text>,
    labels: { confirm: t("security.reportSpam"), cancel: t("common.cancel") },
    confirmProps: { color: "red" },
    onConfirm: () =>
      void (async () => {
        const c = await attempt(() => api.reportSpam({ account_id: accountId, block: true }));
        if (c) {
          upsertContact(c);
          notifyOk(t("security.reported"));
        }
      })(),
  });
}

export function confirmLeaveGroup(conv: Conversation) {
  const t = i18n.t.bind(i18n);
  modals.openConfirmModal({
    title: t("group.leave.title", { name: conv.title }),
    children: <Text size="sm" c="dimmed">{t("group.leave.body")}</Text>,
    labels: { confirm: t("group.leave.confirm"), cancel: t("common.cancel") },
    confirmProps: { color: "red" },
    onConfirm: () => void attempt(() => api.leaveGroup({ conversation_id: conv.id })),
  });
}

/** Actions for the chat list context menu. */
export function listActions(conv: Conversation, t: TFunction): MenuAction[] {
  const muted = isMuted(conv);
  return [
    {
      key: "rename",
      label: t("contact.renameShort"),
      icon: <Icon name="edit" size={18} />,
      hidden: !canRename(conv),
      onClick: () => void openRenameContact(conv.peer_account_id!),
    },
    {
      key: "archive",
      dividerBefore: canRename(conv),
      label: conv.archived ? t("chat.unarchive") : t("chat.archive"),
      icon: conv.archived ? <IconArchiveOff size={18} /> : <IconArchive size={18} />,
      onClick: () => void patchConversation(conv.id, { archived: !conv.archived, pinned: conv.archived ? conv.pinned : false }),
    },
    {
      key: "pin",
      label: conv.pinned ? t("chat.unpin") : t("chat.pin"),
      icon: conv.pinned ? <IconPinnedOff size={18} /> : <Icon name="pin" size={18} />,
      hidden: conv.archived,
      onClick: () => void patchConversation(conv.id, { pinned: !conv.pinned }),
    },
    {
      key: "mute",
      label: muted ? t("chat.unmute") : t("chat.muteAction"),
      icon: muted ? <Icon name="bell" size={18} /> : <Icon name="mute" size={18} />,
      onClick: () => (muted ? void patchConversation(conv.id, { muted_until: null }) : openMuteDialog(conv)),
    },
    {
      key: "read",
      label: t("chat.markRead"),
      icon: <Icon name="check" size={18} />,
      hidden: conv.unread_count === 0,
      onClick: () => void attempt(() => api.markRead({ conversation_id: conv.id })),
    },
    conv.kind === "group" && !conv.left
      ? {
          key: "clear",
          label: t("chat.clear.action"),
          icon: <IconEraser size={18} />,
          color: "red",
          dividerBefore: true,
          onClick: () => confirmClearChat(conv),
        }
      : {
          key: "delete",
          label: t("chat.delete.action"),
          icon: <Icon name="trash" size={18} />,
          color: "red",
          dividerBefore: true,
          onClick: () => confirmDeleteChat(conv),
        },
  ];
}

/** Actions for the conversation header "more" menu. */
export function headerActions(conv: Conversation, t: TFunction, blocked: boolean): MenuAction[] {
  const muted = isMuted(conv);
  return [
    {
      key: "info",
      label: conv.kind === "group" ? t("group.info") : t("contact.info"),
      icon: <Icon name="info" size={18} />,
      onClick: () => setApp({ infoOpen: true }),
    },
    {
      key: "rename",
      label: t("contact.renameShort"),
      icon: <Icon name="edit" size={18} />,
      hidden: !canRename(conv),
      onClick: () => void openRenameContact(conv.peer_account_id!),
    },
    {
      key: "select",
      label: t("chat.selectMessages"),
      icon: <Icon name="check" size={18} />,
      onClick: () => setApp({ selection: { conversationId: conv.id, ids: [] } }),
    },
    {
      key: "mute",
      label: muted ? t("chat.unmute") : t("chat.muteAction"),
      icon: muted ? <Icon name="bell" size={18} /> : <Icon name="mute" size={18} />,
      onClick: () => (muted ? void patchConversation(conv.id, { muted_until: null }) : openMuteDialog(conv)),
    },
    {
      key: "disappearing",
      label: t("disappearing.title"),
      icon: <Icon name="clock" size={18} />,
      hidden: conv.left || (conv.kind === "group" && getApp().groups[conv.id]?.my_role !== "admin"),
      onClick: () => openDisappearingDialog(conv),
    },
    {
      key: "pin",
      label: conv.pinned ? t("chat.unpin") : t("chat.pin"),
      icon: conv.pinned ? <IconPinnedOff size={18} /> : <Icon name="pin" size={18} />,
      onClick: () => void patchConversation(conv.id, { pinned: !conv.pinned }),
    },
    {
      key: "archive",
      label: conv.archived ? t("chat.unarchive") : t("chat.archive"),
      icon: conv.archived ? <IconArchiveOff size={18} /> : <IconArchive size={18} />,
      onClick: () => void patchConversation(conv.id, { archived: !conv.archived }),
    },
    {
      key: "clear",
      label: t("chat.clear.action"),
      icon: <IconEraser size={18} />,
      dividerBefore: true,
      onClick: () => confirmClearChat(conv),
    },
    {
      key: "block",
      label: blocked ? t("chat.block.unblock") : t("chat.block.action"),
      icon: <IconBan size={18} />,
      color: blocked ? undefined : "red",
      hidden: conv.kind !== "direct" || !conv.peer_account_id,
      onClick: () => confirmBlock(conv.peer_account_id!, conv.title, !blocked),
    },
    {
      key: "report",
      label: t("security.reportSpam"),
      icon: <Icon name="alert" size={18} />,
      color: "red",
      hidden: conv.kind !== "direct" || !conv.peer_account_id,
      onClick: () => confirmReportSpam(conv.peer_account_id!),
    },
    {
      key: "leave",
      label: t("group.leave.action"),
      icon: <Icon name="logout" size={18} />,
      color: "red",
      hidden: conv.kind !== "group" || conv.left,
      onClick: () => confirmLeaveGroup(conv),
    },
    {
      key: "delete",
      label: t("chat.delete.action"),
      icon: <Icon name="trash" size={18} />,
      color: "red",
      // Groups: leave first (clearing is above).
      hidden: conv.kind === "group" && !conv.left,
      onClick: () => confirmDeleteChat(conv),
    },
  ];
}
