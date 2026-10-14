import { Dropzone } from "@mantine/dropzone";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { pickedFromFile } from "../../lib/platform";
import type { Conversation } from "../../lib/types";
import { useApp } from "../../store/app";
import { confirmBlock } from "../chats/dialogs";
import { ChatHeader } from "./ChatHeader";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { PinnedBar } from "./PinnedBar";
import { RequestBar } from "./RequestBar";
import { isRequest } from "./requestActions";
import { JoinRequestsBanner } from "../groups/InviteDialogs";
import { GroupCallBanner } from "../calls/GroupCallScreen";
import { SelectionBar } from "./SelectionBar";
import { isImageFile, isVideoFile } from "./outgoingMedia";
import { useComposerImages, useSendMedia } from "./uiStore";

/** Why the composer is replaced by a notice, or null when the user can write. */
function useWriteBlock(conv: Conversation | undefined): "blocked" | "left" | "admins" | null {
  const blocked = useApp((s) =>
    conv?.peer_account_id ? (s.contacts[conv.peer_account_id]?.blocked ?? conv.blocked) : (conv?.blocked ?? false),
  );
  const onlyAdmins = useApp((s) => (conv ? (s.groups[conv.id]?.settings.only_admins_send ?? false) : false));
  if (!conv) return null;
  if (conv.kind === "direct" && blocked) return "blocked";
  if (conv.kind === "group" && conv.left) return "left";
  if (conv.kind === "group" && onlyAdmins && !conv.is_admin) return "admins";
  return null;
}

export function ConversationView({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const conv = useApp((s) => s.conversations[conversationId]);
  const selecting = useApp((s) => s.selection?.conversationId === conversationId);
  const openSendMedia = useSendMedia((s) => s.open);
  const block = useWriteBlock(conv);

  if (!conv) return null;
  // Message request / group invite from a stranger: accept (or not) before writing.
  const request = !block && isRequest(conv);

  return (
    <div className="conversation">
      {selecting ? <SelectionBar conversationId={conv.id} /> : <ChatHeader conv={conv} />}
      <PinnedBar conv={conv} />
      {conv.kind === "group" && !conv.left && <GroupCallBanner conversationId={conv.id} />}
      {conv.kind === "group" && !conv.left && <JoinRequestsBanner conversationId={conv.id} />}
      <MessageList conversationId={conv.id} group={conv.kind === "group"} />
      {block ? (
        <div className="composer-blocked">
          <span>{t(`chat.cannotWrite.${block}`)}</span>
          {block === "blocked" && conv.peer_account_id && (
            <button type="button" className="link-btn" onClick={() => confirmBlock(conv.peer_account_id!, conv.title, false)}>
              {t("chat.block.unblock")}
            </button>
          )}
        </div>
      ) : request ? (
        <RequestBar conv={conv} />
      ) : (
        <Composer key={conv.id} conv={conv} />
      )}
      {!block && !request && (
        <Dropzone.FullScreen
          active
          multiple
          onDrop={(files) => {
            const picked = files.map(pickedFromFile);
            // Images join the composer as chips (sent with the typed text); anything else opens the dialog.
            const imgs = picked.filter(isImageFile);
            const rest = picked.filter((f) => !isImageFile(f));
            if (imgs.length) useComposerImages.getState().add(conv.id, imgs);
            if (rest.length) openSendMedia(conv.id, rest, rest.every(isVideoFile) ? "media" : "files");
          }}
          zIndex={250}
        >
          <div className="drop-inner">
            <div className="logo-tile">
              <Icon name="clip" size={30} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{t("composer.dropTitle")}</div>
            <div className="hint" style={{ fontSize: 14.5 }}>{t("composer.dropHint", { name: conv.title })}</div>
          </div>
        </Dropzone.FullScreen>
      )}
    </div>
  );
}
