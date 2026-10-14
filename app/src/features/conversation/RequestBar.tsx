// Message requests and group invites from strangers (see crates/chat-core/src/engine/requests.rs).
// Until the user accepts, the core sends nothing back (no receipts, typing or profile) and
// downloads nothing automatically; this bar replaces the composer with the choices.

import { Button, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import type { Conversation } from "../../lib/types";
import { attempt, loadMessages, setBlocked } from "../../store/actions";
import { removeLocally } from "./requestActions";

export function RequestBar({ conv }: { conv: Conversation }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const group = conv.kind === "group";

  const accept = async () => {
    setBusy(true);
    const c = await attempt(() => api.acceptConversation({ conversation_id: conv.id }));
    // Thumbnails were held back while it was a request.
    if (c) await loadMessages(conv.id);
    setBusy(false);
  };

  const block = () =>
    modals.openConfirmModal({
      title: t("chat.block.title", { name: conv.title }),
      children: <Text size="sm" c="dimmed">{t("request.blockBody")}</Text>,
      labels: { confirm: t("chat.block.confirm"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        void (async () => {
          await setBlocked(conv.peer_account_id!, true);
          await attempt(() => removeLocally(conv));
        })(),
    });

  const remove = () =>
    modals.openConfirmModal({
      title: t(group ? "request.declineTitle" : "chat.delete.title", { name: conv.title }),
      children: <Text size="sm" c="dimmed">{t(group ? "request.declineBody" : "request.deleteBody")}</Text>,
      labels: { confirm: t(group ? "request.decline" : "chat.delete.confirm"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        void attempt(async () => {
          // Declining a group invite leaves the group (the others see it), then forgets it.
          if (group) await api.leaveGroup({ conversation_id: conv.id });
          await removeLocally(conv);
        }),
    });

  return (
    <div className="request-bar">
      <div className="request-bar-text">
        <strong>{t(group ? "request.groupTitle" : "request.title", { name: conv.title })}</strong>
        <span>{t(group ? "request.groupBody" : "request.body")}</span>
      </div>
      <div className="request-bar-actions">
        {!group && conv.peer_account_id && (
          <Button variant="default" color="red" onClick={block} disabled={busy}>
            {t("request.block")}
          </Button>
        )}
        <Button variant="default" onClick={remove} disabled={busy}>
          {t(group ? "request.decline" : "request.delete")}
        </Button>
        <Button onClick={() => void accept()} loading={busy}>
          {t(group ? "request.join" : "request.accept")}
        </Button>
      </div>
    </div>
  );
}
