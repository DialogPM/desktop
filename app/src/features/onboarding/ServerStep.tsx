import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import type { ServerInfo } from "../../lib/types";
import { errorText } from "../../store/actions";

function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, "");
}

interface Props {
  defaultServer: string;
  /** Server currently chosen (default or a tested custom one). */
  serverUrl: string;
  server: ServerInfo | null;
  onServer: (url: string, info: ServerInfo | null) => void;
  /** Accounts are listed above: this is the "add an account" part of the start screen. */
  hasProfiles?: boolean;
  onPick: (step: "register" | "login" | "other") => void;
}

/** "Welcome" screen: create / log in, plus the server line that can switch to a custom server. */
export function WelcomeScreen({ defaultServer, serverUrl, server, onServer, hasProfiles, onPick }: Props) {
  const { t } = useTranslation();
  const custom = serverUrl !== defaultServer;
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(custom ? serverUrl : "");
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<ServerInfo | null>(custom ? server : null);
  const [testError, setTestError] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Check the chosen server once (tells whether it accepts new accounts).
  useEffect(() => {
    if (server || !serverUrl) return;
    let alive = true;
    api
      .checkServer(serverUrl)
      .then((info) => alive && onServer(serverUrl, info))
      .catch((e) => alive && setCheckError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [server, serverUrl, onServer]);

  const test = async () => {
    const u = normalizeUrl(url);
    if (!u) return;
    setTesting(true);
    setTestError(null);
    setTested(null);
    try {
      const info = await api.checkServer(u);
      setTested(info);
      setCheckError(null);
      onServer(info.url || u, info);
    } catch (e) {
      setTestError(errorText(e));
    } finally {
      setTesting(false);
    }
  };

  const reset = () => {
    setEditing(false);
    setUrl("");
    setTested(null);
    setTestError(null);
    setCheckError(null);
    onServer(defaultServer, null);
  };

  const closed = server ? !server.registration_enabled : false;

  return (
    <div className="onb-stack">
      {hasProfiles ? (
        <h3 className="onb-h3" style={{ marginTop: 8 }}>
          {t("profiles.add")}
        </h3>
      ) : (
        <div>
          <h2 className="onb-h2">{t("onboarding.welcome.title")}</h2>
          <p className="onb-lead">{t("onboarding.welcome.lead")}</p>
        </div>
      )}
      <div className="onb-buttons">
        <button type="button" className="btn btn-primary" onClick={() => onPick("register")} disabled={closed}>
          {t("onboarding.choose.create")}
        </button>
        {closed && <div className="hint" style={{ textAlign: "center", color: "var(--danger)" }}>{t("onboarding.server.registrationClosed")}</div>}
        <button type="button" className="btn btn-secondary" onClick={() => onPick("login")}>
          {hasProfiles ? t("profiles.login") : t("onboarding.choose.login")}
        </button>
        <button type="button" className="link-btn" onClick={() => onPick("other")}>
          {t("profiles.other")}
        </button>
      </div>
      <div className="onb-server">
        <div className="onb-server-line">
          <span className="dot" data-state={checkError ? "error" : server ? "ok" : "pending"} />
          <span className="truncate" style={{ flex: 1 }} title={checkError ?? undefined}>
            {custom ? t("onboarding.server.custom") : t("onboarding.server.default")} <span className="mono">{serverUrl || "—"}</span>
          </span>
          <button type="button" className="underline-btn" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
            {editing ? t("common.close") : t("common.change")}
          </button>
        </div>
        {checkError && !editing && <div className="error-text" style={{ fontSize: 12.5 }}>{checkError}</div>}
        {editing && (
          <div className="server-box">
            <div className="hint" style={{ lineHeight: 1.45 }}>
              {t("onboarding.server.customHint")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={url}
                placeholder={t("onboarding.server.placeholder")}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label={t("onboarding.server.url")}
                autoFocus
                onChange={(e) => {
                  setUrl(e.currentTarget.value);
                  setTested(null);
                  setTestError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && void test()}
              />
              <button type="button" className="server-test" onClick={() => void test()} disabled={!url.trim() || testing}>
                {testing ? t("onboarding.server.testing") : t("onboarding.server.test")}
              </button>
            </div>
            {tested && (
              <div className="server-ok">
                <Icon name="okcircle" size={15} />
                {tested.name} {tested.version} · {tested.registration_enabled ? t("onboarding.server.registrationOpen") : t("onboarding.server.registrationClosed")}
              </div>
            )}
            {testError && <div className="error-text" style={{ fontSize: 12.5 }}>{testError}</div>}
            <button type="button" className="server-reset" onClick={reset}>
              {t("onboarding.server.reset")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
