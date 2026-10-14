import { BRAND_NAME } from "../../brand";
import { Menu, Text } from "@mantine/core";
import { IconMoonStars } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PasswordField, RadioDot, TextField, ToggleRow } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { PaneHeader } from "../../components/PaneHeader";
import { UserAvatar } from "../../components/UserAvatar";
import i18n, { LANGUAGES, setLanguage, type LanguageCode } from "../../i18n";
import { api } from "../../lib/api";
import { TEXT_SCALES, useAppearance, type Direction, type ThemePref } from "../../lib/appearance";
import { RELOCK_CHOICES_MS, setLockEnabled, setRelockAfterMs, useAppLock } from "../../lib/appLock";
import { OptionsDialog } from "../../components/OptionsDialog";
import { useIsMobile } from "../../lib/hooks";
import { openExternal, pickedPath, pickFiles } from "../../lib/platform";
import type { PrivacySettings } from "../../lib/types";
import { useScreenProtection } from "../../lib/screenProtection";
import { attempt, errorText, goBack, notifyOk, openSettings } from "../../store/actions";
import { getApp, setApp, useApp, type SettingsSection } from "../../store/app";
import { AccountSection } from "./AccountSection";
import { BlockedRow, BlockedSection } from "./BlockedSection";
import { openCameraCapture } from "./cameraDialog";
import { ChatsSection } from "./ChatsSection";
import { DevicesSection } from "./DevicesSection";
import { useNotifyPrefs } from "../../lib/notifyPrefs";
import { ensureNotificationPermission, notificationPermission, showNotification } from "../../lib/platform";
import { playIncoming } from "../../lib/sounds";
import { setCallSettings, useCallSettings } from "../../lib/callSettings";
import { runMediaCheck, setMediaRetention, useMediaRetention } from "../../lib/mediaRetention";
import { setDefaultTimer, useDefaultTimer } from "../../lib/defaultTimer";
import { DISAPPEARING_OPTIONS, disappearingLabel } from "../../lib/messageText";
import { dndUntilText, setDnd, useDnd } from "../../lib/dnd";
import { openDndDialog } from "./dndDialog";
import { maskVoice, recordSample, useVoiceMask, VOICE_MASK_AVAILABLE } from "../../lib/voiceMask";
import { bytesToBase64, encodeWav } from "../../lib/wav";
import { applyEffect, useCallAudioPrefs, VOICE_EFFECT_EMOJI, VOICE_EFFECTS, type VoiceEffect } from "../../lib/voiceFx";

const LICENSE_URL = "https://www.gnu.org/licenses/agpl-3.0.html";

