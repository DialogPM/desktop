// "Start a conversation" row shown above search results when the query looks like an
// account number or a username: the account is looked up in the server directory.

import { Loader } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { formatAccountNumber } from "../../lib/format";
import { openDirect } from "../../store/actions";
import { useApp } from "../../store/app";
import { accountQueryKind, useAccountLookup } from "./accountLookup";

/**
 * The lookup row. For plain words (no "@", could just be a name being searched) nothing is
 * shown unless an account is actually found.
 */
export function AccountLookupRow({ query, onOpened }: { query: string; onOpened?: () => void }) {
  const { t } = useTranslation();
  const lookup = useAccountLookup(query);
  const kind = accountQueryKind(query);
  const [busy, setBusy] = useState(false);
  const myName = useApp((s) => s.profile?.name);
  if (!lookup || !kind) return null;
  const explicit = kind === "number" || kind === "phone" || query.trim().startsWith("@");
  const found = lookup.state === "done" ? lookup.found : null;
  if (!explicit && !found) return null;

  let body;
  if (lookup.state === "loading") {
    body = (
      <div className="row lookup-row" data-state="loading">
        <span className="row-icon" data-tone="soft">
          <Loader size={18} color="var(--accent-text)" />
        </span>
        <div className="flex1">
          <div className="row-title">{t("lookup.searching")}</div>
          <div className="row-sub truncate">{kind === "number" ? formatAccountNumber(lookup.query) : kind === "phone" ? lookup.query : `@${lookup.query}`}</div>
        </div>
      </div>
    );
  } else if (!found) {
    body = (
      <div className="row lookup-row" data-state="empty">
        <span className="row-icon" data-tone="soft">
          <Icon name={lookup.state === "error" ? "alert" : "search"} size={19} />
        </span>
        <div className="flex1">
          <div className="row-title">{lookup.state === "error" ? t("lookup.error") : t("lookup.notFound")}</div>
          <div className="row-sub">{kind === "number" ? t("lookup.notFoundNumber") : kind === "phone" ? t("lookup.notFoundPhone") : t("lookup.notFoundUsername")}</div>
        </div>
      </div>
    );
  } else {
    // Our own account: show our profile name (the core may add a "(You)" suffix) and a "You" badge.
    const name = found.is_me ? myName || formatAccountNumber(found.number) : found.display_name;
    const sub = [found.username && found.display_name !== `@${found.username}` ? `@${found.username}` : null, formatAccountNumber(found.number)]
      .filter(Boolean)
      .join(" · ");
    body = (
      <button
        type="button"
        className="row lookup-row"
        disabled={found.is_me || busy}
        onClick={async () => {
          setBusy(true);
          await openDirect(found.account_id);
          setBusy(false);
          onOpened?.();
        }}
      >
        <UserAvatar name={name} path={found.avatar_path} seed={found.is_me ? "me" : found.account_id} size={44} />
        <div className="flex1">
          <div className="row-title truncate">{name}</div>
          <div className="row-sub truncate mono-num">{sub}</div>
        </div>
        {found.is_me ? (
          <span className="badge-soft" data-tone="muted">
            {t("lookup.isMe")}
          </span>
        ) : (
          <span className="lookup-go">
            <Icon name="chat" size={15} />
            {t("lookup.start")}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="lookup">
      <div className="section-label">{t("lookup.title")}</div>
      {body}
    </div>
  );
}
