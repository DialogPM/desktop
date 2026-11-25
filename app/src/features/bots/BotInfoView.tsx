// The info panel of a bot conversation: what the bot is, what it can and cannot do, its
// commands, and stopping it.

import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { isMuted } from "../../lib/format";
import type { BotInfo, Conversation } from "../../lib/types";
import { openSettings, patchConversation } from "../../store/actions";
import { BotBadge } from "./BotBadge";
import { confirmStopBot, startBot } from "./botActions";
import "./bots.css";

export function BotInfoView({ conv, bot }: { conv: Conversation; bot: BotInfo }) {
  const { t } = useTranslation();
  const muted = isMuted(conv);
  return (
    <>
      <div className="info-hero">
        <UserAvatar name={bot.name} seed={conv.id} size={112} bot />
        <div className="info-name">
          <span className="truncate">{bot.name}</span>
          <BotBadge />
        </div>
        <div className="bot-handle" style={{ fontSize: 13 }}>
          @{bot.username}
        </div>
        {bot.about && (
          <div className="bot-landing-about" style={{ marginTop: 10, fontSize: 14.5 }}>
            {bot.about}
          </div>
        )}
      </div>
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="bot-facts" style={{ width: "100%", marginTop: 0 }}>
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
        {bot.commands.length > 0 && (
          <div>
            <div className="sect-label">{t("bots.commands")}</div>
            {bot.commands.map((c) => (
              <div key={c.command} className="bot-cmd" style={{ cursor: "default", paddingInline: 0 }}>
                <span className="bot-cmd-name">/{c.command}</span>
                <span className="bot-cmd-desc" style={{ whiteSpace: "normal" }}>
                  {c.description}
                </span>
              </div>
            ))}
          </div>
        )}
        {bot.deleted ? (
          <div className="bot-foot-note">{t("bots.deletedNote")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" className="bot-foot-btn" style={{ flex: "none" }} onClick={() => void patchConversation(conv.id, { muted_until: muted ? null : 8_640_000_000_000 })}>
              <Icon name={muted ? "mute" : "bell"} size={17} />
              {muted ? t("bots.unmute") : t("bots.silent")}
            </button>
            {bot.state === "active" ? (
              <button type="button" className="bot-foot-btn" data-tone="danger" style={{ flex: "none" }} onClick={() => confirmStopBot(bot)}>
                {t("bots.stop")}
              </button>
            ) : (
              <button type="button" className="bot-foot-btn" style={{ flex: "none", color: "var(--accent-text)" }} onClick={() => void startBot(bot)}>
                {t("bots.start")}
              </button>
            )}
            {bot.mine && (
              <button type="button" className="bot-foot-btn" style={{ flex: "none" }} onClick={() => openSettings("bots")}>
                <Icon name="gear" size={17} />
                {t("bots.manage")}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
