// Records a voice note and shows a live waveform and timer. The "1" button before sending
// makes it a view-once voice message (played a single time, then erased: engine/view_once.rs).
// The ✨ button picks a voice effect for this note (lib/voiceFx.ts); "anonymous" (the default
// when "anonymized voice" is on, lib/voiceMask.ts) is done by the core's voice_mask.rs. If the
// effect fails nothing is sent (never the original voice).
//
// Audio is captured as raw PCM through Web Audio and encoded as WAV (lib/wav.ts) instead of
// using MediaRecorder: WebKit's MediaRecorder (macOS and Linux webviews) can report a format
// as supported and still deliver no data, and its formats (WebM/Opus, AAC) are not playable
// on every receiving platform.
//
// A microphone (Bluetooth headsets above all) can take a few seconds to deliver sound after it is
// opened, sending only digital silence meanwhile. The recorder shows "starting the microphone"
// and starts the timer only with the first real sound, so nothing said after it shows is lost.

import { Menu, Tooltip } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { formatDuration } from "../../lib/format";
import type { OutgoingAttachment } from "../../lib/types";
import { applyEffect, VOICE_EFFECT_EMOJI, VOICE_EFFECTS, type VoiceEffect } from "../../lib/voiceFx";
import { maskVoice, useVoiceMask, VOICE_MASK_AVAILABLE } from "../../lib/voiceMask";
import { bytesToBase64, encodeWav } from "../../lib/wav";
import i18n from "../../i18n";
import { ViewOnceIcon } from "./ViewOnceViewer";

const WAVE_POINTS = 48;
const MAX_MS = 15 * 60_000;
/** After this long without any sound from the microphone, record anyway (a truly silent input). */
const MIC_WARMUP_MAX_MS = 4000;

function downsample(levels: number[], n: number): number[] {
  if (levels.length === 0) return Array(n).fill(0.1);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * levels.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / n) * levels.length));
    const slice = levels.slice(a, b);
    out.push(slice.reduce((x, y) => Math.max(x, y), 0));
  }
  const max = Math.max(...out, 0.01);
  return out.map((v) => Math.max(0.05, Math.min(1, v / max)));
}

interface Props {
  onCancel: () => void;
  onSend: (att: OutgoingAttachment, viewOnce: boolean) => void;
}

