import { useTranslation } from "react-i18next";
import { passwordStrength } from "../lib/format";

const COLORS = ["var(--danger)", "var(--danger)", "#d98b1b", "#c9a800", "var(--accent)"];

export function PasswordStrength({ value }: { value: string }) {
  const { t } = useTranslation();
  if (!value) return null;
  const score = passwordStrength(value);
  return (
    <div>
      <div className="strength">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} style={i < Math.max(1, score) ? { background: COLORS[score] } : undefined} />
        ))}
      </div>
      <div className="strength-meta" style={{ marginTop: 6 }}>
        <span>{t("password.strength")}</span>
        <span style={{ color: COLORS[score], fontWeight: 650 }}>{t(`password.level${score}`)}</span>
      </div>
    </div>
  );
}
