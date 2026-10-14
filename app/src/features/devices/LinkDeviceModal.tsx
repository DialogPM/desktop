// Device linking by QR code, in the design's QR modal ("My code" / "Scan" tabs).
//  - mode "new": this device is signed out and joins an existing account (login screen).
//  - mode "existing": this device is signed in and approves a new one (Settings → Devices).

import { Loader, Modal } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { QrCode } from "../../components/QrCode";
import { QrScanner } from "../../components/QrScanner";
import { api, parseError } from "../../lib/api";
import { defaultDeviceName } from "../../lib/platform";
import { enterApp, errorText, notifyOk } from "../../store/actions";

type Tab = "mine" | "scan";

type Phase =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "code"; code: string }
  | { kind: "waiting"; sas?: string | null }
  | { kind: "confirm"; name: string; link?: string; sas?: string | null }
  | { kind: "expired" }
  | { kind: "error"; message: string };

interface Props {
  opened: boolean;
  onClose: () => void;
  mode: "new" | "existing";
  /** mode "new": server of the account to join. */
  serverUrl?: string;
  /** mode "existing": called after a device was approved. */
  onLinked?: () => void;
}

export function LinkDeviceModal({ opened, onClose, mode, serverUrl, onLinked }: Props) {
  const { t } = useTranslation();
  const close = () => {
    void api.linkCancel().catch(() => undefined);
    onClose();
  };
  return (
    <Modal opened={opened} onClose={close} title={mode === "new" ? t("link.titleNew") : t("link.titleExisting")} size={420} padding={20}>
      {opened && <LinkFlow mode={mode} serverUrl={serverUrl} onLinked={onLinked} onDone={onClose} />}
    </Modal>
  );
}

