import { modals } from "@mantine/modals";
import i18n from "../../i18n";
import { QrTabs } from "./QrTabs";

export function openMyQr(initial: "mine" | "scan" = "mine") {
  modals.open({ title: i18n.t("qr.title"), children: <QrTabs initial={initial} />, size: 420, padding: 20 });
}
