// Bubble body of a view-once message: a placeholder pill instead of the media (no thumbnail,
// no lightbox, no inline voice player). Incoming and unopened: a button opening ViewOnceViewer
// (which plays a voice note once).

import { Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { Message } from "../../lib/types";
import { useViewOnce } from "./viewOnceStore";
import { ViewOnceIcon } from "./ViewOnceViewer";

export function ViewOnceBody({ m, selecting }: { m: Message; selecting: boolean }) {
  const { t } = useTranslation();
  const opening = useViewOnce((s) => s.messageId === m.id && !s.src);
  const open = useViewOnce((s) => s.open);
  const a = m.attachments[0];
  const voice = m.kind === "voice";
  const video = !voice && (m.kind === "video" || !!a?.mime.startsWith("video/"));
  const state = m.view_once ?? "unopened";
  const busy = opening || a?.download_state === "downloading";

  let label: string;
  let sub: string | null = null;
  if (m.outgoing) {
    label = t(voice ? "viewOnce.voice" : video ? "viewOnce.video" : "viewOnce.photo");
    if (state === "opened") sub = t("viewOnce.opened");
    else if (state === "expired") sub = t("viewOnce.expired");
  } else if (state === "unopened") {
    label = t(voice ? "viewOnce.voice" : video ? "viewOnce.viewVideo" : "viewOnce.viewPhoto");
    if (voice) sub = t("viewOnce.tapToListen");
  } else if (voice) {
    label = t("viewOnce.voice");
    sub = t(state === "opened" ? "viewOnce.opened" : "viewOnce.expired");
  } else {
    label = t(state === "opened" ? "viewOnce.opened" : "viewOnce.expired");
  }
  const canOpen = !m.outgoing && state === "unopened";
  const dimmed = !canOpen && (m.outgoing ? state !== "unopened" : true);

  const content = (
    <>
      <span style={{ display: "flex", color: canOpen ? "var(--accent-text)" : undefined }}>
        {busy ? <Loader size={18} color="currentColor" /> : <ViewOnceIcon size={20} dimmed={dimmed} />}
      </span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0, textAlign: "start" }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
        {sub && <span style={{ fontSize: 12, opacity: 0.7 }}>{sub}</span>}
      </span>
    </>
  );
  const style: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "6px 2px", minWidth: 150 };

  return (
    <div className="bpad" style={{ paddingTop: 6 }}>
      {canOpen ? (
        <button
          type="button"
          className="link-btn"
          style={{ ...style, color: "inherit", cursor: busy || selecting ? "default" : "pointer" }}
          disabled={busy}
          onClick={(e) => {
            if (selecting) return;
            e.stopPropagation();
            void open(m);
          }}
        >
          {content}
        </button>
      ) : (
        <div style={{ ...style, opacity: dimmed ? 0.8 : 1 }}>{content}</div>
      )}
    </div>
  );
}
