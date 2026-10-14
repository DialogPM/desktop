import { CopyButton } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckBox } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { PasswordPairFields } from "../../components/PasswordPairFields";
import { SeedGrid } from "../../components/SeedGrid";
import { api } from "../../lib/api";
import { formatAccountNumber } from "../../lib/format";
import { usePasswordPair } from "../../lib/password";
import { defaultDeviceName } from "../../lib/platform";
import type { RegisterResult } from "../../lib/types";
import { enterApp, errorText } from "../../store/actions";
import { markSetupPending } from "../../lib/setup";

export function RegisterFlow({
  serverUrl,
  onBack,
  resume,
  onStage,
}: {
  serverUrl: string;
  onBack: () => void;
  /** Resume at the recovery phrase step (app was closed before confirming it). */
  resume?: RegisterResult;
  /** Reports the step shown in the indicator: 0 = password, 1 = recovery phrase. */
  onStage: (stage: 0 | 1) => void;
}) {
  const { t } = useTranslation();
  const pair = usePasswordPair();
  const [result, setResult] = useState<RegisterResult | null>(resume ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIt, setSavedIt] = useState(false);

  const register = async () => {
    if (!pair.valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.register({ server_url: serverUrl, password: pair.password, device_name: defaultDeviceName() });
      pair.reset();
      setResult(res);
      onStage(1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!savedIt) return;
    setError(null);
    setBusy(true);
    try {
      await api.confirmMnemonicSaved();
      // Next: name, username and appearance (SetupScreen).
      if (result?.account.account_id) markSetupPending(result.account.account_id);
      await enterApp();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  if (!result) {
    return (
      <form
        className="onb-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void register();
        }}
      >
        <button type="button" className="back-link" onClick={onBack}>
          <Icon name="back" size={16} />
          {t("common.back")}
        </button>
        <div>
          <h2 className="onb-h2">{t("onboarding.register.title")}</h2>
          <p className="onb-lead">{t("onboarding.register.subtitle")}</p>
        </div>
        <PasswordPairFields pair={pair} label={t("password.label")} autoFocus size="lg" />
        <div className="notice">
          <span>
            <Icon name="shield" size={16} />
          </span>
          <span>{t("onboarding.register.passwordHint")}</span>
        </div>
        {error && <div className="error-text">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={!pair.valid || busy}>
          {busy ? t("onboarding.register.creating") : t("onboarding.register.create")}
        </button>
      </form>
    );
  }

  return (
    <div className="onb-stack">
      <div>
        <h2 className="onb-h2">{t("onboarding.seed.ready")}</h2>
        <p className="onb-lead">{t("onboarding.seed.numberHint")}</p>
      </div>
      <div className="num-card">
        <div className="eyebrow">{t("onboarding.seed.yourNumber")}</div>
        <div className="acct-row">
          <div className="acct-number">{formatAccountNumber(result.account.number)}</div>
          <CopyButton value={result.account.number}>
            {({ copied, copy }) => (
              <button type="button" className="chip-btn" onClick={copy}>
                <Icon name={copied ? "check" : "copy"} size={15} />
                {copied ? t("common.copied") : t("common.copy")}
              </button>
            )}
          </CopyButton>
        </div>
      </div>
      <div>
        <h3 className="onb-h3">{t("onboarding.seed.title")}</h3>
        <p className="onb-lead" style={{ fontSize: 13.5 }}>
          {t("onboarding.seed.subtitle")}
        </p>
      </div>
      <SeedGrid words={result.mnemonic} />
      <button type="button" className="check-row" role="checkbox" aria-checked={savedIt} onClick={() => setSavedIt((v) => !v)}>
        <CheckBox on={savedIt} />
        {t("onboarding.seed.savedIt")}
      </button>
      {error && <div className="error-text">{error}</div>}
      <button type="button" className="btn btn-primary" onClick={confirm} disabled={!savedIt || busy}>
        {t("onboarding.seed.enter")}
      </button>
    </div>
  );
}
