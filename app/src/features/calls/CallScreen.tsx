// Full-window call screen: incoming (accept / decline), outgoing, connecting, active.
// Video calls show the peer's video full-window and our camera picture-in-picture.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { formatDuration } from "../../lib/format";
import { acceptCall, declineCall, hangUp, setVoiceEffect, toggleCamera, toggleMute, useCall, type CallState } from "../../store/calls";
import { VoiceFxButton } from "./VoiceFxButton";

function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [since]);
  return since ? Math.max(0, now - since) : 0;
}

function statusText(call: CallState, elapsed: number, t: (k: string) => string): string {
  switch (call.phase) {
    case "incoming":
      return t(call.video ? "call.incomingVideo" : "call.incoming");
    case "outgoing":
      return call.ringing ? t("call.ringing") : t("call.calling");
    case "connecting":
      return t("call.connecting");
    case "active":
      return formatDuration(elapsed);
  }
}

/** "Weak connection" notice of an active call (lib/callAudio.ts), and why our camera stopped. */
function QualityNotice({ call }: { call: CallState }) {
  const { t } = useTranslation();
  if (call.phase !== "active") return null;
  const weak = call.quality !== "good";
  if (!weak && !call.autoCameraOff) return null;
  const text = call.autoCameraOff
    ? t("call.quality.cameraStopped")
    : call.qualityWho === "me"
      ? t("call.quality.mine")
      : call.qualityWho === "peer"
        ? t("call.quality.peer", { name: call.peerName })
        : t("call.quality.weak");
  return (
    <div className="call-quality" data-level={call.autoCameraOff && !weak ? "poor" : call.quality} role="status">
      <span className="call-quality-bars" aria-hidden>
        <i />
        <i data-on={call.quality !== "bad"} />
        <i data-on={false} />
      </span>
      {text}
    </div>
  );
}

/** Muted <video> bound to a MediaStream (audio plays elsewhere). */
export function StreamVideo({ stream, className, mirror }: { stream: MediaStream; className: string; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
    return () => {
      el.srcObject = null;
    };
  }, [stream]);
  return <video ref={ref} className={className} data-mirror={mirror} autoPlay playsInline muted />;
}

function MuteButton({ call }: { call: CallState }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="call-btn"
      data-tone="soft"
      data-on={call.muted}
      onClick={toggleMute}
      disabled={call.phase === "outgoing" && !call.video}
      aria-pressed={call.muted}
      aria-label={call.muted ? t("call.unmute") : t("call.mute")}
    >
      <Icon name={call.muted ? "micoff" : "mic"} size={24} />
      <span>{call.muted ? t("call.unmute") : t("call.mute")}</span>
    </button>
  );
}

function EndButton() {
  const { t } = useTranslation();
  return (
    <button type="button" className="call-btn" data-tone="danger" onClick={() => void hangUp()} aria-label={t("call.end")}>
      <Icon name="phone" size={26} style={{ transform: "rotate(135deg)" }} />
      <span>{t("call.end")}</span>
    </button>
  );
}

function VideoCall({ call, elapsed }: { call: CallState; elapsed: number }) {
  const { t } = useTranslation();
  const hasCamera = !!call.localStream && call.localStream.getVideoTracks().length > 0;
  const remoteVideo = call.remoteStream && call.remoteCameraOn && call.remoteStream.getVideoTracks().length > 0;
  return (
    <div className="call-screen call-video" role="dialog" aria-modal="true" aria-label={t("call.videoTitle")}>
      {remoteVideo ? (
        <StreamVideo stream={call.remoteStream!} className="call-remote" />
      ) : (
        <div className="call-video-placeholder">
          <div className="call-avatar" data-pulse={call.phase !== "active"}>
            <UserAvatar name={call.peerName} path={call.peerAvatar} seed={call.conversationId} size={128} />
          </div>
          {call.phase === "active" && !call.remoteCameraOn && <div className="call-status">{t("call.peerCameraOff")}</div>}
        </div>
      )}
      <div className="call-video-top">
        <div className="call-kind">
          <Icon name="lock" size={13} />
          {t("call.encrypted")}
        </div>
        <div className="call-name">{call.peerName}</div>
        <div className="call-status" data-active={call.phase === "active"}>
          {statusText(call, elapsed, t)}
        </div>
        <QualityNotice call={call} />
      </div>
      {hasCamera && call.cameraOn && <StreamVideo stream={call.localStream!} className="call-local" mirror />}
      <div className="call-actions call-video-actions">
        <MuteButton call={call} />
        <VoiceFxButton effect={call.voiceEffect} denoise={call.denoise} onChange={(c) => void setVoiceEffect(c)} disabled={call.phase !== "active"} />
        <button
          type="button"
          className="call-btn"
          data-tone="soft"
          data-on={!call.cameraOn}
          onClick={toggleCamera}
          disabled={!hasCamera}
          aria-pressed={!call.cameraOn}
          aria-label={call.cameraOn ? t("call.cameraOff") : t("call.cameraOn")}
        >
          <Icon name={call.cameraOn ? "video" : "videooff"} size={24} />
          <span>{call.cameraOn ? t("call.cameraOff") : t("call.cameraOn")}</span>
        </button>
        <EndButton />
      </div>
    </div>
  );
}

export function CallScreen() {
  const { t } = useTranslation();
  const call = useCall((s) => s.call);
  const elapsed = useElapsed(call?.connectedAt ?? null);
  if (!call) return null;
  const incoming = call.phase === "incoming";
  if (call.video && !incoming) return <VideoCall call={call} elapsed={elapsed} />;

  return (
    <div className="call-screen" role="dialog" aria-modal="true" aria-label={t(call.video ? "call.videoTitle" : "call.title")}>
      <div className="call-card">
        <div className="call-kind">
          <Icon name={call.video ? "video" : "lock"} size={13} />
          {t("call.encrypted")}
        </div>
        <div className="call-avatar" data-pulse={call.phase !== "active"}>
          <UserAvatar name={call.peerName} path={call.peerAvatar} seed={call.conversationId} size={112} />
        </div>
        <div className="call-name">{call.peerName}</div>
        <div className="call-status" data-active={call.phase === "active"}>
          {statusText(call, elapsed, t)}
        </div>
        <QualityNotice call={call} />
        <div className="call-actions">
          {incoming ? (
            <>
              <button type="button" className="call-btn" data-tone="danger" onClick={() => void declineCall()} aria-label={t("call.decline")}>
                <Icon name="phone" size={26} style={{ transform: "rotate(135deg)" }} />
                <span>{t("call.decline")}</span>
              </button>
              <button type="button" className="call-btn" data-tone="accept" onClick={() => void acceptCall()} aria-label={t("call.accept")}>
                <Icon name={call.video ? "video" : "phone"} size={26} />
                <span>{t("call.accept")}</span>
              </button>
            </>
          ) : (
            <>
              <MuteButton call={call} />
              <VoiceFxButton effect={call.voiceEffect} denoise={call.denoise} onChange={(c) => void setVoiceEffect(c)} disabled={call.phase !== "active"} />
              <EndButton />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