function LinkFlow({ mode, serverUrl, onLinked, onDone }: { mode: "new" | "existing"; serverUrl?: string; onLinked?: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("scan");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Every started flow gets a number; results of an older flow (tab switched, restarted) are ignored.
  const session = useRef(0);

  const fail = useCallback(
    (id: number, e: unknown) => {
      if (session.current !== id) return;
      const { code } = parseError(e);
      if (code === "gone") setPhase({ kind: "expired" });
      else if (code === "different_server") setPhase({ kind: "error", message: t("link.differentServer") });
      else setPhase({ kind: "error", message: errorText(e) });
    },
    [t],
  );

  const finishNew = useCallback(async (id: number) => {
    await api.linkWait();
    if (session.current !== id) return;
    onDone();
    await enterApp();
  }, [onDone]);

  const startMine = useCallback(async () => {
    const id = ++session.current;
    setPhase({ kind: "busy" });
    try {
      if (mode === "new") {
        const code = await api.linkCreate({ server_url: serverUrl ?? "", device_name: defaultDeviceName() });
        if (session.current !== id) return;
        setPhase({ kind: "code", code });
        await finishNew(id);
      } else {
        const code = await api.linkOffer();
        if (session.current !== id) return;
        setPhase({ kind: "code", code });
        const name = await api.linkOfferWait();
        const sas = await api.linkCode();
        if (session.current !== id) return;
        setPhase({ kind: "confirm", name, sas });
      }
    } catch (e) {
      fail(id, e);
    }
  }, [mode, serverUrl, finishNew, fail]);

  const onScanned = async (link: string) => {
    const id = ++session.current;
    setPhase({ kind: "busy" });
    try {
      if (mode === "new") {
        await api.linkClaim({ link, device_name: defaultDeviceName() });
        const sas = await api.linkCode();
        if (session.current !== id) return;
        setPhase({ kind: "waiting", sas });
        await finishNew(id);
      } else {
        const name = await api.linkInspect({ link });
        if (session.current !== id) return;
        setPhase({ kind: "confirm", name, link });
      }
    } catch (e) {
      fail(id, e);
    }
  };

  const approve = async (link?: string) => {
    const id = ++session.current;
    setPhase({ kind: "busy" });
    try {
      await api.linkApprove(link ? { link } : {});
      if (session.current !== id) return;
      notifyOk(t("link.linked"));
      onLinked?.();
      onDone();
    } catch (e) {
      fail(id, e);
    }
  };

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    session.current++;
    void api.linkCancel().catch(() => undefined);
    setTab(next);
    setPhase({ kind: "idle" });
  };

  // "My code" starts as soon as the tab is shown.
  useEffect(() => {
    if (tab === "mine" && phase.kind === "idle") queueMicrotask(() => void startMine());
  }, [tab, phase.kind, startMine]);

  const restart = () => {
    void api.linkCancel().catch(() => undefined);
    if (tab === "mine") void startMine();
    else setPhase({ kind: "idle" });
  };

  let body: React.ReactNode;
  if (phase.kind === "confirm") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "10px 0 2px", textAlign: "center" }}>
        <div className="dev-icon" style={{ width: 64, height: 64, borderRadius: 19 }}>
          <Icon name="devices" size={30} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{t("link.confirmTitle", { name: phase.name })}</div>
        {phase.sas && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div className="hint" style={{ fontSize: 12.5 }}>{t("link.sasLabel")}</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 3, fontVariantNumeric: "tabular-nums" }}>{phase.sas}</div>
          </div>
        )}
        <div className="hint" style={{ fontSize: 13.5, maxWidth: 320 }}>
          {phase.sas ? t("link.sasConfirmHint") : t("link.confirmBody")}
        </div>
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <button type="button" className="btn btn-secondary" data-size="sm" style={{ flex: 1 }} onClick={restart}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn btn-primary" data-size="sm" style={{ flex: 1 }} onClick={() => void approve(phase.link)}>
            {t("link.approve")}
          </button>
        </div>
      </div>
    );
  } else if (phase.kind === "expired" || phase.kind === "error") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "10px 0 2px", textAlign: "center" }}>
        <div className="dev-icon" style={{ width: 64, height: 64, borderRadius: 19, color: "var(--danger)" }}>
          <Icon name="alert" size={30} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{phase.kind === "expired" ? t("link.expired") : t("errors.title")}</div>
        <div className="hint" style={{ fontSize: 13.5, maxWidth: 320 }}>
          {phase.kind === "expired" ? t("link.expiredHint") : phase.message}
        </div>
        <button type="button" className="btn btn-primary" data-size="sm" style={{ width: "100%" }} onClick={restart}>
          <Icon name={tab === "mine" ? "qr" : "scan"} size={17} />
          {tab === "mine" ? t("link.newCode") : t("link.scanAgain")}
        </button>
      </div>
    );
  } else if (phase.kind === "waiting") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "28px 0 16px", textAlign: "center" }}>
        <Loader />
        <div style={{ fontSize: 16, fontWeight: 700 }}>{t("link.confirmOther")}</div>
        {phase.sas && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div className="hint" style={{ fontSize: 12.5 }}>{t("link.sasLabel")}</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 3, fontVariantNumeric: "tabular-nums" }}>{phase.sas}</div>
          </div>
        )}
        <div className="hint" style={{ fontSize: 13.5, maxWidth: 320 }}>
          {phase.sas ? t("link.sasWaitHint") : t("link.confirmOtherHint")}
        </div>
      </div>
    );
  } else if (tab === "mine") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "6px 0 2px" }}>
        {phase.kind === "code" ? <QrCode value={phase.code} /> : <Loader my={96} />}
        <div className="hint" style={{ fontSize: 13, textAlign: "center", maxWidth: 300, lineHeight: 1.45 }}>
          {mode === "new" ? t("link.showNew") : t("link.showExisting")}
        </div>
        <div className="lock-note" style={{ gap: 8 }}>
          {phase.kind === "code" && <Loader size={12} />}
          <Icon name="clock" size={13} />
          {t("link.validity")}
        </div>
      </div>
    );
  } else {
    body =
      phase.kind === "busy" ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "90px 0" }}>
          <Loader />
        </div>
      ) : (
        <QrScanner
          hint={mode === "new" ? t("link.scanNew") : t("link.scanExisting")}
          pasteLabel={t("link.orPaste")}
          placeholder="chatapp://link?…"
          submitLabel={t("common.continue")}
          onResult={(l) => void onScanned(l)}
        />
      );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "mine"} data-active={tab === "mine"} onClick={() => switchTab("mine")}>
          <Icon name="qr" size={16} />
          {t("qr.myCodeShort")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "scan"} data-active={tab === "scan"} onClick={() => switchTab("scan")}>
          <Icon name="scan" size={16} />
          {t("qr.scanShort")}
        </button>
      </div>
      {body}
    </div>
  );
}
