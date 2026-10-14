// Accounts created before the password rules may still have a weak password: ask once per
// session to change it.

import { Modal } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { openSettings } from "../../store/actions";
import { useApp } from "../../store/app";

export function WeakPasswordNudge() {
  const { t } = useTranslation();
  const weak = useApp((s) => s.details?.password_weak);
  const [closed, setClosed] = useState(false);
  if (!weak || closed) return null;
  return (
    <Modal opened onClose={() => setClosed(true)} withCloseButton={false} centered size="sm">
      <div className="onb-stack" style={{ gap: 14, textAlign: "center", alignItems: "center" }}>
        <span className="nudge-icon">
          <Icon name="key" size={30} />
        </span>
        <h3 className="onb-h2" style={{ margin: 0, fontSize: 20 }}>
          {t("password.weakTitle")}
        </h3>
        <p className="hint" style={{ margin: 0 }}>
          {t("password.weakBody")}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%" }}
          onClick={() => {
            setClosed(true);
            openSettings("account");
          }}
        >
          {t("password.weakAction")}
        </button>
        <button type="button" className="link-btn" onClick={() => setClosed(true)}>
          {t("password.weakLater")}
        </button>
      </div>
    </Modal>
  );
}
