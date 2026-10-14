import { useTranslation } from "react-i18next";
import type { IconName } from "../../components/Icon";
import { isMuted } from "../../lib/format";
import { useIsMobile } from "../../lib/hooks";
import type { Conversation } from "../../lib/types";
import { patchConversation } from "../../store/actions";
import { setApp } from "../../store/app";
import { openMuteDialog } from "../chats/dialogs";
import { useChatSearch } from "../conversation/uiStore";

export interface InfoActionDef {
  key: string;
  icon: IconName;
  label: string;
  onClick: () => void;
  hidden?: boolean;
}

export function toggleMute(conv: Conversation) {
  if (isMuted(conv)) void patchConversation(conv.id, { muted_until: null });
  else openMuteDialog(conv);
}

/** Common tiles: search in the conversation and mute. */
export function useCommonActions(conv: Conversation) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const setSearch = useChatSearch((s) => s.setSearch);
  const muted = isMuted(conv);
  const search: InfoActionDef = {
    key: "search",
    icon: "search",
    label: t("info.search"),
    onClick: () => {
      if (mobile) setApp({ infoOpen: false });
      setSearch(conv.id);
    },
  };
  const mute: InfoActionDef = {
    key: "mute",
    icon: muted ? "bell" : "mute",
    label: muted ? t("info.unmute") : t("info.mute"),
    onClick: () => toggleMute(conv),
  };
  return { search, mute };
}
