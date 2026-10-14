// Contact cards shared in a message: name, account number and quick actions.

import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "../../components/UserAvatar";
import { api } from "../../lib/api";
import { formatAccountNumber } from "../../lib/format";
import type { SharedContact } from "../../lib/types";
import { attempt, openDirect } from "../../store/actions";
import { upsertContact, useApp } from "../../store/app";

function ContactCard({ c }: { c: SharedContact }) {
  const { t } = useTranslation();
  const known = useApp((s) => s.contacts[c.account_id]);
  const isMe = useApp((s) => s.appState?.account?.account_id === c.account_id);
  const [busy, setBusy] = useState(false);
  // A real name we know (our nickname or their profile), else the name in the card.
  const name = known?.local_name ?? known?.profile_name ?? c.name;

  // Adds the person to our contacts, saved under the card's name. The number is resolved by
  // the server, and that account (not the id written in the card) is the one we open.
  const ensureContact = async (): Promise<string | null> => {
    if (known) return known.account_id;
    const added = await attempt(() => api.addContactByNumber({ number: c.number, name: c.name }));
    if (!added) return null;
    upsertContact(added);
    return added.account_id;
  };

  const message = async () => {
    setBusy(true);
    const id = await ensureContact();
    if (id) await openDirect(id);
    setBusy(false);
  };

  const add = async () => {
    setBusy(true);
    if (await ensureContact()) notifications.show({ message: t("contactCard.added") });
    setBusy(false);
  };

  return (
    <div className="contact-card">
      <div className="contact-card-main">
        <UserAvatar name={name} path={known?.avatar_path} seed={c.account_id} size={44} />
        <div className="contact-card-text">
          <div className="contact-card-name truncate">{isMe ? `${c.name} (${t("contactCard.you")})` : name}</div>
          <div className="contact-card-number">{formatAccountNumber(c.number)}</div>
        </div>
      </div>
      {!isMe && (
        <div className="contact-card-actions">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void message();
            }}
          >
            {t("contactCard.message")}
          </button>
          {!known && (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                void add();
              }}
            >
              {t("contactCard.add")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ContactCards({ contacts }: { contacts: SharedContact[] }) {
  return (
    <div className="contact-cards">
      {contacts.map((c) => (
        <ContactCard key={c.account_id} c={c} />
      ))}
    </div>
  );
}
