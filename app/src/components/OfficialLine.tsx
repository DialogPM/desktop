// The official account badge as a line of text (profile panel, message request, own profile):
// "Official account · {label}" and, with `explain`, what it means. See OfficialBadge.tsx.

import { IconRosetteDiscountCheckFilled } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { officialLabel } from "../lib/official";
import { useServerName } from "../store/selectors";

export function OfficialLine({ label, explain = false }: { label: string | null | undefined; explain?: boolean }) {
  const clean = officialLabel(label);
  if (!clean) return null;
  return <Line label={clean} explain={explain} />;
}

function Line({ label, explain }: { label: string; explain: boolean }) {
  const { t } = useTranslation();
  const server = useServerName();
  return (
    <div className="official-line">
      <div className="official-line-head">
        <span className="official-mark" aria-hidden>
          <IconRosetteDiscountCheckFilled size={17} />
        </span>
        <span className="official-line-title">{t("official.title")}</span>
        <span aria-hidden>·</span>
        <bdi className="official-line-label truncate">{label}</bdi>
      </div>
      {explain && <div className="official-line-hint">{t("official.hint", { server })}</div>}
    </div>
  );
}
