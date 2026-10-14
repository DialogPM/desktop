import { useTranslation } from "react-i18next";

/** 6-digit one-time code field (digits only, works with paste and OS code autofill). */
export function TotpInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const { t } = useTranslation();
  return (
    <label className="field">
      <span className="field-label">{t("totp.codeLabel")}</span>
      <input
        className="field-input totp-input"
        data-mono="true"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
        aria-label={t("totp.codeLabel")}
      />
    </label>
  );
}
