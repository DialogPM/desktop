import { Loader } from "@mantine/core";
import { IconCloudDownload, IconWifiOff } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../store/app";

export function ConnectionBanner() {
  const { t } = useTranslation();
  const connection = useApp((s) => s.connection);
  const sync = useApp((s) => s.historySync);
  return (
    <>
      {connection !== "online" && (
        <div className={`banner banner-${connection}`} role="status">
          {connection === "connecting" ? <Loader size={14} color="currentColor" /> : <IconWifiOff size={16} />}
          <span>{connection === "connecting" ? t("connection.connecting") : t("connection.offline")}</span>
        </div>
      )}
      {sync && (
        <div className="banner banner-sync" role="status">
          {sync.done ? <IconCloudDownload size={16} /> : <Loader size={14} color="currentColor" />}
          <span>{sync.done ? t("sync.done") : t("sync.progress", { count: sync.records })}</span>
        </div>
      )}
    </>
  );
}
