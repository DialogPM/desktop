import { Loader, Menu, Modal, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconCrown, IconLink, IconShieldOff, IconUserMinus } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextAreaField, TextField, ToggleRow } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import i18n from "../../i18n";
import { api } from "../../lib/api";
import { formatAccountNumber, formatDateTime } from "../../lib/format";
import { useIsMobile, useLocale } from "../../lib/hooks";
import { pickedPath, pickFiles } from "../../lib/platform";
import type { Conversation, GroupInfo, GroupMember, UpdateGroupRequest } from "../../lib/types";
import { attempt, loadGroup, openDirect } from "../../store/actions";
import { setApp, useApp } from "../../store/app";
import { ContactPicker } from "../chats/ContactPicker";
import { openGroupBans, openInviteLink, openJoinRequests } from "../groups/InviteDialogs";
import { confirmDeleteChat, confirmLeaveGroup } from "../chats/dialogs";
import { ChatToggles, DangerRow, InfoActions, MediaSection, Sect } from "./common";
import { useCommonActions } from "./infoActions";
import type { InfoView } from "./InfoPanel";

function storeGroup(g: GroupInfo | undefined) {
  if (g) setApp((s) => ({ groups: { ...s.groups, [g.conversation_id]: g } }));
}

async function update(req: UpdateGroupRequest) {
  storeGroup(await attempt(() => api.updateGroup(req)));
}

