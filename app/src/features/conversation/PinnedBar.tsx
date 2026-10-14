import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { previewText } from "../../lib/messageText";
import type { Conversation, Message } from "../../lib/types";
import { useApp } from "../../store/app";
import { jumpTo, pinMessage } from "./messageActions";

/** The chat's pinned messages (this device only): click to jump and cycle through them. */
export function PinnedBar({ conv }: { conv: Conversation }) {
  const { t } = useTranslation();
  const version = useApp((s) => s.pinsVersion);
  const [pins, setPins] = useState<Message[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .pinnedMessages({ conversation_id: conv.id })
      .then((list) => {
        if (!alive) return;
        setPins(list);
        setIndex(0);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [conv.id, version]);

  const current = pins[Math.min(index, pins.length - 1)];
  // Edits arrive as message events: prefer the live copy.
  const live = useApp((s) => (current ? s.messages[current.id] : undefined)) ?? current;
  if (!live) return null;

  const who = live.outgoing ? t("common.you") : live.sender_name;
  const label = pins.length > 1 ? t("pin.barCount", { index: Math.min(index, pins.length - 1) + 1, count: pins.length }) : t("pin.bar");
  return (
    <div className="pinned-bar">
      <button
        type="button"
        className="pinned-main"
        onClick={() => {
          jumpTo(live.id);
          setIndex((i) => (i + 1) % pins.length);
        }}
      >
        <span className="pinned-ticks" aria-hidden>
          {pins.map((p, i) => (
            <span key={p.id} data-on={i === Math.min(index, pins.length - 1)} />
          ))}
        </span>
        <Icon name="pin" size={17} />
        <span className="pinned-text">
          <span className="pinned-label">{label}</span>
          <span className="pinned-preview truncate">
            {conv.kind === "group" ? `${who}: ` : ""}
            {previewText(live.kind, live.text, t, live.view_once)}
          </span>
        </span>
      </button>
      <button type="button" className="icon-btn" data-tone="muted" onClick={() => void pinMessage(live, null)} aria-label={t("pin.unpin")}>
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
