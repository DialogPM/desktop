// The password was changed on another device: the data on this device is still locked with
// the old one. Asks for the new password so both match again.

import { Modal } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PasswordField } from "../../components/Field";
import { api } from "../../lib/api";
import { parseError } from "../../lib/backend";
import { errorText, notifyOk } from "../../store/actions";
import { setApp, useApp } from "../../store/app";

export function LocalPasswordNudge() {
  const { t } = useTranslation();
  const outdated = useApp((s) => s.details?.local_password_outdated);
  const [later, setLater] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!outdated || later) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.protectLocalData({ password });
      setApp((s) => (s.details ? { details: { ...s.details, local_password_outdated: false } } : {}));
      notifyOk(t("dataLock.updated"));
    } catch (e) {
      setError(parseError(e).code === "invalid_password" ? t("lock.wrongPassword") : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened onClose={() => setLater(true)} title={t("dataLock.outdatedTitle")} centered size={440}>
      <form
        className="onb-stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="hint" style={{ margin: 0 }}>
          {t("dataLock.outdatedLead")}
        </p>
        <PasswordField
          label={t("dataLock.newPassword")}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          autoComplete="current-password"
          autoFocus
          error={error}
        />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setLater(true)}>
            {t("dataLock.later")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!password || busy}>
            {busy ? t("dataLock.working") : t("dataLock.update")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
