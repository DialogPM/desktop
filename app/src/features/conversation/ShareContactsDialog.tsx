// Picks one or more contacts and sends them as contact cards.

import { Button, Group, Modal, Text } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { useIsMobile } from "../../lib/hooks";
import { sendMessage } from "../../store/actions";
import { ContactPicker } from "../chats/ContactPicker";

const MAX_CONTACTS = 50;

export function ShareContactsDialog({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (selected.length === 0) return;
    setSending(true);
    const sent = await sendMessage({ conversation_id: conversationId, contact_ids: selected });
    setSending(false);
    if (sent) onClose();
  };

  return (
    <Modal opened onClose={onClose} title={t("shareContacts.title")} size="md" fullScreen={mobile} padding={0}>
      <Text size="sm" c="dimmed" px="md" pb={4}>
        {t("shareContacts.hint")}
      </Text>
      <ContactPicker includeChats selected={selected} onChange={(ids) => setSelected(ids.slice(0, MAX_CONTACTS))} height={mobile ? "calc(100dvh - 210px)" : 380} />
      <Group justify="flex-end" p="md" pt="xs">
        <Button leftSection={<Icon name="send" size={17} />} onClick={send} disabled={selected.length === 0} loading={sending}>
          {selected.length > 0 ? t("shareContacts.sendCount", { count: selected.length }) : t("shareContacts.send")}
        </Button>
      </Group>
    </Modal>
  );
}
