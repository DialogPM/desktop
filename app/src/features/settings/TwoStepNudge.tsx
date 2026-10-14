// Recommends two-step verification while it is off: at most once a week. When it was last shown
// is kept in the encrypted local database (not the webview's storage, which may not survive).

import { Modal } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { openTwoStepSetup } from "../../lib/twoStep";
import { openSettings } from "../../store/actions";
import { useApp } from "../../store/app";

const REMINDER = "totp_nudge";
const INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function TwoStepNudge() {
  const { t } = useTranslation();
  const details = useApp((s) => s.details);
  const [open, setOpen] = useState(false);
  const account = details?.account.account_id;
  const wanted = !!details && !!account && !details.totp_enabled;

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    api
      .reminderShownAt(REMINDER)
      .then((shownAt) => {
        if (cancelled || (shownAt !== null && Date.now() - shownAt < INTERVAL_MS)) return;
        setOpen(true);
        // Counted as shown right away: closing the app instead of answering still waits a week.
        void api.markReminderShown(REMINDER).catch(() => undefined);
      })
      .catch((e: unknown) => console.warn("two-step reminder", e));
    return () => {
      cancelled = true;
    };
  }, [wanted, account]);

  if (!wanted || !open) return null;
  const close = () => setOpen(false);

  return (
    <Modal opened onClose={close} withCloseButton={false} centered size="sm">
      <div className="onb-stack" style={{ gap: 14, textAlign: "center", alignItems: "center" }}>
        <span className="nudge-icon">
          <Icon name="shield" size={30} />
        </span>
        <h3 className="onb-h2" style={{ margin: 0, fontSize: 20 }}>
          {t("totp.nudgeTitle")}
        </h3>
        <p className="hint" style={{ margin: 0 }}>
          {t("totp.nudgeText")}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%" }}
          onClick={() => {
            close();
            openSettings("account");
            openTwoStepSetup();
          }}
        >
          {t("totp.nudgeEnable")}
        </button>
        <button type="button" className="link-btn" onClick={close}>
          {t("totp.nudgeLater")}
        </button>
      </div>
    </Modal>
  );
}
