// Settings → Bots: the bots this account created (design: "ChatApp Boti", screen 1).
//
// A bot's token is shown only on the device that created or reset it (the server keeps a hash);
// subscribers are chat ids, the same handle the bot itself gets: nobody's name or number.

import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { PaneHeader } from "../../components/PaneHeader";
import { QrCode } from "../../components/QrCode";
import { UserAvatar } from "../../components/UserAvatar";
import { api } from "../../lib/api";
import { useIsMobile, useLocale } from "../../lib/hooks";
import type { BotSubscriber, OwnedBot } from "../../lib/types";
import { USER_LINK_HOST, userLink, userLinksAvailable } from "../../lib/userLinkParse";
import { attempt, errorText, goBack } from "../../store/actions";
import { useApp } from "../../store/app";
import { BotBadge } from "./BotBadge";
import { openBot } from "./botActions";
import { botSlug } from "./botText";
import "./bots.css";

type Lang = "curl" | "js" | "py";

/** "Copy" that says "Copied" for a moment. */
function useCopied(): [string | null, (key: string, value: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((key: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      window.setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    });
  }, []);
  return [copied, copy];
}

function snippet(lang: Lang, base: string, token: string, chat: string, text: string): string {
  const url = `${base}/bot/${token}/sendMessage`;
  const q = JSON.stringify(text);
  if (lang === "curl") return `curl ${url} \\\n  -d chat_id=${chat} \\\n  --data-urlencode text=${q}`;
  if (lang === "js")
    return `await fetch("${url}", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify({ chat_id: "${chat}", text: ${q} })\n});`;
  return `import requests\n\nrequests.post(\n    "${url}",\n    json={"chat_id": "${chat}", "text": ${q}},\n)`;
}

function mask(token: string): string {
  return `${token.slice(0, 4)}${"•".repeat(18)}${token.slice(-4)}`;
}

export function BotsSection() {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const [bots, setBots] = useState<OwnedBot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.botsList();
      setBots(list);
      setError(null);
      return list;
    } catch (e) {
      setError(errorText(e));
      return null;
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const current = bots?.find((b) => b.id === sel) ?? (mobile ? null : (bots?.[0] ?? null));
  const patch = (b: OwnedBot) => setBots((list) => list?.map((x) => (x.id === b.id ? b : x)) ?? null);

  const create = () =>
    modals.open({
      title: t("bots.newTitle"),
      size: 520,
      children: (
        <CreateBot
          taken={(u) => bots?.some((b) => b.username === u) ?? false}
          onCreated={(b) => {
            setBots((list) => [...(list ?? []), b]);
            setSel(b.id);
          }}
        />
      ),
    });

  const list = (
    <div className="bots-list">
      <div className="bots-list-sub">{t("bots.subtitle")}</div>
      <div className="bots-list-items">
        {bots?.map((b) => (
          <button key={b.id} type="button" className="bots-item" data-active={!mobile && b.id === current?.id} onClick={() => setSel(b.id)}>
            <UserAvatar name={b.name} seed={b.id} size={42} bot />
            <div className="flex1" style={{ minWidth: 0 }}>
              <div className="bots-item-name truncate">{b.name}</div>
              <div className="bot-handle truncate">@{b.username}</div>
            </div>
            <span className="bots-item-count">{b.subscribers}</span>
          </button>
        ))}
        <button type="button" className="bots-new" data-bot-new onClick={create}>
          <span>
            <Icon name="plus" size={19} />
          </span>
          {t("bots.new")}
        </button>
      </div>
    </div>
  );

  let body;
  if (error && !bots) {
    body = (
      <div className="bots-empty">
        <div className="hint">{error}</div>
      </div>
    );
  } else if (bots && bots.length === 0) {
    body = (
      <div className="bots-empty">
        <div className="bots-empty-icon">
          <Icon name="bot" size={28} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{t("bots.emptyTitle")}</div>
        <div className="hint" style={{ fontSize: 13.5, maxWidth: 360, lineHeight: 1.5 }}>
          {t("bots.emptyBody")}
        </div>
        <button type="button" className="bots-send" style={{ marginTop: 6 }} data-bot-new onClick={create}>
          <Icon name="plus" size={16} />
          {t("bots.create")}
        </button>
      </div>
    );
  } else if (mobile) {
    body = current ? (
      <div className="bots-detail">
        <BotDetail key={current.id} bot={current} onChange={patch} onDeleted={() => void load().then(() => setSel(null))} />
      </div>
    ) : (
      list
    );
  } else {
    body = (
      <>
        {list}
        <div className="bots-detail">{current && <BotDetail key={current.id} bot={current} onChange={patch} onDeleted={() => void load().then(() => setSel(null))} />}</div>
      </>
    );
  }

  const onBack = mobile ? (current && sel ? () => setSel(null) : goBack) : undefined;
  return (
    <>
      <PaneHeader title={mobile && current && sel ? current.name : t("bots.title")} onBack={onBack} />
      <div className="bots">{body}</div>
    </>
  );
}

