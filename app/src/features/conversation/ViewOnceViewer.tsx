// Full-screen viewer for view-once media (crates/chat-core/src/engine/view_once.rs).
//
// Opening asks the core for the media (`openViewOnce`: marks it opened everywhere and returns
// the attachment with its path); closing revokes the blob URL, forgets it in media.ts and tells
// the core (`viewOnceDone`), which securely deletes the file. While open, the window is
// protected from screenshots and recording (where the OS supports it) whatever the user's
// setting, and copy, drag, selection and the context menu are blocked.
//
// A voice note plays once in the same overlay: from a blob: URL (never a decrypted file),
// pause allowed but no seeking, and the player closes (so the core erases the file) when
// playback ends, when the user closes it or when the window is hidden, whichever comes first.

import { Portal } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { formatDuration } from "../../lib/format";
import type { Attachment } from "../../lib/types";
import { setWindowContentProtected } from "../../lib/platform";
import { useScreenProtection } from "../../lib/screenProtection";
import { useViewOnce } from "./viewOnceStore";
import { Waveform } from "./VoicePlayer";

/** Mounted once (MainLayout). */
export function ViewOnceViewer() {
  const shown = useViewOnce((s) => !!s.src);
  if (!shown) return null;
  return <ViewOnceViewerInner />;
}

const block = (e: React.SyntheticEvent) => e.preventDefault();

function ViewOnceViewerInner() {
  const { t } = useTranslation();
  const { attachment, src, voice, close } = useViewOnce();

  // Screen protection for the viewer's lifetime, then back to the user's setting.
  useEffect(() => {
    void setWindowContentProtected(true);
    return () => {
      void setWindowContentProtected(useScreenProtection.getState().enabled);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if ((e.metaKey || e.ctrlKey) && ["c", "s", "p", "a"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  // A voice note stops for good when the window is hidden (minimized, another space).
  useEffect(() => {
    if (!voice) return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") close();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [voice, close]);

  if (!attachment || !src) return null;
  const noSelect: React.CSSProperties = { userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties;
  if (voice) {
    return (
      <Portal>
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t("viewOnce.voice")}
          style={noSelect}
          onContextMenu={block}
          onCopy={block}
          onCut={block}
          onDragStart={block}
        >
          <div className="lightbox-header">
            <span style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, fontWeight: 650, fontSize: 15 }}>
              <ViewOnceIcon size={20} />
              <span className="truncate">{t("viewOnce.voice")}</span>
            </span>
            <button type="button" className="lightbox-btn" onClick={close} aria-label={t("common.close")}>
              <Icon name="x" size={20} />
            </button>
          </div>
          <div className="lightbox-stage" onClick={(e) => e.target === e.currentTarget && close()}>
            <OnceAudio attachment={attachment} src={src} onEnded={close} />
          </div>
          <div className="lightbox-caption" style={{ textAlign: "center", opacity: 0.75 }}>
            {t("viewOnce.voiceHint")}
          </div>
        </div>
      </Portal>
    );
  }
  const video = attachment.mime.startsWith("video/");

  return (
    <Portal>
      <div
        className="lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={t(video ? "viewOnce.video" : "viewOnce.photo")}
        style={noSelect}
        onContextMenu={block}
        onCopy={block}
        onCut={block}
        onDragStart={block}
      >
        <div className="lightbox-header">
          <span style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, fontWeight: 650, fontSize: 15 }}>
            <ViewOnceIcon size={20} />
            <span className="truncate">{t(video ? "viewOnce.video" : "viewOnce.photo")}</span>
          </span>
          <button type="button" className="lightbox-btn" onClick={close} aria-label={t("common.close")}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="lightbox-stage" onClick={(e) => (!video || e.target === e.currentTarget) && close()}>
          {video ? (
            <video
              src={src}
              autoPlay
              playsInline
              controls
              controlsList="nodownload noremoteplayback noplaybackrate"
              disablePictureInPicture
              disableRemotePlayback
              draggable={false}
              onContextMenu={block}
              style={{ maxWidth: "100%", maxHeight: "100%", ...noSelect }}
            />
          ) : (
            <img src={src} alt="" draggable={false} onContextMenu={block} style={{ cursor: "default", ...noSelect }} />
          )}
        </div>
        <div className="lightbox-caption" style={{ textAlign: "center", opacity: 0.75 }}>
          {t("viewOnce.closeHint")}
        </div>
      </div>
    </Portal>
  );
}

/**
 * One-shot audio player: starts at once, can be paused and resumed, but never sought or
 * replayed; `onEnded` fires when playback finishes (or cannot start at all).
 */
function OnceAudio({ attachment, src, onEnded }: { attachment: Attachment; src: string; onEnded: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLAudioElement>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState((attachment.duration_ms ?? 0) / 1000);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The click that opened the player counts as the user gesture; if the webview still
    // refuses autoplay, the play button starts it.
    el.play().catch((e: unknown) => console.warn("view-once voice autoplay refused", e));
    return () => {
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, []);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch((e: unknown) => {
        console.warn("view-once voice playback failed", e);
        onEnded();
      });
    } else {
      el.pause();
    }
  };

  const progress = duration > 0 ? Math.min(1, time / duration) : 0;
  return (
    <div
      className="voice"
      style={{ width: 320, padding: "18px 20px", borderRadius: 22, background: "rgba(255, 255, 255, 0.08)", ["--wave-off" as string]: "rgba(255, 255, 255, 0.3)", ["--meta" as string]: "rgba(255, 255, 255, 0.7)" }}
    >
      <button type="button" className="voice-play" onClick={toggle} aria-label={isPlaying ? t("voice.pause") : t("voice.play")}>
        <Icon name={isPlaying ? "pause" : "play"} size={18} />
      </button>
      <div className="voice-body">
        {/* No seeking: listened to once, straight through. */}
        <Waveform wave={attachment.waveform} progress={progress} />
        <div className="voice-foot">
          <span>{formatDuration((isPlaying || time > 0 ? time : duration) * 1000)}</span>
        </div>
      </div>
      <audio
        ref={ref}
        src={src}
        preload="auto"
        controlsList="nodownload noremoteplayback noplaybackrate"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
        onError={onEnded}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
      />
    </div>
  );
}

/** Signal-style "1" in a dashed circle. */
export function ViewOnceIcon({ size = 18, dimmed }: { size?: number; dimmed?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, opacity: dimmed ? 0.6 : 1 }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" strokeDasharray={dimmed ? "3 2.6" : undefined} />
      {!dimmed && <path d="M12.6 7.5v9M12.6 7.5l-2.4 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

