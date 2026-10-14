import { MantineProvider, mergeThemeOverrides } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { App } from "./App";
import { useAppearance } from "./lib/appearance";
import { theme } from "./theme";

/** Theme plus translated accessibility labels for Mantine's built-in buttons. */
export function Root() {
  const { t } = useTranslation();
  // The appearance store is the single source of truth for light/dark (see lib/appearance.ts).
  const scheme = useAppearance((s) => s.scheme);
  const localized = useMemo(
    () =>
      mergeThemeOverrides(theme, {
        components: {
          Modal: { defaultProps: { closeButtonProps: { "aria-label": t("common.close") } } },
          Drawer: { defaultProps: { closeButtonProps: { "aria-label": t("common.close") } } },
          Notification: { defaultProps: { closeButtonProps: { "aria-label": t("common.close") } } },
        },
      }),
    [t],
  );
  return (
    <MantineProvider theme={localized} forceColorScheme={scheme}>
      <ModalsProvider labels={{ confirm: t("common.ok"), cancel: t("common.cancel") }}>
        <Notifications position="top-center" limit={3} zIndex={3000} />
        <App />
      </ModalsProvider>
    </MantineProvider>
  );
}
