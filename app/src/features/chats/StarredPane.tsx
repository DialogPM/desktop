import { IconStarFilled } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PaneHeader } from "../../components/PaneHeader";
import { UserAvatar } from "../../components/UserAvatar";
import { api } from "../../lib/api";
import { formatListTime } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import { isolate, previewText } from "../../lib/messageText";
import type { Message } from "../../lib/types";
import { openConversation } from "../../store/actions";
import { setApp, useApp } from "../../store/app";
import { starMessage } from "../conversation/messageActions";

/** Starred messages of every chat (this device only, a week each). */
export function StarredPane() {
  const { t } = useTranslation();
  const locale = useLocale();
  const convs = useApp((s) => s.conversations);
  const [list, setList] = useState<Message[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .starredMessages()
      .then((l) => alive && setList(l))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [version]);

  return (
    <>
      <PaneHeader title={t("star.title")} onBack={() => setApp({ sidebar: "chats" })} />
      <div className="pane-scroll">
        {list?.length === 0 && (
          <div className="empty-hint" style={{ padding: "32px 24px", textAlign: "center" }}>
            <div style={{ fontWeight: 650, marginBottom: 6 }}>{t("star.empty")}</div>
            <div className="hint">{t("star.emptyHint")}</div>
          </div>
        )}
        {list?.map((m) => {
          const c = convs[m.conversation_id];
          if (!c) return null;
          return (
            <div key={m.id} className="starred-row">
              <button
                type="button"
                className="chat-row"
                onClick={() => {
                  openConversation(c.id);
                  setApp({ highlightId: m.id });
                }}
              >
                <UserAvatar name={c.title} path={c.avatar_path} seed={c.id} size={44} group={c.kind === "group"} />
                <div className="chat-row-body">
                  <div className="chat-row-top">
                    <span className="chat-row-name">{c.title}</span>
                    <span className="chat-row-time">{formatListTime(m.sent_at, locale, t)}</span>
                  </div>
                  <div className="chat-row-bottom">
                    <span className="chat-row-preview">
                      {m.outgoing ? `${t("common.you")}: ` : c.kind === "group" ? `${isolate(m.sender_name)}: ` : ""}
                      {previewText(m.kind, m.text, t)}
                    </span>
                  </div>
                </div>
              </button>
              <button
                type="button"
                className="icon-btn starred-toggle"
                aria-label={t("star.unstar")}
                title={t("star.unstar")}
                onClick={() => void starMessage(m, false).then(() => setVersion((v) => v + 1))}
              >
                <IconStarFilled size={17} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
