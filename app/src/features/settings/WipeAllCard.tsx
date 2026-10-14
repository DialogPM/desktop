// Settings > Conversations: delete every conversation, here and for the other side of each one.

import { Modal } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PasswordField } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { useIsMobile } from "../../lib/hooks";
import { errorText, notifyOk, reloadConversations } from "../../store/actions";
import { setApp } from "../../store/app";

export function WipeAllCard() {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wipe = async () => {
    setBusy(true);
    setError(null);
    try {
      // Irreversible: the account password confirms it is really the owner.
      if (!(await api.verifyPassword({ password }))) {
        setError(t("wipe.wrongPassword"));
        return;
      }
      await api.wipeAllConversations({ password });
      setApp({ activeId: null, infoOpen: false, convMessages: {} });
      await reloadConversations();
      setOpen(false);
      setPassword("");
      notifyOk(t("wipe.done"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="danger-link" onClick={() => setOpen(true)}>
        <Icon name="trash" size={17} />
        {t("wipe.action")}
      </button>
      <Modal opened={open} onClose={() => setOpen(false)} title={t("wipe.title")} fullScreen={mobile} size="md">
        <form className="onb-stack" style={{ gap: 14 }} onSubmit={(e) => (e.preventDefault(), void wipe())}>
          <p className="hint" style={{ margin: 0 }}>
            {t("wipe.body")}
          </p>
          <ul className="hint" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            <li>{t("wipe.point1")}</li>
            <li>{t("wipe.point2")}</li>
            <li>{t("wipe.point3")}</li>
          </ul>
          <PasswordField label={t("password.label")} value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" />
          {error && <div className="error-text">{error}</div>}
          <button type="submit" className="btn btn-danger" disabled={!password || busy}>
            {busy ? t("wipe.working") : t("wipe.confirm")}
          </button>
        </form>
      </Modal>
    </>
  );
}