export function VoiceRecorder({ onCancel, onSend }: Props) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const [viewOnce, setViewOnce] = useState(false);
  const [masking, setMasking] = useState(false);
  const maskByDefault = useVoiceMask((s) => s.enabled);
  const [effect, setEffect] = useState<VoiceEffect>(maskByDefault ? "anonymous" : "none");
  const effectRef = useRef(effect);
  const viewOnceRef = useRef(false);
  const chunks = useRef<Float32Array[]>([]);
  const sampleRate = useRef(48_000);
  const stopRef = useRef<(() => void) | null>(null);
  const allLevels = useRef<number[]>([]);
  const startedAt = useRef(0);
  const sendOnStop = useRef(false);
  const onSendRef = useRef(onSend);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onSendRef.current = onSend;
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    let cancelled = false;
    let stopped = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer = 0;

    const release = () => {
      window.clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      void ctx?.close().catch(() => undefined);
    };

    const stop = () => {
      if (stopped) return;
      stopped = true;
      const duration = Date.now() - startedAt.current;
      release();
      if (!sendOnStop.current) return;
      const samples = chunks.current.reduce((n, c) => n + c.length, 0);
      if (duration < 700 || samples === 0) {
        console.warn(`voice note discarded: ${duration} ms, ${samples} samples`);
        // Stopped while the microphone was still starting: nothing was recorded, not an error.
        if (samples === 0 && startedAt.current > 0) notifications.show({ color: "red", message: i18n.t("voice.micError") });
        onCancelRef.current();
        return;
      }
      const recorded = chunks.current;
      const rate = sampleRate.current;
      chunks.current = [];
      const send = (data: string) =>
        onSendRef.current({
          data_base64: data,
          file_name: `voice-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`,
          mime: "audio/wav",
          kind: "voice",
          duration_ms: duration,
          waveform: downsample(allLevels.current, WAVE_POINTS),
        }, viewOnceRef.current);
      const fx = effectRef.current;
      console.info(`voice note recorded: ${duration} ms, effect ${fx}`);
      if (fx === "none") {
        send(bytesToBase64(encodeWav(recorded, rate)));
        return;
      }
      setMasking(true);
      const processed = async (): Promise<string> => {
        if (fx === "anonymous" && VOICE_MASK_AVAILABLE) return maskVoice(bytesToBase64(encodeWav(recorded, rate)));
        const all = new Float32Array(samples);
        let off = 0;
        for (const c of recorded) {
          all.set(c, off);
          off += c.length;
        }
        return bytesToBase64(encodeWav([await applyEffect(all, rate, fx)], rate));
      };
      processed().then(send, (e: unknown) => {
        console.warn("voice effect failed", e);
        notifications.show({ color: "red", message: i18n.t("voice.maskError") });
        onCancelRef.current();
      });
    };
    stopRef.current = stop;

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (e) {
        console.warn("microphone unavailable", e);
        notifications.show({ color: "red", message: i18n.t("voice.micError") });
        onCancelRef.current();
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
      sampleRate.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      // ScriptProcessorNode is deprecated but works in every WebKit/Chromium webview without
      // loading a worklet module; it must be connected to the destination to run (muted).
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      let peak = 0;
      let isLive = false;
      const opened = Date.now();
      proc.onaudioprocess = (e) => {
        if (stopped) return;
        const data = e.inputBuffer.getChannelData(0);
        if (!isLive) {
          // Digital silence (exact zeros) while the device starts up is dropped.
          let max = 0;
          for (const v of data) max = Math.max(max, Math.abs(v));
          if (max < 1e-6 && Date.now() - opened < MIC_WARMUP_MAX_MS) return;
          isLive = true;
          startedAt.current = Date.now();
          setLive(true);
        }
        chunks.current.push(new Float32Array(data));
        let sum = 0;
        for (const v of data) sum += v * v;
        peak = Math.max(peak, Math.min(1, Math.sqrt(sum / data.length) * 4));
      };
      source.connect(proc);
      proc.connect(mute);
      mute.connect(ctx.destination);

      timer = window.setInterval(() => {
        if (!isLive) return;
        const level = peak;
        peak = 0;
        allLevels.current.push(level);
        setLevels((l) => [...l.slice(-59), level]);
        const ms = Date.now() - startedAt.current;
        setElapsed(ms);
        if (ms > MAX_MS) {
          sendOnStop.current = true;
          stop();
        }
      }, 100);
    };
    void start();

    return () => {
      cancelled = true;
      sendOnStop.current = false;
      stop();
      release();
    };
  }, []);

  const finish = (send: boolean) => {
    sendOnStop.current = send;
    stopRef.current?.();
    if (!send) onCancel();
  };

  return (
    <>
      <Tooltip label={t("voice.cancel")}>
        <button type="button" className="composer-round" data-tone="danger" disabled={masking} onClick={() => finish(false)} aria-label={t("voice.cancel")}>
          <Icon name="trash" size={20} />
        </button>
      </Tooltip>
      <div className="recorder">
        <span className="rec-dot" data-waiting={!live || undefined} />
        <span className="rec-time">{live ? formatDuration(elapsed) : t("voice.starting")}</span>
        {masking && <span className="rec-time">{t("voice.maskProcessing")}</span>}
        <div className="live-wave" aria-hidden>
          {levels.map((v, i) => (
            <i key={i} style={{ height: `${Math.max(12, v * 100)}%` }} />
          ))}
        </div>
      </div>
      <Menu position="top" withinPortal shadow="md" disabled={masking}>
        <Menu.Target>
          <button
            type="button"
            className="composer-round"
            disabled={masking}
            style={{ background: effect !== "none" ? "var(--accent)" : "var(--sunk)", color: effect !== "none" ? "var(--on-accent)" : undefined }}
            aria-label={t("voiceFx.title")}
            title={effect !== "none" ? t(`voiceFx.${effect}`) : t("voiceFx.title")}
          >
            {effect !== "none" ? <span style={{ fontSize: 18 }}>{VOICE_EFFECT_EMOJI[effect]}</span> : <IconSparkles size={20} stroke={1.8} />}
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{t("voiceFx.title")}</Menu.Label>
          {VOICE_EFFECTS.map((e) => (
            <Menu.Item
              key={e}
              leftSection={<span style={{ fontSize: 18 }}>{VOICE_EFFECT_EMOJI[e]}</span>}
              style={e === effect ? { fontWeight: 700 } : undefined}
              onClick={() => {
                effectRef.current = e;
                setEffect(e);
              }}
            >
              {t(`voiceFx.${e}`)}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      <Tooltip label={viewOnce ? t("viewOnce.voiceToggleOn") : t("viewOnce.voiceToggle")} multiline maw={260}>
        <button
          type="button"
          className="composer-round"
          style={{ background: viewOnce ? "var(--accent)" : "var(--sunk)", color: viewOnce ? "var(--on-accent)" : undefined }}
          aria-pressed={viewOnce}
          aria-label={t("viewOnce.voiceToggle")}
          onClick={() => {
            viewOnceRef.current = !viewOnce;
            setViewOnce(!viewOnce);
          }}
        >
          <ViewOnceIcon size={20} />
        </button>
      </Tooltip>
      <Tooltip label={t("voice.send")}>
        <button type="button" className="composer-send" disabled={masking} onClick={() => finish(true)} aria-label={t("voice.send")}>
          <Icon name="send" size={19} />
        </button>
      </Tooltip>
    </>
  );
}
