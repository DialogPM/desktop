import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import i18n from "../../i18n";
import { api } from "../../lib/api";
import { reloadAfterProfileSwitch } from "../../lib/profiles";
import { attempt, logout } from "../../store/actions";
import { getApp, useApp } from "../../store/app";

/**
 * Logging out ("Remove from this computer") unlinks this device and deletes its local data;
 * "Switch account" keeps everything and only locks the account. The dialog explains the
 * difference and makes switching the safe, primary choice; removing stays red and secondary.
 * `zIndex` lets it open above the lock screen.
 */
function openLogoutDialog(zIndex?: number) {
  const id = modals.open({
    title: i18n.t("profiles.removeTitle"),
    size: 460,
    children: <LogoutDialog zIndex={zIndex} onClose={() => modals.close(id)} />,
    ...(zIndex ? { zIndex } : {}),
  });
}

function LogoutDialog({ zIndex, onClose }: { zIndex?: number; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="notice">
        <span>
          <Icon name="users" size={17} />
        </span>
        <span>
          <b>{t("profiles.switch")}:</b> {t("profiles.logoutSwitchExplain")}
        </span>
      </div>
      <div className="notice" data-tone="danger">
        <span>
          <Icon name="logout" size={17} />
        </span>
        <span>
          <b>{t("profiles.remove")}:</b> {t("profiles.logoutRemoveExplain")}
        </span>
      </div>
      <div className="logout-actions">
        <button
          type="button"
          className="btn btn-primary"
          data-autofocus
          onClick={() => {
            onClose();
            void switchAccount();
          }}
        >
          {t("profiles.switchInstead")}
        </button>
        <button
          type="button"
          className="btn btn-danger-quiet"
          onClick={() => {
            onClose();
            void logoutChecked(zIndex);
          }}
        >
          {t("profiles.remove")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

/** Asks before logging out (from the lock screens, "forgot the password"). */
export function confirmLogout(zIndex?: number) {
  openLogoutDialog(zIndex);
}

/** "Remove from this computer": the same as logging out (this device is unlinked and its data
 * deleted), worded for the accounts saved on this computer. */
export function confirmRemoveProfile() {
  openLogoutDialog();
}

/** "Switch account": locks this account (it stays on this computer, logged in) and goes back
 * to the start screen. */
export async function switchAccount() {
  await attempt(async () => {
    await api.closeProfile();
    reloadAfterProfileSwitch(false);
  });
}

/** Name of the signed-in account for the warnings: its profile name, else its last digits. */
function accountName(): string {
  const { profile, appState } = getApp();
  const name = profile?.name.trim();
  if (name) return name;
  const number = appState?.account?.number ?? "";
  return number ? `•••• ${number.slice(-4)}` : i18n.t("profiles.account");
}

/**
 * Logs out, unless this is the only device of the account: then a strong warning comes first
 * (nobody can reach the account until it logs in again), with switching as the safe choice.
 * When the device list cannot be fetched (offline), it logs out as already confirmed.
 */
async function logoutChecked(zIndex?: number) {
  const devices = await api.listDevices().catch(() => null);
  if (devices && devices.filter((d) => !d.current).length === 0) {
    const id = modals.open({
      title: i18n.t("profiles.lastDeviceTitle", { name: accountName() }),
      size: 460,
      children: <LastDeviceDialog onClose={() => modals.close(id)} />,
      ...(zIndex ? { zIndex } : {}),
    });
    return;
  }
  await attempt(logout);
}

function LastDeviceDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  // Switching needs the local data locked with the password (it is kept on this computer).
  const canSwitch = useApp((s) => s.appState?.local_protected ?? false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="notice" data-tone="danger">
        <span>
          <Icon name="alert" size={17} />
        </span>
        <span>{t("profiles.lastDeviceBody", { name: accountName() })}</span>
      </div>
      <div className="logout-actions">
        {canSwitch ? (
          <button
            type="button"
            className="btn btn-primary"
            data-autofocus
            onClick={() => {
              onClose();
              void switchAccount();
            }}
          >
            {t("profiles.switchInstead")}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" data-autofocus onClick={onClose}>
            {t("common.cancel")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger-quiet"
          onClick={() => {
            onClose();
            void attempt(logout);
          }}
        >
          {t("profiles.logoutAnyway")}
        </button>
        {canSwitch && (
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
        )}
      </div>
    </div>
  );
}
