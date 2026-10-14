// Forward, delete and "message info" dialogs (global, driven by useMessageDialogs).

import { Button, Group, Loader, Modal, ScrollArea, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusTicks } from "../../components/StatusTicks";
import { CheckBox } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useIsMobile, useLocale } from "../../lib/hooks";
import { previewText } from "../../lib/messageText";
import type { MessageInfo, MessageReceipt } from "../../lib/types";
import { attempt, deleteMessages, notifyOk } from "../../store/actions";
import { setApp, useApp } from "../../store/app";
import { useMessageDialogs } from "./uiStore";

export function MessageDialogs() {
  return (
    <>
      <ForwardDialog />
      <DeleteDialog />
      <InfoDialog />
    </>
  );
}

function ForwardDialog() {
  const ids = useMessageDialogs((s) => s.forward);
  if (!ids) return null;
  return <ForwardInner ids={ids} />;
}

function ForwardInner({ ids }: { ids: string[] }) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const close = () => useMessageDialogs.getState().setForward(null);
  const conversations = useApp((s) => s.conversations);
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(conversations)
      .filter((c) => !c.left && !c.blocked && (!q || c.title.toLowerCase().includes(q)))
      .sort((a, b) => (b.last_message?.sent_at ?? b.updated_at) - (a.last_message?.sent_at ?? a.updated_at));
  }, [conversations, query]);

  const toggle = (id: string) => setTargets((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const send = async () => {
    setBusy(true);
    const ok = await attempt(async () => {
      await api.forwardMessages({ message_ids: ids, conversation_ids: targets });
      return true;
    });
    setBusy(false);
    if (ok) {
      notifyOk(t("message.forwardedTo", { count: targets.length }));
      setApp({ selection: null });
      close();
    }
  };

  return (
    <Modal opened onClose={close} title={t("message.forwardTitle", { count: ids.length })} fullScreen={mobile} size="md">
      <Stack gap="sm">
        <TextInput
          radius="xl"
          placeholder={t("chats.search")}
          leftSection={<Icon name="search" size={16} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          data-autofocus
        />
        <ScrollArea.Autosize mah={mobile ? "65dvh" : 380}>
          {list.map((c) => (
            <UnstyledButton key={c.id} className="row" onClick={() => toggle(c.id)} style={{ padding: "8px 6px", minHeight: 0, width: "100%", margin: 0, borderRadius: 12 }}>
              <UserAvatar name={c.title} path={c.avatar_path} seed={c.id} size={40} group={c.kind === "group"} />
              <Text fw={500} className="truncate" style={{ flex: 1 }}>
                {c.title}
              </Text>
              <CheckBox on={targets.includes(c.id)} round />
            </UnstyledButton>
          ))}
        </ScrollArea.Autosize>
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button leftSection={<Icon name="send" size={16} />} disabled={!targets.length} loading={busy} onClick={send}>
            {t("message.forward")}
            {targets.length ? ` (${targets.length})` : ""}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function DeleteDialog() {
  const { t } = useTranslation();
  const del = useMessageDialogs((s) => s.del);
  const messages = useApp((s) => s.messages);
  const close = () => useMessageDialogs.getState().setDelete(null);
  if (!del) return null;
  const msgs = del.ids.map((id) => messages[id]).filter(Boolean);
  const forEveryone = msgs.length > 0 && msgs.every((m) => m.outgoing && !m.deleted && m.kind !== "system");
  const run = async (everyone: boolean) => {
    close();
    setApp({ selection: null });
    await deleteMessages(del.ids, everyone);
  };
  return (
    <Modal opened onClose={close} title={t("message.deleteTitle", { count: del.ids.length })} size="sm">
      <Stack gap="xs">
        {forEveryone && (
          <Button color="red" variant="light" onClick={() => void run(true)}>
            {t("message.deleteForEveryone")}
          </Button>
        )}
        <Button color="red" variant={forEveryone ? "subtle" : "light"} onClick={() => void run(false)}>
          {t("message.deleteForMe")}
        </Button>
        <Button variant="default" onClick={close}>
          {t("common.cancel")}
        </Button>
      </Stack>
    </Modal>
  );
}

function ReceiptRow({ r, at }: { r: MessageReceipt; at: number | null }) {
  const locale = useLocale();
  return (
    <Group wrap="nowrap" gap="sm" py={6}>
      <UserAvatar name={r.display_name} path={r.avatar_path} seed={r.account_id} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" fw={500} className="truncate">
          {r.display_name}
        </Text>
        <Text size="xs" c="dimmed">
          {at ? formatDateTime(at, locale) : "—"}
        </Text>
      </div>
      <StatusTicks status={r.status} />
    </Group>
  );
}

function InfoDialog() {
  const id = useMessageDialogs((s) => s.info);
  if (!id) return null;
  return <InfoInner id={id} />;
}

function InfoInner({ id }: { id: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [info, setInfo] = useState<MessageInfo | null>(null);
  const close = () => useMessageDialogs.getState().setInfo(null);

  useEffect(() => {
    let alive = true;
    api
      .getMessageInfo({ message_id: id })
      .then((i) => alive && setInfo(i))
      .catch(() => alive && close());
    return () => {
      alive = false;
    };
  }, [id]);

  const read = info?.receipts.filter((r) => r.status === "read") ?? [];
  const delivered = info?.receipts.filter((r) => r.status === "delivered") ?? [];
  const pending = info?.receipts.filter((r) => r.status !== "read" && r.status !== "delivered") ?? [];

  return (
    <Modal opened onClose={close} title={t("message.info")} size="md">
      {!info ? (
        <Loader m="lg" />
      ) : (
        <Stack gap="md">
          <div className="bubble" data-out="true" style={{ alignSelf: "flex-end", maxWidth: "90%" }}>
            <div className="bubble-text">{info.message.deleted ? t("message.deletedByYou") : previewText(info.message.kind, info.message.text, t)}</div>
            <div className="bubble-meta">{formatDateTime(info.message.sent_at, locale)}</div>
          </div>
          {read.length > 0 && (
            <div>
              <Group gap={6} mb={4}>
                <Icon name="checks" size={18} style={{ color: "var(--accent-text)" }} />
                <Text fw={600} size="sm">
                  {t("message.readBy")}
                </Text>
              </Group>
              {read.map((r) => (
                <ReceiptRow key={r.account_id} r={r} at={r.read_at} />
              ))}
            </div>
          )}
          {delivered.length > 0 && (
            <div>
              <Group gap={6} mb={4}>
                <Icon name="checks" size={18} style={{ color: "var(--muted)" }} />
                <Text fw={600} size="sm">
                  {t("message.deliveredTo")}
                </Text>
              </Group>
              {delivered.map((r) => (
                <ReceiptRow key={r.account_id} r={r} at={r.delivered_at} />
              ))}
            </div>
          )}
          {pending.length > 0 && (
            <div>
              <Text fw={600} size="sm" mb={4}>
                {t("message.notDelivered")}
              </Text>
              {pending.map((r) => (
                <ReceiptRow key={r.account_id} r={r} at={null} />
              ))}
            </div>
          )}
          {info.receipts.length === 0 && (
            <Text size="sm" c="dimmed">
              {t("message.noReceipts")}
            </Text>
          )}
        </Stack>
      )}
    </Modal>
  );
}
