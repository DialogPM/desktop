import { modals } from "@mantine/modals";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RadioDot } from "./Field";

/** Radio list + OK/Cancel, rendered inside a Mantine modal opened with modals.open(). */
export function OptionsDialog({
  options,
  initial,
  onConfirm,
  description,
  confirmLabel,
  danger,
}: {
  options: { value: string; label: string; hint?: string }[];
  initial: string;
  onConfirm: (value: string) => void;
  description?: string;
  confirmLabel?: string;
  /** Red confirm button (destructive action). */
  danger?: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {description && <div className="hint" style={{ fontSize: 13.5 }}>{description}</div>}
      <div role="radiogroup">
        {options.map((o) => (
          <button type="button" key={o.value} className="option-row" role="radio" aria-checked={value === o.value} onClick={() => setValue(o.value)}>
            <RadioDot on={value === o.value} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
              <span>{o.label}</span>
              {o.hint && <span className="hint" style={{ fontSize: 12.5 }}>{o.hint}</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={() => modals.closeAll()}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className={danger ? "btn btn-danger" : "btn btn-primary"}
          onClick={() => {
            modals.closeAll();
            onConfirm(value);
          }}
        >
          {confirmLabel ?? t("common.ok")}
        </button>
      </div>
    </div>
  );
}
