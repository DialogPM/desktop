// The official account badge: the server operator vouches for this account, in a statement the
// core checked against the operator's key. It exists so that people stop trusting accounts that
// merely call themselves "Support" or "Admin", so it is drawn by the app (a filled rosette in the
// brand color, outside the name) and never derived from anything an account can set itself:
// names, emoji and profile text are always rendered as plain text next to it.
//
// Not the same thing as the shield of a verified safety number (the user compared keys with
// that person): different icon, different words.

import { Tooltip } from "@mantine/core";
import { IconRosetteDiscountCheckFilled } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { officialLabel } from "../lib/official";

/** The icon next to a name, with "Official account · {label}" as its tooltip and accessible name. */
export function OfficialBadge({ label, size = 15 }: { label: string | null | undefined; size?: number }) {
  const clean = officialLabel(label);
  if (!clean) return null;
  return <Mark label={clean} size={size} />;
}

function Mark({ label, size }: { label: string; size: number }) {
  const { t } = useTranslation();
  const text = t("official.badge", { label });
  return (
    <Tooltip label={text} withinPortal>
      <span className="official-mark" role="img" aria-label={text}>
        <IconRosetteDiscountCheckFilled size={size} aria-hidden />
      </span>
    </Tooltip>
  );
}
