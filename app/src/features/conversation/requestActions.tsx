// Helpers for message requests (see RequestBar.tsx and crates/chat-core/src/engine/requests.rs).

import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import i18n from "../../i18n";
import { api } from "../../lib/api";
import type { Conversation } from "../../lib/types";
import { getApp, setApp } from "../../store/app";

/** Whether the conversation is shown as a request (and not already blocked or left). */
export function isRequest(conv: Conversation): boolean {
  return !conv.accepted && !conv.left && !conv.blocked;
}

export async function removeLocally(conv: Conversation) {
  await api.deleteConversation({ conversation_id: conv.id });
  if (getApp().activeId === conv.id) setApp({ activeId: null, infoOpen: false });
}

/** Asks before downloading an attachment from someone the user has not accepted yet. */
export function confirmRequestDownload(): Promise<boolean> {
  const t = i18n.t.bind(i18n);
  return new Promise((resolve) => {
    let confirmed = false;
    modals.openConfirmModal({
      title: t("request.downloadTitle"),
      children: <Text size="sm" c="dimmed">{t("request.downloadBody")}</Text>,
      labels: { confirm: t("message.download"), cancel: t("common.cancel") },
      onConfirm: () => {
        confirmed = true;
      },
      onClose: () => resolve(confirmed),
    });
  });
}
