import { Loader } from "@mantine/core";
import { IconBan } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { api } from "../../lib/api";
import { formatAccountNumber } from "../../lib/format";
import type { Contact } from "../../lib/types";
import { attempt, openSettings } from "../../store/actions";
import { upsertContact, useApp } from "../../store/app";

/** Blocked contacts from the core, refreshed whenever a contact changes (contact_updated). */
function useBlocked(): Contact[] | null {
  const contacts = useApp((s) => s.contacts);
  const [list, setList] = useState<Contact[] | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .listBlocked()
      .then((l) => alive && setList(l))
      .catch(() => alive && setList((prev) => prev ?? []));
    return () => {
      alive = false;
    };
  }, [contacts]);
  return list;
}

/** Discreet "Blocked contacts (N)" row at the bottom of Settings → Privacy. */
export function BlockedRow() {
  const { t } = useTranslation();
  const blocked = useBlocked();
  return (
    <div className="list-card">
      <button type="button" className="list-card-row" onClick={() => openSettings("blocked")}>
        <span className="ic">
          <IconBan size={19} />
        </span>
        <div className="flex1">
          <div className="list-card-title">{t("settings.blocked.title")}</div>
          <div className="list-card-sub" style={{ marginTop: 0 }}>
            {blocked === null ? "…" : blocked.length ? t("settings.blocked.count", { count: blocked.length }) : t("settings.blocked.none")}
          </div>
        </div>
        <span className="list-card-chev">
          <Icon name="chevron" size={17} />
        </span>
      </button>
    </div>
  );
}

/** Settings → Privacy → Blocked contacts. */
export function BlockedSection() {
  const { t } = useTranslation();
  const blocked = useBlocked();
  const [busy, setBusy] = useState<string | null>(null);

  const unblock = async (c: Contact) => {
    setBusy(c.account_id);
    const res = await attempt(() => api.setBlocked({ account_id: c.account_id, blocked: false }));
    if (res) upsertContact(res);
    setBusy(null);
  };

  if (blocked === null) return <Loader m="xl" />;

  return (
    <>
      <div className="hint" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
        {t("settings.blocked.hint")}
      </div>
      {blocked.length === 0 ? (
        <div className="blocked-empty">
          <span className="row-icon" data-tone="soft">
            <IconBan size={22} />
          </span>
          <div className="list-card-title">{t("settings.blocked.emptyTitle")}</div>
          <div className="hint">{t("settings.blocked.empty")}</div>
        </div>
      ) : (
        <div className="list-card">
          {blocked.map((c) => (
            <div key={c.account_id} className="list-card-row">
              <UserAvatar name={c.display_name} path={c.avatar_path} seed={c.account_id} size={42} />
              <div className="flex1" style={{ minWidth: 0 }}>
                <div className="list-card-title truncate">{c.display_name}</div>
                <div className="list-card-sub mono-num truncate" style={{ marginTop: 0 }}>
                  {formatAccountNumber(c.number)}
                </div>
              </div>
              <button type="button" className="chip-btn" data-tone="sunk" disabled={busy === c.account_id} onClick={() => void unblock(c)}>
                {t("settings.blocked.unblock")}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
