// Key transparency (docs/KEY-TRANSPARENCY.md): a banner over the whole app when the core
// detects that the server's public key log is inconsistent (event kt_alerts), and the status
// line of a contact's key on the safety number screen.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { api, onEvent } from "../../lib/api";
import { showNotification } from "../../lib/platform";
import type { KtAlert, KtContactStatus } from "../../lib/types";
import { attempt } from "../../store/actions";

export function KtAlertBanner() {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<KtAlert[]>([]);
  const shown = useRef<KtAlert[]>([]);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | null = null;
    const update = (list: KtAlert[]) => {
      shown.current = list;
      setAlerts(list);
    };
    void api.ktStatus().then((o) => alive && update(o.alerts), () => {});
    void onEvent("kt_alerts", (list) => {
      const fresh = list.filter((a) => !shown.current.some((p) => p.kind === a.kind && p.at === a.at));
      if (fresh.length) void showNotification(t("kt.alertTitle"), t(`kt.kind.${fresh[0].kind}`));
      update(list);
    }).then((u) => {
      if (alive) unlisten = u;
      else u();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [t]);

  if (!alerts.length) return null;
  const last = alerts[alerts.length - 1];
  return (
    <div className="banner banner-security" role="alert">
      <Icon name="alert" size={16} />
      <span>
        <strong>{t("kt.alertTitle")}</strong>: {t(`kt.kind.${last.kind}`)}
        {alerts.length > 1 ? ` (+${alerts.length - 1})` : ""}. {t("kt.alertHint")}
      </span>
      <button type="button" className="chip-btn" onClick={() => void attempt(() => api.ktDismissAlerts())}>
        {t("security.dismiss")}
      </button>
    </div>
  );
}

/** "Key transparency: verified / not verified yet / ALERT" for a contact's key. */
export function KtContactLine({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const [st, setSt] = useState<KtContactStatus | null>(null);

  useEffect(() => {
    let alive = true;
    void api.ktContactStatus({ account_id: accountId }).then((s) => alive && setSt(s), () => {});
    return () => {
      alive = false;
    };
  }, [accountId]);

  if (!st || st.status === "unavailable") return null;
  const alert = st.status === "alert";
  return (
    <div className="notice" data-tone={alert ? "danger" : undefined} style={{ width: "100%" }} role={alert ? "alert" : "status"}>
      <span>
        <Icon name={alert ? "alert" : st.status === "verified" ? "okcircle" : "shield"} size={17} />
      </span>
      <span style={alert ? undefined : { color: "var(--ink)" }}>
        <strong>{t("kt.title")}</strong>: {t(`kt.status.${st.status}`)}
        <br />
        <span className="hint" style={{ fontSize: 12.5 }}>
          {t(`kt.statusHint.${st.status}`)}
        </span>
      </span>
    </div>
  );
}
