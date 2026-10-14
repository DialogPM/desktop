import { Loader, Modal } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { QrCode } from "../../components/QrCode";
import { QrScanner } from "../../components/QrScanner";
import { api } from "../../lib/api";
import type { SafetyNumber } from "../../lib/types";
import { attempt } from "../../store/actions";
import { upsertContact } from "../../store/app";
import { KtContactLine } from "../settings/KeyTransparency";

export function SafetyNumberView({ accountId, name }: { accountId: string; name: string }) {
  const { t } = useTranslation();
  const [sn, setSn] = useState<SafetyNumber | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<"match" | "mismatch" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void attempt(() => api.getSafetyNumber({ account_id: accountId })).then((s) => alive && s && setSn(s));
    return () => {
      alive = false;
    };
  }, [accountId]);

  const setVerified = async (verified: boolean) => {
    setBusy(true);
    const c = await attempt(() => api.setVerified({ account_id: accountId, verified }));
    setBusy(false);
    if (c) {
      upsertContact(c);
      setSn((s) => (s ? { ...s, verified } : s));
    }
  };

  if (!sn) return <Loader m="xl" />;
  const groups = sn.digits.split(/\s+/).filter(Boolean);

  return (
    <div className="pane-scroll">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, padding: "24px 20px" }}>
        {sn.verified && (
          <span className="badge-soft" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
            <Icon name="shield" size={14} />
            {t("safety.verified")}
          </span>
        )}
        <QrCode value={sn.qr_payload} size={180} />
        <div className="safety-grid" data-big="true" aria-label={t("safety.number")} style={{ margin: 0 }}>
          {groups.map((g, i) => (
            <span key={i}>{g}</span>
          ))}
        </div>
        <div className="hint" style={{ fontSize: 13.5, textAlign: "center", maxWidth: 380 }}>
          {t("safety.explanation", { name })}
        </div>
        <KtContactLine accountId={accountId} />
        {scanResult === "match" && (
          <div className="notice" style={{ width: "100%" }}>
            <span>
              <Icon name="okcircle" size={17} />
            </span>
            <span style={{ color: "var(--ink)" }}>{t("safety.match")}</span>
          </div>
        )}
        {scanResult === "mismatch" && (
          <div className="notice" data-tone="danger" style={{ width: "100%" }}>
            <span>
              <Icon name="alert" size={17} />
            </span>
            <span>{t("safety.mismatch", { name })}</span>
          </div>
        )}
        <button type="button" className="btn btn-secondary" data-size="md" style={{ width: "100%" }} onClick={() => setScanning(true)}>
          <Icon name="scan" size={18} />
          {t("safety.scan")}
        </button>
        <button
          type="button"
          className={`btn ${sn.verified ? "btn-secondary" : "btn-primary"}`}
          data-size="md"
          style={{ width: "100%" }}
          disabled={busy}
          onClick={() => void setVerified(!sn.verified)}
        >
          <Icon name="shield" size={18} />
          {sn.verified ? t("safety.clear") : t("safety.markVerified")}
        </button>
      </div>
      <Modal opened={scanning} onClose={() => setScanning(false)} title={t("safety.scan")} size={420} padding={20}>
        {scanning && (
          <QrScanner
            onResult={(text) => {
              setScanning(false);
              const ok = text.trim() === sn.qr_payload;
              setScanResult(ok ? "match" : "mismatch");
              if (ok && !sn.verified) void setVerified(true);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
