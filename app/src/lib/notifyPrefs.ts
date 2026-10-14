// Notification preferences kept on this device.

import { create } from "zustand";

interface Prefs {
  /** System notifications for new messages. */
  desktop: boolean;
  /** Sound for new messages in other chats / while the app is in the background. */
  sound: boolean;
  /** Short sound for new messages in the chat that is open. */
  soundInChat: boolean;
  /** Unread counter on the app icon (dock / taskbar). */
  badge: boolean;
}

const KEY = "chatapp-notifications";
const DEFAULTS: Prefs = { desktop: true, sound: true, soundInChat: true, badge: true };

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* defaults */
  }
  return DEFAULTS;
}

interface Store extends Prefs {
  set: (patch: Partial<Prefs>) => void;
}

export const useNotifyPrefs = create<Store>()((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch);
    const { desktop, sound, soundInChat, badge } = { ...get(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify({ desktop, sound, soundInChat, badge }));
    } catch {
      /* ignore */
    }
  },
}));

export const getNotifyPrefs = useNotifyPrefs.getState;
