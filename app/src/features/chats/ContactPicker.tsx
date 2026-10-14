import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckBox } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { formatAccountNumber } from "../../lib/format";
import { useApp } from "../../store/app";
import { useSortedContacts } from "../../store/selectors";

interface Props {
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Account ids that cannot be picked (already members). */
  exclude?: string[];
  /** Height of the list, or undefined to let it grow inside a scrolling parent. */
  height?: number | string;
  /** Also offer people from direct chats who are not saved as contacts. */
  includeChats?: boolean;
}

/** Multi-select list of contacts with search and removable chips. */
export function ContactPicker({ selected, onChange, exclude = [], height, includeChats = false }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const contactsById = useApp((s) => s.contacts);
  const chatNames = useApp((s) => s.conversations);
  const nameOf = (id: string) =>
    contactsById[id]?.display_name ?? Object.values(chatNames).find((c) => c.peer_account_id === id)?.title ?? id;
  const contacts = useSortedContacts(query, includeChats).filter((c) => !c.blocked && !exclude.includes(c.account_id));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const list = (
    <div style={{ paddingBottom: 8 }}>
      {contacts.map((c) => (
        <button type="button" key={c.account_id} className="row" onClick={() => toggle(c.account_id)} aria-pressed={selected.includes(c.account_id)}>
          <UserAvatar name={c.display_name} path={c.avatar_path} seed={c.account_id} size={40} />
          <div className="flex1">
            <div className="row-title truncate">{c.display_name}</div>
            <div className="row-sub truncate">{c.about || formatAccountNumber(c.number)}</div>
          </div>
          <CheckBox on={selected.includes(c.account_id)} round />
        </button>
      ))}
      {contacts.length === 0 && <div className="list-empty">{query ? t("chats.noResults") : t("newChat.noContacts")}</div>}
    </div>
  );

  return (
    <>
      {selected.length > 0 && (
        <div className="picked-chips">
          {selected.map((id) => (
            <button type="button" key={id} className="picked-chip" onClick={() => toggle(id)} aria-label={t("common.remove")}>
              <UserAvatar name={nameOf(id)} seed={id} size={22} />
              {nameOf(id)}
              <Icon name="x" size={14} />
            </button>
          ))}
        </div>
      )}
      <div style={{ padding: "12px 16px 8px" }}>
        <div className="search-box">
          <Icon name="search" size={17} />
          <input placeholder={t("newChat.search")} value={query} onChange={(e) => setQuery(e.currentTarget.value)} aria-label={t("newChat.search")} />
        </div>
      </div>
      {height !== undefined ? <div style={{ height, overflowY: "auto" }}>{list}</div> : list}
    </>
  );
}
