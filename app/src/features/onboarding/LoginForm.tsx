import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccountNumberInput } from "../../components/AccountNumberInput";
import { PasswordField } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { api, parseError } from "../../lib/api";
import { defaultDeviceName } from "../../lib/platform";
import { enterApp, errorText } from "../../store/actions";
import { LinkDeviceModal } from "../devices/LinkDeviceModal";
import { TotpInput } from "../../components/TotpInput";

export function LoginForm({ serverUrl, onBack, onRecover }: { serverUrl: string; onBack: () => void; onRecover: () => void }) {
  const { t } = useTranslation();
  const [number, setNumber] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  // Two-step verification: asked after the server accepted the password.
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");
  // The account requires approval of new logins: waiting for one of its devices.
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const approvalCancelled = useRef(false);
  const valid = number.length === 16 && password.length > 0 && (!needCode || code.length === 6);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.login({ server_url: serverUrl, number, password, device_name: defaultDeviceName(), totp: needCode ? code : undefined });
      await enterApp();
    } catch (e) {
      if (parseError(e).code === "approval_required") {
        await waitForApproval();
        return;
      }
      if (parseError(e).code === "totp_required") {
        setNeedCode(true);
      } else {
        setError(errorText(e));
        if (parseError(e).code === "invalid_totp") setCode("");
      }
      setBusy(false);
    }
  };

  const waitForApproval = async () => {
    setAwaitingApproval(true);
    approvalCancelled.current = false;
    try {
      await api.loginWaitApproval();
      await enterApp();
    } catch (e) {
      if (approvalCancelled.current) return;
      const { code: c } = parseError(e);
      setError(c === "gone" ? t("security.loginExpired") : errorText(e));
      setAwaitingApproval(false);
      setBusy(false);
    }
  };

  const cancelApproval = () => {
    approvalCancelled.current = true;
    void api.loginCancelApproval();
    setAwaitingApproval(false);
    setBusy(false);
    setError(null);
  };

  if (awaitingApproval) {
    return (
      <div className="onb-stack">
        <div>
          <h2 className="onb-h2">{t("security.waitingTitle")}</h2>
          <p className="onb-lead">{t("security.waitingBody")}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={cancelApproval}>
          {t("common.cancel")}
        </button>
      </div>
    );
  }

  if (needCode) {
    return (
      <form className="onb-stack" onSubmit={(e) => (e.preventDefault(), void submit())}>
        <button type="button" className="back-link" onClick={() => (setNeedCode(false), setCode(""), setError(null))}>
          <Icon name="back" size={16} />
          {t("common.back")}
        </button>
        <div>
          <h2 className="onb-h2">{t("totp.loginTitle")}</h2>
          <p className="onb-lead">{t("totp.loginHint")}</p>
        </div>
        <TotpInput value={code} onChange={setCode} autoFocus />
        {error && <div className="error-text">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
          {busy ? t("onboarding.login.submitting") : t("totp.verify")}
        </button>
      </form>
    );
  }

  return (
    <form className="onb-stack" onSubmit={(e) => (e.preventDefault(), void submit())}>
      <button type="button" className="back-link" onClick={onBack}>
        <Icon name="back" size={16} />
        {t("common.back")}
      </button>
      <div>
        <h2 className="onb-h2">{t("onboarding.login.title")}</h2>
        <p className="onb-lead">{t("onboarding.login.subtitle")}</p>
      </div>
      <AccountNumberInput label={t("onboarding.accountNumber")} value={number} onChange={setNumber} autoFocus size="lg" />
      <PasswordField label={t("password.label")} value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" size="lg" />
      {error && <div className="error-text">{error}</div>}
      <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
        {busy ? t("onboarding.login.submitting") : t("onboarding.login.submit")}
      </button>
      <div className="or-divider">{t("common.or")}</div>
      <button type="button" className="btn btn-secondary" style={{ height: 48, fontSize: 14.5 }} onClick={() => setLinking(true)}>
        <Icon name="scan" size={17} />
        {t("onboarding.login.scan")}
      </button>
      <button type="button" className="link-btn" onClick={onRecover}>
        {t("onboarding.login.recover")}
      </button>
      <LinkDeviceModal opened={linking} onClose={() => setLinking(false)} mode="new" serverUrl={serverUrl} />
    </form>
  );
}
