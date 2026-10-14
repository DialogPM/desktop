import { IconAddressBook } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ToggleRow } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { pickedPath, pickFiles } from "../../lib/platform";
import type { ContactImportResult } from "../../lib/types";
import { attempt, reloadContacts } from "../../store/actions";
import { setApp, useApp } from "../../store/app";
import { WipeAllCard } from "./WipeAllCard";

export function ChatsSection() {
  const { t } = useTranslation();
  const backup = useApp((s) => s.details?.backup_enabled ?? false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ContactImportResult | null>(null);

  const toggleBackup = async (enabled: boolean) => {
    const ok = await attempt(async () => {
      await api.setBackupEnabled({ enabled });
      return true;
    });
    if (ok) setApp((s) => (s.details ? { details: { ...s.details, backup_enabled: enabled } } : {}));
  };

  const importBook = async () => {
    const [f] = await pickFiles({ kind: "contacts" });
    if (!f) return;
    setBusy(true);
    setResult(null);
    const res = await attempt(() => api.importContacts({ path: pickedPath(f) }));
    setBusy(false);
    if (res) {
      setResult(res);
      void reloadContacts();
    }
  };

  return (
    <>
      <div className="sub-label">{t("settings.chats.backup")}</div>
      <div className="list-card">
        <ToggleRow icon={<Icon name="lock" size={19} />} label={t("settings.chats.backupLabel")} sub={t("settings.chats.backupHint")} on={backup} onToggle={() => void toggleBackup(!backup)} />
      </div>
      <div className="sub-label" style={{ marginTop: 8 }}>
        {t("settings.chats.import")}
      </div>
      <div className="list-card">
        <div className="list-card-body">
          <div className="hint" style={{ fontSize: 13.5 }}>
            {t("settings.chats.importHint")}
          </div>
          <button type="button" className="btn btn-secondary" data-size="sm" style={{ alignSelf: "flex-start" }} onClick={importBook} disabled={busy}>
            <IconAddressBook size={18} />
            {t("settings.chats.importButton")}
          </button>
          {result && (
            <div className="notice">
              <span>
                <Icon name="okcircle" size={16} />
              </span>
              <span style={{ color: "var(--ink)" }}>{t("settings.chats.importResult", { total: result.total, withPhone: result.with_phone, matched: result.matched })}</span>
            </div>
          )}
          <div className="hint">{t("settings.chats.importPrivacy")}</div>
        </div>
      </div>
      <WipeAllCard />
    </>
  );
}
