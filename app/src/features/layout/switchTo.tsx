// Switching to another account on this computer (AccountSwitcher, settings menu).

import { modals } from "@mantine/modals";
import i18n from "../../i18n";
import { api, parseError } from "../../lib/api";
import { reloadAfterProfileSwitch } from "../../lib/profiles";
import type { ProfileCard } from "../../lib/types";
import { attempt } from "../../store/actions";
import { UnlockForm } from "../onboarding/ProfilePicker";

export function profileLabel(p: ProfileCard): string {
  return p.label || i18n.t("profiles.account");
}

/** Switches to `p`: at once when it is unlocked, else after its password. */
export async function switchTo(p: ProfileCard) {
  if (p.active) return;
  if (p.unlocked) {
    try {
      await api.switchProfile({ id: p.id });
      reloadAfterProfileSwitch(true);
      return;
    } catch (e) {
      if (parseError(e).code !== "password_required") {
        await attempt(() => Promise.reject(e));
        return;
      }
    }
  }
  modals.open({
    title: i18n.t("profiles.passwordFor", { name: profileLabel(p) }),
    size: 420,
    children: <UnlockForm profile={p} onForgotten={() => modals.closeAll()} bare />,
  });
}
