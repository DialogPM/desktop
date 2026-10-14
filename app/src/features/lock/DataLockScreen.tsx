import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PasswordField } from "../../components/Field";
import { Icon } from "../../components/Icon";
import i18n from "../../i18n";
import { api } from "../../lib/api";
import { parseError } from "../../lib/backend";
import { initAppLock } from "../../lib/appLock";
import { errorText, loadSession } from "../../store/actions";
import { setApp } from "../../store/app";
import { confirmLogout } from "../settings/logoutDialog";

/**
 * The local database is encrypted with a key that only the account password unlocks.
 * - "unlock": app start, nothing on disk is readable until the password is entered.
 * - "protect": the data is not locked yet (just linked, or from an older version).
 */
export function DataLockScreen({ mode }: { mode: "unlock" | "protect" }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "unlock") await api.unlock({ password });
      else await api.protectLocalData({ password });
      const appState = await api.getState();
      // The password was just entered: the app lock must not ask for it again now.
      initAppLock(appState.account?.account_id, false);
      setApp({ appState });
      if (mode === "unlock" && appState.status === "ready") await loadSession();
    } catch (e) {
      setError(parseError(e).code === "invalid_password" ? t(mode === "unlock" ? "dataLock.wrongPassword" : "lock.wrongPassword") : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label={t(`dataLock.${mode}Title`)}>
      <form
        className="lock-card"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="logo-tile">
          <Icon name="lock" size={28} />
        </div>
        <div>
          <h2 className="onb-h2" style={{ textAlign: "center" }}>
            {t(`dataLock.${mode}Title`)}
          </h2>
          <p className="onb-lead" style={{ textAlign: "center" }}>
            {t(`dataLock.${mode}Lead`)}
          </p>
        </div>
        <PasswordField
          label={t("password.label")}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          autoComplete="current-password"
          autoFocus
          size="lg"
          error={error}
        />
        <button type="submit" className="btn btn-primary" disabled={!password || busy}>
          {busy ? t("dataLock.working") : t(mode === "unlock" ? "lock.unlock" : "dataLock.protect")}
        </button>
        <button
          type="button"
          className="link-btn"
          style={{ color: "var(--muted)", fontWeight: 500, fontSize: 13 }}
          onClick={() => (mode === "unlock" ? confirmReset() : confirmLogout(400))}
        >
          {t(mode === "unlock" ? "dataLock.forgot" : "lock.forgot")}
        </button>
      </form>
    </div>
  );
}

/** Forgotten password: the local data cannot be opened anymore, so it is deleted. */
function confirmReset() {
  const t = i18n.t.bind(i18n);
  modals.openConfirmModal({
    title: t("dataLock.resetTitle"),
    children: (
      <Text size="sm" c="dimmed">
        {t("dataLock.resetBody")}
      </Text>
    ),
    labels: { confirm: t("dataLock.reset"), cancel: t("common.cancel") },
    confirmProps: { color: "red" },
    // Above the lock screen.
    zIndex: 400,
    onConfirm: () => {
      void api.resetLocalData().catch((e) => console.error("reset failed", e));
    },
  });
}
