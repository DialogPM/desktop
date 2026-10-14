// Group invite links: the admin's link dialog, the join requests list, and joining with a link.

import { Loader } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextField, ToggleRow } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import i18n from "../../i18n";
import { api, parseError } from "../../lib/api";
import { formatListTime } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import { copyText } from "../../lib/platform";
import type { GroupBan, GroupInfo, InvitePreview, JoinRequest } from "../../lib/types";
import { attempt, errorText, notifyError, notifyOk, openConversation, reloadConversations } from "../../store/actions";
import { setApp, useApp } from "../../store/app";

/** An invite link inside some text (links in messages, pasted text). */
export const INVITE_LINK_RE = /chatapp:\/\/join\/[A-Za-z0-9_-]{22}/;

function storeGroup(g: GroupInfo | undefined) {
  if (g) setApp((s) => ({ groups: { ...s.groups, [g.conversation_id]: g } }));
}

// ---------------------------------------------------------------------------
// admins: the link
// ---------------------------------------------------------------------------

function InviteLinkForm({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const group = useApp((s) => s.groups[conversationId]);
  const [approval, setApproval] = useState(group?.invite_approval ?? false);
  const [busy, setBusy] = useState(false);
  if (!group) return null;
  const link = group.invite_link;

  const set = async (req: { enabled: boolean; approval?: boolean; reset?: boolean }) => {
    setBusy(true);
    storeGroup(await attempt(() => api.setGroupInvite({ conversation_id: conversationId, ...req })));
    setBusy(false);
  };

  if (!link) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="hint" style={{ fontSize: 13.5 }}>{t("invite.hint")}</div>
        <ToggleRow label={t("invite.approval")} sub={t("invite.approvalHint")} on={approval} onToggle={() => setApproval((a) => !a)} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void set({ enabled: true, approval })}>
            <Icon name="plus" size={16} />
            {t("invite.create")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="invite-link-box">
        <span className="invite-link-text" data-testid="invite-link">
          {link}
        </span>
        <button type="button" className="btn btn-secondary" onClick={() => void copyText(link).then((ok) => ok && notifyOk(t("common.copied")))}>
          <Icon name="copy" size={16} />
          {t("common.copy")}
        </button>
      </div>
      <div className="hint" style={{ fontSize: 13 }}>{t("invite.shareHint")}</div>
      <ToggleRow
        label={t("invite.approval")}
        sub={t("invite.approvalHint")}
        on={group.invite_approval}
        disabled={busy}
        onToggle={() => void set({ enabled: true, approval: !group.invite_approval })}
      />
      <div className="dialog-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() =>
            modals.openConfirmModal({
              title: t("invite.resetTitle"),
              children: <div className="hint">{t("invite.resetBody")}</div>,
              labels: { confirm: t("invite.reset"), cancel: t("common.cancel") },
              onConfirm: () => void set({ enabled: true, reset: true }),
            })
          }
        >
          {t("invite.reset")}
        </button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void set({ enabled: false })}>
          {t("invite.turnOff")}
        </button>
      </div>
    </div>
  );
}

export function openInviteLink(conversationId: string) {
  modals.open({ title: i18n.t("invite.title"), children: <InviteLinkForm conversationId={conversationId} /> });
}

// ---------------------------------------------------------------------------
// admins: requests
// ---------------------------------------------------------------------------

function JoinRequestsList({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const count = useApp((s) => s.groups[conversationId]?.join_requests ?? 0);
  const [list, setList] = useState<JoinRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .groupJoinRequests({ conversation_id: conversationId })
      .then((l) => alive && setList(l))
      .catch((e) => {
        if (!alive) return;
        setList([]);
        notifyError(e);
      });
    return () => {
      alive = false;
    };
  }, [conversationId, count]);

  const decide = async (r: JoinRequest, approve: boolean) => {
    setBusy(r.account_id);
    const req = { conversation_id: conversationId, account_id: r.account_id };
    const g = await attempt(() => (approve ? api.approveJoinRequest(req) : api.rejectJoinRequest(req)));
    storeGroup(g);
    if (g) setList((l) => l?.filter((x) => x.account_id !== r.account_id) ?? null);
    setBusy(null);
  };

  if (!list) return <Loader m="lg" />;
  if (!list.length) return <div className="hint" style={{ padding: "12px 0" }}>{t("invite.noRequests")}</div>;
  return (
    <div className="join-requests">
      {list.map((r) => (
        <div key={r.account_id} className="join-request-row">
          <UserAvatar name={r.name} path={r.avatar_path} seed={r.account_id} size={40} />
          <div className="flex1" style={{ minWidth: 0 }}>
            <div className="row-title truncate">{r.name}</div>
            <div className="row-sub">{t("invite.requestedAt", { when: formatListTime(r.requested_at, locale, t) })}</div>
          </div>
          <button
            type="button"
            className="icon-btn"
            data-tone="muted"
            disabled={busy === r.account_id}
            aria-label={t("invite.reject")}
            title={t("invite.reject")}
            onClick={() => void decide(r, false)}
          >
            <Icon name="x" size={19} />
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ height: 34, padding: "0 12px" }}
            disabled={busy === r.account_id}
            aria-label={t("invite.approve")}
            onClick={() => void decide(r, true)}
          >
            <Icon name="check" size={16} />
            {t("invite.approve")}
          </button>
        </div>
      ))}
    </div>
  );
}

export function openJoinRequests(conversationId: string) {
  modals.open({ title: i18n.t("invite.requests"), children: <JoinRequestsList conversationId={conversationId} /> });
}

