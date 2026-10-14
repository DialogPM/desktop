import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ToggleRow } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { isMuted } from "../../lib/format";
import { disappearingLabel } from "../../lib/messageText";
import { MediaImg } from "../../components/MediaImg";
import type { Conversation, Message } from "../../lib/types";
import { useApp } from "../../store/app";
import { openDisappearingDialog } from "../chats/dialogs";
import { useLightbox } from "../conversation/uiStore";
import { toggleMute } from "./infoActions";
import type { InfoActionDef } from "./infoActions";
import type { InfoView } from "./InfoPanel";

/** Section card of the info pane (flush band in A, rounded sunk card in B). */
export function Sect({ children, flush, members }: { children: ReactNode; flush?: boolean; members?: boolean }) {
  return (
    <div className="sect" data-flush={flush} data-members={members}>
      {children}
    </div>
  );
}

/** The 86x66 quick action tiles under the avatar. */
export function InfoActions({ actions }: { actions: InfoActionDef[] }) {
  return (
    <div className="info-actions">
      {actions
        .filter((a) => !a.hidden)
        .map((a) => (
          <button type="button" key={a.key} className="info-action" onClick={a.onClick}>
            <span>
              <Icon name={a.icon} size={19} />
            </span>
            {a.label}
          </button>
        ))}
    </div>
  );
}

/** "Media and documents" with the first three thumbnails. */
export function MediaSection({ conversationId, onView }: { conversationId: string; onView: (v: InfoView) => void }) {
  const { t } = useTranslation();
  const [media, setMedia] = useState<Message[] | null>(null);
  const [files, setFiles] = useState(0);
  const openLightbox = useLightbox((s) => s.open);
  const lastMessage = useApp((s) => s.conversations[conversationId]?.last_message?.id);

  useEffect(() => {
    let alive = true;
    api
      .listMedia({ conversation_id: conversationId, kind: "media", limit: 200 })
      .then((m) => alive && setMedia(m))
      .catch(() => alive && setMedia([]));
    api
      .listMedia({ conversation_id: conversationId, kind: "files", limit: 200 })
      .then((m) => alive && setFiles(m.reduce((n, x) => n + x.attachments.length, 0)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [conversationId, lastMessage]);

  const items = (media ?? []).flatMap((m) =>
    m.attachments.filter((a) => a.mime.startsWith("image/") || a.mime.startsWith("video/")).map((a, i) => ({ m, a, i })),
  );
  const thumbs = items.slice(0, 3);

  return (
    <Sect>
      <button type="button" className="sect-head" onClick={() => onView("media")} style={thumbs.length ? undefined : { marginBottom: 0 }}>
        <span className="sect-title">{t("info.media")}</span>
        <span className="sect-aside">
          {items.length + files}
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {thumbs.length > 0 && (
        <div className="media-thumbs">
          {thumbs.map(({ m, a, i }) => (
            <button type="button" key={a.id} onClick={() => a.local_path && a.mime.startsWith("image/") && openLightbox(m, i)} aria-label={a.file_name}>
              {(a.local_path || a.thumbnail) && (
                <MediaImg path={a.local_path} fallback={a.thumbnail} mime={a.mime} style={a.local_path ? undefined : { filter: "blur(4px)" }} />
              )}
            </button>
          ))}
        </div>
      )}
    </Sect>
  );
}

/** Mute + disappearing messages switches. */
export function ChatToggles({ conv, extra }: { conv: Conversation; extra?: ReactNode }) {
  const { t } = useTranslation();
  const muted = isMuted(conv);
  // Group timer: a group rule only admins change.
  const timerLocked = useApp((s) => conv.kind === "group" && s.groups[conv.id]?.my_role !== "admin");
  return (
    <Sect flush>
      <ToggleRow
        icon={<Icon name="bell" size={19} />}
        label={t("info.muteNotifications")}
        sub={muted ? t("info.on") : t("info.off")}
        on={muted}
        onToggle={() => toggleMute(conv)}
      />
      {!conv.left && (
        <ToggleRow
          icon={<Icon name="clock" size={19} />}
          label={t("disappearing.title")}
          sub={timerLocked ? `${disappearingLabel(conv.disappearing_seconds, t)} · ${t("groupRules.timerByAdmins")}` : disappearingLabel(conv.disappearing_seconds, t)}
          on={conv.disappearing_seconds > 0}
          disabled={timerLocked}
          onToggle={() => openDisappearingDialog(conv)}
        />
      )}
      {extra}
    </Sect>
  );
}

export function DangerRow({ icon, label, onClick, tone }: { icon: ReactNode; label: ReactNode; onClick: () => void; tone?: "ink" }) {
  return (
    <button type="button" className="danger-row" data-tone={tone} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}
