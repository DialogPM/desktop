import { CopyButton, Loader } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconPhone } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PasswordField, TextField, ToggleRow } from "../../components/Field";
import { Icon, type IconName } from "../../components/Icon";
import { PasswordPairFields } from "../../components/PasswordPairFields";
import { SeedGrid } from "../../components/SeedGrid";
import i18n from "../../i18n";
import { api, parseError } from "../../lib/api";
import { formatAccountNumber } from "../../lib/format";
import type { CurrentProfile } from "../../lib/types";
import { usePasswordPair } from "../../lib/password";
import { attempt, errorText, notifyOk, refreshDetails, signedOut } from "../../store/actions";
import { useApp } from "../../store/app";
import { openMyQr } from "../chats/MyQrModal";
import { TwoStepCard } from "./TwoStepCard";
import { UsernameCard } from "./UsernameCard";

export function AccountSection() {
  const { t } = useTranslation();
  const details = useApp((s) => s.details);
  if (!details) return <Loader m="xl" />;
  const number = details.account.number;

  const row = (icon: IconName, title: string, sub: string, onClick: () => void) => (
    <button type="button" className="list-card-row" onClick={onClick}>
      <span className="ic">
        <Icon name={icon} size={19} />
      </span>
      <div className="flex1">
        <div className="list-card-title">{title}</div>
        <div className="list-card-sub" style={{ marginTop: 0 }}>
          {sub}
        </div>
      </div>
      <span className="list-card-chev">
        <Icon name="chevron" size={17} />
      </span>
    </button>
  );

  return (
    <>
      <div className="card-sunk">
        <div className="eyebrow">{t("settings.account.number")}</div>
        <div className="acct-row">
          <div className="acct-number">{formatAccountNumber(number)}</div>
          <CopyButton value={number}>
            {({ copied, copy }) => (
              <button type="button" className="chip-btn" data-tone="pane" onClick={copy}>
                <Icon name={copied ? "check" : "copy"} size={15} />
                {copied ? t("common.copied") : t("common.copy")}
              </button>
            )}
          </CopyButton>
        </div>
        <div className="hint">
          {t("settings.account.server")}: <span className="mono">{details.account.server_url}</span>
        </div>
      </div>

      <ThisComputerCard />

      <UsernameCard />

      <TwoStepCard />

      <div className="list-card">
        {row("key", t("settings.account.changePassword"), t("settings.account.changePasswordHint"), openChangePassword)}
        {row("eye", t("settings.account.recovery"), t("settings.account.recoveryHint"), openRevealMnemonic)}
        {row("qr", t("qr.myCode"), t("settings.account.qrHint"), () => openMyQr())}
      </div>

      <PhoneCard />

      <button type="button" className="danger-link" onClick={openDeleteAccount}>
        <Icon name="trash" size={17} />
        {t("settings.account.delete")}
      </button>
    </>
  );
}

/** "Show this account on the start screen" (accounts saved on this computer, profiles.rs). */
function ThisComputerCard() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<CurrentProfile | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .currentProfile()
      .then((c) => alive && setCurrent(c))
      .catch((e) => console.error("profile", e));
    return () => {
      alive = false;
    };
  }, []);
  if (!current?.registered) return null;
  const toggle = async () => {
    const visible = !current.visible;
    const ok = await attempt(async () => {
      await api.setProfileVisible({ visible });
      return true;
    });
    if (ok) setCurrent({ ...current, visible });
  };
  return (
    <>
      <div className="sub-label">{t("profiles.thisComputer")}</div>
      <div className="list-card">
        <ToggleRow icon={<Icon name="devices" size={19} />} label={t("profiles.showOnStart")} sub={t("profiles.showOnStartHint")} on={current.visible} onToggle={() => void toggle()} />
      </div>
    </>
  );
}

