import { BRAND_NAME } from "../../brand";
import { CallScreen } from "../calls/CallScreen";
import { GroupCallScreen } from "../calls/GroupCallScreen";
import { TwoStepNudge } from "../settings/TwoStepNudge";
import { LocalPasswordNudge } from "../lock/LocalPasswordNudge";
import { WeakPasswordNudge } from "../settings/WeakPasswordNudge";
import { LoginRequestPrompt, NewDeviceBanner, UpdateBanner } from "../settings/AccountSecurity";
import { KtAlertBanner } from "../settings/KeyTransparency";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ConnectionBanner } from "../../components/ConnectionBanner";
import { Icon } from "../../components/Icon";
import { useAppearance } from "../../lib/appearance";
import { useIsMobile } from "../../lib/hooks";
import { goBack, navDepth } from "../../store/actions";
import { useApp } from "../../store/app";
import { Lightbox } from "../conversation/Lightbox";
import { ViewOnceViewer } from "../conversation/ViewOnceViewer";
import { MessageDialogs } from "../conversation/MessageDialogs";
import { SendMediaModal } from "../conversation/SendMediaModal";
import { Sidebar } from "../chats/Sidebar";
import { ConversationView } from "../conversation/ConversationView";
import { InfoPanel } from "../info/InfoPanel";
import { SettingsMenu } from "../settings/SettingsMenu";
import { SettingsPage } from "../settings/SettingsPage";
import { PaneResizer } from "./PaneResizer";
import { Rail, TabBar } from "./Rail";

function EmptyMain() {
  const { t } = useTranslation();
  return (
    <div className="empty-main">
      <div className="logo-tile">
        <Icon name="chat" size={34} />
      </div>
      <div className="empty-title">{BRAND_NAME}</div>
      <div className="empty-sub">{t("empty.subtitle")}</div>
      <div className="lock-note" style={{ marginTop: 18 }}>
        <Icon name="lock" size={13} />
        {t("empty.e2e")}
      </div>
    </div>
  );
}

/** True when a modal, drawer or overlay currently owns the keyboard. */
function overlayOpen(): boolean {
  return !!document.querySelector('[role="dialog"], [role="menu"], .mantine-Popover-dropdown, .lightbox');
}

/**
 * Back navigation: Escape on desktop, and the browser/Android back button on phones
 * (a sentinel history entry is kept while there is somewhere to go back to).
 */
function useBackNavigation(mobile: boolean) {
  const depth = useApp(() => navDepth());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || overlayOpen()) return;
      goBack();
    };
    // Capture phase: runs before Mantine closes (and unmounts) the overlay for this same key press.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (!mobile) return;
    const onPop = () => {
      if (goBack() && navDepth() > 0) history.pushState({ chatapp: true }, "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [mobile]);

  useEffect(() => {
    if (mobile && depth > 0 && !(history.state as { chatapp?: boolean } | null)?.chatapp) {
      history.pushState({ chatapp: true }, "");
    }
  }, [mobile, depth]);
}

export function MainLayout() {
  const mobile = useIsMobile();
  useBackNavigation(mobile);
  const activeId = useApp((s) => s.activeId);
  const infoOpen = useApp((s) => s.infoOpen);
  const sidebar = useApp((s) => s.sidebar);
  const settingsSection = useApp((s) => s.settingsSection);
  const listWidth = useAppearance((s) => s.listWidth);
  const conversationExists = useApp((s) => (activeId ? !!s.conversations[activeId] : false));
  const active = conversationExists ? activeId : null;

  let content;
  let tabbar = false;
  if (mobile) {
    let pane;
    if (sidebar === "settings" && settingsSection) pane = <SettingsPage section={settingsSection} />;
    else if (sidebar === "settings") {
      pane = <SettingsMenu />;
      tabbar = true;
    } else if (sidebar !== "chats") pane = <Sidebar />;
    else if (active && infoOpen) pane = <InfoPanel conversationId={active} />;
    else if (active) pane = <ConversationView key={active} conversationId={active} />;
    else {
      pane = <Sidebar />;
      tabbar = true;
    }
    content = <div className={`pane pane-full${active && sidebar === "chats" && !infoOpen ? " pane-chat" : ""}`}>{pane}</div>;
  } else if (sidebar === "settings") {
    content = (
      <>
        <Rail />
        <aside className="pane pane-list">
          <SettingsMenu />
        </aside>
        <PaneResizer />
        <main className="pane pane-main">
          <SettingsPage section={settingsSection ?? "account"} />
        </main>
      </>
    );
  } else {
    content = (
      <>
        <Rail />
        <aside className="pane pane-list">
          <Sidebar />
        </aside>
        <PaneResizer />
        <main className="pane pane-main pane-chat">
          {active ? <ConversationView key={active} conversationId={active} /> : <EmptyMain />}
        </main>
        {active && infoOpen && (
          <aside className="pane pane-info">
            <InfoPanel conversationId={active} />
          </aside>
        )}
      </>
    );
  }

  return (
    <div className="app-root">
      <ConnectionBanner />
      <KtAlertBanner />
      <NewDeviceBanner />
      <UpdateBanner />
      <div className="shell" style={mobile ? undefined : { ["--list-w" as string]: `${listWidth}px` }}>
        {content}
      </div>
      {tabbar && <TabBar />}
      <Lightbox />
      <ViewOnceViewer />
      <CallScreen />
      <GroupCallScreen />
      <TwoStepNudge />
      <LocalPasswordNudge />
      <WeakPasswordNudge />
      <LoginRequestPrompt />
      <SendMediaModal />
      <MessageDialogs />
    </div>
  );
}
