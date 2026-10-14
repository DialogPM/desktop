import type { ComponentProps } from "react";
import { digitsOnly, formatAccountNumber } from "../lib/format";
import { TextField } from "./Field";

type Props = Omit<ComponentProps<typeof TextField>, "value" | "onChange"> & {
  /** Digits only. */
  value: string;
  onChange: (digits: string) => void;
};

/** 16-digit account number input, displayed in groups of four. */
export function AccountNumberInput({ value, onChange, ...rest }: Props) {
  return (
    <TextField
      inputMode="numeric"
      autoComplete="username"
      placeholder="0000 0000 0000 0000"
      mono
      {...rest}
      value={formatAccountNumber(value)}
      onChange={(e) => onChange(digitsOnly(e.currentTarget.value).slice(0, 16))}
    />
  );
}
