// "Remember the password on this computer": opt-in, per account (chat-core local_lock.rs). On,
// the key of the local data is kept on disk and the account opens at startup without the
// password. Turning it on shows the warning once and needs the password as proof.

import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckBox, PasswordField } from "../../components/Field";
import i18n from "../../i18n";
import { api, parseError } from "../../lib/api";
import { errorText, notifyOk } from "../../store/actions";
import { setApp } from "../../store/app";

/** The warning (anyone with the files can read the messages; not a replacement for the 24 words). */
export function confirmRememberPassword(zIndex?: number): Promise<boolean> {
  const t = i18n.t.bind(i18n);
  return new Promise((resolve) => {
    modals.openConfirmModal({
      title: t("autoUnlock.warnTitle"),
      children: (
        <Text size="sm" c="dimmed">
          {t("autoUnlock.warnBody")}
        </Text>
      ),
      labels: { confirm: t("autoUnlock.warnConfirm"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      zIndex,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false),
    });
  });
}

/** Checkbox under a password field; checking it shows the warning first. */
export function RememberPasswordCheck({ on, onChange, zIndex }: { on: boolean; onChange: (on: boolean) => void; zIndex?: number }) {
  const { t } = useTranslation();
  const toggle = async () => {
    if (on) {
      onChange(false);
      return;
    }
    if (await confirmRememberPassword(zIndex)) onChange(true);
  };
  return (
    <button type="button" className="check-row" role="checkbox" aria-checked={on} onClick={() => void toggle()}>
      <CheckBox on={on} />
      {t("autoUnlock.remember")}
    </button>
  );
}

/** Reloads the app state (AppState.auto_unlock) after the setting changed. */
export async function refreshAutoUnlock() {
  const appState = await api.getState();
  setApp({ appState });
}

/** Settings: turning it on asks for the account password as proof (after the warning). */
export function EnableAutoUnlockForm() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.setAutoUnlock({ enabled: true, password });
      await refreshAutoUnlock();
      modals.closeAll();
      notifyOk(t("autoUnlock.enabled"));
    } catch (e) {
      setError(parseError(e).code === "invalid_password" ? t("lock.wrongPassword") : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="list-card-body"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="onb-lead" style={{ fontSize: 13.5 }}>
        {t("autoUnlock.enableLead")}
      </p>
      <PasswordField label={t("password.label")} value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" data-autofocus error={error} />
      <button type="submit" className="btn btn-primary" disabled={!password || busy}>
        {t("autoUnlock.warnConfirm")}
      </button>
    </form>
  );
}

/** Opens the warning, then the password form. */
export async function enableAutoUnlock() {
  if (!(await confirmRememberPassword())) return;
  modals.open({ title: i18n.t("autoUnlock.remember"), children: <EnableAutoUnlockForm />, size: 420 });
}

/** Back to the default: the password is asked at every start. */
export async function disableAutoUnlock() {
  try {
    await api.setAutoUnlock({ enabled: false });
    await refreshAutoUnlock();
    notifyOk(i18n.t("autoUnlock.disabled"));
  } catch (e) {
    console.error("auto unlock", e);
  }
}
