import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PasswordField } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { unlockApp } from "../../lib/appLock";
import { errorText } from "../../store/actions";
import { confirmLogout } from "../settings/logoutDialog";

/** Full-screen lock shown when the app lock is enabled (app start, or back from background). */
export function LockScreen() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      if (await api.verifyPassword({ password })) {
        unlockApp();
        return;
      }
      setError(t("lock.wrongPassword"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label={t("lock.locked")}>
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
            {t("lock.locked")}
          </h2>
          <p className="onb-lead" style={{ textAlign: "center" }}>
            {t("lock.lead")}
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
          {t("lock.unlock")}
        </button>
        <button type="button" className="link-btn" style={{ color: "var(--muted)", fontWeight: 500, fontSize: 13 }} onClick={() => confirmLogout(400)}>
          {t("lock.forgot")}
        </button>
      </form>
    </div>
  );
}
