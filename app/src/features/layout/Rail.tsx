import { BRAND_NAME } from "../../brand";
import { Tooltip } from "@mantine/core";
import { IconMoonStars } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { AccountSwitcher } from "./AccountSwitcher";
import { useAppearance } from "../../lib/appearance";
import { dndUntilText, useDnd } from "../../lib/dnd";
import { toggleDnd } from "../settings/dndDialog";
import { openSettings } from "../../store/actions";
import { setApp, useApp } from "../../store/app";
import { useUnreadChats } from "../../store/selectors";
import { openMyQr } from "../chats/MyQrModal";

export function ThemeIcon({ size }: { size: number }) {
  const scheme = useAppearance((s) => s.scheme);
  return <Icon name={scheme === "dark" ? "sun" : "moon"} size={size} />;
}

/** Desktop navigation rail (68px). */
export function Rail() {
  const { t } = useTranslation();
  const sidebar = useApp((s) => s.sidebar);
  const profile = useApp((s) => s.profile);
  const unread = useUnreadChats();
  const toggleScheme = useAppearance((s) => s.toggleScheme);
  const scheme = useAppearance((s) => s.scheme);
  const dndUntil = useDnd((s) => s.until);
  const inChats = sidebar !== "settings";

  const item = (label: string, icon: "chat" | "qr" | "gear", active: boolean, onClick: () => void, badge?: number) => (
    <Tooltip label={label} position="right">
      <button type="button" className="rail-btn" data-active={active} onClick={onClick} aria-label={label}>
        <Icon name={icon} size={21} />
        {!!badge && <span className="rail-badge">{badge > 99 ? "99+" : badge}</span>}
      </button>
    </Tooltip>
  );

  return (
    <nav className="rail" aria-label={BRAND_NAME}>
      <div className="logo-tile" aria-hidden>
        <Icon name="chat" size={21} />
      </div>
      {item(t("chats.title"), "chat", inChats, () => setApp({ sidebar: "chats", settingsSection: null }), unread)}
      {item(t("qr.title"), "qr", false, () => openMyQr())}
      {item(t("settings.title"), "gear", sidebar === "settings", () => openSettings(useApp.getState().settingsSection ?? "account"))}
      <div style={{ flex: 1 }} />
      <Tooltip label={scheme === "dark" ? t("settings.appearance.light") : t("settings.appearance.dark")} position="right">
        <button type="button" className="rail-btn" onClick={toggleScheme} aria-label={t("settings.appearance.toggle")}>
          <ThemeIcon size={20} />
        </button>
      </Tooltip>
      <Tooltip label={dndUntil > 0 ? `${t("dnd.turnOff")} · ${dndUntilText(dndUntil)}` : t("dnd.menu")} position="right">
        <button type="button" className="rail-btn" data-active={dndUntil > 0} onClick={toggleDnd} aria-label={t("dnd.title")} aria-pressed={dndUntil > 0}>
          <IconMoonStars size={20} stroke={1.8} />
        </button>
      </Tooltip>
      <AccountSwitcher>
        <button type="button" className="rail-me" aria-label={t("profiles.quickTitle")} title={t("profiles.quickTitle")}>
          <UserAvatar name={profile?.name || "?"} path={profile?.avatar_path} seed="me" size={38} />
        </button>
      </AccountSwitcher>
    </nav>
  );
}

/** Phone bottom tab bar (list and settings menu screens). */
export function TabBar() {
  const { t } = useTranslation();
  const sidebar = useApp((s) => s.sidebar);
  const unread = useUnreadChats();
  const tab = (label: string, icon: "chat" | "qr" | "gear", active: boolean, onClick: () => void, badge?: number) => (
    <button type="button" data-active={active} onClick={onClick}>
      <span className="tabbar-pill">
        <Icon name={icon} size={21} />
        {!!badge && <span className="rail-badge">{badge > 99 ? "99+" : badge}</span>}
      </span>
      {label}
    </button>
  );
  return (
    <nav className="tabbar">
      {tab(t("chats.title"), "chat", sidebar !== "settings", () => setApp({ sidebar: "chats", settingsSection: null }), unread)}
      {tab(t("qr.title"), "qr", false, () => openMyQr())}
      {tab(t("settings.title"), "gear", sidebar === "settings", () => openSettings(null))}
    </nav>
  );
}
