import { ScrollArea } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EMOJI_CATEGORIES } from "./emojiData";
import { Icon } from "./Icon";

const RECENT_KEY = "chatapp-recent-emoji";

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function pushRecent(e: string) {
  const list = [e, ...loadRecent().filter((x) => x !== e)].slice(0, 32);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function EmojiPicker({ onPick, height = 280 }: { onPick: (emoji: string) => void; height?: number }) {
  const { t } = useTranslation();
  const [recent] = useState(loadRecent);
  const [tab, setTab] = useState<string>(recent.length ? "recent" : EMOJI_CATEGORIES[0].key);
  const list = tab === "recent" ? recent : (EMOJI_CATEGORIES.find((c) => c.key === tab)?.emojis ?? []);

  return (
    <div className="emoji-picker">
      <div className="emoji-tabs" role="tablist">
        <button type="button" role="tab" data-active={tab === "recent"} aria-selected={tab === "recent"} onClick={() => setTab("recent")} aria-label={t("emoji.recent")}>
          <Icon name="clock" size={18} />
        </button>
        {EMOJI_CATEGORIES.map((c) => (
          <button type="button" role="tab" key={c.key} data-active={tab === c.key} aria-selected={tab === c.key} onClick={() => setTab(c.key)} aria-label={t(`emoji.${c.key}`)}>
            {c.icon}
          </button>
        ))}
      </div>
      <div className="emoji-cat">{t(`emoji.${tab}`)}</div>
      <ScrollArea h={height} type="auto" offsetScrollbars>
        {list.length === 0 ? (
          <div className="list-empty">{t("emoji.noRecent")}</div>
        ) : (
          <div className="emoji-grid">
            {list.map((e) => (
              <button
                type="button"
                key={e}
                className="emoji-cell"
                onClick={() => {
                  pushRecent(e);
                  onPick(e);
                }}
                aria-label={e}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