function PhoneCard() {
  const { t } = useTranslation();
  const details = useApp((s) => s.details)!;
  const server = useApp((s) => s.serverInfo);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = server?.phone_verification_enabled ?? true;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="list-card">
      <div className="list-card-row" style={{ alignItems: "flex-start" }}>
        <span className="ic" style={{ paddingTop: 2 }}>
          <IconPhone size={19} />
        </span>
        <div className="flex1">
          <div className="list-card-title">
            {t("settings.account.phone")}
            <span className="badge-soft" data-tone="muted">
              {t("common.optional")}
            </span>
          </div>
          <div className="list-card-sub">{t("settings.account.phoneHint")}</div>
        </div>
      </div>
      <div className="list-card-body" style={{ borderBottom: 0 }}>
        {!supported ? (
          <div className="hint">{t("settings.account.phoneUnsupported")}</div>
        ) : details.phone && details.phone_verified ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{details.phone}</span>
              <span className="badge-soft">{t("settings.account.verified")}</span>
              <button
                type="button"
                className="chip-btn"
                data-tone="danger"
                style={{ marginLeft: "auto" }}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api.removePhone();
                    await refreshDetails();
                  })
                }
              >
                {t("common.remove")}
              </button>
            </div>
            <div style={{ margin: "0 -16px -16px", borderTop: "1px solid var(--line)" }}>
              <ToggleRow
                label={t("settings.account.discoverable")}
                sub={t("settings.account.discoverableHint")}
                on={details.discoverable_by_phone}
                disabled={busy}
                onToggle={() =>
                  void run(async () => {
                    await api.setDiscoverable({ discoverable: !details.discoverable_by_phone });
                    await refreshDetails();
                  })
                }
              />
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <TextField
                  label={t("settings.account.phoneNumber")}
                  placeholder="+40 721 000 000"
                  inputMode="tel"
                  value={phone}
                  disabled={sent}
                  onChange={(e) => setPhone(e.currentTarget.value)}
                />
              </div>
              {!sent ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ height: 48, fontSize: 14 }}
                  disabled={busy || phone.replace(/\D/g, "").length < 7}
                  onClick={() =>
                    void run(async () => {
                      await api.requestPhoneCode({ phone: phone.trim() });
                      setSent(true);
                    })
                  }
                >
                  {t("settings.account.sendCode")}
                </button>
              ) : (
                <button type="button" className="btn btn-secondary" style={{ height: 48, fontSize: 14 }} onClick={() => (setSent(false), setCode(""))}>
                  {t("common.change")}
                </button>
              )}
            </div>
            {sent && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <TextField
                    label={t("settings.account.code")}
                    description={t("settings.account.codeHint")}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    mono
                    value={code}
                    onChange={(e) => setCode(e.currentTarget.value.replace(/\D/g, ""))}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ height: 48, fontSize: 14, marginBottom: 26 }}
                  disabled={busy || code.length < 4}
                  onClick={() =>
                    void run(async () => {
                      await api.verifyPhone({ phone: phone.trim(), code });
                      setSent(false);
                      setCode("");
                      await refreshDetails();
                      notifyOk(t("settings.account.phoneVerified"));
                    })
                  }
                >
                  {t("settings.account.verify")}
                </button>
              </div>
            )}
          </>
        )}
        {error && <div className="error-text">{error}</div>}
      </div>
    </div>
  );
}

function ChangePasswordForm() {
  const { t } = useTranslation();
  const [old, setOld] = useState("");
  const pair = usePasswordPair();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.changePassword({ old_password: old, new_password: pair.password });
      modals.closeAll();
      notifyOk(t("settings.account.passwordChanged"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <PasswordField label={t("password.current")} value={old} onChange={(e) => setOld(e.currentTarget.value)} autoComplete="current-password" data-autofocus />
      <PasswordPairFields pair={pair} />
      {error && <div className="error-text">{error}</div>}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={() => modals.closeAll()}>
          {t("common.cancel")}
        </button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !old || !pair.valid}>
          {t("settings.account.changePassword")}
        </button>
      </div>
    </div>
  );
}

function openChangePassword() {
  modals.open({ title: i18n.t("settings.account.changePassword"), children: <ChangePasswordForm />, size: 460 });
}

/** Asks for the password, then shows the 24 words (blurred until revealed). */
function RevealMnemonicForm() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [words, setWords] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setWords(await api.revealMnemonic({ password }));
      setPassword("");
    } catch (e) {
      setError(parseError(e).code === "invalid_password" ? t("lock.wrongPassword") : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (words) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="hint" style={{ fontSize: 13.5 }}>
          {t("settings.account.recoveryShown")}
        </div>
        <SeedGrid words={words} />
        <div className="notice" data-tone="warn">
          <span>
            <Icon name="alert" size={16} />
          </span>
          <span>{t("onboarding.seed.warning")}</span>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={() => modals.closeAll()}>
            {t("common.close")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (password) void submit();
      }}
    >
      <div className="hint" style={{ fontSize: 13.5 }}>
        {t("settings.account.recoveryAsk")}
      </div>
      <PasswordField label={t("password.label")} value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" data-autofocus error={error} />
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={() => modals.closeAll()}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn btn-primary" disabled={!password || busy}>
          <Icon name="eye" size={17} />
          {t("settings.account.recoveryShow")}
        </button>
      </div>
    </form>
  );
}

function openRevealMnemonic() {
  modals.open({ title: i18n.t("settings.account.recovery"), children: <RevealMnemonicForm />, size: 520 });
}

function DeleteAccountForm() {
  const { t } = useTranslation();
  const number = useApp((s) => s.details?.account.number ?? "");
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last4 = number.slice(-4);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount({ password });
      modals.closeAll();
      signedOut("account_deleted");
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="notice" data-tone="danger">
        <span>
          <Icon name="alert" size={17} />
        </span>
        <span>{t("settings.account.deleteWarning")}</span>
      </div>
      <PasswordField label={t("password.label")} value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" />
      <TextField label={t("settings.account.deleteConfirm", { digits: last4 })} value={confirmText} inputMode="numeric" mono onChange={(e) => setConfirmText(e.currentTarget.value)} />
      {error && <div className="error-text">{error}</div>}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={() => modals.closeAll()}>
          {t("common.cancel")}
        </button>
        <button type="button" className="btn btn-danger" onClick={submit} disabled={busy || !password || confirmText.trim() !== last4}>
          {t("settings.account.deleteForever")}
        </button>
      </div>
    </div>
  );
}

function openDeleteAccount() {
  modals.open({ title: i18n.t("settings.account.delete"), children: <DeleteAccountForm />, size: 480 });
}
