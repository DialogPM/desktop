import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { LANGUAGES } from "../../i18n";
import { api } from "../../lib/api";
import { useIsMobile } from "../../lib/hooks";
import { openSettings } from "../../store/actions";
import { useApp, type SettingsSection } from "../../store/app";
import { confirmRemoveProfile, switchAccount } from "./logoutDialog";
import { switchTo } from "../layout/switchTo";
import type { ProfileCard } from "../../lib/types";

type MenuSection = Exclude<SettingsSection, "profile" | "blocked">;

const SECTIONS: { key: MenuSection; icon: IconName }[] = [
  { key: "account", icon: "key" },
  { key: "privacy", icon: "lock" },
  { key: "notifications", icon: "bell" },
  { key: "devices", icon: "devices" },
  { key: "chats", icon: "chat" },
  { key: "appearance", icon: "palette" },
  { key: "language", icon: "lang" },
  { key: "about", icon: "info" },
];

/** Number of linked devices (for the "N active sessions" hint). */
function useDeviceCount(): number | null {
  const version = useApp((s) => s.devicesVersion);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .listDevices()
      .then((l) => alive && setCount(l.length))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [version]);
  return count;
}

export function SettingsMenu() {
  const { t, i18n } = useTranslation();
  const mobile = useIsMobile();
  const profile = useApp((s) => s.profile);
  const section = useApp((s) => s.settingsSection);
  const devices = useDeviceCount();
  const username = useApp((s) => s.details?.username);
  // The blocked list is a sub-page of Privacy.
  const current = mobile ? null : section === "blocked" ? "privacy" : (section ?? "account");

  const hint = (key: MenuSection): string => {
    if (key === "devices" && devices !== null) return t("settings.devices.sessions", { count: devices });
    if (key === "language") return LANGUAGES.find((l) => l.code === i18n.language)?.label ?? "";
    if (key === "about") return t("settings.about.version", { version: __APP_VERSION__ });
    return t(`settings.${key}.hint`);
  };

  return (
    <>
      <div className="set-title">{t("settings.title")}</div>
      <div className="set-list">
        <button type="button" className="set-profile" data-active={current === "profile"} onClick={() => openSettings("profile")}>
          <UserAvatar name={profile?.name || "?"} path={profile?.avatar_path} seed="me" size={58} />
          <div className="flex1">
            <div className="set-profile-name truncate">{profile?.name || t("settings.profile.noName")}</div>
            {username && <div className="set-profile-username truncate">@{username}</div>}
            <div className="set-profile-about truncate">{profile?.about || t("settings.profile.aboutPlaceholder")}</div>
          </div>
          <span className="list-card-chev">
            <Icon name="chevron" size={18} />
          </span>
        </button>
        {SECTIONS.map(({ key, icon }) => (
          <button type="button" key={key} className="set-item" data-active={current === key} onClick={() => openSettings(key)}>
            <span className="set-item-icon">
              <Icon name={icon} size={19} />
            </span>
            <div className="flex1">
              <div className="set-item-title">{t(`settings.${key}.title`)}</div>
              <div className="set-item-hint">{hint(key)}</div>
            </div>
          </button>
        ))}
        <QuickAccounts />
        <button type="button" className="set-item" onClick={() => void switchAccount()}>
          <span className="set-item-icon">
            <Icon name="users" size={19} />
          </span>
          <div className="flex1">
            <div className="set-item-title">{t("profiles.switch")}</div>
            <div className="set-item-hint">{t("profiles.switchHint")}</div>
          </div>
        </button>
        <button type="button" className="set-item set-logout" onClick={() => confirmRemoveProfile()}>
          <span className="set-item-icon">
            <Icon name="logout" size={19} />
          </span>
          {t("profiles.remove")}
        </button>
      </div>
    </>
  );
}

/** The other accounts on this computer, one tap away (phone layout and settings). */
function QuickAccounts() {
  const { t } = useTranslation();
  const [others, setOthers] = useState<ProfileCard[]>([]);
  useEffect(() => {
    let alive = true;
    void api.listProfiles().then(
      (list) => alive && setOthers(list.filter((p) => !p.active)),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return (
    <>
      {others.map((p) => (
        <button type="button" key={p.id} className="set-item" onClick={() => void switchTo(p)}>
          <span className="set-item-icon" style={{ background: "none" }}>
            <UserAvatar name={p.label || t("profiles.account")} seed={p.id} size={30} />
          </span>
          <div className="flex1">
            <div className="set-item-title">{p.label || t("profiles.account")}</div>
            <div className="set-item-hint">{p.unlocked ? t("profiles.unlockedHint") : t("profiles.lockedHint")}</div>
          </div>
        </button>
      ))}
    </>
  );
}
