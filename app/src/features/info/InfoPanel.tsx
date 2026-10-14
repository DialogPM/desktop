import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PaneHeader } from "../../components/PaneHeader";
import { useIsMobile } from "../../lib/hooks";
import { setApp, useApp } from "../../store/app";
import { ContactInfo } from "./ContactInfo";
import { GroupInfoView } from "./GroupInfoView";
import { MediaGallery } from "./MediaGallery";
import { SafetyNumberView } from "./SafetyNumberView";

export type InfoView = "main" | "media" | "safety";

export function InfoPanel({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const conv = useApp((s) => s.conversations[conversationId]);
  const [view, setView] = useState<InfoView>("main");
  if (!conv) return null;

  const close = () => setApp({ infoOpen: false });

  if (view === "media") {
    return (
      <>
        <PaneHeader title={t("info.media")} onBack={() => setView("main")} />
        <MediaGallery conversationId={conv.id} />
      </>
    );
  }
  if (view === "safety" && conv.peer_account_id) {
    return (
      <>
        <PaneHeader title={t("safety.title")} onBack={() => setView("main")} />
        <SafetyNumberView accountId={conv.peer_account_id} name={conv.title} />
      </>
    );
  }

  return (
    <>
      <PaneHeader
        title={<span style={{ fontSize: 16.5 }}>{conv.kind === "group" ? t("group.info") : t("contact.info")}</span>}
        onBack={close}
        close={!mobile}
      />
      <div className="pane-scroll" style={{ paddingBottom: 24 }}>
        {conv.kind === "group" ? <GroupInfoView conv={conv} onView={setView} /> : <ContactInfo conv={conv} onView={setView} />}
      </div>
    </>
  );
}
