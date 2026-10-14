// State of the view-once viewer (ViewOnceViewer.tsx): opening asks the core for the media,
// closing releases it and lets the core securely delete the file.
//
// Voice notes play once from a blob: URL made from the decrypted bytes read over IPC (lib/media.ts
// always plays audio from memory, never from a decrypted file); the URL is revoked when the
// player closes, which it does as soon as playback ends.

import { create } from "zustand";
import { api } from "../../lib/api";
import { forgetMediaSrc, resolveMediaSrc } from "../../lib/media";
import type { Attachment, Message } from "../../lib/types";
import { notifyError } from "../../store/actions";
import { getApp } from "../../store/app";
import { confirmRequestDownload, isRequest } from "./requestActions";

interface ViewOnceState {
  /** Message being opened or shown. */
  messageId: string | null;
  attachment: Attachment | null;
  /** The message is a voice note (played once instead of shown). */
  voice: boolean;
  src: string | null;
  open: (m: Message) => Promise<void>;
  close: () => void;
}

/** Releases what the viewer held for one message and lets the core delete the file. */
function finish(messageId: string, attachment: Attachment | null) {
  if (attachment?.local_path) forgetMediaSrc(attachment.local_path);
  void api.viewOnceDone({ message_id: messageId }).catch((e) => console.warn("view_once_done failed", e));
}

export const useViewOnce = create<ViewOnceState>()((set, get) => ({
  messageId: null,
  attachment: null,
  voice: false,
  src: null,
  open: async (m) => {
    if (get().messageId || m.outgoing || m.view_once !== "unopened") return;
    // From a message request: warn before opening what a stranger sent (like downloads).
    const conv = getApp().conversations[m.conversation_id];
    if (conv && isRequest(conv) && !(await confirmRequestDownload())) return;
    if (get().messageId) return;
    const voice = m.kind === "voice";
    set({ messageId: m.id, attachment: null, voice, src: null });
    let attachment: Attachment | null = null;
    try {
      attachment = await api.openViewOnce({ message_id: m.id });
      const path = attachment.local_path;
      if (!path) throw new Error("view-once media is not available");
      const src = await resolveMediaSrc(path, voice && !attachment.mime.startsWith("audio/") ? "audio/mp4" : attachment.mime);
      if (!src) throw new Error("view-once media could not be loaded");
      if (get().messageId !== m.id) {
        // Closed while loading.
        finish(m.id, attachment);
        return;
      }
      set({ attachment, src });
    } catch (e) {
      notifyError(e);
      if (get().messageId === m.id) set({ messageId: null, attachment: null, src: null });
      // Opened but not shown: still erase the local copy.
      if (attachment) finish(m.id, attachment);
    }
  },
  close: () => {
    const { messageId, attachment, src } = get();
    if (!messageId) return;
    set({ messageId: null, attachment: null, src: null });
    // Still loading: `open` cleans up once the core answers.
    if (src) finish(messageId, attachment);
  },
}));
