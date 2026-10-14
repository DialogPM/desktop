import { useTranslation } from "react-i18next";
import type { MessageStatus } from "../lib/types";
import { Icon } from "./Icon";

/** Delivery state of an outgoing message: clock, one check, two checks (read ones are colored by CSS). */
export function StatusTicks({ status, size = 15 }: { status: MessageStatus; size?: number }) {
  const { t } = useTranslation();
  const label = t(`status.${status}`);
  if (status === "failed") {
    return (
      <span className="tick" data-failed="true" style={{ color: "var(--danger)" }} aria-label={label}>
        <Icon name="alert" size={size} />
      </span>
    );
  }
  const name = status === "pending" ? "clock" : status === "sent" ? "check" : "checks";
  return (
    <span className="tick" data-read={status === "read"} aria-label={label} title={label}>
      <Icon name={name} size={status === "pending" ? size - 3 : size} />
    </span>
  );
}
