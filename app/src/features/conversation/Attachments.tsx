import { Loader, RingProgress } from "@mantine/core";
import { IconDownload, IconMicrophoneOff, IconPhotoOff } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { extOf, formatBytes, formatDuration } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import { MediaImg } from "../../components/MediaImg";
import { useMediaSrc } from "../../lib/media";
import type { Attachment, Message } from "../../lib/types";
import { downloadAttachment, saveAttachment } from "./attachmentActions";
import { useLightbox } from "./uiStore";

function DownloadBadge({ a, onClick }: { a: Attachment; onClick: () => void }) {
  const { t } = useTranslation();
  if (a.download_state === "downloading") {
    const p = Math.round((a.progress ?? 0) * 100);
    return p > 0 ? (
      <RingProgress
        size={52}
        thickness={4}
        sections={[{ value: p, color: "white" }]}
        label={<div style={{ color: "#fff", fontSize: 11, textAlign: "center" }}>{p}%</div>}
      />
    ) : (
      <Loader color="white" size="md" />
    );
  }
  return (
    <button
      type="button"
      className="dl-btn"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={t("message.download")}
    >
      <IconDownload size={22} />
    </button>
  );
}

/** One or more images (up to 4 tiles, "+N" on the last one). */
export function ImageGrid({ message, attachments, locale }: { message: Message; attachments: Attachment[]; locale: string }) {
  const open = useLightbox((s) => s.open);
  const shown = attachments.slice(0, 4);
  const extra = attachments.length - shown.length;
  const count = attachments.length > 4 ? "many" : String(attachments.length);
  const single = attachments.length === 1 ? attachments[0] : null;
  const ratio = single?.width && single?.height ? single.width / single.height : null;

  return (
    <div className="image-grid" data-count={count}>
      {shown.map((a, i) => {
        const src = a.local_path;
        return (
          <div
            key={a.id}
            className="image-tile"
            style={single && ratio ? { aspectRatio: String(Math.max(0.6, Math.min(1.9, ratio))) } : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (src) open(message, i);
              else downloadAttachment(message, a);
            }}
          >
            {src ? (
              <MediaImg path={src} fallback={a.thumbnail} mime={a.mime} alt={a.file_name} loading="lazy" draggable={false} />
            ) : a.thumbnail ? (
              <img src={a.thumbnail} alt="" className="blurred" draggable={false} />
            ) : null}
            {!src && (
              <div className="image-tile-overlay">
                <DownloadBadge a={a} onClick={() => downloadAttachment(message, a)} />
                {a.download_state !== "downloading" && <small>{formatBytes(a.size, locale)}</small>}
              </div>
            )}
            {extra > 0 && i === shown.length - 1 && src && <div className="image-tile-overlay">+{extra}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function VideoAttachment({ message, a }: { message: Message; a: Attachment }) {
  const src = useMediaSrc(a.local_path, a.mime);
  const locale = useLocale();
  if (src) return <video className="video-inline" src={src} controls preload="metadata" />;
  return (
    <div className="image-grid" data-count="1">
      <div className="image-tile" style={{ aspectRatio: "16 / 10" }} onClick={() => downloadAttachment(message, a)}>
        {a.thumbnail && <img src={a.thumbnail} alt="" className="blurred" />}
        <div className="image-tile-overlay">
          {a.download_state === "downloading" ? <DownloadBadge a={a} onClick={() => undefined} /> : <Icon name="play" size={40} />}
          <small>
            {a.duration_ms ? `${formatDuration(a.duration_ms)} · ` : ""}
            {formatBytes(a.size, locale)}
          </small>
        </div>
      </div>
    </div>
  );
}

export function FileIcon({ name }: { name: string }) {
  const ext = extOf(name);
  return <div className="file-icon">{ext.slice(0, 4) || <Icon name="file" size={20} />}</div>;
}

export function FileCard({ message, a }: { message: Message; a: Attachment }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const ext = extOf(a.file_name).toUpperCase();
  const downloaded = !!a.local_path;
  return (
    <div className="file-card">
      <FileIcon name={a.file_name} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="file-name" title={a.file_name}>
          {a.file_name}
        </div>
        <div className="file-sub">
          {formatBytes(a.size, locale)}
          {ext ? ` · ${ext}` : ""}
          {a.download_state === "downloading" && a.progress !== null ? ` · ${Math.round(a.progress * 100)}%` : ""}
        </div>
      </div>
      {a.download_state === "downloading" ? (
        <Loader size="sm" />
      ) : (
        <button
          type="button"
          className="file-action"
          onClick={(e) => {
            e.stopPropagation();
            if (downloaded) void saveAttachment(message, a);
            else downloadAttachment(message, a);
          }}
          aria-label={downloaded ? t("message.save") : t("message.download")}
          title={downloaded ? t("message.save") : t("message.download")}
        >
          <IconDownload size={17} />
        </button>
      )}
    </div>
  );
}

/** Media erased by the retention period: a neutral placeholder, no download/save/forward. */
export function ExpiredMedia({ attachments, voice }: { attachments: Attachment[]; voice: boolean }) {
  const { t } = useTranslation();
  // Documents keep their name; photos, videos and voice notes do not.
  const names = attachments.map((a) => a.file_name).filter(Boolean);
  return (
    <div className="file-card" style={{ opacity: 0.8 }}>
      <span style={{ display: "flex", padding: "0 4px" }}>{voice ? <IconMicrophoneOff size={22} /> : <IconPhotoOff size={22} />}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="file-name">{t(voice ? "retention.voiceExpired" : "retention.mediaExpired")}</div>
        {names.length > 0 && (
          <div className="file-sub" title={names.join(", ")}>
            {names.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
