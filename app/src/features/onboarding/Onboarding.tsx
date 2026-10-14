// Start screen: the accounts saved on this computer (ProfilePicker.tsx), then welcome (with the
// server choice), create an account (password, then the recovery phrase), log in (password or
// QR from another device) or recover with the 24 words. A new account is saved on this
// computer as its own profile.

import { BRAND_NAME } from "../../brand";
import { Menu } from "@mantine/core";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { LANGUAGES, setLanguage } from "../../i18n";
import { useAppearance } from "../../lib/appearance";
import { useIsMobile } from "../../lib/hooks";
import { api } from "../../lib/api";
import type { ProfileCard, RegisterResult, ServerInfo } from "../../lib/types";
import { setApp, useApp } from "../../store/app";
import { useRemoteWipe } from "../../lib/remoteWipe";
import { ThemeIcon } from "../layout/Rail";
import { LoginForm } from "./LoginForm";
import { OpenOtherProfile, ProfileList } from "./ProfilePicker";
import { RecoverForm } from "./RecoverForm";
import { RegisterFlow } from "./RegisterFlow";
import { WelcomeScreen } from "./ServerStep";

type Step = "welcome" | "register" | "login" | "recover" | "other";

export function BrandPanel() {
  const { t } = useTranslation();
  return (
    <div className="onb-brand">
      <div className="onb-logo">
        <div className="logo-tile">
          <Icon name="chat" size={22} />
        </div>
        {BRAND_NAME}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <h1>{t("onboarding.brand.headline")}</h1>
        <p>{t("onboarding.brand.lead")}</p>
        <div className="onb-features">
          <div>
            <Icon name="lock" size={18} />
            <span>{t("onboarding.brand.f1")}</span>
          </div>
          <div>
            <Icon name="shield" size={18} />
            <span>{t("onboarding.brand.f2")}</span>
          </div>
          <div>
            <Icon name="key" size={18} />
            <span>{t("onboarding.brand.f3")}</span>
          </div>
        </div>
      </div>
      <div className="onb-version">{t("settings.about.version", { version: __APP_VERSION__ })}</div>
    </div>
  );
}

/** "1 Account — 2 Recovery" indicator of the registration screens. */
function Steps({ current }: { current: 0 | 1 | 2 }) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const labels = [t("onboarding.steps.account"), t("onboarding.steps.recovery"), t("onboarding.steps.profile")];
  return (
    <div className="steps">
      {labels.map((label, i) => (
        <div key={i} className="step" data-on={i <= current} data-current={i === current}>
          <span className="step-num">{i < current ? <Icon name="check" size={13} strokeWidth={2.6} /> : i + 1}</span>
          {(!mobile || i === current) && <span className="step-label">{label}</span>}
          {i < labels.length - 1 && <span className="step-line" />}
        </div>
      ))}
    </div>
  );
}

export function TopBar({ steps }: { steps?: 0 | 1 | 2 }) {
  const { t, i18n } = useTranslation();
  const toggleScheme = useAppearance((s) => s.toggleScheme);
  return (
    <div className="onb-top">
      {steps !== undefined && <Steps current={steps} />}
      <div className="onb-top-actions">
        <Menu position="bottom-end" width={170}>
          <Menu.Target>
            <button type="button" className="square-btn" aria-label={t("settings.language.title")}>
              {i18n.language.toUpperCase()}
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            {LANGUAGES.map((l) => (
              <Menu.Item key={l.code} onClick={() => setLanguage(l.code)} rightSection={i18n.language === l.code ? <Icon name="check" size={16} /> : null}>
                {l.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        <button type="button" className="square-btn" onClick={toggleScheme} aria-label={t("settings.appearance.toggle")}>
          <ThemeIcon size={17} />
        </button>
      </div>
    </div>
  );
}

export function MobileBrand() {
  const { t } = useTranslation();
  return (
    <div className="onb-mobile-brand">
      <div className="logo-tile">
        <Icon name="chat" size={24} />
      </div>
      <div>
        <b>{BRAND_NAME}</b>
        <span>{t("onboarding.tagline")}</span>
      </div>
    </div>
  );
}

function LoggedOutNotice() {
  const { t } = useTranslation();
  const reason = useApp((s) => s.loggedOutReason);
  if (!reason) return null;
  return (
    <div className="notice" data-tone="warn">
      <span>
        <Icon name="info" size={16} />
      </span>
      <div>
        <div className="notice-title">{t("onboarding.loggedOut.title")}</div>
        {t(`onboarding.loggedOut.${reason}`)}
      </div>
      <button type="button" className="close" onClick={() => setApp({ loggedOutReason: null })} aria-label={t("common.close")}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export function Onboarding({ defaultServer, resume }: { defaultServer: string; resume?: RegisterResult }) {
  const mobile = useIsMobile();
  const [step, setStep] = useState<Step>(resume ? "register" : "welcome");
  const [serverUrl, setServerUrl] = useState(resume?.account.server_url ?? defaultServer);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [regStage, setRegStage] = useState<0 | 1>(resume ? 1 : 0);
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [profilesVersion, setProfilesVersion] = useState(0);
  const wipeVersion = useRemoteWipe((s) => s.version);

  // Accounts saved on this computer (not while finishing a registration).
  useEffect(() => {
    if (resume) return;
    let alive = true;
    api
      .listProfiles()
      .then((list) => alive && setProfiles(list))
      .catch((e) => console.error("profiles", e));
    return () => {
      alive = false;
    };
  }, [resume, profilesVersion, wipeVersion]);

  const back = () => setStep("welcome");
  const onServer = useCallback((url: string, info: ServerInfo | null) => {
    setServerUrl(url);
    setServer(info);
  }, []);

  let content: ReactNode;
  switch (step) {
    case "welcome":
      content = (
        <>
          {profiles.length > 0 && <ProfileList profiles={profiles} onChanged={() => setProfilesVersion((v) => v + 1)} />}
          <WelcomeScreen
            defaultServer={defaultServer}
            serverUrl={serverUrl}
            server={server}
            onServer={onServer}
            hasProfiles={profiles.length > 0}
            onPick={(s) => {
              setRegStage(0);
              setStep(s);
            }}
          />
        </>
      );
      break;
    case "other":
      content = <OpenOtherProfile onBack={back} />;
      break;
    case "register":
      content = <RegisterFlow serverUrl={serverUrl} onBack={back} resume={resume} onStage={setRegStage} />;
      break;
    case "login":
      content = <LoginForm serverUrl={serverUrl} onBack={back} onRecover={() => setStep("recover")} />;
      break;
    case "recover":
      content = <RecoverForm serverUrl={serverUrl} onBack={() => setStep("login")} />;
      break;
  }

  return (
    <div className="onb">
      {!mobile && <BrandPanel />}
      <div className="onb-main">
        <div className="onb-col">
          <TopBar steps={step === "register" ? regStage : undefined} />
          {mobile && <MobileBrand />}
          <LoggedOutNotice />
          {content}
        </div>
      </div>
    </div>
  );
}
