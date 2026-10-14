import { modals } from "@mantine/modals";
import { api } from "../../lib/api";
import { isFileDangerous } from "../../lib/fileSafety";
import { pickSavePath } from "../../lib/platform";
import type { Attachment, Message } from "../../lib/types";
import { attempt, notifyOk } from "../../store/actions";
import { getApp } from "../../store/app";
import { confirmRequestDownload, isRequest } from "./requestActions";
import i18n from "../../i18n";

export function downloadAttachment(m: Message, a: Attachment) {
  if (a.download_state === "downloading") return;
  // From a message request: nothing was downloaded automatically, and the user is warned
  // before opening what a stranger sent.
  const conv = getApp().conversations[m.conversation_id];
  if (conv && !m.outgoing && isRequest(conv)) {
    void confirmRequestDownload().then((ok) => {
      if (ok) void attempt(() => api.downloadAttachment({ message_id: m.id, attachment_id: a.id }));
    });
    return;
  }
  void attempt(() => api.downloadAttachment({ message_id: m.id, attachment_id: a.id }));
}

/** Programs, scripts and installers: asks before saving them (they can harm the computer). */
function confirmDangerous(fileName: string): Promise<boolean> {
  if (!isFileDangerous(fileName)) return Promise.resolve(true);
  const t = i18n.t.bind(i18n);
  return new Promise((resolve) => {
    let confirmed = false;
    modals.openConfirmModal({
      title: t("message.dangerousTitle"),
      children: t("message.dangerousBody", { name: fileName }),
      labels: { confirm: t("message.dangerousConfirm"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        confirmed = true;
      },
      onClose: () => resolve(confirmed),
    });
  });
}

/** Asks for a destination and copies the decrypted attachment there. */
export async function saveAttachment(m: Message, a: Attachment) {
  if (!a.local_path) {
    downloadAttachment(m, a);
    return;
  }
  if (!(await confirmDangerous(a.file_name))) return;
  const dest = await attempt(() => pickSavePath(a.file_name));
  if (!dest) return;
  const ok = await attempt(async () => {
    await api.saveAttachment({ message_id: m.id, attachment_id: a.id, dest_path: dest });
    return true;
  });
  if (ok && !dest.startsWith("browser-download:")) notifyOk(i18n.t("message.saved"));
}
