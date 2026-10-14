// Group call screen: ringing (join / decline), then a grid of participants with video tiles or
// avatars, a speaking indicator, and mute / camera / leave controls. Plus the "call in
// progress" banner shown in the group conversation.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { useCallSettings } from "../../lib/callSettings";
import { formatDuration } from "../../lib/format";
import { useApp } from "../../store/app";
import { useCall } from "../../store/calls";
import {
  declineGroupCall,
  joinGroupCall,
  leaveGroupCall,
  refreshGroupCall,
  setGroupVoiceEffect,
  toggleGroupCamera,
  toggleGroupMute,
  useGroupCall,
  VIDEO_SUGGESTED_MAX,
  type GroupCallUi,
  type GroupPeer,
} from "../../store/groupCalls";
import { StreamVideo } from "./CallScreen";
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

function Tile({ peer, video }: { peer: GroupPeer; video: boolean }) {
  const { t } = useTranslation();
  const showVideo = video && peer.cameraOn && !!peer.stream && peer.stream.getVideoTracks().length > 0;
  return (
    <div className="gcall-tile" data-speaking={peer.speaking}>
      {showVideo ? (
        <StreamVideo stream={peer.stream!} className="gcall-video" />
      ) : (
        <UserAvatar name={peer.name} path={peer.avatar} seed={peer.accountId} size={72} />
      )}
      <div className="gcall-tile-name">
        <span>{peer.name}</span>
        {!peer.connected && <span className="gcall-tile-state">{t("call.connecting")}</span>}
      </div>
    </div>
  );
}

function SelfTile({ call }: { call: GroupCallUi }) {
  const { t } = useTranslation();
  const profile = useApp((s) => s.profile);
  const hasCamera = !!call.localStream && call.localStream.getVideoTracks().length > 0;
  return (
    <div className="gcall-tile" data-speaking={call.speaking}>
      {hasCamera && call.cameraOn ? (
        <StreamVideo stream={call.localStream!} className="gcall-video" mirror />
      ) : (
        <UserAvatar name={profile?.name ?? ""} path={profile?.avatar_path ?? null} seed="me" size={72} />
      )}
      <div className="gcall-tile-name">
        <span>{t("common.you")}</span>
        {call.muted && <Icon name="micoff" size={13} />}
      </div>
    </div>
  );
}

function Incoming({ call }: { call: GroupCallUi }) {
  const { t } = useTranslation();
  return (
    <div className="call-screen" role="dialog" aria-modal="true" aria-label={t("groupCall.incomingTitle")}>
      <div className="call-card">
        <div className="call-kind">
          <Icon name={call.video ? "video" : "lock"} size={13} />
          {t("call.encrypted")}
        </div>
        <div className="call-avatar" data-pulse>
          <UserAvatar name={call.title} path={call.avatar} seed={call.conversationId} size={112} />
        </div>
        <div className="call-name">{call.title}</div>
        <div className="call-status">{t(call.video ? "groupCall.incomingVideo" : "groupCall.incoming")}</div>
        <div className="call-actions">
          <button type="button" className="call-btn" data-tone="danger" onClick={() => void declineGroupCall()} aria-label={t("call.decline")}>
            <Icon name="phone" size={26} style={{ transform: "rotate(135deg)" }} />
            <span>{t("call.decline")}</span>
          </button>
          <button
            type="button"
            className="call-btn"
            data-tone="accept"
            onClick={() => void joinGroupCall(call.conversationId)}
            aria-label={t("groupCall.join")}
          >
            <Icon name={call.video ? "video" : "phone"} size={26} />
            <span>{t("groupCall.join")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function GroupCallScreen() {
  const { t } = useTranslation();
  const call = useGroupCall((s) => s.call);
  const elapsed = useElapsed(call?.joinedAt ?? null);
  if (!call) return null;
  if (call.phase === "incoming") return <Incoming call={call} />;
  const peers = Object.values(call.peers);
  const hasCamera = !!call.localStream && call.localStream.getVideoTracks().length > 0;
  const count = peers.length + 1;
  return (
    <div className="call-screen gcall" role="dialog" aria-modal="true" aria-label={t("groupCall.title")}>
      <div className="gcall-top">
        <div className="call-kind">
          <Icon name="lock" size={13} />
          {t("call.encrypted")}
        </div>
        <div className="call-name">{call.title}</div>
        <div className="call-status" data-active={call.phase === "active"}>
          {call.phase === "active"
            ? `${formatDuration(elapsed)} · ${t("groupCall.participants", { count, max: call.maxParticipants })}`
            : t("call.connecting")}
        </div>
      </div>
      <div className="gcall-grid" data-count={Math.min(count, 9)}>
        <SelfTile call={call} />
        {peers.map((p) => (
          <Tile key={p.key} peer={p} video={call.video} />
        ))}
      </div>
      {call.phase === "active" && peers.length === 0 && <div className="gcall-alone">{t("groupCall.waiting")}</div>}
      <div className="call-actions gcall-actions">
        <button
          type="button"
          className="call-btn"
          data-tone="soft"
          data-on={call.muted}
          onClick={toggleGroupMute}
          aria-pressed={call.muted}
          aria-label={call.muted ? t("call.unmute") : t("call.mute")}
        >
          <Icon name={call.muted ? "micoff" : "mic"} size={24} />
          <span>{call.muted ? t("call.unmute") : t("call.mute")}</span>
        </button>
        <VoiceFxButton effect={call.voiceEffect} denoise={call.denoise} onChange={(c) => void setGroupVoiceEffect(c)} disabled={call.phase !== "active"} />
        {call.video && (
          <button
            type="button"
            className="call-btn"
            data-tone="soft"
            data-on={!call.cameraOn}
            onClick={toggleGroupCamera}
            disabled={!hasCamera}
            aria-pressed={!call.cameraOn}
            aria-label={call.cameraOn ? t("call.cameraOff") : t("call.cameraOn")}
          >
            <Icon name={call.cameraOn ? "video" : "videooff"} size={24} />
            <span>{call.cameraOn ? t("call.cameraOff") : t("call.cameraOn")}</span>
          </button>
        )}
        <button type="button" className="call-btn" data-tone="danger" onClick={() => void leaveGroupCall()} aria-label={t("groupCall.leave")}>
          <Icon name="phone" size={26} style={{ transform: "rotate(135deg)" }} />
          <span>{t("groupCall.leave")}</span>
        </button>
      </div>
    </div>
  );
}

/** "Call in progress — Join" at the top of a group conversation. */
export function GroupCallBanner({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const info = useGroupCall((s) => s.ongoing[conversationId]);
  const here = useGroupCall((s) => s.call?.conversationId === conversationId);
  const busy = useCall((s) => s.call !== null);
  const allowed = useCallSettings((s) => s.allow_calls);
  useEffect(() => {
    void refreshGroupCall(conversationId);
  }, [conversationId]);
  if (!info || info.ended || info.joined || here) return null;
  const count = info.participants.length;
  const full = count >= info.max_participants;
  return (
    <button
      type="button"
      className="join-banner"
      disabled={busy || full || !allowed}
      onClick={() => void joinGroupCall(conversationId, { video: info.video && count < VIDEO_SUGGESTED_MAX })}
    >
      <Icon name={info.video ? "video" : "phone"} size={17} />
      <span className="flex1">
        {t(full ? "groupCall.bannerFull" : "groupCall.banner", { count })}
        {!allowed && ` · ${t("call.callsOffBanner")}`}
      </span>
      {!full && allowed && <span className="link-btn">{t("groupCall.join")}</span>}
    </button>
  );
}
