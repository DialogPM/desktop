import { Portal, Tooltip } from "@mantine/core";
import { IconDownload, IconZoomIn, IconZoomOut, IconZoomReset } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { formatDateTime } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import { MediaImg } from "../../components/MediaImg";
import { useApp } from "../../store/app";
import { saveAttachment } from "./attachmentActions";
import { isImage, useLightbox } from "./uiStore";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export function Lightbox() {
  const opened = useLightbox((s) => s.message);
  if (!opened) return null;
  return <LightboxInner key={opened.id} />;
}

function LightboxInner() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { message: initial, index, close, setIndex } = useLightbox();
  // Keep the latest version of the message (download states etc.).
  const message = useApp((s) => (initial ? (s.messages[initial.id] ?? initial) : null));
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const images = message ? message.attachments.filter((a) => isImage(a) && a.local_path) : [];
  const current = images[Math.min(index, images.length - 1)];

  const go = (d: number) => {
    if (!images.length) return;
    setIndex((index + d + images.length) % images.length);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const setZoomClamped = (z: number) => {
    const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    setZoom(nz);
    if (nz === 1) setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "+" || e.key === "=") setZoomClamped(zoom * 1.4);
      else if (e.key === "-") setZoomClamped(zoom / 1.4);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!message || !current) return null;
  const caption = message.text;

  return (
    <Portal>
      <div className="lightbox" role="dialog" aria-modal="true">
        <div className="lightbox-header">
          <UserAvatar name={message.sender_name} seed={message.sender_account_id} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="truncate" style={{ fontWeight: 650, fontSize: 15 }}>{message.outgoing ? t("common.you") : message.sender_name}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.62)" }}>
              {formatDateTime(message.sent_at, locale)}
              {images.length > 1 ? ` · ${index + 1}/${images.length}` : ""}
            </div>
          </div>
          <Tooltip label={t("lightbox.zoomOut")}>
            <button type="button" className="lightbox-btn" onClick={() => setZoomClamped(zoom / 1.4)} aria-label={t("lightbox.zoomOut")}>
              <IconZoomOut size={20} />
            </button>
          </Tooltip>
          <Tooltip label={t("lightbox.reset")}>
            <button type="button" className="lightbox-btn" onClick={() => setZoomClamped(1)} aria-label={t("lightbox.reset")}>
              <IconZoomReset size={20} />
            </button>
          </Tooltip>
          <Tooltip label={t("lightbox.zoomIn")}>
            <button type="button" className="lightbox-btn" onClick={() => setZoomClamped(zoom * 1.4)} aria-label={t("lightbox.zoomIn")}>
              <IconZoomIn size={20} />
            </button>
          </Tooltip>
          <Tooltip label={t("message.save")}>
            <button type="button" className="lightbox-btn" onClick={() => void saveAttachment(message, current)} aria-label={t("message.save")}>
              <IconDownload size={20} />
            </button>
          </Tooltip>
          <button type="button" className="lightbox-btn" onClick={close} aria-label={t("common.close")}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div
          className="lightbox-stage"
          onClick={(e) => e.target === e.currentTarget && zoom === 1 && close()}
          onWheel={(e) => setZoomClamped(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}
          onPointerDown={(e) => {
            if (zoom === 1) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            setDragging(true);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
          }}
          onPointerUp={() => {
            drag.current = null;
            setDragging(false);
          }}
        >
          <MediaImg
            path={current.local_path}
            mime={current.mime}
            alt={current.file_name}
            draggable={false}
            onDoubleClick={() => setZoomClamped(zoom > 1 ? 1 : 2.5)}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              cursor: zoom > 1 ? "grab" : "zoom-in",
              transition: dragging ? "none" : undefined,
            }}
          />
          {images.length > 1 && (
            <>
              <button type="button" className="lightbox-btn lightbox-nav" style={{ left: 12 }} onClick={() => go(-1)} aria-label={t("lightbox.previous")}>
                <Icon name="chevron" size={24} style={{ transform: "rotate(180deg)" }} />
              </button>
              <button type="button" className="lightbox-btn lightbox-nav" style={{ right: 12 }} onClick={() => go(1)} aria-label={t("lightbox.next")}>
                <Icon name="chevron" size={24} />
              </button>
            </>
          )}
        </div>
        {caption && <div className="lightbox-caption">{caption}</div>}
      </div>
    </Portal>
  );
}
