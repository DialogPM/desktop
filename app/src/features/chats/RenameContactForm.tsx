import { modals } from "@mantine/modals";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../../components/Field";
import { api } from "../../lib/api";
import { formatAccountNumber } from "../../lib/format";
import type { Contact } from "../../lib/types";
import { attempt } from "../../store/actions";
import { upsertContact } from "../../store/app";

/** "Edit name" dialog body: sets or clears the local name of a contact. */
export function RenameContactForm({ contact }: { contact: Contact }) {
  const { t } = useTranslation();
  const [name, setName] = useState(contact.local_name ?? contact.profile_name ?? "");
  const [busy, setBusy] = useState(false);
  const save = async (value: string | null) => {
    setBusy(true);
    const c = await attempt(() => api.renameContact({ account_id: contact.account_id, name: value }));
    setBusy(false);
    if (!c) return;
    upsertContact(c);
    modals.closeAll();
  };
  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        void save(name.trim() || null);
      }}
    >
      <div className="hint" style={{ fontSize: 13.5, lineHeight: 1.45 }}>
        {t("contact.renameHint")}
      </div>
      <TextField
        label={t("contact.name")}
        placeholder={contact.profile_name ?? formatAccountNumber(contact.number)}
        description={
          contact.profile_name
            ? t("contact.profileName", { name: contact.profile_name })
            : t("contact.numberOnly", { number: formatAccountNumber(contact.number).replace(/ /g, "\u00a0") })
        }
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        maxLength={60}
        data-autofocus
      />
      <div className="dialog-actions" style={{ justifyContent: "space-between" }}>
        {contact.local_name ? (
          <button type="button" className="link-btn" style={{ color: "var(--muted)" }} disabled={busy} onClick={() => void save(null)}>
            {contact.profile_name ? t("contact.resetName") : t("contact.removeName")}
          </button>
        ) : (
          <span />
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => modals.closeAll()}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </form>
  );
}
