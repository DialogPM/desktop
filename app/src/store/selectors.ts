// Derived data hooks.

import { useMemo } from "react";
import type { Contact, Conversation } from "../lib/types";
import { useApp, type AppStore } from "./app";

/** Contacts filtered by name / number / phone, sorted by name. */
export function useSortedContacts(filter: string, includeChats = false): Contact[] {
  const contacts = useApp((s) => s.contacts);
  const conversations = useApp((s) => s.conversations);
  return useMemo(() => {
    const q = filter.trim().toLowerCase();
    const digits = q.replace(/\s/g, "");
    const all: Record<string, Contact> = { ...contacts };
    if (includeChats) {
      // People we chat with but never added as contacts (they messaged us first).
      for (const c of Object.values(conversations)) {
        if (c.kind !== "direct" || !c.peer_account_id || !c.peer_number || all[c.peer_account_id]) continue;
        all[c.peer_account_id] = {
          account_id: c.peer_account_id,
          number: c.peer_number,
          profile_name: null,
          local_name: null,
          display_name: c.title,
          about: null,
          avatar_path: c.avatar_path,
          phone: null,
          blocked: false,
          verified: false,
          official: c.official ?? null,
        };
      }
    }
    return Object.values(all)
      .filter(
        (c) =>
          !q ||
          c.display_name.toLowerCase().includes(q) ||
          (digits && /^\d+$/.test(digits) && c.number.includes(digits)) ||
          (c.phone && c.phone.replace(/\s/g, "").includes(digits)),
      )
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [contacts, conversations, filter, includeChats]);
}


/** Number of (not archived) conversations with unread messages. */
export function useUnreadChats(): number {
  return useApp((s) => Object.values(s.conversations).filter((c) => !c.archived && c.unread_count > 0).length);
}

/**
 * Name of the server this account is on, for "notice from …": the name the server gives
 * itself, else its host. Notices are signed by that server's operator.
 */
export function serverName(s: Pick<AppStore, "serverInfo" | "details" | "appState">): string {
  const named = s.serverInfo?.name?.trim();
  if (named) return named;
  const url = s.details?.account.server_url ?? s.appState?.account?.server_url ?? "";
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export function useServerName(): string {
  return useApp(serverName);
}

/**
 * Official badge label of the person in a direct chat (null for groups). The contact's copy
 * wins when it has one: contact_updated arrives when the operator's statement changes.
 */
export function peerOfficial(s: Pick<AppStore, "contacts">, conv: Conversation): string | null {
  if (conv.kind !== "direct") return null;
  const c = conv.peer_account_id ? s.contacts[conv.peer_account_id] : undefined;
  return (c && c.official !== undefined ? c.official : conv.official) ?? null;
}

export function usePeerOfficial(conv: Conversation): string | null {
  return useApp((s) => peerOfficial(s, conv));
}