function BotDetail({ bot, onChange, onDeleted }: { bot: OwnedBot; onChange: (b: OwnedBot) => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const server = useApp((s) => s.appState?.account?.server_url ?? "");
  const webLinks = userLinksAvailable(server);
  const [copied, copy] = useCopied();
  const [showToken, setShowToken] = useState(false);
  const [regenerated, setRegenerated] = useState(false);
  const [lang, setLang] = useState<Lang>("curl");
  const [subs, setSubs] = useState<BotSubscriber[] | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [text, setText] = useState(() => t("bots.testDefault"));
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sending, setSending] = useState(false);

  const loadSubs = useCallback(() => {
    api
      .botSubscribers({ bot_id: bot.id })
      .then((list) => {
        setSubs(list);
        if (list.length !== bot.subscribers) onChange({ ...bot, subscribers: list.length });
      })
      .catch(() => setSubs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id]);
  useEffect(() => {
    queueMicrotask(loadSubs);
  }, [loadSubs]);

  const target = subs?.find((s) => s.chat_id === to) ?? subs?.[0] ?? null;
  const link = webLinks ? userLink(bot.username) : `@${bot.username}`;
  const shownLink = webLinks ? `${USER_LINK_HOST}/@${bot.username}` : `@${bot.username}`;
  const token = bot.token ?? null;
  const code = useMemo(
    () => snippet(lang, server.replace(/\/+$/, ""), showToken && token ? token : "<TOKEN>", target?.chat_id ?? "<CHAT_ID>", text.trim() || t("bots.testDefault")),
    [lang, server, showToken, token, target, text, t],
  );
  const subName = (s: BotSubscriber, i: number) => (s.mine ? t("bots.subscriberYou") : `${t("bots.subscriber")} ${(subs?.length ?? 0) - i}`);
  const since = (ts: number) => new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  const regenerate = () =>
    modals.openConfirmModal({
      title: t("bots.tokenRegenTitle"),
      children: (
        <Text size="sm" c="dimmed">
          {t("bots.tokenRegenBody")}
        </Text>
      ),
      labels: { confirm: t("bots.tokenRegenerate"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        void (async () => {
          const fresh = await attempt(() => api.botResetToken({ bot_id: bot.id }));
          if (!fresh) return;
          onChange({ ...bot, token: fresh });
          setRegenerated(true);
          setShowToken(true);
        })(),
    });

  const send = async () => {
    if (!target || !text.trim() || sending) return;
    setSending(true);
    try {
      await api.botSendTest({ bot_id: bot.id, chat_id: target.chat_id, text: text.trim() });
      setResult({ ok: true, message: t("bots.testSent") });
    } catch (e) {
      setResult({ ok: false, message: errorText(e) });
      loadSubs();
    }
    setSending(false);
    window.setTimeout(() => setResult(null), 2500);
  };

  const remove = () =>
    modals.openConfirmModal({
      title: t("bots.deleteTitle", { name: bot.name }),
      children: (
        <Text size="sm" c="dimmed">
          {t("bots.deleteBody")}
        </Text>
      ),
      labels: { confirm: t("bots.delete"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        void (async () => {
          const ok = await attempt(async () => {
            await api.botDelete({ bot_id: bot.id });
            return true;
          });
          if (ok) onDeleted();
        })(),
    });

  return (
    <div className="bots-detail-inner">
      <div className="bots-head">
        <UserAvatar name={bot.name} seed={bot.id} size={60} bot />
        <div className="flex1" style={{ minWidth: 0 }}>
          <div className="bots-head-name">
            <span className="truncate">{bot.name}</span>
            <BotBadge />
          </div>
          {bot.about && <div className="bots-head-about">{bot.about}</div>}
        </div>
        <button type="button" className="bots-chip" data-on="sunk" data-tone="ink" onClick={() => void openBot(bot.id)}>
          <Icon name="chat" size={14} />
          {t("bots.openChat")}
        </button>
      </div>

      <div className="bots-block">
        <div className="bots-label">{t("bots.publicLink")}</div>
        <div className="bots-field">
          <span className="bots-field-icon">
            <Icon name="globe" size={16} />
          </span>
          <span className="bots-mono">{shownLink}</span>
          <button type="button" className="bots-chip" data-copy-bot-link onClick={() => copy("link", link)}>
            <Icon name="copy" size={14} />
            {copied === "link" ? t("common.copied") : t("common.copy")}
          </button>
          {webLinks && (
            <button
              type="button"
              className="bots-chip"
              data-tone="ink"
              onClick={() =>
                modals.open({
                  title: `@${bot.username}`,
                  children: (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingBottom: 8 }}>
                      <QrCode value={link} />
                      <div className="bot-handle" style={{ fontSize: 13 }}>
                        {shownLink}
                      </div>
                    </div>
                  ),
                })
              }
            >
              <Icon name="qr" size={14} />
              {t("bots.qr")}
            </button>
          )}
        </div>
        <div className="bots-note">{t(webLinks ? "bots.publicLinkHint" : "bots.usernameOnlyHint")}</div>
      </div>

      <div className="bots-block">
        <div className="bots-label-row">
          <div className="bots-label">{t("bots.token")}</div>
          <button type="button" className="bots-quiet" data-bot-regen onClick={regenerate}>
            <Icon name="refresh" size={13} />
            {t("bots.tokenRegenerate")}
          </button>
        </div>
        {token ? (
          <div className="bots-field" data-outline="true">
            <span className="bots-field-icon">
              <Icon name="key" size={16} />
            </span>
            <span className="bots-mono" data-bot-token>
              {showToken ? token : mask(token)}
            </span>
            <button type="button" className="bots-chip" data-icon="true" onClick={() => setShowToken((v) => !v)} aria-label={t(showToken ? "bots.tokenHide" : "bots.tokenShow")}>
              <Icon name={showToken ? "eyeoff" : "eye"} size={16} />
            </button>
            <button type="button" className="bots-chip" data-on="sunk" onClick={() => copy("token", token)}>
              <Icon name="copy" size={14} />
              {copied === "token" ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        ) : (
          <div className="bots-empty-box">{t("bots.tokenHidden")}</div>
        )}
        {regenerated && (
          <div className="bots-note" data-tone="warn">
            <Icon name="alert" size={14} />
            {t("bots.tokenRegenerated")}
          </div>
        )}
      </div>

      <div className="bots-block">
        <div className="bots-label-row">
          <div className="bots-label">{t("bots.sendTitle")}</div>
          <div className="bots-tabs">
            {(["curl", "js", "py"] as Lang[]).map((l) => (
              <button key={l} type="button" data-active={lang === l} onClick={() => setLang(l)}>
                {l === "curl" ? "cURL" : l === "js" ? "JavaScript" : "Python"}
              </button>
            ))}
          </div>
        </div>
        <div className="bots-code">
          {code}
          <button type="button" onClick={() => copy("code", snippet(lang, server.replace(/\/+$/, ""), token ?? "<TOKEN>", target?.chat_id ?? "<CHAT_ID>", text.trim() || t("bots.testDefault")))}>
            {copied === "code" ? t("common.copied") : t("common.copy")}
          </button>
        </div>
        <div className="bots-note">{t("bots.sendHint")}</div>
      </div>

      <div className="bots-block">
        <div className="bots-label">{t("bots.subscribers", { count: subs?.length ?? bot.subscribers })}</div>
        {subs && subs.length === 0 && <div className="bots-empty-box">{t("bots.noSubscribers")}</div>}
        {subs && subs.length > 0 && (
          <div className="bots-subs">
            {subs.map((s, i) => (
              <div key={s.chat_id} className="bots-sub" data-mine={s.mine}>
                <UserAvatar name={s.mine ? t("bots.subscriberYou") : "#"} seed={s.chat_id} size={36} />
                <div className="flex1" style={{ minWidth: 0 }}>
                  <div className="bots-sub-name">{subName(s, i)}</div>
                  <div className="hint" style={{ fontSize: 12 }}>
                    {t("bots.startedOn", { date: since(s.since) })}
                  </div>
                </div>
                <button type="button" className="bots-quiet" title={t("common.copy")} onClick={() => copy(`chat:${s.chat_id}`, s.chat_id)}>
                  <span className="bots-sub-id">{copied === `chat:${s.chat_id}` ? t("common.copied") : `chat_id ${s.chat_id.slice(0, 8)}…`}</span>
                </button>
                <button type="button" className="bots-chip" data-on="sunk" data-tone="ink" style={{ height: 32 }} onClick={() => setTo(s.chat_id)}>
                  {t("bots.test")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bots-test">
        <div className="bots-label">{t("bots.testTitle")}</div>
        <div className="bots-test-row">
          <select className="bots-input" style={{ width: 200 }} value={target?.chat_id ?? ""} onChange={(e) => setTo(e.currentTarget.value)} disabled={!subs?.length} aria-label={t("bots.subscriber")}>
            {subs?.length ? (
              subs.map((s, i) => (
                <option key={s.chat_id} value={s.chat_id}>
                  {subName(s, i)}
                </option>
              ))
            ) : (
              <option value="">{t("bots.testNoSubs")}</option>
            )}
          </select>
          <input
            className="bots-input"
            style={{ flex: 1 }}
            value={text}
            maxLength={4096}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            aria-label={t("bots.testTitle")}
          />
          <button type="button" className="bots-send" data-bot-test disabled={!target || !text.trim() || sending} onClick={() => void send()}>
            <Icon name="send" size={15} />
            {t("bots.send")}
          </button>
        </div>
        {result && (
          <div className="bots-note" data-tone={result.ok ? "ok" : "danger"}>
            <Icon name={result.ok ? "okcircle" : "alert"} size={14} />
            {result.message}
          </div>
        )}
      </div>

      <button type="button" className="bots-delete" data-bot-delete onClick={remove}>
        <Icon name="trash" size={16} />
        {t("bots.delete")}
      </button>
    </div>
  );
}

function CreateBot({ taken, onCreated }: { taken: (username: string) => boolean; onCreated: (b: OwnedBot) => void }) {
  const { t } = useTranslation();
  const server = useApp((s) => s.appState?.account?.server_url ?? "");
  const prefix = userLinksAvailable(server) ? `${USER_LINK_HOST}/@` : "@";
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [touched, setTouched] = useState(false);
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inUse, setInUse] = useState<string | null>(null);
  const [done, setDone] = useState<{ bot: OwnedBot; token: string } | null>(null);
  const [copied, copy] = useCopied();

  const raw = botSlug(handle);
  const username = `${raw}_bot`;
  // The server has the last word (names of accounts and reserved names count too); this
  // only catches a bot that already has the name.
  useEffect(() => {
    if (raw.length < 3) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      api
        .botFind({ username })
        .then(() => alive && setInUse(username))
        .catch(() => undefined);
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [raw, username]);

  if (done) {
    return (
      <div className="bots-form">
        <div className="bots-ready">
          <span>
            <Icon name="okcircle" size={22} />
          </span>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{t("bots.ready", { name: done.bot.username })}</div>
            <div className="bot-handle" style={{ fontSize: 12.5 }}>
              {prefix}
              {done.bot.username}
            </div>
          </div>
        </div>
        <div className="bots-form-field">
          <label>{t("bots.token")}</label>
          <div className="bots-field">
            <span className="bots-mono" data-wrap="true" data-bot-new-token>
              {done.token}
            </span>
            <button type="button" className="bots-chip" onClick={() => copy("token", done.token)}>
              {copied === "token" ? t("common.copied") : t("common.copy")}
            </button>
          </div>
          <div className="bots-note">{t("bots.tokenWarning")}</div>
        </div>
        <button type="button" className="bots-wide-btn" onClick={() => modals.closeAll()}>
          {t("bots.done")}
        </button>
      </div>
    );
  }

  const isTaken = raw.length >= 3 && (taken(username) || inUse === username);
  const ok = raw.length >= 3 && !isTaken;
  const state = !raw ? "empty" : ok ? "ok" : "bad";
  const can = !!name.trim() && ok && !busy;
  const submit = async () => {
    if (!can) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.botCreate({ username, name: name.trim(), about: about.trim() });
      onCreated({ ...created.bot, token: created.token });
      setDone(created);
    } catch (e) {
      const msg = errorText(e);
      if (/taken/i.test(String(e))) setInUse(username);
      else setError(msg);
    }
    setBusy(false);
  };

  return (
    <form
      className="bots-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="bots-form-field">
        <label htmlFor="bot-name">{t("bots.name")}</label>
        <input
          id="bot-name"
          className="bots-input"
          data-size="lg"
          autoFocus
          maxLength={64}
          value={name}
          placeholder={t("bots.namePlaceholder")}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setName(v);
            if (!touched) setHandle(botSlug(v));
          }}
        />
      </div>
      <div className="bots-form-field">
        <label htmlFor="bot-address">{t("bots.address")}</label>
        <div className="bots-address" data-state={state}>
          <span>{prefix}</span>
          <input
            id="bot-address"
            value={touched ? handle : raw}
            placeholder={t("bots.addressPlaceholder")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setHandle(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 28));
              setTouched(true);
            }}
          />
          <span>_bot</span>
        </div>
        <div className="bots-note" data-tone={state === "ok" ? "ok" : state === "bad" ? "danger" : undefined} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name={state === "ok" ? "okcircle" : "info"} size={14} />
          {!raw ? t("bots.addressRules") : raw.length < 3 ? t("bots.addressShort") : isTaken ? t("bots.addressTaken") : t("bots.addressFree", { address: `${prefix}${username}` })}
        </div>
      </div>
      <div className="bots-form-field">
        <label htmlFor="bot-about">
          {t("bots.description")} <span style={{ fontWeight: 500, color: "var(--faint)" }}>{t("bots.optional")}</span>
        </label>
        <input id="bot-about" className="bots-input" data-size="lg" maxLength={512} value={about} placeholder={t("bots.descriptionPlaceholder")} onChange={(e) => setAbout(e.currentTarget.value)} />
      </div>
      {error && (
        <div className="bots-note" data-tone="danger">
          <Icon name="alert" size={14} />
          {error}
        </div>
      )}
      <button type="submit" className="bots-wide-btn" data-bot-create disabled={!can}>
        {t("bots.createButton")}
      </button>
    </form>
  );
}
