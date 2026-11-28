// "Export chat": saves a conversation to a file the user chooses, as text or as an archive
// with the media. The file leaves the app unencrypted, so the dialog says so first.

import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Icon } from "../../components/Icon";
import { OptionsDialog } from "../../components/OptionsDialog";
import i18n from "../../i18n";
import { api, parseError } from "../../lib/api";
import { pickSavePath } from "../../lib/platform";
import type { Conversation, Message } from "../../lib/types";
import { attempt, notifyError, notifyOk } from "../../store/actions";
import { buildTranscript, exportBaseName } from "./exportChat";

const PAGE = 500;

/** Every message of a conversation, oldest first (the order the conversation shows them in). */
export async function loadAllMessages(conversationId: string): Promise<Message[]> {
  const seen = new Set<string>();
  const all: Message[] = [];
  let before: number | undefined;
  for (;;) {
    const page = await api.getMessages({ conversation_id: conversationId, before, limit: PAGE });
    const fresh = page.filter((m) => !seen.has(m.id));
    for (const m of fresh) seen.add(m.id);
    all.push(...fresh);
    if (page.length < PAGE || !fresh.length) break;
    // Pages are cut by arrival time; messages that arrived in the same millisecond as the
    // last one are asked for again rather than lost (duplicates are dropped above).
    before = Math.min(...page.map((m) => m.received_at)) + 1;
  }
  return all.reverse();
}

async function runExport(conv: Conversation, withMedia: boolean) {
  const t = i18n.t.bind(i18n);
  const base = exportBaseName(conv);
  const dest = await attempt(() => pickSavePath(`${base}.${withMedia ? "zip" : "txt"}`));
  if (!dest) return;
  const id = notifications.show({ loading: true, autoClose: false, withCloseButton: false, message: t("chat.export.working") });
  try {
    const messages = await loadAllMessages(conv.id);
    const transcript = buildTranscript(conv, messages, t, { withMedia });
    const r = await api.exportConversation({
      conversation_id: conv.id,
      dest_path: dest,
      text: transcript.text,
      archive: withMedia,
      text_name: `${base}.txt`,
      media: transcript.media,
    });
    notifications.hide(id);
    notifyOk(r.media_skipped > 0 ? t("chat.export.doneSkipped", { count: r.media_skipped }) : t("chat.export.done"));
  } catch (e) {
    notifications.hide(id);
    if (parseError(e).message === "export_too_large") notifications.show({ color: "red", message: t("chat.export.tooLarge") });
    else notifyError(e);
  }
}

export function openExportChat(conv: Conversation) {
  const t = i18n.t.bind(i18n);
  modals.open({
    title: t("chat.export.title", { name: conv.title }),
    size: 460,
    children: (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="export-warning" role="note">
          <Icon name="alert" size={18} />
          <span>{t("chat.export.warning")}</span>
        </div>
        <OptionsDialog
          initial="text"
          confirmLabel={t("chat.export.confirm")}
          options={[
            { value: "text", label: t("chat.export.textOnly"), hint: t("chat.export.textOnlyHint") },
            { value: "media", label: t("chat.export.withMedia"), hint: t("chat.export.withMediaHint") },
          ]}
          onConfirm={(v) => void runExport(conv, v === "media")}
        />
      </div>
    ),
  });
}
