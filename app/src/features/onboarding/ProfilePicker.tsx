// Start screen: the accounts saved on this computer (profiles). Each one opens with its own
// password, locally, without logging in again. Hidden accounts are opened by typing the full
// account number ("Open another account on this computer").

import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AccountNumberInput } from "../../components/AccountNumberInput";
import { PasswordField } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import i18n from "../../i18n";
import { api, parseError } from "../../lib/api";
import { reloadAfterProfileSwitch } from "../../lib/profiles";
import type { ProfileCard } from "../../lib/types";
import { attempt, errorText } from "../../store/actions";

function profileName(p: ProfileCard): string {
  return p.label || i18n.t("profiles.account");
}

function profileSub(p: ProfileCard): string {
  return [p.last4 ? `•••• ${p.last4}` : null, p.server_host].filter(Boolean).join(" · ");
}

/** Password form of one profile. `bare`: without the name label (in a titled dialog). */
export function UnlockForm({ profile, onForgotten, bare }: { profile: ProfileCard; onForgotten: () => void; bare?: boolean }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.openProfile({ id: profile.id, password });
      reloadAfterProfileSwitch(true);
    } catch (e) {
      setError(parseError(e).code === "invalid_password" ? t("dataLock.wrongPassword") : errorText(e));
      setBusy(false);
    }
  };

  const forgot = () =>
    modals.openConfirmModal({
      title: t("profiles.forgetTitle"),
      children: (
        <Text size="sm" c="dimmed">
          {t("profiles.forgetBody")}
        </Text>
      ),
      labels: { confirm: t("profiles.forget"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        void attempt(async () => {
          await api.forgetProfile({ id: profile.id });
          onForgotten();
        }),
    });

  return (
    <form
      className="list-card-body"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <PasswordField
        label={bare ? t("password.label") : t("profiles.passwordFor", { name: profileName(profile) })}
        value={password}
        onChange={(e) => setPassword(e.currentTarget.value)}
        autoComplete="current-password"
        autoFocus
        error={error}
      />
      <button type="submit" className="btn btn-primary" disabled={!password || busy}>
        {busy ? t("profiles.opening") : t("profiles.open")}
      </button>
      <button type="button" className="link-btn" style={{ color: "var(--muted)", fontWeight: 500, fontSize: 13 }} onClick={forgot}>
        {t("profiles.forgot")}
      </button>
    </form>
  );
}

/** The listed profiles; a click shows the password field. */
export function ProfileList({ profiles, onChanged }: { profiles: ProfileCard[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(profiles.length === 1 && !profiles[0].unlocked ? profiles[0].id : null);
  return (
    <div className="onb-stack">
      <div>
        <h2 className="onb-h2">{t("profiles.title")}</h2>
        <p className="onb-lead">{t("profiles.lead")}</p>
      </div>
      <div className="list-card">
        {profiles.map((p) => (
          <div key={p.id} className="profile-item">
            <button
              type="button"
              className="list-card-row"
              aria-expanded={open === p.id}
              onClick={() => {
                // Opened earlier in this run of the app: no password needed.
                if (p.unlocked) {
                  void api.switchProfile({ id: p.id }).then(
                    () => reloadAfterProfileSwitch(true),
                    () => setOpen(p.id),
                  );
                  return;
                }
                setOpen(open === p.id ? null : p.id);
              }}
            >
              <UserAvatar name={profileName(p)} seed={p.id} size={42} />
              <div className="flex1" style={{ minWidth: 0 }}>
                <div className="list-card-title truncate">{profileName(p)}</div>
                {profileSub(p) && <div className="list-card-sub truncate mono">{profileSub(p)}</div>}
              </div>
              {p.unlocked ? (
                <span className="list-card-sub" style={{ marginTop: 0, color: "var(--accent-text)", fontWeight: 600 }}>{t("profiles.unlocked")}</span>
              ) : (
                <span className="list-card-chev" style={{ transform: open === p.id ? "rotate(90deg)" : undefined }}>
                  <Icon name="chevron" size={17} />
                </span>
              )}
            </button>
            {open === p.id && <UnlockForm profile={p} onForgotten={onChanged} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Open another account on this computer": full account number and password. */
export function OpenOtherProfile({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [number, setNumber] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = number.length === 16 && password.length > 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.openProfileByNumber({ number, password });
      reloadAfterProfileSwitch(true);
    } catch (e) {
      setError(parseError(e).code === "invalid_password" ? t("profiles.otherWrong") : errorText(e));
      setBusy(false);
    }
  };

  return (
    <form className="onb-stack" onSubmit={(e) => (e.preventDefault(), void submit())}>
      <button type="button" className="back-link" onClick={onBack}>
        <Icon name="back" size={16} />
        {t("common.back")}
      </button>
      <div>
        <h2 className="onb-h2">{t("profiles.otherTitle")}</h2>
        <p className="onb-lead">{t("profiles.otherLead")}</p>
      </div>
      <AccountNumberInput label={t("onboarding.accountNumber")} value={number} onChange={setNumber} autoFocus size="lg" />
      <PasswordField label={t("password.label")} value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" size="lg" />
      {error && <div className="error-text">{error}</div>}
      <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
        {busy ? t("profiles.opening") : t("profiles.open")}
      </button>
    </form>
  );
}
