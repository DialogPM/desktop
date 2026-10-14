// Account security prompts shown over the whole app: a banner when a new device joined the
// account (until dismissed), and approval of new password logins (when the account requires
// it). Both are driven by core events (device_alerts, login_requests).

import { Modal } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { api, onEvent } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import { showNotification } from "../../lib/platform";
import type { LoginRequestInfo, NewDeviceAlert } from "../../lib/types";
import { attempt, openSettings } from "../../store/actions";

/** Subscribes to a core event for the lifetime of the component. */
function useCoreEvent<T>(subscribe: (h: (p: T) => void) => Promise<() => void>, handler: (p: T) => void) {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;
    void subscribe(handler).then((u) => {
      if (alive) unlisten = u;
      else u();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function NewDeviceBanner() {
  const { t } = useTranslation();
  const locale = useLocale();
  const [alerts, setAlerts] = useState<NewDeviceAlert[]>([]);
  const shown = useRef<NewDeviceAlert[]>([]);
  const update = (list: NewDeviceAlert[]) => {
    shown.current = list;
    setAlerts(list);
  };

  useEffect(() => {
    void api.deviceAlerts().then(update, () => {});
  }, []);
  useCoreEvent<NewDeviceAlert[]>(
    (h) => onEvent("device_alerts", h),
    (list) => {
      const prev = shown.current;
      const fresh = list.filter((a) => !prev.some((p) => p.device_id === a.device_id && p.created_at === a.created_at));
      for (const a of fresh) void showNotification(t("security.newDeviceTitle"), `${a.name} (${a.platform})`);
      update(list);
    },
  );

  if (!alerts.length) return null;
  const last = alerts[alerts.length - 1];
  return (
    <div className="banner banner-security" role="alert">
      <Icon name="alert" size={16} />
      <span>
        {t("security.newDeviceTitle")}:{" "}
        {t("security.newDeviceBody", { name: last.name, platform: last.platform, date: formatDateTime(last.created_at, locale) })}
        {alerts.length > 1 ? ` (+${alerts.length - 1})` : ""}. {t("security.newDeviceHint")}
      </span>
      <button type="button" className="chip-btn" onClick={() => openSettings("devices")}>
        {t("security.review")}
      </button>
      <button type="button" className="chip-btn" onClick={() => void attempt(() => api.dismissDeviceAlerts())}>
        {t("security.dismiss")}
      </button>
    </div>
  );
}

export function LoginRequestPrompt() {
  const { t } = useTranslation();
  const locale = useLocale();
  const [requests, setRequests] = useState<LoginRequestInfo[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.listLoginRequests().then(setRequests, () => {});
  }, []);
  useCoreEvent<LoginRequestInfo[]>(
    (h) => onEvent("login_requests", h),
    (list) => setRequests(list),
  );
  // Expired requests disappear without an event.
  useEffect(() => {
    if (!requests.length) return;
    const id = window.setInterval(() => setRequests((r) => r.filter((x) => x.expires_at > Date.now())), 15_000);
    return () => window.clearInterval(id);
  }, [requests.length]);

  const req = requests[0];
  if (!req) return null;
  const answer = async (approve: boolean) => {
    setBusy(true);
    await attempt(() => api.answerLoginRequest({ id: req.id, approve }));
    setRequests((r) => r.filter((x) => x.id !== req.id));
    setBusy(false);
  };
  return (
    <Modal opened onClose={() => {}} withCloseButton={false} closeOnClickOutside={false} centered size="sm">
      <div className="onb-stack" style={{ gap: 14, textAlign: "center", alignItems: "center" }}>
        <span className="nudge-icon">
          <Icon name="shield" size={30} />
        </span>
        <h3 className="onb-h2" style={{ margin: 0, fontSize: 20 }}>
          {t("security.loginRequestTitle")}
        </h3>
        <p className="hint" style={{ margin: 0 }}>
          {t("security.loginRequestBody", { name: req.name, platform: req.platform, date: formatDateTime(req.created_at, locale) })}
        </p>
        <button type="button" className="btn btn-danger" style={{ width: "100%" }} disabled={busy} onClick={() => void answer(false)}>
          {t("security.deny")}
        </button>
        <button type="button" className="link-btn" disabled={busy} onClick={() => void answer(true)}>
          {t("security.approve")}
        </button>
      </div>
    </Modal>
  );
}

/** A signed desktop update is available (builds with updates enabled only). */
export function UpdateBanner() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useCoreEvent<{ version: string }>(
    (h) => onEvent("update_available", h),
    (u) => setVersion(u.version),
  );
  if (!version) return null;
  return (
    <div className="banner banner-sync" role="status">
      <span>{t("security.updateAvailable", { version })}</span>
      <button
        type="button"
        className="chip-btn"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void attempt(() => api.installUpdate()).finally(() => setBusy(false));
        }}
      >
        {t("security.updateInstall")}
      </button>
      <button type="button" className="chip-btn" onClick={() => setVersion(null)}>
        {t("security.dismiss")}
      </button>
    </div>
  );
}
