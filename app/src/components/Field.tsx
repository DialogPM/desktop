// Small form primitives in the design's style (see .field / .switch / .radio-dot in styles/base.css).

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon";

interface FieldShellProps {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  mutedLabel?: boolean;
  id: string;
  children: ReactNode;
}

function FieldShell({ label, description, error, mutedLabel, id, children }: FieldShellProps) {
  return (
    <div className="field" data-muted-label={mutedLabel}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      {children}
      {error ? <div className="field-error">{error}</div> : description ? <div className="field-desc">{description}</div> : null}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  mono?: boolean;
  size?: "md" | "lg";
  mutedLabel?: boolean;
  variant?: "pane" | "sunk";
  /** Content before the input (e.g. an "@" prefix). */
  left?: ReactNode;
  right?: ReactNode;
};

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, description, error, mono, size = "md", mutedLabel, variant, left, right, id, className, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  const input = <input ref={ref} id={fid} {...rest} />;
  return (
    <FieldShell label={label} description={description} error={error} mutedLabel={mutedLabel} id={fid}>
      {left || right ? (
        <div className={`field-input field-affix ${className ?? ""}`} data-size={size} data-mono={mono} data-error={!!error} data-variant={variant}>
          {left}
          {input}
          {right}
        </div>
      ) : (
        <input
          ref={ref}
          id={fid}
          className={`field-input ${className ?? ""}`}
          data-size={size}
          data-mono={mono}
          data-error={!!error}
          data-variant={variant}
          {...rest}
        />
      )}
    </FieldShell>
  );
});

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  mutedLabel?: boolean;
};

export const TextAreaField = forwardRef<HTMLTextAreaElement, AreaProps>(function TextAreaField(
  { label, description, error, mutedLabel, id, rows = 3, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} description={description} error={error} mutedLabel={mutedLabel} id={fid}>
      <textarea ref={ref} id={fid} className="field-input" rows={rows} data-error={!!error} {...rest} />
    </FieldShell>
  );
});

/** Password input with a show/hide toggle. */
export const PasswordField = forwardRef<HTMLInputElement, Omit<InputProps, "type" | "right" | "mono">>(function PasswordField(props, ref) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      ref={ref}
      placeholder="••••••••"
      {...props}
      type={visible ? "text" : "password"}
      right={
        <button type="button" className="icon-btn" onClick={() => setVisible((v) => !v)} aria-label={t("password.toggle")} tabIndex={-1}>
          <Icon name={visible ? "eyeoff" : "eye"} size={18} />
        </button>
      }
    />
  );
});

export function Switch({ on }: { on: boolean }) {
  return (
    <span className="switch" data-on={on} aria-hidden>
      <span />
    </span>
  );
}

export function RadioDot({ on }: { on: boolean }) {
  return (
    <span className="radio-dot" data-on={on} aria-hidden>
      <span />
    </span>
  );
}

export function CheckBox({ on, round }: { on: boolean; round?: boolean }) {
  return (
    <span className="check-box" data-on={on} data-round={round} aria-hidden>
      {on && <Icon name="check" size={14} strokeWidth={2.6} />}
    </span>
  );
}

/** A row with a label, optional description and a switch; the whole row toggles. */
export function ToggleRow({
  icon,
  label,
  sub,
  on,
  onToggle,
  disabled,
}: {
  icon?: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="toggle-row" role="switch" aria-checked={on} onClick={onToggle} disabled={disabled}>
      {icon && <span className="ic">{icon}</span>}
      <div className="flex1">
        <div className="toggle-label">{label}</div>
        {sub && <div className="toggle-sub">{sub}</div>}
      </div>
      <Switch on={on} />
    </button>
  );
}
