import { CopyButton, Loader } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconAt, IconDice5, IconQrcode } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { QrCode } from "../../components/QrCode";
import { api, parseError } from "../../lib/api";
import { shareQr } from "../../lib/share";
import type { UsernameLink } from "../../lib/types";
import { discriminatorOf, discriminatorValid, nicknameOf, withRandomDiscriminator } from "../../lib/username";
import { errorText, notifyOk } from "../../store/actions";
import { setApp, useApp } from "../../store/app";

/** Validation message key for a username (without "@"), or null when valid. */
function usernameProblem(u: string): string | null {
  if (!u) return null;
  if (!/^[a-z0-9_.]*$/.test(u)) return "settings.username.errChars";
  if (!/^[a-z]/.test(u)) return "settings.username.errStart";
  if (u.length < 3) return "settings.username.errShort";
  if (u.length > 32) return "settings.username.errLong";
  if (!discriminatorValid(u)) return "settings.username.errNumber";
  return null;
}

/** "@nickname" with the trailing ".01" discriminator shown dimmed. */
function UsernameText({ username }: { username: string }) {
  const d = discriminatorOf(username);
  return (
    <span className="username-value">
      @{nicknameOf(username)}
      {d !== null && <span style={{ opacity: 0.6 }}>.{d}</span>}
    </span>
  );
}

/** Username link + QR code: lets people add you without seeing the account number in the link. */
function UsernameLinkSection() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<UsernameLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api
      .getUsernameLink()
      .then((l) => alive && setLink(l))
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [open]);

  const reset = () =>
    modals.openConfirmModal({
      title: t("settings.username.linkReset"),
      children: <div className="hint" style={{ fontSize: 14 }}>{t("settings.username.linkResetConfirm")}</div>,
      labels: { confirm: t("settings.username.linkReset"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setLink(null);
        api
          .resetUsernameLink()
          .then((l) => {
            setLink(l);
            notifyOk(t("settings.username.linkResetDone"));
          })
          .catch((e) => setError(errorText(e)));
      },
    });

  const share = async () => {
    if (!link) return;
    const res = await shareQr({ link: link.link, title: t("qr.shareTitle"), svg: qrRef.current?.querySelector("svg") ?? null, fileName: "chatapp-username-qr.png" });
    if (res === "copied") notifyOk(t("qr.linkCopied"));
    else if (res === "downloaded") notifyOk(t("qr.saved"));
  };

  if (!open) {
    return (
      <button type="button" className="chip-btn" data-tone="sunk" style={{ marginTop: 10 }} onClick={() => {
          setLink(null);
          setError(null);
          setOpen(true);
        }}>
        <IconQrcode size={15} />
        {t("settings.username.linkShow")}
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 12 }}>
      <div className="list-card-title" style={{ alignSelf: "flex-start" }}>
        {t("settings.username.linkTitle")}
      </div>
      <div ref={qrRef}>{link ? <QrCode value={link.link} size={180} /> : error ? null : <Loader my={70} />}</div>
      <div className="hint" style={{ fontSize: 13, textAlign: "center", maxWidth: 320, lineHeight: 1.45 }}>
        {t("settings.username.linkHint")}
      </div>
      {error && <div className="error-text">{error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {link && (
          <CopyButton value={link.link}>
            {({ copied, copy }) => (
              <button type="button" className="chip-btn" onClick={copy}>
                <Icon name={copied ? "check" : "copy"} size={15} />
                {copied ? t("qr.linkCopied") : t("qr.copyLink")}
              </button>
            )}
          </CopyButton>
        )}
        {link && (
          <button type="button" className="chip-btn" onClick={() => void share()}>
            <Icon name="share" size={15} />
            {t("qr.share")}
          </button>
        )}
        <button type="button" className="chip-btn" data-tone="danger" onClick={reset} disabled={!link}>
          {t("settings.username.linkReset")}
        </button>
        <button type="button" className="chip-btn" data-tone="sunk" onClick={() => setOpen(false)}>
          {t("settings.username.linkHide")}
        </button>
      </div>
    </div>
  );
}

/** Settings → Account: optional public username that lets others find you. */
export function UsernameCard() {
  const { t } = useTranslation();
  const username = useApp((s) => s.details?.username ?? null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = usernameProblem(value);
  const unchanged = value === (username ?? "");

  const commit = async (next: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.setUsername({ username: next });
      setApp((s) => (s.details ? { details: { ...s.details, username: res } } : {}));
      setEditing(false);
      notifyOk(res ? t("settings.username.saved", { username: res }) : t("settings.username.removed"));
    } catch (e) {
      const { code } = parseError(e);
      setError(code === "conflict" ? t("settings.username.taken") : code === "invalid_input" ? t("settings.username.invalid") : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setValue(username ?? "");
    setError(null);
    setEditing(true);
  };

  return (
    <div className="list-card">
      <div className="list-card-row" style={{ alignItems: "flex-start" }}>
        <span className="ic" style={{ paddingTop: 2 }}>
          <IconAt size={19} />
        </span>
        <div className="flex1">
          <div className="list-card-title">
            {t("settings.username.title")}
            <span className="badge-soft" data-tone="muted">
              {t("common.optional")}
            </span>
          </div>
          <div className="list-card-sub">{t("settings.username.hint")}</div>
        </div>
      </div>
      <div className="list-card-body" style={{ borderBottom: 0 }}>
        {editing ? (
          <form
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (value && !problem && !unchanged) void commit(value);
            }}
          >
            <TextField
              label={t("settings.username.label")}
              value={value}
              maxLength={32}
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t("settings.username.placeholder")}
              left={<span className="username-prefix">@</span>}
              onChange={(e) => {
                setValue(e.currentTarget.value.trim().replace(/^@/, "").toLowerCase());
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditing(false);
                }
              }}
              error={problem ? t(problem) : error}
              description={value && !problem ? t("settings.username.preview", { username: value }) : t("settings.username.rules")}
            />
            <div className="hint" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
              {t("settings.username.numberHint")}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-secondary"
                data-size="sm"
                style={{ marginRight: "auto" }}
                disabled={!/^[a-z]/.test(value)}
                onClick={() => {
                  setValue(withRandomDiscriminator(value));
                  setError(null);
                }}
              >
                <IconDice5 size={15} />
                {t("settings.username.addNumber")}
              </button>
              <button type="button" className="btn btn-secondary" data-size="sm" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn btn-primary" data-size="sm" disabled={busy || !value || !!problem || unchanged}>
                {t("common.save")}
              </button>
            </div>
          </form>
        ) : username ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <UsernameText username={username} />
            <CopyButton value={`@${username}`}>
              {({ copied, copy }) => (
                <button type="button" className="icon-btn" onClick={copy} aria-label={t("common.copy")}>
                  <Icon name={copied ? "check" : "copy"} size={15} />
                </button>
              )}
            </CopyButton>
            <span style={{ flex: 1 }} />
            <button type="button" className="chip-btn" data-tone="sunk" onClick={startEdit} disabled={busy}>
              {t("common.change")}
            </button>
            <button type="button" className="chip-btn" data-tone="danger" onClick={() => void commit(null)} disabled={busy}>
              {t("common.remove")}
            </button>
          </div>
        ) : (
          <button type="button" className="chip-btn" onClick={startEdit}>
            <IconAt size={15} />
            {t("settings.username.set")}
          </button>
        )}
        {!editing && error && <div className="error-text">{error}</div>}
        {!editing && username && <UsernameLinkSection key={username} />}
      </div>
    </div>
  );
}
