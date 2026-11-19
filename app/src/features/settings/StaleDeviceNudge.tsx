// Asks about a linked device that has not connected for a week: messages keep queueing on the
// server for it (each message is encrypted for every device of the account) until it comes back
// or is unlinked; the server unlinks it on its own after 30 days. One device at a time, at most
// once a week per device; when it was shown is kept in the encrypted local database.

import { Modal } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import type { DeviceInfo } from "../../lib/types";
import { attempt } from "../../store/actions";
import { useApp } from "../../store/app";

const STALE_DAYS = 7;
const INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
// Per device (its id is reused after an unlink, so with its creation time); [a-z0-9_], at most 32.
const reminder = (d: DeviceInfo) => `stale_dev_${d.device_id}_${d.created_at}`;

export function StaleDeviceNudge() {
  const { t } = useTranslation();
  const account = useApp((s) => s.details?.account.account_id);
  const version = useApp((s) => s.devicesVersion);
  const [stale, setStale] = useState<{ device: DeviceInfo; days: number } | null>(null);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    void (async () => {
      const devices = await api.listDevices();
      const stale = devices
        .filter((d) => !d.current && Date.now() - d.last_seen_at >= STALE_DAYS * DAY_MS)
        .sort((a, b) => a.last_seen_at - b.last_seen_at);
      for (const d of stale) {
        const shownAt = await api.reminderShownAt(reminder(d));
        if (cancelled) return;
        if (shownAt !== null && Date.now() - shownAt < INTERVAL_MS) continue;
        setStale({ device: d, days: Math.floor((Date.now() - d.last_seen_at) / DAY_MS) });
        // Counted as shown right away: closing the app instead of answering still waits a week.
        void api.markReminderShown(reminder(d)).catch(() => undefined);
        return;
      }
    })().catch((e: unknown) => console.warn("stale device reminder", e));
    return () => {
      cancelled = true;
    };
  }, [account, version]);

  if (!stale) return null;
  const { device, days } = stale;
  const close = () => setStale(null);

  return (
    <Modal opened onClose={close} withCloseButton={false} centered size="sm">
      <div className="onb-stack" style={{ gap: 14, textAlign: "center", alignItems: "center" }}>
        <span className="nudge-icon">
          <Icon name="devices" size={30} />
        </span>
        <h3 className="onb-h2" style={{ margin: 0, fontSize: 20 }}>
          {t("settings.devices.staleTitle", { name: device.name, count: days })}
        </h3>
        <p className="hint" style={{ margin: 0 }}>
          {t("settings.devices.staleText")}
        </p>
        <button
          type="button"
          className="btn btn-danger"
          style={{ width: "100%" }}
          onClick={() => {
            close();
            void attempt(() => api.unlinkDevice({ device_id: device.device_id }));
          }}
        >
          {t("settings.devices.staleUnlink")}
        </button>
        <button type="button" className="link-btn" onClick={close}>
          {t("settings.devices.staleKeep")}
        </button>
      </div>
    </Modal>
  );
}