// ---------------------------------------------------------------------------
// admins: removed (banned) members
// ---------------------------------------------------------------------------

function GroupBansList({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [list, setList] = useState<GroupBan[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .groupBans({ conversation_id: conversationId })
      .then((l) => alive && setList(l))
      .catch((e) => {
        if (!alive) return;
        setList([]);
        notifyError(e);
      });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const unban = async (b: GroupBan) => {
    setBusy(b.account_id);
    const g = await attempt(() => api.unbanGroupMember({ conversation_id: conversationId, account_id: b.account_id }));
    storeGroup(g);
    if (g) {
      setList((l) => l?.filter((x) => x.account_id !== b.account_id) ?? null);
      notifyOk(t("invite.unbanned", { name: b.display_name }));
    }
    setBusy(null);
  };

  if (!list) return <Loader m="lg" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="hint" style={{ fontSize: 13 }}>{t("invite.bannedHint")}</div>
      {!list.length ? (
        <div className="hint" style={{ padding: "12px 0" }}>{t("invite.noBanned")}</div>
      ) : (
        <div className="join-requests" data-testid="group-bans">
          {list.map((b) => (
            <div key={b.account_id} className="join-request-row">
              <UserAvatar name={b.display_name} path={b.avatar_path} seed={b.account_id} size={40} />
              <div className="flex1" style={{ minWidth: 0 }}>
                <div className="row-title truncate">{b.display_name}</div>
                <div className="row-sub">{t("invite.bannedAt", { when: formatListTime(b.banned_at, locale, t) })}</div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ height: 34, padding: "0 12px" }}
                disabled={busy === b.account_id}
                onClick={() => void unban(b)}
              >
                {t("invite.unban")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function openGroupBans(conversationId: string) {
  modals.open({ title: i18n.t("invite.bannedTitle"), children: <GroupBansList conversationId={conversationId} /> });
}

/** Admins: "N people asked to join" above the messages. */
export function JoinRequestsBanner({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const count = useApp((s) => (s.groups[conversationId]?.my_role === "admin" ? s.groups[conversationId]?.join_requests : 0) ?? 0);
  if (!count) return null;
  return (
    <button type="button" className="join-banner" onClick={() => openJoinRequests(conversationId)}>
      <Icon name="users" size={17} />
      <span className="flex1">{t("invite.banner", { count })}</span>
      <span className="link-btn">{t("invite.review")}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// joining with a link
// ---------------------------------------------------------------------------

function JoinLinkForm({ initial }: { initial: string }) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const link = text.match(INVITE_LINK_RE)?.[0] ?? null;

  useEffect(() => {
    if (!link) return;
    let alive = true;
    api
      .previewGroupInvite({ link })
      .then((p) => {
        if (!alive) return;
        setPreview(p);
        setRequested(p.requested);
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setPreview(null);
        setError(errorText(parseError(e)));
      });
    return () => {
      alive = false;
    };
  }, [link]);

  const open = (conversationId: string | null) => {
    modals.closeAll();
    if (conversationId) {
      setApp({ sidebar: "chats" });
      openConversation(conversationId);
    }
  };

  const join = async () => {
    if (!link) return;
    setBusy(true);
    try {
      const r = await api.joinGroupByLink({ link });
      if (r.status === "requested") setRequested(true);
      else {
        await reloadConversations();
        open(r.conversation_id);
      }
    } catch (e) {
      setError(errorText(parseError(e)));
    }
    setBusy(false);
  };

  const cancel = async () => {
    if (!preview) return;
    setBusy(true);
    await attempt(() => api.cancelJoinRequest({ group_id: preview.group_id }));
    setRequested(false);
    setBusy(false);
  };

  const shown = link ? preview : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <TextField
        label={t("invite.linkLabel")}
        placeholder="chatapp://join/…"
        value={text}
        autoFocus={!initial}
        mono
        onChange={(e) => {
          setText(e.currentTarget.value);
          setError(null);
        }}
        error={text && !link ? t("invite.notALink") : (error ?? undefined)}
      />
      {shown && (
        <div className="invite-preview">
          <UserAvatar name={shown.name} path={null} seed={shown.group_id} size={64} group />
          <div className="invite-preview-name">{shown.name}</div>
          <div className="hint">{t("group.subtitle", { count: shown.member_count })}</div>
          {shown.description && <div className="invite-preview-desc">{shown.description}</div>}
          {shown.approval && !shown.is_member && <div className="hint">{t("invite.needsApproval")}</div>}
          {shown.banned && !shown.is_member && (
            <div className="hint" style={{ color: "var(--danger)" }} data-testid="invite-banned">
              {t("errors.banned")}
            </div>
          )}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={() => modals.closeAll()}>
          {t("common.cancel")}
        </button>
        {shown?.is_member ? (
          <button type="button" className="btn btn-primary" onClick={() => open(shown.conversation_id)}>
            {t("invite.open")}
          </button>
        ) : requested ? (
          <>
            <span className="hint" style={{ alignSelf: "center" }}>
              {t("invite.requestSent")}
            </span>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void cancel()}>
              {t("invite.cancelRequest")}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!shown || busy || !!shown.banned} onClick={() => void join()}>
            {shown?.approval ? t("invite.askToJoin") : t("invite.join")}
          </button>
        )}
      </div>
    </div>
  );
}

export function openJoinLink(initial = "") {
  modals.open({ title: i18n.t("invite.joinTitle"), children: <JoinLinkForm initial={initial} /> });
}
