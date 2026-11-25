// What a conversation with a bot shows instead of the usual composer:
// - never started: the bot's card and "Start" (BotLanding + BotStartBar);
// - started: the commands composer when the bot has commands, else Mute / Stop (the design);
// - stopped or deleted: a note, and "Start" again when possible.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { isMuted } from "../../lib/format";
import { useIsMobile } from "../../lib/hooks";
import type { BotInfo, Conversation } from "../../lib/types";
import { patchConversation, sendText } from "../../store/actions";
import { BotBadge } from "./BotBadge";
import { confirmStopBot, startBot } from "./botActions";
import { commandQuery, matchingCommands } from "./botText";
import "./bots.css";

/** Far enough ahead to mean "until I turn it back on". */
const MUTE_FOREVER = 8_640_000_000_000;

export function BotLanding({ conv, bot }: { conv: Conversation; bot: BotInfo }) {
  const { t } = useTranslation();
  return (
    <div className="bot-landing">
      <UserAvatar name={bot.name} seed={conv.id} size={96} bot />
      <div>
        <div className="bot-landing-name">
          <span>{bot.name}</span>
          <BotBadge />
        </div>
        <div className="bot-handle" style={{ fontSize: 13, marginTop: 4 }}>
          @{bot.username}
        </div>
      </div>
      {bot.about && <div className="bot-landing-about">{bot.about}</div>}
      <div className="bot-facts">
        <div className="bot-fact" data-ok="true">
          <span>
            <Icon name="check" size={15} />
          </span>
          {t("bots.canWrite")}
        </div>
        <div className="bot-fact">
          <span>
            <Icon name="x" size={15} />
          </span>
          {t("bots.cannotSee")}
        </div>
        <div className="bot-fact">
          <span>
            <Icon name="x" size={15} />
          </span>
          {t("bots.notEncrypted")}
        </div>
      </div>
    </div>
  );
}

function StartButton({ bot }: { bot: BotInfo }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <div className="bot-foot-row">
      <button
        type="button"
        className="bot-foot-btn"
        data-tone="primary"
        data-bot-start
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await startBot(bot);
          setBusy(false);
        }}
      >
        {t("bots.start")}
      </button>
    </div>
  );
}

/** The bottom of a bot conversation. */
export function BotFooter({ conv, bot }: { conv: Conversation; bot: BotInfo }) {
  const { t } = useTranslation();
  if (bot.deleted) {
    return (
      <div className="bot-foot">
        <div className="bot-foot-note">{t("bots.deletedNote")}</div>
      </div>
    );
  }
  if (bot.state !== "active") {
    return (
      <div className="bot-foot">
        {bot.state === "stopped" && <div className="bot-foot-note">{t("bots.stoppedNote")}</div>}
        <StartButton bot={bot} />
      </div>
    );
  }
  if (bot.commands.length > 0) return <BotComposer key={conv.id} conv={conv} bot={bot} />;
  const muted = isMuted(conv);
  return (
    <div className="bot-foot">
      <div className="bot-foot-row">
        <button type="button" className="bot-foot-btn" onClick={() => void patchConversation(conv.id, { muted_until: muted ? null : MUTE_FOREVER })}>
          <Icon name={muted ? "mute" : "bell"} size={17} />
          {muted ? t("bots.unmute") : t("bots.silent")}
        </button>
        <button type="button" className="bot-foot-btn" data-tone="danger" data-bot-stop onClick={() => confirmStopBot(bot)}>
          {t("bots.stop")}
        </button>
      </div>
    </div>
  );
}

/** Text only, with the bot's commands offered after "/". */
function BotComposer({ conv, bot }: { conv: Conversation; bot: BotInfo }) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [closed, setClosed] = useState(false);
  const items = useMemo(() => (closed ? [] : matchingCommands(bot.commands, commandQuery(text))), [bot.commands, text, closed]);
  const current = Math.min(active, Math.max(items.length - 1, 0));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const change = (v: string) => {
    setText(v);
    setClosed(false);
    setActive(0);
  };
  const send = (value = text) => {
    const v = value.trim();
    if (!v) return;
    setText("");
    void sendText(conv.id, v);
    ref.current?.focus();
  };

  return (
    <div className="composer">
      <button
        type="button"
        className="composer-round"
        aria-label={t("bots.commands")}
        title={t("bots.commands")}
        onClick={() => {
          change(text.startsWith("/") ? "" : "/");
          ref.current?.focus();
        }}
      >
        <span className="bot-slash">/</span>
      </button>
      <div className="composer-field">
        {items.length > 0 && (
          <div className="mention-popup" role="listbox" aria-label={t("bots.commands")}>
            {items.map((c, i) => (
              <button
                key={c.command}
                type="button"
                role="option"
                aria-selected={i === current}
                className="bot-cmd"
                data-active={i === current}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => send(`/${c.command}`)}
              >
                <span className="bot-cmd-name">/{c.command}</span>
                <span className="bot-cmd-desc">{c.description}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={t("bots.placeholder")}
          aria-label={t("bots.placeholder")}
          onChange={(e) => change(e.currentTarget.value)}
          onBlur={() => window.setTimeout(() => setClosed(true), 150)}
          onFocus={() => setClosed(false)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (items.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((current + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
                return;
              }
              if (e.key === "Tab") {
                e.preventDefault();
                change(`/${items[current].command} `);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(`/${items[current].command}`);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setClosed(true);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !mobile) {
              e.preventDefault();
              send();
            }
          }}
        />
      </div>
      <button type="button" className="composer-send" onClick={() => send()} disabled={!text.trim()} aria-label={t("composer.send")}>
        <Icon name="send" size={19} />
      </button>
    </div>
  );
}
