// Settings: two-step verification (TOTP) — status, enable with a QR code, disable with a code.

import { CopyButton, Modal } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { QrCode } from "../../components/QrCode";
import { TotpInput } from "../../components/TotpInput";
import { api } from "../../lib/api";
import { useIsMobile } from "../../lib/hooks";
import { registerTwoStepOpener } from "../../lib/twoStep";
import { errorText, notifyOk, refreshDetails } from "../../store/actions";
import { useApp } from "../../store/app";

type Step = { kind: "setup"; secret: string; uri: string } | { kind: "disable" } | null;

export function TwoStepCard() {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const enabled = useApp((s) => s.details?.totp_enabled ?? false);
  const [step, setStep] = useState<Step>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setCode("");
    setError(null);
    if (enabled) {
      setStep({ kind: "disable" });
      return;
    }
    setBusy(true);
    try {
      const s = await api.totpSetup();
      setStep({ kind: "setup", ...s });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    registerTwoStepOpener(() => void openRef.current());
    return () => registerTwoStepOpener(null);
  }, []);

  const confirm = async () => {
    if (!step || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      if (step.kind === "setup") {
        await api.totpEnable({ code });
        notifyOk(t("totp.enabled"));
      } else {
        await api.totpDisable({ code });
        notifyOk(t("totp.disabled"));
      }
      setStep(null);
      await refreshDetails();
    } catch (e) {
      setError(errorText(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="list-card">
        <button type="button" className="list-card-row" onClick={() => void open()} disabled={busy}>
          <span className="ic">
            <Icon name="shield" size={19} />
          </span>
          <div className="flex1">
            <div className="list-card-title">{t("totp.title")}</div>
            <div className="list-card-sub" style={{ marginTop: 0, color: enabled ? "var(--accent-text)" : undefined }}>
              {enabled ? t("totp.on") : t("totp.off")}
            </div>
          </div>
          <span className="list-card-chev">
            <Icon name="chevron" size={17} />
          </span>
        </button>
      </div>
      {error && !step && <div className="error-text">{error}</div>}
      <Modal
        opened={step !== null}
        onClose={() => setStep(null)}
        title={step?.kind === "disable" ? t("totp.disableTitle") : t("totp.setupTitle")}
        fullScreen={mobile}
        size="md"
      >
        <form className="onb-stack" style={{ gap: 14 }} onSubmit={(e) => (e.preventDefault(), void confirm())}>
          {step?.kind === "setup" && (
            <>
              <p className="hint" style={{ margin: 0 }}>
                {t("totp.step1")}
              </p>
              <div style={{ display: "grid", placeItems: "center" }}>
                <QrCode value={step.uri} size={190} />
              </div>
              <div className="hint" style={{ margin: 0 }}>
                {t("totp.manual")}
              </div>
              <div className="acct-row">
                <span className="mono" style={{ wordBreak: "break-all", fontSize: 14 }}>
                  {step.secret.replace(/(.{4})/g, "$1 ").trim()}
                </span>
                <CopyButton value={step.secret}>
                  {({ copied, copy }) => (
                    <button type="button" className="chip-btn" data-tone="pane" onClick={copy}>
                      <Icon name={copied ? "check" : "copy"} size={15} />
                      {copied ? t("common.copied") : t("common.copy")}
                    </button>
                  )}
                </CopyButton>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                {t("totp.step2")}
              </p>
            </>
          )}
          {step?.kind === "disable" && (
            <p className="hint" style={{ margin: 0 }}>
              {t("totp.disableHint")}
            </p>
          )}
          <TotpInput value={code} onChange={setCode} autoFocus={step?.kind === "disable"} />
          {error && <div className="error-text">{error}</div>}
          <button
            type="submit"
            className={step?.kind === "disable" ? "btn btn-danger" : "btn btn-primary"}
            disabled={code.length !== 6 || busy}
          >
            {step?.kind === "disable" ? t("totp.disable") : t("totp.enable")}
          </button>
          <p className="hint" style={{ margin: 0, fontSize: 12 }}>
            {t("totp.recoveryNote")}
          </p>
        </form>
      </Modal>
    </>
  );
}
