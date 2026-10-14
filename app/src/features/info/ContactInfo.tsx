import { CopyButton, Tooltip } from "@mantine/core";
import { IconPhone } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { api } from "../../lib/api";
import { formatAccountNumber } from "../../lib/format";
import type { Conversation, SafetyNumber } from "../../lib/types";
import { useApp } from "../../store/app";
import { canRename, confirmBlock, confirmDeleteChat, confirmReportSpam, openRenameContact } from "../chats/dialogs";
import { useSubtitle } from "../conversation/subtitle";
import { ChatToggles, DangerRow, InfoActions, MediaSection, Sect } from "./common";
import { useCommonActions } from "./infoActions";
import type { InfoView } from "./InfoPanel";

/** Safety number section (12 groups of 5 digits) with a link to the verification screen. */
function SafetySection({ accountId, name, onView }: { accountId: string; name: string; onView: (v: InfoView) => void }) {
  const { t } = useTranslation();
  const verified = useApp((s) => s.contacts[accountId]?.verified ?? false);
  const [sn, setSn] = useState<SafetyNumber | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .getSafetyNumber({ account_id: accountId })
      .then((s) => alive && setSn(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [accountId]);
  const groups = sn ? sn.digits.split(/\s+/).filter(Boolean) : [];
  return (
    <div className="sect" style={{ padding: 16 }}>
      <div className="sect-title" style={{ justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="shield-mark">
            <Icon name="shield" size={17} />
          </span>
          {t("safety.number")}
        </span>
        {verified && <span className="badge-soft">{t("safety.verified")}</span>}
      </div>
      {groups.length > 0 && (
        <div className="safety-grid" aria-label={t("safety.number")}>
          {groups.map((g, i) => (
            <span key={i}>{g}</span>
          ))}
        </div>
      )}
      <div className="hint" style={{ lineHeight: 1.45 }}>
        {t("safety.compare", { name })}
      </div>
      <button type="button" className="chip-btn" style={{ marginTop: 12 }} onClick={() => onView("safety")}>
        <Icon name="scan" size={15} />
        {verified ? t("safety.review") : t("safety.verify")}
      </button>
    </div>
  );
}

export function ContactInfo({ conv, onView }: { conv: Conversation; onView: (v: InfoView) => void }) {
  const { t } = useTranslation();
  const contact = useApp((s) => (conv.peer_account_id ? s.contacts[conv.peer_account_id] : undefined));
  const sub = useSubtitle(conv);
  const { search, mute } = useCommonActions(conv);
  const number = contact?.number ?? conv.peer_number ?? "";
  const blocked = contact?.blocked ?? conv.blocked;
  const name = contact?.display_name ?? conv.title;

  return (
    <>
      <div className="info-hero">
        <UserAvatar name={conv.title} path={contact?.avatar_path ?? conv.avatar_path} seed={conv.id} size={112} />
        <div className="info-name">
          <span className="truncate">{name}</span>
          {contact?.verified && (
            <span className="shield-mark" aria-label={t("safety.verified")}>
              <Icon name="shield" size={18} />
            </span>
          )}
          {canRename(conv) && (
            <Tooltip label={t("contact.rename")}>
              <button type="button" className="icon-btn info-name-edit" onClick={() => void openRenameContact(conv.peer_account_id!)} aria-label={t("contact.rename")}>
                <Icon name="edit" size={16} />
              </button>
            </Tooltip>
          )}
        </div>
        <div className="info-sub" style={sub.accent ? { color: "var(--accent-text)" } : undefined}>
          {sub.text}
        </div>
        {number && (
          <div className="info-number">
            {formatAccountNumber(number)}
            <CopyButton value={number}>
              {({ copied, copy }) => (
                <button type="button" className="icon-btn" onClick={copy} aria-label={t("common.copy")}>
                  <Icon name={copied ? "check" : "copy"} size={14} />
                </button>
              )}
            </CopyButton>
          </div>
        )}
        {contact?.profile_name && contact.local_name && <div className="hint">~{contact.profile_name}</div>}
        {canRename(conv) && contact && !contact.local_name && !contact.profile_name && (
          <button type="button" className="chip-btn" style={{ marginTop: 10 }} onClick={() => void openRenameContact(conv.peer_account_id!)}>
            <Icon name="edit" size={15} />
            {t("contact.addName")}
          </button>
        )}
        <InfoActions actions={[search, mute, { key: "qr", icon: "qr", label: t("info.qr"), onClick: () => onView("safety"), hidden: !conv.peer_account_id }]} />
      </div>

      {(contact?.about || contact?.phone) && (
        <Sect>
          {contact?.about && (
            <>
              <div className="sect-label">{t("contact.about")}</div>
              <div className="sect-text">{contact.about}</div>
            </>
          )}
          {contact?.phone && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: contact.about ? 12 : 0 }}>
              <IconPhone size={17} style={{ color: "var(--muted)" }} />
              <div>
                <div style={{ fontSize: 14.5 }}>{contact.phone}</div>
                <div className="hint">{t("contact.fromAddressBook")}</div>
              </div>
            </div>
          )}
        </Sect>
      )}

      <MediaSection conversationId={conv.id} onView={onView} />
      <ChatToggles conv={conv} />
      {conv.peer_account_id && <SafetySection accountId={conv.peer_account_id} name={name} onView={onView} />}

      <Sect flush>
        {conv.peer_account_id && (
          <DangerRow
            icon={<Icon name="alert" size={19} />}
            label={blocked ? t("chat.block.unblockName", { name: conv.title }) : t("chat.block.blockContact")}
            tone={blocked ? "ink" : undefined}
            onClick={() => confirmBlock(conv.peer_account_id!, conv.title, !blocked)}
          />
        )}
        {conv.peer_account_id && (
          <DangerRow icon={<Icon name="alert" size={19} />} label={t("security.reportSpam")} onClick={() => confirmReportSpam(conv.peer_account_id!)} />
        )}
        <DangerRow icon={<Icon name="trash" size={19} />} label={t("chat.delete.action")} onClick={() => confirmDeleteChat(conv)} />
      </Sect>
    </>
  );
}
