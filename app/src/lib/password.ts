import { useState } from "react";

/** Same rules as the core (crates/chat-core/src/util.rs, password_problems). */
export const MIN_PASSWORD = 12;
export const PASSPHRASE_LEN = 20;
const COMMON = [
  "password", "parola", "passwort", "motdepasse", "qwerty", "qwertz", "azerty", "asdf", "letmein", "welcome",
  "admin", "chatapp", "iloveyou", "abc", "abcdef", "monkey", "dragon", "football", "secret", "test",
];

export type PasswordRule = "length" | "mix" | "common";

/** The rules a new password does not meet yet (empty: accepted). */
export function passwordProblems(pw: string): PasswordRule[] {
  const chars = [...pw];
  const out: PasswordRule[] = [];
  if (chars.length < MIN_PASSWORD) out.push("length");
  const classes = [/\p{Ll}/u, /\p{Lu}/u, /[0-9]/, /[^\p{L}\p{N}]/u].filter((r) => r.test(pw)).length;
  if (classes < 3 && chars.length < PASSPHRASE_LEN) out.push("mix");
  const letters = (pw.match(/\p{L}/gu) ?? []).join("").toLowerCase();
  const sameChar = chars.length > 0 && chars.every((c) => c === chars[0]);
  const sequence = letters === "" || ("abcdefghijklmnopqrstuvwxyz".includes(letters) && letters.length < 8);
  if (sameChar || sequence || COMMON.includes(letters)) out.push("common");
  return out;
}

/** State for a "new password + confirmation" pair. */
export function usePasswordPair() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const problems = passwordProblems(password);
  const tooShort = password.length > 0 && problems.length > 0;
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = password.length > 0 && problems.length === 0 && confirm === password;
  const reset = () => {
    setPassword("");
    setConfirm("");
  };
  return { password, setPassword, confirm, setConfirm, problems, tooShort, mismatch, valid, reset };
}

export type PasswordPair = ReturnType<typeof usePasswordPair>;
