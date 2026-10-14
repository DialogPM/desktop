import { Loader, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ToggleRow } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import type { DeviceInfo } from "../../lib/types";
import { attempt, notifyError } from "../../store/actions";
import { setApp, useApp } from "../../store/app";
import { LinkDeviceModal } from "../devices/LinkDeviceModal";

/** The server unlinks devices inactive for 30 days; warn a few days before. */
const INACTIVE_WARNING_DAYS = 25;
const inactiveDays = (d: DeviceInfo) => Math.floor((Date.now() - d.last_seen_at) / 86_400_000);

export function DevicesSection() {
  const { t } = useTranslation();
  const locale = useLocale();
  const version = useApp((s) => s.devicesVersion);
  const maxDevices = useApp((s) => s.serverInfo?.max_devices);
  const loginApproval = useApp((s) => s.details?.login_approval ?? false);
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const [reload, setReload] = useState(0);
  const load = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    api
      .listDevices()
      .then((list) => {
        if (alive) setDevices(list.sort((a, b) => Number(b.current) - Number(a.current) || b.last_seen_at - a.last_seen_at));
      })
      .catch(notifyError);
    return () => {
      alive = false;
    };
  }, [version, reload]);

  const unlink = (d: DeviceInfo) =>
    modals.openConfirmModal({
      title: t("settings.devices.unlinkTitle", { name: d.name }),
      children: <div className="hint" style={{ fontSize: 14 }}>{t("settings.devices.unlinkBody")}</div>,
      labels: { confirm: t("settings.devices.unlink"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        void attempt(async () => {
          await api.unlinkDevice({ device_id: d.device_id });
          load();
        }),
    });

  const toggleApproval = async () => {
    const enabled = !loginApproval;
    const ok = await attempt(async () => {
      await api.setLoginApproval({ enabled });
      return true;
    });
    if (ok) setApp((s) => (s.details ? { details: { ...s.details, login_approval: enabled } } : {}));
  };

  const rename = async () => {
    if (editing === null || !editing.trim()) return;
    await attempt(() => api.renameDevice({ name: editing.trim() }));
    setEditing(null);
    load();
  };

  return (
    <>
      <div className="hint" style={{ fontSize: 13.5 }}>
        {t("settings.devices.intro")}
      </div>
      <div className="list-card">
        {!devices ? (
          <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
            <Loader />
          </div>
        ) : (
          devices.map((d) => (
            <div key={d.device_id} className="list-card-row">
              <span className="dev-icon">
                <Icon name="devices" size={19} />
              </span>
              <div className="flex1">
                {d.current && editing !== null ? (
                  <div className="field-input field-affix" style={{ height: 38 }}>
                    <input
                      value={editing}
                      autoFocus
                      maxLength={50}
                      aria-label={t("settings.devices.rename")}
                      onChange={(e) => setEditing(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void rename();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      style={{ fontSize: 14.5 }}
                    />
                    <button type="button" className="icon-btn" onClick={rename} aria-label={t("common.save")} style={{ width: 30, height: 30, color: "var(--accent-text)" }}>
                      <Icon name="check" size={16} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => setEditing(null)} aria-label={t("common.cancel")} style={{ width: 30, height: 30 }}>
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="list-card-title">
                    <span className="truncate">{d.name}</span>
                    {d.current && <span className="badge-soft" style={{ padding: "3px 7px" }}>{t("settings.devices.thisDevice")}</span>}
                  </div>
                )}
                <div className="list-card-sub" style={{ marginTop: 0 }}>
                  {d.current
                    ? t("settings.devices.activeNow", { date: formatDateTime(d.created_at, locale) })
                    : t("settings.devices.lastActive", { date: formatDateTime(d.last_seen_at, locale) })}
                </div>
                {!d.current && inactiveDays(d) >= INACTIVE_WARNING_DAYS && (
                  <div className="list-card-sub" style={{ marginTop: 0, color: "var(--danger)" }}>
                    {t("settings.devices.inactiveWarning", { days: inactiveDays(d) })}
                  </div>
                )}
              </div>
              {d.current ? (
                editing === null && (
                  <Tooltip label={t("settings.devices.rename")}>
                    <button type="button" className="icon-btn" data-tone="muted" onClick={() => setEditing(d.name)} aria-label={t("settings.devices.rename")}>
                      <Icon name="edit" size={17} />
                    </button>
                  </Tooltip>
                )
              ) : (
                <button type="button" className="chip-btn" data-tone="danger" onClick={() => unlink(d)}>
                  {t("settings.devices.unlink")}
                </button>
              )}
            </div>
          ))
        )}
      </div>
      <div className="list-card">
        <ToggleRow
          icon={<Icon name="shield" size={19} />}
          label={t("settings.devices.approvalLabel")}
          sub={t("settings.devices.approvalHint")}
          on={loginApproval}
          onToggle={() => void toggleApproval()}
        />
      </div>
      {maxDevices ? <div className="hint">{t("settings.devices.descriptionMax", { count: maxDevices })}</div> : null}
      <button type="button" className="btn btn-primary" data-size="md" onClick={() => setLinking(true)}>
        <Icon name="scan" size={18} />
        {t("settings.devices.link")}
      </button>
      <LinkDeviceModal opened={linking} onClose={() => setLinking(false)} mode="existing" onLinked={load} />
    </>
  );
}
