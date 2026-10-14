import { Collapse } from "@mantine/core";
import { IconAddressBook } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { PaneHeader } from "../../components/PaneHeader";
import { UserAvatar } from "../../components/UserAvatar";
import { api, parseError } from "../../lib/api";
import { formatAccountNumber } from "../../lib/format";
import type { Contact } from "../../lib/types";
import { errorText, openDirect, openSettings } from "../../store/actions";
import { setApp, upsertContact } from "../../store/app";
import { useSortedContacts } from "../../store/selectors";
import { accountQueryKind } from "./accountLookup";
import { AccountLookupRow } from "./AccountLookupRow";
import { openMyQr } from "./MyQrModal";

export function ContactRow({ c, onClick, right }: { c: Contact; onClick: () => void; right?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="row" onClick={onClick}>
      <UserAvatar name={c.display_name} path={c.avatar_path} seed={c.account_id} size={44} />
      <div className="flex1">
        <div className="row-title truncate">{c.display_name}</div>
        <div className="row-sub truncate">{c.about || formatAccountNumber(c.number)}</div>
      </div>
      {c.blocked && (
        <span className="badge-soft" data-tone="danger">
          {t("chat.block.blocked")}
        </span>
      )}
      {right}
    </button>
  );
}

export function NewChatPane() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  /** Account number (any spacing) or username. */
  const [target, setTarget] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contacts = useSortedContacts(query);
  const kind = accountQueryKind(target);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await api.addContactByQuery({ query: target.trim(), name: name.trim() || undefined });
      upsertContact(c);
      setTarget("");
      setName("");
      setAddOpen(false);
      await openDirect(c.account_id);
    } catch (e) {
      setError(parseError(e).code === "not_found" ? t("lookup.notFound") : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const action = (icon: React.ReactNode, title: string, sub: string | null, onClick: () => void, soft?: boolean) => (
    <button type="button" className="row" onClick={onClick}>
      <span className="row-icon" data-tone={soft ? "soft" : undefined}>
        {icon}
      </span>
      <div className="flex1">
        <div className="row-title">{title}</div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
    </button>
  );

  return (
    <>
      <PaneHeader title={t("newChat.title")} onBack={() => setApp({ sidebar: "chats" })} />
      <div style={{ padding: "12px 16px 8px" }}>
        <div className="search-box">
          <Icon name="search" size={17} />
          <input placeholder={t("newChat.search")} value={query} onChange={(e) => setQuery(e.currentTarget.value)} aria-label={t("newChat.search")} />
        </div>
      </div>
      <div className="pane-scroll" style={{ paddingBottom: 12 }}>
        {query && <AccountLookupRow query={query.trim()} onOpened={() => setQuery("")} />}
        {!query && (
          <>
            {action(<Icon name="users" size={21} />, t("newGroup.title"), null, () => setApp({ sidebar: "new_group" }))}
            {action(<Icon name="plus" size={21} />, t("newChat.byNumber"), t("newChat.byNumberHint"), () => setAddOpen((o) => !o))}
            <Collapse expanded={addOpen}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 20px 16px" }}>
                <TextField
                  label={t("newChat.numberOrUsername")}
                  placeholder={t("newChat.numberOrUsernamePlaceholder")}
                  value={kind === "number" ? formatAccountNumber(target) : target}
                  autoComplete="off"
                  spellCheck={false}
                  mono={kind === "number"}
                  onChange={(e) => {
                    setTarget(e.currentTarget.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && kind && !busy && void add()}
                  error={target.trim().length > 2 && !kind && !/^[\d\s-]+$/.test(target) ? t("newChat.invalidTarget") : undefined}
                />
                <TextField label={t("newChat.nameOptional")} value={name} onChange={(e) => setName(e.currentTarget.value)} />
                {error && <div className="error-text">{error}</div>}
                <button type="button" className="btn btn-primary" data-size="sm" onClick={add} disabled={!kind || busy}>
                  {t("newChat.startChat")}
                </button>
              </div>
            </Collapse>
            {action(<Icon name="scan" size={21} />, t("newChat.byQr"), t("newChat.byQrHint"), () => openMyQr("scan"))}
            {action(<IconAddressBook size={21} />, t("newChat.byPhone"), t("newChat.byPhoneHint"), () => openSettings("chats"), true)}
          </>
        )}
        <div className="section-label">{t("newChat.contacts")}</div>
        {contacts.length === 0 && !(query && (accountQueryKind(query) === "number" || query.trim().startsWith("@"))) && (
          <div className="list-empty">{query ? t("chats.noResults") : t("newChat.noContacts")}</div>
        )}
        {contacts.map((c) => (
          <ContactRow key={c.account_id} c={c} onClick={() => void openDirect(c.account_id)} />
        ))}
      </div>
    </>
  );
}
