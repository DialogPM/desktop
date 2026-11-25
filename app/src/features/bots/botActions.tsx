// Starting, stopping and opening bots (the core: crates/chat-core/src/engine/bots.rs).

import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import i18n from "../../i18n";
import { api } from "../../lib/api";
import type { BotInfo } from "../../lib/types";
import { attempt, openConversation } from "../../store/actions";
import { getApp, setApp, upsertConversation as upsert } from "../../store/app";

/** Opens the conversation with a bot. Nothing is sent to the bot: it starts only on "Start". */
export async function openBot(botId: string): Promise<boolean> {
  const c = await attempt(() => api.botOpen({ bot_id: botId }));
  if (!c) return false;
  upsert(c);
  setApp({ sidebar: "chats", chatFilter: c.archived ? "archived" : getApp().chatFilter === "archived" ? "all" : getApp().chatFilter });
  openConversation(c.id);
  return true;
}

export async function startBot(bot: BotInfo) {
  const c = await attempt(() => api.botStart({ bot_id: bot.id }));
  if (c) upsert(c);
}

export function confirmStopBot(bot: BotInfo) {
  const t = i18n.t.bind(i18n);
  modals.openConfirmModal({
    title: t("bots.stopTitle", { name: bot.name }),
    children: (
      <Text size="sm" c="dimmed">
        {t("bots.stopBody")}
      </Text>
    ),
    labels: { confirm: t("bots.stop"), cancel: t("common.cancel") },
    confirmProps: { color: "red" },
    onConfirm: () =>
      void (async () => {
        const c = await attempt(() => api.botStop({ bot_id: bot.id }));
        if (c) upsert(c);
      })(),
  });
}
