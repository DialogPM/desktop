import { Loader } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { formatDuration } from "../../lib/format";
import { useMediaSrc } from "../../lib/media";
import type { Attachment, Message } from "../../lib/types";
import { downloadAttachment } from "./attachmentActions";

const SPEEDS = [1, 1.5, 2];
const BARS = 34;

/** Only one voice note plays at a time. */
let playing: HTMLAudioElement | null = null;

function resample(wave: number[] | null, n: number): number[] {
  if (!wave || wave.length === 0) return Array.from({ length: n }, () => 0.3);
  return Array.from({ length: n }, (_, i) => {
    const v = wave[Math.floor((i / n) * wave.length)] ?? 0.2;
    return Math.max(0.1, Math.min(1, v));
  });
}

export function Waveform({ wave, progress, onSeek }: { wave: number[] | null; progress: number; onSeek?: (p: number) => void }) {
  const bars = resample(wave, BARS);
  return (
    <div
      className="waveform"
      onPointerDown={(e) => {
        if (!onSeek) return;
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
      }}
    >
      {bars.map((v, i) => (
        <i key={i} data-played={i / BARS < progress} style={{ height: 5 + Math.round(v * 21) }} />
      ))}
    </div>
  );
}

export function VoicePlayer({ message, a }: { message: Message; a: Attachment }) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState((a.duration_ms ?? 0) / 1000);
  const [speed, setSpeed] = useState(1);
  const src = useMediaSrc(a.local_path, a.mime);

  useEffect(() => {
    const el = audioRef.current;
    return () => {
      if (el && playing === el) {
        el.pause();
        playing = null;
      }
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      if (playing && playing !== el) playing.pause();
      playing = el;
      el.playbackRate = speed;
      el.play().catch((e: unknown) => {
        console.warn("voice playback failed", e);
        setPlaying(false);
      });
    } else {
      el.pause();
    }
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const progress = duration > 0 ? time / duration : 0;

  return (
    <div className="voice" onClick={(e) => e.stopPropagation()}>
      {!src ? (
        a.download_state === "downloading" ? (
          <span className="voice-play">
            <Loader size="sm" color="currentColor" />
          </span>
        ) : (
          <button type="button" className="voice-play" onClick={() => downloadAttachment(message, a)} aria-label={t("message.download")}>
            <IconDownload size={19} />
          </button>
        )
      ) : (
        <button type="button" className="voice-play" onClick={toggle} aria-label={isPlaying ? t("voice.pause") : t("voice.play")}>
          <Icon name={isPlaying ? "pause" : "play"} size={18} />
        </button>
      )}
      <div className="voice-body">
        <Waveform
          wave={a.waveform}
          progress={progress}
          onSeek={
            src
              ? (p) => {
                  const el = audioRef.current;
                  if (el && duration) el.currentTime = p * duration;
                }
              : undefined
          }
        />
        <div className="voice-foot">
          <span>{formatDuration((isPlaying || time > 0 ? time : duration) * 1000)}</span>
          {src && (isPlaying || speed !== 1) && (
            <button type="button" className="speed-btn" onClick={cycleSpeed} aria-label={t("voice.speed")}>
              {speed}×
            </button>
          )}
        </div>
      </div>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setTime(0);
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDuration(d);
          }}
        />
      )}
    </div>
  );
}
