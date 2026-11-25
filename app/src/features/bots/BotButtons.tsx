// The buttons under a bot's message. One kind tells the bot it was pressed (the bot gets the
// button's data); the other opens a link, after showing where it leads.

import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { openExternal } from "../../lib/platform";
import type { BotButton, Message } from "../../lib/types";
import { notifyError } from "../../store/actions";
import "./bots.css";

export function BotButtons({ message, disabled }: { message: Message; disabled?: boolean }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const rows = message.buttons ?? [];
  if (!rows.length) return null;

  const press = async (key: string, b: BotButton) => {
    if (b.url) {
      const url = b.url;
      modals.openConfirmModal({
        title: t("bots.openLinkTitle"),
        children: (
          <Text size="sm" c="dimmed" style={{ overflowWrap: "anywhere" }}>
            {url}
          </Text>
        ),
        labels: { confirm: t("bots.openLink"), cancel: t("common.cancel") },
        onConfirm: () => void openExternal(url),
      });
      return;
    }
    if (!b.data || busy) return;
    setBusy(key);
    try {
      await api.botPress({ message_id: message.id, data: b.data });
      setDone(key);
      window.setTimeout(() => setDone((d) => (d === key ? null : d)), 1500);
    } catch (e) {
      notifyError(e);
    }
    setBusy(null);
  };

  return (
    <div className="bot-buttons" onClick={(e) => e.stopPropagation()}>
      {rows.map((row, i) => (
        <div key={i} className="bot-buttons-row">
          {row.map((b, j) => {
            const key = `${i}:${j}`;
            return (
              <button key={key} type="button" className="bot-button" data-bot-button disabled={disabled || busy === key} data-done={done === key} onClick={() => void press(key, b)}>
                <span className="truncate">{b.text}</span>
                {b.url ? <Icon name="external" size={13} /> : done === key ? <Icon name="check" size={13} /> : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
