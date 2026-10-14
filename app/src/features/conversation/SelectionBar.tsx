import { Tooltip } from "@mantine/core";
import { Icon } from "../../components/Icon";
import { useTranslation } from "react-i18next";
import { formatTime } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import { copyText } from "../../lib/platform";
import { notifyOk } from "../../store/actions";
import { setApp, useApp } from "../../store/app";
import { selectedMessages } from "./messageActions";
import { isExpiredAttachment, useMessageDialogs } from "./uiStore";

export function SelectionBar({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const count = useApp((s) => s.selection?.ids.length ?? 0);
  const { setForward, setDelete } = useMessageDialogs();
  const msgs = () => selectedMessages().filter((m) => !m.deleted);
  // View-once media cannot be copied or forwarded.
  // Neither can media erased by the retention period.
  const hasViewOnce = useApp(
    (s) =>
      s.selection?.ids.some((id) => {
        const m = s.messages[id];
        return !!m?.view_once || !!m?.attachments.some(isExpiredAttachment);
      }) ?? false,
  );

  const copy = async () => {
    const list = msgs().filter((m) => m.text && !m.view_once);
    const text =
      list.length === 1
        ? (list[0].text ?? "")
        : list.map((m) => `[${formatTime(m.sent_at, locale)}] ${m.outgoing ? t("common.you") : m.sender_name}: ${m.text}`).join("\n");
    if (await copyText(text)) notifyOk(t("common.copied"));
    setApp({ selection: null });
  };

  const btn = (label: string, icon: "copy" | "forward" | "trash", onClick: () => void, danger?: boolean, off?: boolean) => (
    <Tooltip label={label}>
      <button
        type="button"
        className="icon-btn"
        data-size="40"
        data-tone="muted"
        disabled={!count || off}
        onClick={onClick}
        aria-label={label}
        style={danger ? { color: "var(--danger)" } : undefined}
      >
        <Icon name={icon} size={19} />
      </button>
    </Tooltip>
  );

  return (
    <div className="chat-head">
      <button type="button" className="icon-btn" data-size="40" onClick={() => setApp({ selection: null })} aria-label={t("common.cancel")}>
        <Icon name="x" size={20} />
      </button>
      <div style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>{t("message.selected", { count })}</div>
      {btn(t("message.copy"), "copy", () => void copy())}
      {btn(t("message.forward"), "forward", () => setForward(msgs().map((m) => m.id)), false, hasViewOnce)}
      {btn(t("message.delete"), "trash", () => setDelete({ conversationId, ids: selectedMessages().map((m) => m.id) }), true)}
    </div>
  );
}
