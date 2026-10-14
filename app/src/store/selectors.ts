// Derived data hooks.

import { useMemo } from "react";
import type { Contact } from "../lib/types";
import { useApp } from "./app";

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
