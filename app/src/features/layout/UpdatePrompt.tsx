// Tells the user that a newer version of the app exists. The server announces version numbers
// only (admin settings, `client_versions` of /v1/info); where to get the update is built into
// the app, so a server can never point users at a download of its choosing.
//
// - Older than the announced latest version: a prompt once per run, which "Later" closes.
// - Older than the announced minimum: the prompt cannot be closed.
//
// A copy of the app that updates itself (lib/updater.ts) installs the signed update right
// here when its own check found one; every other copy opens the download page.

import { Modal } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { openExternal } from "../../lib/platform";
import { installUpdate, startUpdater, useUpdater } from "../../lib/updater";
import { isOlder } from "../../lib/version";
import { attempt } from "../../store/actions";
import { useApp } from "../../store/app";

/** Download page of the desktop app (installers for every system, links to the stores). */
const DOWNLOAD_URL = "https://dialog.pm/#descarca";

// "Later" holds until the app is closed (also across locking and switching accounts).
let postponed: string | null = null;

export function UpdatePrompt() {
  const { t } = useTranslation();
  const info = useApp((s) => s.serverInfo);
  const [, refresh] = useState(0);
  const signed = useUpdater((s) => s.available);
  const installing = useUpdater((s) => s.installing);
  const percent = useUpdater((s) => s.percent);
  useEffect(startUpdater, []);

  const required = isOlder(__APP_VERSION__, info?.client_min);
  const offered = required || isOlder(__APP_VERSION__, info?.client_latest);
  // The version to name: the latest when announced, else the minimum that is required.
  const version = isOlder(__APP_VERSION__, info?.client_latest) ? info?.client_latest : info?.client_min;
  if (!offered || !version || (!required && postponed === version)) return null;

  const later = () => {
    postponed = version;
    refresh((n) => n + 1);
  };

  return (
    <Modal
      opened
      onClose={required ? () => undefined : later}
      withCloseButton={false}
      closeOnClickOutside={!required}
      closeOnEscape={!required}
      centered
      size="sm"
    >
      <div className="onb-stack" style={{ gap: 14, textAlign: "center", alignItems: "center" }}>
        <span className="nudge-icon">
          <Icon name="download" size={30} />
        </span>
        <h3 className="onb-h2" style={{ margin: 0, fontSize: 20 }}>
          {t(required ? "update.requiredTitle" : "update.title")}
        </h3>
        <p className="hint" style={{ margin: 0 }}>
          {t(required ? "update.requiredBody" : "update.body", { version, current: __APP_VERSION__ })}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={installing}
          onClick={() => void (signed ? attempt(installUpdate) : openExternal(DOWNLOAD_URL))}
        >
          {!installing
            ? t(signed ? "security.updateInstall" : "update.now")
            : percent === null || percent >= 100
              ? t("security.updateInstalling")
              : t("security.updateDownloading", { percent })}
        </button>
        {!required && !installing && (
          <button type="button" className="link-btn" onClick={later}>
            {t("update.later")}
          </button>
        )}
      </div>
    </Modal>
  );
}