export function SettingsPage({ section }: { section: SettingsSection }) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  let body: ReactNode;
  switch (section) {
    case "profile":
      body = <ProfileSection />;
      break;
    case "account":
      body = <AccountSection />;
      break;
    case "privacy":
      body = <PrivacySection />;
      break;
    case "notifications":
      body = <NotificationsSection />;
      break;
    case "devices":
      body = <DevicesSection />;
      break;
    case "chats":
      body = <ChatsSection />;
      break;
    case "appearance":
      body = <AppearanceSection />;
      break;
    case "language":
      body = <LanguageSection />;
      break;
    case "about":
      body = <AboutSection />;
      break;
    case "blocked":
      body = <BlockedSection />;
      break;
  }
  // The blocked list is a sub-page of Privacy: its back arrow returns there (also on desktop).
  const onBack = section === "blocked" ? () => openSettings("privacy") : mobile ? goBack : undefined;
  return (
    <>
      <PaneHeader title={t(`settings.${section}.title`)} onBack={onBack} />
      <div className="set-body">
        <div className="set-body-inner">{body}</div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function ProfileSection() {
  const { t } = useTranslation();
  const profile = useApp((s) => s.profile);
  const [name, setName] = useState(profile?.name ?? "");
  const [about, setAbout] = useState(profile?.about ?? "");

  // Saved when a field loses focus (or on Enter), like the design which has no save button.
  const save = async () => {
    const p0 = getApp().profile;
    const n = name.trim();
    const a = about.trim();
    if (!n || (n === (p0?.name ?? "") && a === (p0?.about ?? ""))) {
      if (!n) setName(p0?.name ?? "");
      return;
    }
    const p = await attempt(() => api.setProfile({ name: n, about: a }));
    if (p) {
      setApp({ profile: p });
      notifyOk(t("common.saved"));
    }
  };

  const setAvatar = async (remove: boolean) => {
    let path = "";
    if (!remove) {
      const [f] = await pickFiles({ kind: "image" });
      if (!f) return;
      path = pickedPath(f);
    }
    const p = await attempt(() => api.setProfile({ avatar_path: path }));
    if (p) setApp({ profile: p });
  };

  const takePhoto = () =>
    openCameraCapture(async (dataUrl) => {
      const p = await attempt(() => api.setProfile({ avatar_data_base64: dataUrl }));
      if (p) setApp({ profile: p });
      return !!p;
    }, () => void setAvatar(false));

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 0 10px" }}>
        <Menu position="bottom">
          <Menu.Target>
            <button type="button" className="avatar-edit" aria-label={t("profile.changePhoto")}>
              <UserAvatar name={name || "?"} path={profile?.avatar_path} seed="me" size={124} />
              <span className="avatar-edit-badge">
                <Icon name="camera" size={17} />
              </span>
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<Icon name="image" size={17} />} onClick={() => void setAvatar(false)}>
              {t("profile.choosePhoto")}
            </Menu.Item>
            <Menu.Item leftSection={<Icon name="camera" size={17} />} onClick={takePhoto}>
              {t("profile.takePhoto")}
            </Menu.Item>
            {profile?.avatar_path && (
              <Menu.Item color="red" leftSection={<Icon name="trash" size={17} />} onClick={() => void setAvatar(true)}>
                {t("profile.removePhoto")}
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </div>
      <TextField
        label={t("settings.profile.name")}
        mutedLabel
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.currentTarget.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <TextField
        label={t("settings.profile.about")}
        mutedLabel
        placeholder={t("settings.profile.aboutPlaceholder")}
        value={about}
        maxLength={140}
        onChange={(e) => setAbout(e.currentTarget.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <div className="hint">{t("settings.profile.visibility")}</div>
    </>
  );
}

// ---------------------------------------------------------------------------

function EnableLockForm({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await api.verifyPassword({ password });
      if (!ok) {
        setError(t("lock.wrongPassword"));
        return;
      }
      setLockEnabled(accountId, true);
      modals.closeAll();
      notifyOk(t("lock.enabled"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (password) void submit();
      }}
    >
      <div className="hint" style={{ fontSize: 13.5 }}>
        {t("lock.enableHint")}
      </div>
      <PasswordField label={t("password.label")} value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" data-autofocus error={error} />
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={() => modals.closeAll()}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn btn-primary" disabled={!password || busy}>
          {t("lock.enable")}
        </button>
      </div>
    </form>
  );
}

function PrivacySection() {
  const { t } = useTranslation();
  const privacy = useApp((s) => s.details?.privacy);
  const accountId = useApp((s) => s.details?.account.account_id);
  const notifPreview = useAppearance((s) => s.notifPreview);
  const setNotifPreview = useAppearance((s) => s.setNotifPreview);
  const lockEnabled = useAppLock((s) => s.enabled);
  const relockMs = useAppLock((s) => s.relockMs);
  const noCapture = useScreenProtection((s) => s.enabled);
  const capturePausedUntil = useScreenProtection((s) => s.pausedUntil);
  const pauseCapture = useScreenProtection((s) => s.pause);
  const resumeCapture = useScreenProtection((s) => s.resume);
  // Minutes left of a pause, refreshed every minute while it lasts.
  const [captureMinutesLeft, setCaptureMinutesLeft] = useState(0);
  useEffect(() => {
    if (!capturePausedUntil) return;
    const update = () => setCaptureMinutesLeft(Math.max(1, Math.ceil((capturePausedUntil - Date.now()) / 60_000)));
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, [capturePausedUntil]);
  const temporary = useApp((s) => s.temporaryMode);
  if (!privacy) return null;

  const update = async (patch: Partial<PrivacySettings>) => {
    const res = await attempt(() => api.setPrivacy(patch));
    if (res) setApp((s) => (s.details ? { details: { ...s.details, privacy: res } } : {}));
  };

  const toggleLock = () => {
    if (!accountId) return;
    if (lockEnabled) {
      setLockEnabled(accountId, false);
      return;
    }
    modals.open({ title: t("lock.title"), children: <EnableLockForm accountId={accountId} />, size: 420 });
  };

  const relockKey = (ms: number) => (ms === 0 ? "start" : ms === 60_000 ? "min1" : ms === 5 * 60_000 ? "min5" : "hour1");
  const relockLabel = (ms: number) => t(`settings.privacy.relock.${relockKey(ms)}`);
  const chooseRelock = () =>
    modals.open({
      title: t("settings.privacy.relock.title"),
      size: 420,
      children: (
        <OptionsDialog
          options={RELOCK_CHOICES_MS.map((ms) => ({ value: String(ms), label: relockLabel(ms) }))}
          initial={String(relockMs)}
          description={t("settings.privacy.relock.hint")}
          onConfirm={(v) => setRelockAfterMs(Number(v))}
        />
      ),
    });

  return (
    <>
      <div className="list-card">
        <PrivacyRow label={t("settings.privacy.readReceipts")} sub={t("settings.privacy.readReceiptsHint")} on={privacy.read_receipts} onToggle={() => void update({ read_receipts: !privacy.read_receipts })} />
        <PrivacyRow label={t("settings.privacy.typing")} sub={t("settings.privacy.typingHint")} on={privacy.typing_indicators} onToggle={() => void update({ typing_indicators: !privacy.typing_indicators })} />
        <PrivacyRow
          label={t("settings.privacy.online")}
          sub={t("settings.privacy.onlineHint")}
          on={privacy.last_seen === "everyone"}
          onToggle={() => void update({ last_seen: privacy.last_seen === "everyone" ? "nobody" : "everyone" })}
        />
        <PrivacyRow label={t("settings.privacy.preview")} sub={t("settings.privacy.previewHint")} on={notifPreview} onToggle={() => setNotifPreview(!notifPreview)} />
        <PrivacyRow
          label={t("settings.privacy.lock")}
          sub={lockEnabled ? `${t("settings.privacy.lockHint")} ${t(`settings.privacy.relock.again.${relockKey(relockMs)}`)}` : t("settings.privacy.lockHint")}
          on={lockEnabled}
          onToggle={toggleLock}
        />
        {lockEnabled && (
          <button type="button" className="list-card-row" onClick={chooseRelock}>
            <div className="flex1">
              <div className="list-card-title">{t("settings.privacy.relock.title")}</div>
              <div className="list-card-sub" style={{ marginTop: 0 }}>
                {relockLabel(relockMs)}
              </div>
            </div>
            <span className="list-card-chev">
              <Icon name="chevron" size={17} />
            </span>
          </button>
        )}
        <PrivacyRow
          label={t("settings.privacy.screenshots")}
          sub={
            noCapture
              ? `${t("settings.privacy.screenshotsHint")} ${t("settings.privacy.screenshotsPause")} ${t("settings.privacy.screenshotsPlatforms")}`
              : t("settings.privacy.screenshotsPaused", { minutes: captureMinutesLeft })
          }
          on={noCapture}
          onToggle={() => (noCapture ? pauseCapture() : resumeCapture())}
        />
        <PrivacyRow label={t("temporary.title")} sub={t("temporary.hint")} on={temporary} onToggle={() => toggleTemporary(!temporary)} />
      </div>
      <DefaultTimerPrivacy />
      <MediaRetentionPrivacy />
      <CallsPrivacy />
      {VOICE_MASK_AVAILABLE && <VoiceMaskPrivacy />}
      <BlockedRow />
    </>
  );
}

function NotificationsSection() {
  const { t } = useTranslation();
  const prefs = useNotifyPrefs();
  const notifPreview = useAppearance((s) => s.notifPreview);
  const setNotifPreview = useAppearance((s) => s.setNotifPreview);
  const dndUntil = useDnd((s) => s.until);
  const [perm, setPerm] = useState<"granted" | "denied" | "default" | null>(null);
  useEffect(() => {
    void notificationPermission().then(setPerm);
  }, []);

  const toggleDesktop = async () => {
    if (!prefs.desktop) {
      const ok = await ensureNotificationPermission();
      setPerm(ok ? "granted" : "denied");
    }
    prefs.set({ desktop: !prefs.desktop });
  };

  const test = async () => {
    if (prefs.sound) playIncoming();
    if (prefs.desktop) {
      const ok = await ensureNotificationPermission();
      setPerm(ok ? "granted" : "denied");
      if (ok) await showNotification(BRAND_NAME, t("settings.notifications.testBody"));
    }
  };

  return (
    <>
      <div className="list-card">
        <PrivacyRow
          label={t("dnd.title")}
          sub={dndUntil > 0 ? `${t("dnd.on")} · ${dndUntilText(dndUntil)}` : t("dnd.hint")}
          on={dndUntil > 0}
          onToggle={() => (dndUntil > 0 ? void attempt(() => setDnd(0)) : openDndDialog())}
        />
      </div>
      {dndUntil > 0 && (
        <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={openDndDialog}>
          <IconMoonStars size={17} />
          {t("dnd.change")}
        </button>
      )}
      <div className="list-card">
        <PrivacyRow label={t("settings.notifications.desktop")} sub={t("settings.notifications.desktopHint")} on={prefs.desktop} onToggle={() => void toggleDesktop()} />
        <PrivacyRow label={t("settings.notifications.sound")} sub={t("settings.notifications.soundHint")} on={prefs.sound} onToggle={() => prefs.set({ sound: !prefs.sound })} />
        <PrivacyRow label={t("settings.notifications.soundInChat")} sub={t("settings.notifications.soundInChatHint")} on={prefs.soundInChat} onToggle={() => prefs.set({ soundInChat: !prefs.soundInChat })} />
        <PrivacyRow label={t("settings.notifications.badge")} sub={t("settings.notifications.badgeHint")} on={prefs.badge} onToggle={() => prefs.set({ badge: !prefs.badge })} />
        <PrivacyRow label={t("settings.privacy.preview")} sub={t("settings.privacy.previewHint")} on={notifPreview} onToggle={() => setNotifPreview(!notifPreview)} />
      </div>
      {prefs.desktop && perm === "denied" && (
        <div className="notice" data-tone="warn">
          <span>
            <Icon name="alert" size={16} />
          </span>
          <span>{t("settings.notifications.blocked")}</span>
        </div>
      )}
      <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => void test()}>
        <Icon name="bell" size={17} />
        {t("settings.notifications.test")}
      </button>
      <div className="hint" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        {t("settings.notifications.mutedHint")}
      </div>
    </>
  );
}

/** Privacy switch row inside a bordered card (15px padding, like the design). */
function toggleTemporary(enabled: boolean) {
  const t = i18n.t.bind(i18n);
  const apply = () =>
    void attempt(async () => {
      await api.setTemporaryMode({ enabled });
      setApp({ temporaryMode: enabled });
      notifyOk(t(enabled ? "temporary.enabled" : "temporary.disabled"));
    });
  modals.openConfirmModal({
    title: t(enabled ? "temporary.enableTitle" : "temporary.disableTitle"),
    children: <Text size="sm" c="dimmed">{t(enabled ? "temporary.enableBody" : "temporary.disableBody")}</Text>,
    labels: { confirm: t(enabled ? "temporary.enable" : "temporary.disable"), cancel: t("common.cancel") },
    confirmProps: { color: enabled ? "red" : undefined },
    onConfirm: apply,
  });
}

/** "5 minutes ago", "2 hours ago", ... */
function relativeTime(ts: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const s = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86_400), "day");
}

/**
 * Settings → Privacy → Disappearing messages: the default timer of the chats we start and the
 * groups we create (synced to our other devices; existing chats keep their own).
 */
function DefaultTimerPrivacy() {
  const { t } = useTranslation();
  const seconds = useDefaultTimer((s) => s.seconds);
  const choose = () =>
    modals.open({
      title: t("defaultTimer.title"),
      size: 420,
      children: (
        <OptionsDialog
          options={DISAPPEARING_OPTIONS.map(([s, key]) => ({ value: String(s), label: t(`disappearing.${key}`) }))}
          initial={String(seconds)}
          description={t("defaultTimer.hint")}
          onConfirm={(v) => void attempt(() => setDefaultTimer(Number(v)))}
        />
      ),
    });
  return (
    <>
      <div className="sub-label" style={{ marginTop: 8 }}>
        {t("disappearing.title")}
      </div>
      <div className="list-card">
        <button type="button" className="list-card-row" onClick={choose}>
          <div className="flex1">
            <div className="list-card-title">{t("defaultTimer.title")}</div>
            <div className="list-card-sub" style={{ marginTop: 0 }}>
              {disappearingLabel(seconds, t)}
            </div>
            <div className="list-card-sub">{t("defaultTimer.hint")}</div>
          </div>
          <span className="list-card-chev">
            <Icon name="chevron" size={17} />
          </span>
        </button>
      </div>
    </>
  );
}

/**
 * Settings → Privacy → Media: how long photos, videos, voice messages and files are kept (1, 7,
 * 14 or 30 days; synced to our other devices; no "forever"), the last media check and a button
 * to run it now.
 */
function MediaRetentionPrivacy() {
  const { t, i18n: i18 } = useTranslation();
  const days = useMediaRetention((s) => s.days);
  const options = useMediaRetention((s) => s.options);
  const last = useMediaRetention((s) => s.last_check);
  const [checking, setChecking] = useState(false);
  const label = (d: number) => t("retention.days", { count: d });
  const choose = () =>
    modals.open({
      title: t("retention.title"),
      size: 420,
      children: (
        <OptionsDialog
          options={options.map((d) => ({ value: String(d), label: label(d) }))}
          initial={String(days)}
          description={t("retention.hint")}
          onConfirm={(v) => void attempt(() => setMediaRetention(Number(v)))}
        />
      ),
    });
  const checkNow = async () => {
    setChecking(true);
    await attempt(() => runMediaCheck());
    setChecking(false);
  };
  return (
    <>
      <div className="sub-label" style={{ marginTop: 8 }}>
        {t("retention.section")}
      </div>
      <div className="list-card">
        <button type="button" className="list-card-row" onClick={choose}>
          <div className="flex1">
            <div className="list-card-title">{t("retention.title")}</div>
            <div className="list-card-sub" style={{ marginTop: 0 }}>
              {label(days)}
            </div>
          </div>
          <span className="list-card-chev">
            <Icon name="chevron" size={17} />
          </span>
        </button>
        <div className="list-card-row" style={{ cursor: "default" }}>
          <div className="flex1">
            <div className="list-card-sub" style={{ marginTop: 0 }}>
              {t("retention.hint")}
            </div>
            <div className="list-card-sub">
              {last
                ? t("retention.lastCheck", { when: relativeTime(last.checked_at, i18.language), count: last.removed })
                : t("retention.neverChecked")}
            </div>
          </div>
          <button type="button" className="btn btn-secondary" disabled={checking} onClick={() => void checkNow()}>
            {t("retention.checkNow")}
          </button>
        </div>
      </div>
    </>
  );
}

/** Settings → Privacy → Calls: allow calls, relay-only calls (synced to our other devices). */
function CallsPrivacy() {
  const { t } = useTranslation();
  const allow = useCallSettings((s) => s.allow_calls);
  const relay = useCallSettings((s) => s.relay_only);
  const denoise = useCallAudioPrefs((s) => s.denoise);
  const setDenoise = useCallAudioPrefs((s) => s.setDenoise);
  return (
    <>
      <div className="sub-label" style={{ marginTop: 8 }}>
        {t("settings.calls.title")}
      </div>
      <div className="list-card">
        <PrivacyRow label={t("settings.calls.allow")} sub={t("settings.calls.allowHint")} on={allow} onToggle={() => void attempt(() => setCallSettings({ allow_calls: !allow }))} />
        <PrivacyRow
          label={t("settings.calls.relayOnly")}
          sub={t("settings.calls.relayOnlyHint")}
          on={relay}
          disabled={!allow}
          onToggle={() => void attempt(() => setCallSettings({ relay_only: !relay }))}
        />
        {VOICE_MASK_AVAILABLE && <PrivacyRow label={t("voiceFx.denoiseSetting")} sub={t("voiceFx.denoiseHint")} on={denoise} onToggle={() => setDenoise(!denoise)} />}
      </div>
    </>
  );
}

const SAMPLE_MS = 5000;

/** Settings → Privacy → Voice effects: "anonymize by default" for voice notes, and a sample
 *  recording to hear every effect on your own voice (in memory only, never sent or saved). */
function VoiceMaskPrivacy() {
  const { t } = useTranslation();
  const enabled = useVoiceMask((s) => s.enabled);
  const setEnabled = useVoiceMask((s) => s.setEnabled);
  const [step, setStep] = useState<"idle" | "recording" | "processing">("idle");
  const [sample, setSample] = useState<Uint8Array | null>(null);
  const [playing, setPlaying] = useState<VoiceEffect | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<VoiceEffect, string>());
  const audio = () => (playerRef.current ??= new Audio());

  const forget = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
  };
  useEffect(
    () => () => {
      playerRef.current?.pause();
      forget();
    },
    [],
  );

  async function urlFor(wav: Uint8Array, effect: VoiceEffect): Promise<string> {
    const cached = urls.current.get(effect);
    if (cached) return cached;
    let out = wav;
    if (effect === "anonymous") {
      out = Uint8Array.from(atob(await maskVoice(bytesToBase64(wav))), (c) => c.charCodeAt(0));
    } else if (effect !== "none") {
      // recordSample gives a 16 kHz 16-bit mono WAV with a 44-byte header.
      const pcm = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.byteLength - ((wav.byteLength - 44) % 2)));
      const samples = Float32Array.from(pcm, (v) => v / 32768);
      out = encodeWav([await applyEffect(samples, 16_000, effect)], 16_000);
    }
    const url = URL.createObjectURL(new Blob([out as BlobPart], { type: "audio/wav" }));
    urls.current.set(effect, url);
    return url;
  }

  async function play(effect: VoiceEffect, wav = sample) {
    if (!wav) return;
    try {
      const p = audio();
      p.pause();
      setPlaying(effect);
      p.src = await urlFor(wav, effect);
      p.onended = () => setPlaying(null);
      await p.play();
    } catch (e) {
      console.warn("voice effect sample", e);
      setPlaying(null);
      notifications.show({ color: "red", message: t("voice.maskError") });
    }
  }

  const tryIt = async () => {
    audio().pause();
    forget();
    setSample(null);
    setStep("recording");
    try {
      const wav = await recordSample(SAMPLE_MS);
      setSample(wav);
      setStep("idle");
      await play("anonymous", wav);
    } catch (e) {
      console.warn("voice sample", e);
      notifications.show({ color: "red", message: t("voice.micError") });
      setStep("idle");
    }
  };

  return (
    <>
      <div className="sub-label" style={{ marginTop: 8 }}>
        {t("voice.fxSection")}
      </div>
      <div className="list-card">
        <PrivacyRow label={t("voice.mask")} sub={t("voice.maskHint")} on={enabled} onToggle={() => setEnabled(!enabled)} />
        <div className="list-card-row" style={{ cursor: "default", flexWrap: "wrap", gap: 8 }}>
          <div className="flex1" style={{ minWidth: 200 }}>
            <div className="list-card-title">{t("voice.fxTry")}</div>
            <div className="list-card-sub" style={{ marginTop: 0 }}>
              {step === "recording" ? t("voice.maskRecording") : t("voice.fxTryHint")}
            </div>
          </div>
          <button type="button" className="btn btn-secondary" disabled={step !== "idle"} onClick={() => void tryIt()}>
            <Icon name="mic" size={16} /> {t("voice.maskTryButton")}
          </button>
        </div>
        {sample && (
          <div className="list-card-row" style={{ cursor: "default", gap: 8, flexWrap: "wrap" }}>
            {VOICE_EFFECTS.map((e) => (
              <button key={e} type="button" className={`btn ${playing === e ? "btn-primary" : "btn-secondary"}`} onClick={() => void play(e)}>
                {VOICE_EFFECT_EMOJI[e]} {e === "none" ? t("voice.maskOriginal") : t(`voiceFx.${e}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function PrivacyRow(props: { label: string; sub: string; on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div className="list-card-row" style={{ padding: 0 }}>
      <ToggleRow {...props} />
    </div>
  );
}

// ---------------------------------------------------------------------------

// Preview colors of each theme card (chat background, incoming and outgoing bubble), from the design tokens.
const PREVIEW: Record<Direction, Record<"light" | "dark", { bg: string; in: string; out: string }>> = {
  A: {
    light: { bg: "#F3EFE7", in: "#E4DFD4", out: "#D8EBDF" },
    dark: { bg: "#12110F", in: "#22211E", out: "#1B392D" },
  },
  B: {
    light: { bg: "#FFFFFF", in: "#EEF2F5", out: "linear-gradient(135deg,#0FA283 0%,#0B8597 100%)" },
    dark: { bg: "#0F161A", in: "#19242B", out: "linear-gradient(135deg,#0E8C72 0%,#0A6C80 100%)" },
  },
};

/** Theme, style and text size (Settings → Appearance, and the first-run setup). */
export function AppearanceSection() {
  const { t } = useTranslation();
  const direction = useAppearance((s) => s.direction);
  const theme = useAppearance((s) => s.theme);
  const setTheme = useAppearance((s) => s.setTheme);
  const setDirection = useAppearance((s) => s.setDirection);
  const textScale = useAppearance((s) => s.textScale);
  const setTextScale = useAppearance((s) => s.setTextScale);
  const p = PREVIEW[direction];

  const themeCard = (value: ThemePref, label: string) => {
    const light = p.light;
    const dark = p.dark;
    const bg = value === "auto" ? `linear-gradient(90deg, ${light.bg} 50%, ${dark.bg} 50%)` : p[value].bg;
    const pal = value === "dark" ? dark : light;
    return (
      <button type="button" key={value} className="choice-card" data-on={theme === value} onClick={() => setTheme(value)} aria-pressed={theme === value}>
        <div className="theme-prev" style={{ background: bg }}>
          <i style={{ alignSelf: "flex-start", width: "58%", background: value === "auto" ? light.in : pal.in }} />
          <i style={{ alignSelf: "flex-end", width: "46%", background: value === "auto" ? dark.out : pal.out }} />
        </div>
        <div className="choice-label">{label}</div>
      </button>
    );
  };

  const dirCard = (value: Direction, label: string, sub: string) => (
    <button type="button" key={value} className="choice-card" data-kind="dir" data-on={direction === value} onClick={() => setDirection(value)} aria-pressed={direction === value}>
      <div className="choice-label">{label}</div>
      <div className="choice-sub">{sub}</div>
    </button>
  );

  return (
    <>
      <div className="sub-label">{t("settings.appearance.theme")}</div>
      <div className="card-grid" data-cols="3">
        {themeCard("light", t("settings.appearance.light"))}
        {themeCard("dark", t("settings.appearance.dark"))}
        {themeCard("auto", t("settings.appearance.auto"))}
      </div>
      <div className="sub-label" style={{ marginTop: 8 }}>
        {t("settings.appearance.style")}
      </div>
      <div className="card-grid">
        {dirCard("A", t("settings.appearance.dirA"), t("settings.appearance.dirAHint"))}
        {dirCard("B", t("settings.appearance.dirB"), t("settings.appearance.dirBHint"))}
      </div>
      <div className="sub-label" style={{ marginTop: 8 }}>
        {t("settings.appearance.textSize")}
      </div>
      <div className="seg text-size-seg" role="radiogroup" aria-label={t("settings.appearance.textSize")}>
        {TEXT_SCALES.map((v, i) => (
          <button type="button" key={v} role="radio" aria-checked={textScale === v} data-active={textScale === v} onClick={() => setTextScale(v)}>
            <span className="text-size-a" style={{ fontSize: 12 + i * 2.5 }} aria-hidden>
              A
            </span>
            {Math.round(v * 100)}%
          </button>
        ))}
      </div>
      <div className="hint">{t("settings.appearance.textSizeHint")}</div>
    </>
  );
}

// ---------------------------------------------------------------------------

function systemLanguage(): string {
  return (navigator.languages?.[0] ?? navigator.language ?? "en").slice(0, 2).toLowerCase();
}

function LanguageSection() {
  const { t } = useTranslation();
  const current = i18n.language;
  const sys = systemLanguage();
  return (
    <>
      <div className="list-card" role="radiogroup">
        {LANGUAGES.map((l) => (
          <button
            type="button"
            key={l.code}
            className="list-card-row"
            role="radio"
            aria-checked={current === l.code}
            onClick={() => setLanguage(l.code as LanguageCode)}
          >
            <div className="flex1">
              <div className="list-card-title">{l.label}</div>
              <div className="list-card-sub">{sys === l.code ? t("settings.language.system") : t(`settings.language.names.${l.code}`)}</div>
            </div>
            <RadioDot on={current === l.code} />
          </button>
        ))}
      </div>
      <div className="hint">{t("settings.language.hint")}</div>
    </>
  );
}

// ---------------------------------------------------------------------------

function AboutSection() {
  const { t } = useTranslation();
  const server = useApp((s) => s.serverInfo);
  const serverUrl = useApp((s) => s.details?.account.server_url);
  return (
    <>
      <div className="about-hero">
        <div className="logo-tile">
          <Icon name="chat" size={32} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 750 }}>{BRAND_NAME}</div>
        <div className="mono" style={{ fontSize: 13, color: "var(--muted)" }}>
          {t("settings.about.version", { version: __APP_VERSION__ })}
        </div>
        <div className="hint" style={{ fontSize: 13.5, maxWidth: 380 }}>
          {t("settings.about.tagline")}
        </div>
      </div>
      <div className="list-card">
        <div className="list-card-row">
          <span className="ic">
            <Icon name="server" size={19} />
          </span>
          <div className="flex1">
            <div className="list-card-title">{server?.name ?? t("settings.about.server")}</div>
            <div className="list-card-sub mono" style={{ wordBreak: "break-all" }}>
              {server?.url ?? serverUrl}
            </div>
            {server && <div className="list-card-sub">{t("onboarding.server.version", { version: server.version })}</div>}
          </div>
        </div>
        <div className="list-card-row" style={{ alignItems: "flex-start" }}>
          <span className="ic" style={{ paddingTop: 2 }}>
            <Icon name="shield" size={19} />
          </span>
          <div className="flex1">
            <div className="list-card-title">{t("settings.about.security")}</div>
            <div className="list-card-sub">{t("settings.about.signal")}</div>
          </div>
        </div>
        <button type="button" className="list-card-row" onClick={() => void openExternal(LICENSE_URL)}>
          <span className="ic">
            <Icon name="file" size={19} />
          </span>
          <div className="flex1">
            <div className="list-card-title">{t("settings.about.license")}</div>
            <div className="list-card-sub">{t("settings.about.openSource")}</div>
          </div>
          <span className="list-card-chev">
            <Icon name="external" size={16} />
          </span>
        </button>
      </div>
    </>
  );
}
