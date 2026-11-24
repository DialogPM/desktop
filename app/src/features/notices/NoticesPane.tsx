// Notices from the operator of the server this account is on ("maintenance tonight", "update
// required"). The core keeps only notices whose operator signature checks out. They are not
// chat messages: nobody can be answered here. The text is shown exactly as sent (plain text,
// line breaks kept); web addresses become links only as their own literal text (lib/format.ts
// linkify), never as Markdown or HTML, so a notice cannot hide where a link leads.

import { Tooltip } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { PaneHeader } from "../../components/PaneHeader";
import { formatDateTime, linkify } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import { openExternal } from "../../lib/platform";
import type { Notice } from "../../lib/types";
import { attempt } from "../../store/actions";
import { setApp } from "../../store/app";
import { deleteNotice, markNoticesRead, setNoticesViewOpen, useNotices } from "../../store/notices";
import { useServerName } from "../../store/selectors";

export function NoticesPane() {
  const { t } = useTranslation();
  const server = useServerName();
  const notices = useNotices((s) => s.notices);
  const unread = useNotices((s) => s.unread);
  // Notices that were unread when the view opened keep a "new" mark while it stays open,
  // although opening the view marks them read at once.
  const [fresh, setFresh] = useState<ReadonlySet<number>>(
    () => new Set(useNotices.getState().notices.filter((n) => !n.read).map((n) => n.id)),
  );

  useEffect(() => {
    setNoticesViewOpen(true);
    return () => setNoticesViewOpen(false);
  }, []);

  // Opening the view reads everything; so does a notice arriving while it is on screen
  // (once the window has the focus: one arriving in the background still counts as unread).
  useEffect(() => {
    if (unread === 0) return;
    const read = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      const ids = useNotices.getState().notices.filter((n) => !n.read).map((n) => n.id);
      setFresh((prev) => new Set([...prev, ...ids]));
      markNoticesRead();
    };
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [unread]);

  return (
    <>
      <PaneHeader title={t("notices.title")} onBack={() => setApp({ sidebar: "chats" })} />
      <div className="pane-scroll">
        <div className="notice notices-intro">
          <span className="notices-intro-icon" aria-hidden>
            <Icon name="server" size={18} />
          </span>
          <span>{t("notices.from", { server })}</span>
        </div>
        {notices.length === 0 ? (
          <div className="notices-empty">
            <span className="notices-empty-icon" aria-hidden>
              <Icon name="bell" size={26} />
            </span>
            <div style={{ fontWeight: 650 }}>{t("notices.empty")}</div>
            <div className="hint">{t("notices.emptyHint", { server })}</div>
          </div>
        ) : (
          <ul className="notices-list" aria-label={t("notices.title")}>
            {notices.map((n) => (
              <NoticeItem key={n.id} n={n} fresh={fresh.has(n.id)} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function NoticeItem({ n, fresh }: { n: Notice; fresh: boolean }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  return (
    <li className="op-notice" data-new={fresh}>
      <div className="op-notice-head">
        {fresh && <span className="op-notice-dot" aria-label={t("notices.new")} role="img" />}
        <div className="op-notice-title" dir="auto">{n.title}</div>
        <Tooltip label={t("notices.delete")}>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("notices.delete")}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await attempt(() => deleteNotice(n.id));
              setBusy(false);
            }}
          >
            <Icon name="trash" size={16} />
          </button>
        </Tooltip>
      </div>
      <time className="op-notice-date" dateTime={Number.isFinite(n.created_at) ? new Date(n.created_at).toISOString() : undefined}>
        {formatDateTime(n.created_at, locale)}
      </time>
      {n.body && (
        <div className="op-notice-body" dir="auto">
          {linkify(n.body).map((p, i) =>
            p.href ? (
              <a
                key={i}
                href={p.href}
                title={p.href}
                onClick={(e) => {
                  e.preventDefault();
                  void openExternal(p.href!);
                }}
              >
                {p.text}
              </a>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </div>
      )}
    </li>
  );
}
