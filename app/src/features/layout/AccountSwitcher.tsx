// Quick account switch: the accounts saved on this computer. One opened with its password since
// the app started switches at once; the others ask for their password first (once per run of the
// app, chat_core::profiles keeps the opened keys in memory until the app quits).

import { Menu } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { UserAvatar } from "../../components/UserAvatar";
import { api } from "../../lib/api";
import type { ProfileCard } from "../../lib/types";
import { switchAccount } from "../settings/logoutDialog";
import { profileLabel as name, switchTo } from "./switchTo";

/** Menu of the accounts on this computer, opened from `target` (the rail avatar). */
export function AccountSwitcher({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  return (
    <Menu
      position="right-end"
      withinPortal
      shadow="md"
      width={280}
      onOpen={() => void api.listProfiles().then(setProfiles, () => setProfiles([]))}
    >
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t("profiles.quickTitle")}</Menu.Label>
        {profiles.map((p) => (
          <Menu.Item
            key={p.id}
            leftSection={<UserAvatar name={name(p)} seed={p.id} size={28} />}
            rightSection={p.active ? <Icon name="check" size={16} /> : p.unlocked ? null : <Icon name="lock" size={14} />}
            onClick={() => void switchTo(p)}
            disabled={p.active}
          >
            <div style={{ fontWeight: 600 }}>{name(p)}</div>
            {p.last4 && <div style={{ fontSize: 12, opacity: 0.7 }} className="mono">•••• {p.last4}</div>}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item leftSection={<Icon name="plus" size={16} />} onClick={() => void switchAccount()}>
          {t("profiles.addOrOpen")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
