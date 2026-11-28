// Sending an edited copy of an image of a conversation back into it (Lightbox.tsx + ImageAnnotator.tsx).

import type { TFunction } from "i18next";
import { api } from "../../lib/api";
import type { PickedFile } from "../../lib/platform";
import type { Attachment, Message } from "../../lib/types";
import { attempt } from "../../store/actions";
import { getApp, upsertMessage } from "../../store/app";
import { imageAttachment, rejectTooBig } from "./outgoingMedia";
import { isRequest } from "./requestActions";
import { isImage } from "./uiStore";

/**
 * True when an edited copy of an image of this conversation can be sent back into it: the same
 * cases in which the conversation shows its composer (ConversationView.tsx).
 */
export function canSendEdited(conversationId: string): boolean {
  const s = getApp();
  const conv = s.conversations[conversationId];
  if (!conv || isRequest(conv)) return false;
  if (conv.bot && (conv.bot.state === "none" || conv.bot.deleted)) return false;
  if (conv.kind === "direct") return !(conv.peer_account_id ? (s.contacts[conv.peer_account_id]?.blocked ?? conv.blocked) : conv.blocked);
  if (conv.left) return false;
  return !(s.groups[conv.id]?.settings.only_admins_send ?? false) || !!conv.is_admin;
}

/** Still images the editor can open (an animation would lose its frames). */
export const isEditableImage = (a: Attachment) => isImage(a) && !/^image\/(gif|svg)/.test(a.mime);

/**
 * Sends an edited image into the conversation of the message it came from, as a reply to that
 * message. It goes out like any other picture (same command, encrypted by the core).
 */
export async function sendEditedImage(original: Message, edited: PickedFile, caption: string, t: TFunction, locale: string): Promise<boolean> {
  if (rejectTooBig([edited], t, locale)) return false;
  const sent = await attempt(async () =>
    api.sendMessage({
      conversation_id: original.conversation_id,
      text: caption || undefined,
      attachments: [await imageAttachment(edited)],
      reply_to: original.id,
    }),
  );
  if (!sent) return false;
  upsertMessage(sent);
  return true;
}