function EditTextForm({ initial, label, multiline, onSave }: { initial: string; label: string; multiline?: boolean; onSave: (v: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {multiline ? (
        <TextAreaField label={label} value={value} onChange={(e) => setValue(e.currentTarget.value)} rows={4} maxLength={500} data-autofocus />
      ) : (
        <TextField label={label} value={value} onChange={(e) => setValue(e.currentTarget.value)} maxLength={80} data-autofocus />
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={() => modals.closeAll()}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!multiline && !value.trim()}
          onClick={() => {
            modals.closeAll();
            onSave(value.trim());
          }}
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

function openEdit(title: string, initial: string, multiline: boolean, onSave: (v: string) => void) {
  modals.open({ title, children: <EditTextForm initial={initial} label={title} multiline={multiline} onSave={onSave} /> });
}

function AddMembersModal({ group, onClose }: { group: GroupInfo; onClose: () => void }) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    storeGroup(await attempt(() => api.addGroupMembers({ conversation_id: group.conversation_id, account_ids: selected })));
    setBusy(false);
    onClose();
  };
  return (
    <Modal opened onClose={onClose} title={t("group.addMembers")} fullScreen={mobile} size="md" padding={0} styles={{ header: { padding: "16px 20px 4px" } }}>
      <ContactPicker selected={selected} onChange={setSelected} exclude={group.members.map((m) => m.account_id)} height={mobile ? "65dvh" : 380} />
      <div className="dialog-actions" style={{ padding: 16 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button type="button" className="btn btn-primary" disabled={!selected.length || busy} onClick={add}>
          <Icon name="plus" size={16} />
          {t("common.add")}
          {selected.length ? ` (${selected.length})` : ""}
        </button>
      </div>
    </Modal>
  );
}

/** The core names members without a known profile name "Member" in first-name groups. */
export function memberName(name: string, t: (k: string) => string): string {
  return name === "Member" ? t("groupRules.unnamed") : name;
}

function MemberRow({ m, group, amAdmin }: { m: GroupMember; group: GroupInfo; amAdmin: boolean }) {
  const { t } = useTranslation();
  const contact = useApp((s) => s.contacts[m.account_id]);
  const profile = useApp((s) => s.profile);
  // First-name groups: only the name the group shows, never the number or a local nickname.
  const firstNames = group.settings.member_names === "first_name";
  const name = m.is_me ? t("common.you") : firstNames ? memberName(m.display_name, t) : (contact?.display_name ?? m.display_name);
  const avatarName = m.is_me ? (profile?.name ?? m.display_name) : name;
  const avatarPath = m.is_me ? (profile?.avatar_path ?? null) : (contact?.avatar_path ?? m.avatar_path);
  const status = m.is_me
    ? profile?.about || formatAccountNumber(m.number)
    : firstNames
      ? ""
      : contact?.about || formatAccountNumber(m.number);
  const cid = group.conversation_id;

  const row = (
    <button type="button" className="member-row" disabled={m.is_me}>
      <UserAvatar name={avatarName} path={avatarPath} seed={m.is_me ? "me" : m.account_id} size={40} />
      <div className="flex1">
        <div className="member-name truncate">{name}</div>
        <div className="member-status truncate">{status}</div>
      </div>
      {m.role === "admin" && <span className="badge-soft">{t("group.admin")}</span>}
      {m.verified === false && (
        <span className="badge-soft" data-tone="danger" title={t("group.unverifiedHint")}>
          {t("group.unverified")}
        </span>
      )}
    </button>
  );
  if (m.is_me) return row;

  return (
    <Menu position="bottom-end" withinPortal width={250}>
      <Menu.Target>{row}</Menu.Target>
      <Menu.Dropdown>
        {!firstNames && (
          <Menu.Item leftSection={<Icon name="chat" size={17} />} onClick={() => void openDirect(m.account_id)}>
            {t("group.messageMember", { name })}
          </Menu.Item>
        )}
        {amAdmin && (
          <>
            <Menu.Item
              leftSection={m.role === "admin" ? <IconShieldOff size={17} /> : <IconCrown size={17} />}
              onClick={() => void attempt(async () => storeGroup(await api.setGroupAdmin({ conversation_id: cid, account_id: m.account_id, admin: m.role !== "admin" })))}
            >
              {m.role === "admin" ? t("group.dismissAdmin") : t("group.makeAdmin")}
            </Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<IconUserMinus size={17} />}
              onClick={() =>
                modals.openConfirmModal({
                  title: i18n.t("group.removeTitle", { name }),
                  children: <div className="hint" style={{ fontSize: 14 }}>{i18n.t("group.removeBody", { name, group: group.name })}</div>,
                  labels: { confirm: i18n.t("common.remove"), cancel: i18n.t("common.cancel") },
                  confirmProps: { color: "red" },
                  onConfirm: () => void attempt(async () => storeGroup(await api.removeGroupMember({ conversation_id: cid, account_id: m.account_id }))),
                })
              }
            >
              {t("group.remove")}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

export function GroupInfoView({ conv, onView }: { conv: Conversation; onView: (v: InfoView) => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const group = useApp((s) => s.groups[conv.id]);
  const contacts = useApp((s) => s.contacts);
  const { search, mute } = useCommonActions(conv);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void loadGroup(conv.id);
  }, [conv.id]);

  if (!group) return <Loader m="xl" />;

  const amAdmin = group.my_role === "admin" && !conv.left;
  const canEdit = !conv.left && (amAdmin || !group.settings.only_admins_edit);
  const members = group.members
    .slice()
    .sort((a, b) => Number(b.is_me) - Number(a.is_me) || Number(b.role === "admin") - Number(a.role === "admin") || a.display_name.localeCompare(b.display_name));
  const me = members.find((m) => m.is_me);
  const creator = group.created_by ? (group.members.find((m) => m.account_id === group.created_by)?.display_name ?? contacts[group.created_by]?.display_name) : null;

  const changeAvatar = async () => {
    const [f] = await pickFiles({ kind: "image" });
    if (f) await update({ conversation_id: conv.id, avatar_path: pickedPath(f) });
  };

  const avatar = <UserAvatar name={group.name} path={group.avatar_path} seed={conv.id} size={112} group />;

  return (
    <>
      <div className="info-hero">
        {canEdit ? (
          <Menu position="bottom" withinPortal>
            <Menu.Target>
              <button type="button" className="avatar-edit" aria-label={t("group.changePhoto")}>
                {avatar}
                <span className="avatar-edit-badge" style={{ width: 34, height: 34 }}>
                  <Icon name="camera" size={16} />
                </span>
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<Icon name="image" size={17} />} onClick={changeAvatar}>
                {t("group.changePhoto")}
              </Menu.Item>
              {group.avatar_path && (
                <Menu.Item color="red" leftSection={<Icon name="trash" size={17} />} onClick={() => void update({ conversation_id: conv.id, avatar_path: "" })}>
                  {t("profile.removePhoto")}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        ) : (
          avatar
        )}
        <div className="info-name">
          <span className="truncate">{group.name}</span>
          {canEdit && (
            <Tooltip label={t("group.rename")}>
              <button
                type="button"
                className="icon-btn"
                onClick={() => openEdit(t("group.name"), group.name, false, (v) => void update({ conversation_id: conv.id, name: v }))}
                aria-label={t("group.rename")}
              >
                <Icon name="edit" size={16} />
              </button>
            </Tooltip>
          )}
        </div>
        <div className="info-sub">{conv.left ? t("group.notMember") : t("group.subtitle", { count: group.member_count })}</div>
        <InfoActions actions={[search, { key: "add", icon: "plus", label: t("info.add"), onClick: () => setAdding(true), hidden: !amAdmin }, mute]} />
      </div>

      <Sect>
        <div className="sect-label">
          {t("group.description")}
          {canEdit && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => openEdit(t("group.description"), group.description, true, (v) => void update({ conversation_id: conv.id, description: v }))}
              aria-label={t("group.editDescription")}
            >
              <Icon name="edit" size={15} />
            </button>
          )}
        </div>
        <div className="sect-text" style={group.description ? undefined : { color: "var(--muted)" }}>
          {group.description || (canEdit ? t("group.addDescription") : t("group.noDescription"))}
        </div>
        <div className="sect-meta">
          {creator
            ? t("group.createdBy", { name: group.created_by === me?.account_id ? t("common.you") : creator, date: formatDateTime(group.created_at, locale) })
            : t("group.createdAt", { date: formatDateTime(group.created_at, locale) })}
        </div>
      </Sect>

      <MediaSection conversationId={conv.id} onView={onView} />
      <ChatToggles conv={conv} />

      {amAdmin && (
        <Sect flush>
          <div className="sect-label" style={{ padding: "12px 16px 0" }}>
            {t("group.settings")}
          </div>
          <ToggleRow
            label={t("group.onlyAdminsSend")}
            sub={t("group.onlyAdminsSendHint")}
            on={group.settings.only_admins_send}
            onToggle={() => void update({ conversation_id: conv.id, settings: { only_admins_send: !group.settings.only_admins_send } })}
          />
          <ToggleRow
            label={t("group.onlyAdminsEdit")}
            sub={t("group.onlyAdminsEditHint")}
            on={group.settings.only_admins_edit}
            onToggle={() => void update({ conversation_id: conv.id, settings: { only_admins_edit: !group.settings.only_admins_edit } })}
          />
          <ToggleRow
            label={t("groupRules.showMembers")}
            sub={t("groupRules.showMembersHint")}
            on={!group.settings.hide_members}
            onToggle={() => void update({ conversation_id: conv.id, settings: { hide_members: !group.settings.hide_members } })}
          />
          <button type="button" className="row" onClick={() => openInviteLink(conv.id)}>
            <span className="ic" style={{ display: "flex", color: "var(--muted)" }}>
              <IconLink size={19} />
            </span>
            <div className="flex1">
              <div className="row-title">{t("invite.title")}</div>
              <div className="row-sub">{group.invite_link ? (group.invite_approval ? t("invite.onApproval") : t("invite.on")) : t("invite.off")}</div>
            </div>
          </button>
          {(group.invite_approval || group.join_requests > 0) && (
            <button type="button" className="row" onClick={() => openJoinRequests(conv.id)}>
              <span className="ic" style={{ display: "flex", color: "var(--muted)" }}>
                <Icon name="users" size={19} />
              </span>
              <div className="flex1">
                <div className="row-title">{t("invite.requests")}</div>
              </div>
              {group.join_requests > 0 && <span className="unread-badge">{group.join_requests}</span>}
            </button>
          )}
          <button type="button" className="row" onClick={() => openGroupBans(conv.id)}>
            <span className="ic" style={{ display: "flex", color: "var(--muted)" }}>
              <Icon name="x" size={19} />
            </span>
            <div className="flex1">
              <div className="row-title">{t("invite.bannedTitle")}</div>
            </div>
          </button>
          <ToggleRow
            label={t("groupRules.firstNames")}
            sub={t("groupRules.firstNamesHint")}
            on={group.settings.member_names === "first_name"}
            onToggle={() =>
              void update({ conversation_id: conv.id, settings: { member_names: group.settings.member_names === "first_name" ? "number" : "first_name" } })
            }
          />
        </Sect>
      )}

      <Sect members>
        <div style={{ padding: "0 16px 8px", fontSize: 14.5, fontWeight: 650 }}>{t("group.members", { count: group.member_count })}</div>
        {group.members_hidden && <div className="hint" style={{ padding: "0 16px 8px" }}>{t("groupRules.hiddenNotice")}</div>}
        {amAdmin && (
          <button type="button" className="member-row" onClick={() => setAdding(true)}>
            <span className="member-add">
              <Icon name="plus" size={19} />
            </span>
            <span className="member-name" style={{ color: "var(--accent-text)" }}>
              {t("group.addMembers")}
            </span>
          </button>
        )}
        {members.map((m) => (
          <MemberRow key={m.account_id} m={m} group={group} amAdmin={amAdmin} />
        ))}
      </Sect>

      <Sect flush>
        {!conv.left ? (
          <DangerRow icon={<Icon name="logout" size={19} />} label={t("group.leave.action")} onClick={() => confirmLeaveGroup(conv)} />
        ) : (
          <DangerRow icon={<Icon name="trash" size={19} />} label={t("chat.delete.action")} onClick={() => confirmDeleteChat(conv)} />
        )}
      </Sect>

      {adding && <AddMembersModal group={group} onClose={() => setAdding(false)} />}
    </>
  );
}
