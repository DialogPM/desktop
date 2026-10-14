// Account directory lookup for the search fields: detects queries that look like an
// account number or a username and resolves them with findAccount (debounced).

import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { FoundAccount } from "../../lib/types";

export type AccountQueryKind = "number" | "username" | "phone";

/** 3-32 characters a-z 0-9 _ . starting with a letter (same rule as the core). */
export const USERNAME_RE = /^[a-z][a-z0-9_.]{2,31}$/;

/**
 * What a search text looks like: a 16-digit account number (spaces / dashes allowed),
 * a username (optionally with "@"), or neither.
 */
export function accountQueryKind(raw: string): AccountQueryKind | null {
  const q = raw.trim();
  if (/^[\d\s-]+$/.test(q) && q.replace(/\D/g, "").length === 16) return "number";
  // Phone numbers: international (+40..., 0040...) or national (07..., with our own country).
  if (/^\+?[\d\s().-]+$/.test(q) && /^(\+|0)/.test(q)) {
    const digits = q.replace(/\D/g, "").length;
    if (digits >= 6 && digits <= 15) return "phone";
  }
  if (USERNAME_RE.test(q.replace(/^@/, "").toLowerCase())) return "username";
  return null;
}

type Lookup = { query: string; state: "loading" } | { query: string; state: "done"; found: FoundAccount | null } | { query: string; state: "error" };

/** Debounced (400 ms) findAccount for queries that look like a number or a username. */
export function useAccountLookup(query: string): Lookup | null {
  const kind = accountQueryKind(query);
  const normalized =
    kind === "number"
      ? query.replace(/\D/g, "")
      : kind === "username"
        ? query.trim().replace(/^@/, "").toLowerCase()
        : kind === "phone"
          ? query.trim().replace(/[\s().-]/g, "")
          : "";
  const [debounced] = useDebouncedValue(normalized, 400);
  const [result, setResult] = useState<Lookup | null>(null);

  useEffect(() => {
    if (!debounced) return;
    let alive = true;
    queueMicrotask(() => alive && setResult({ query: debounced, state: "loading" }));
    api
      .findAccount({ query: debounced })
      .then((found) => alive && setResult({ query: debounced, state: "done", found }))
      .catch(() => alive && setResult({ query: debounced, state: "error" }));
    return () => {
      alive = false;
    };
  }, [debounced]);

  if (!normalized) return null;
  // Typing or waiting for the debounce: show "searching" instead of a stale result.
  if (normalized !== debounced || result?.query !== normalized) return { query: normalized, state: "loading" };
  return result;
}
