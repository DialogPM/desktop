import { CopyButton, Loader } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { QrCode } from "../../components/QrCode";
import { QrScanner } from "../../components/QrScanner";
import { api, parseError } from "../../lib/api";
import { formatAccountNumber } from "../../lib/format";
import { shareQr } from "../../lib/share";
import { errorText, notifyOk, openDirect } from "../../store/actions";
import { useApp } from "../../store/app";

function MyCode() {
  const { t } = useTranslation();
  const number = useApp((s) => s.details?.account.number ?? "");
  const name = useApp((s) => s.profile?.name ?? "");
  const username = useApp((s) => s.details?.username);
  const [link, setLink] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const share = async () => {
    if (!link) return;
    const res = await shareQr({ link, title: t("qr.shareTitle"), svg: qrRef.current?.querySelector("svg") ?? null, fileName: "chatapp-qr.png" });
    if (res === "copied") notifyOk(t("qr.linkCopied"));
    else if (res === "downloaded") notifyOk(t("qr.saved"));
  };
  useEffect(() => {
    let alive = true;
    api
      .getMyContactLink()
      .then((l) => alive && setLink(l))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "6px 0 2px" }}>
      <div ref={qrRef}>{link ? <QrCode value={link} /> : <Loader my={90} />}</div>
      <div style={{ textAlign: "center" }}>
        {name && <div style={{ fontSize: 16, fontWeight: 700 }}>{name}</div>}
        {username && <div className="username-value" style={{ fontSize: 14.5, marginTop: 2 }}>@{username}</div>}
        <div className="mono" style={{ fontSize: 17, fontWeight: 600, wordSpacing: "0.35em", marginTop: 4 }}>
          {formatAccountNumber(number)}
        </div>
      </div>
      <div className="hint" style={{ fontSize: 13, textAlign: "center", maxWidth: 300, lineHeight: 1.45 }}>
        {t("qr.myCodeHint")}
      </div>
      {link && (
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <CopyButton value={link}>
            {({ copied, copy }) => (
              <button type="button" className="btn" data-size="sm" style={{ flex: 1, background: "var(--accent-soft)", color: "var(--accent-text)" }} onClick={copy}>
                <Icon name={copied ? "check" : "copy"} size={16} />
                {copied ? t("qr.linkCopied") : t("qr.copyLink")}
              </button>
            )}
          </CopyButton>
          <button type="button" className="btn btn-secondary" data-size="sm" style={{ flex: 1 }} onClick={() => void share()}>
            <Icon name="share" size={16} />
            {t("qr.share")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Scans or accepts a pasted contact link, adds the contact and opens the chat. */
function ScanContact({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handle = async (link: string) => {
    setBusy(true);
    setError(null);
    try {
      const c = await api.addContactFromLink({ link });
      onDone();
      await openDirect(c.account_id);
    } catch (e) {
      const { code } = parseError(e);
      setError(code === "different_server" ? t("qr.differentServer") : errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <QrScanner onResult={(l) => void handle(l)} busy={busy} />
      {error && <div className="error-text" style={{ textAlign: "center" }}>{error}</div>}
    </div>
  );
}

export function QrTabs({ initial }: { initial: "mine" | "scan" }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(initial);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "mine"} data-active={tab === "mine"} onClick={() => setTab("mine")}>
          <Icon name="qr" size={16} />
          {t("qr.myCodeShort")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "scan"} data-active={tab === "scan"} onClick={() => setTab("scan")}>
          <Icon name="scan" size={16} />
          {t("qr.scanShort")}
        </button>
      </div>
      {tab === "mine" ? <MyCode /> : <ScanContact onDone={() => modals.closeAll()} />}
    </div>
  );
}
