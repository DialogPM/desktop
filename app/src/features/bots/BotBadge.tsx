import { useTranslation } from "react-i18next";
import "./bots.css";

/** The label that marks a bot wherever its name is shown. */
export function BotBadge({ small }: { small?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="bot-badge" data-size={small ? "sm" : undefined}>
      {t("bots.badge")}
    </span>
  );
}
