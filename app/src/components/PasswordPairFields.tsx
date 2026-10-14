import { useTranslation } from "react-i18next";
import { MIN_PASSWORD, type PasswordPair, type PasswordRule } from "../lib/password";
import { Icon } from "./Icon";
import { PasswordField } from "./Field";
import { PasswordStrength } from "./PasswordStrength";

export function PasswordPairFields({
  pair,
  label,
  autoFocus,
  size,
}: {
  pair: PasswordPair;
  label?: string;
  autoFocus?: boolean;
  size?: "md" | "lg";
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="field">
        <PasswordField
          label={label ?? t("password.new")}
          value={pair.password}
          onChange={(e) => pair.setPassword(e.currentTarget.value)}
          autoComplete="new-password"
          autoFocus={autoFocus}
          size={size}
        />
        <PasswordStrength value={pair.password} />
        <ul className="password-rules" aria-label={t("password.rulesTitle")}>
          {(["length", "mix", "common"] as PasswordRule[]).map((r) => {
            const ok = pair.password.length > 0 && !pair.problems.includes(r);
            return (
              <li key={r} data-ok={ok}>
                <Icon name={ok ? "check" : "x"} size={14} />
                {t(`password.rule.${r}`, { count: MIN_PASSWORD })}
              </li>
            );
          })}
        </ul>
      </div>
      <PasswordField
        label={t("password.confirm")}
        value={pair.confirm}
        onChange={(e) => pair.setConfirm(e.currentTarget.value)}
        autoComplete="new-password"
        size={size}
        error={pair.mismatch ? t("password.mismatch") : undefined}
      />
    </>
  );
}
