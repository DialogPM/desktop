// Small UI-only stores for overlays of the conversation view.

import { create } from "zustand";
import type { PickedFile } from "../../lib/platform";
import type { Attachment, Message } from "../../lib/types";

export interface LightboxState {
  message: Message | null;
  index: number;
  open: (message: Message, index: number) => void;
  close: () => void;
  setIndex: (i: number) => void;
}

export const useLightbox = create<LightboxState>()((set) => ({
  message: null,
  index: 0,
  open: (message, index) => set({ message, index }),
  close: () => set({ message: null, index: 0 }),
  setIndex: (index) => set({ index }),
}));

export interface SendMediaState {
  conversationId: string | null;
  files: PickedFile[];
  mode: "media" | "files";
  open: (conversationId: string, files: PickedFile[], mode: "media" | "files") => void;
  close: () => void;
  setFiles: (files: PickedFile[]) => void;
}

export const useSendMedia = create<SendMediaState>()((set) => ({
  conversationId: null,
  files: [],
  mode: "media",
  open: (conversationId, files, mode) => set({ conversationId, files, mode }),
  close: () => set({ conversationId: null, files: [] }),
  setFiles: (files) => set({ files }),
}));

/**
 * Images pasted or dropped into the composer, per conversation, shown as chips above the text
 * field until sent (the text becomes their caption). They stay on the device until then.
 */
export interface ComposerImagesState {
  byConv: Record<string, PickedFile[]>;
  add: (conversationId: string, files: PickedFile[]) => void;
  replace: (conversationId: string, old: PickedFile, next: PickedFile) => void;
  remove: (conversationId: string, file: PickedFile) => void;
  clear: (conversationId: string) => void;
}

export const useComposerImages = create<ComposerImagesState>()((set) => ({
  byConv: {},
  add: (id, files) => set((s) => ({ byConv: { ...s.byConv, [id]: [...(s.byConv[id] ?? []), ...files] } })),
  replace: (id, old, next) => set((s) => ({ byConv: { ...s.byConv, [id]: (s.byConv[id] ?? []).map((f) => (f === old ? next : f)) } })),
  remove: (id, file) => set((s) => ({ byConv: { ...s.byConv, [id]: (s.byConv[id] ?? []).filter((f) => f !== file) } })),
  clear: (id) =>
    set((s) => {
      const byConv = { ...s.byConv };
      delete byConv[id];
      return { byConv };
    }),
}));

export interface MessageDialogsState {
  forward: string[] | null;
  info: string | null;
  del: { conversationId: string; ids: string[] } | null;
  setForward: (ids: string[] | null) => void;
  setInfo: (id: string | null) => void;
  setDelete: (v: { conversationId: string; ids: string[] } | null) => void;
}

export const useMessageDialogs = create<MessageDialogsState>()((set) => ({
  forward: null,
  info: null,
  del: null,
  setForward: (forward) => set({ forward }),
  setInfo: (info) => set({ info }),
  setDelete: (del) => set({ del }),
}));

export const isImage = (a: Attachment) => a.mime.startsWith("image/");
export const isVideo = (a: Attachment) => a.mime.startsWith("video/");

/** In-conversation search (header search field): id of the conversation being searched. */
export const useChatSearch = create<{ conversationId: string | null; setSearch: (conversationId: string | null) => void }>()((set) => ({
  conversationId: null,
  setSearch: (conversationId) => set({ conversationId }),
}));

/** Media erased by the retention period (crates/chat-core/src/engine/retention.rs). */
export function isExpiredAttachment(a: Attachment): boolean {
  return a.download_state === "expired" || a.expired_at != null;
}
