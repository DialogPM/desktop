// First-run setup, right after creating an account: the name others see, an optional username
// and the look of the app. Every step can be skipped; the account works without them.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../../components/Field";
import { api } from "../../lib/api";
import { useIsMobile } from "../../lib/hooks";
import { finishSetup } from "../../lib/setup";
import { discriminatorValid } from "../../lib/username";
import { errorText } from "../../store/actions";
import { setApp, useApp } from "../../store/app";
import { AppearanceSection } from "../settings/SettingsPage";
import { BrandPanel, MobileBrand, TopBar } from "./Onboarding";

const STEPS = ["name", "username", "look"] as const;

/** Validation message key for a username (without "@"), or null when valid. */
function usernameProblem(u: string): string | null {
  if (!u) return null;
  if (!/^[a-z0-9_.]*$/.test(u)) return "settings.username.errChars";
  if (!/^[a-z]/.test(u)) return "settings.username.errStart";
  if (u.length < 3) return "settings.username.errShort";
  if (u.length > 32) return "settings.username.errLong";
  if (!discriminatorValid(u)) return "settings.username.errNumber";
  return null;
}

export function SetupScreen({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const profile = useApp((s) => s.profile);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.name ?? "");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = STEPS[step];

  const next = () => {
    setError(null);
    if (step < STEPS.length - 1) setStep(step + 1);
    else finishSetup(accountId);
  };

  const saveName = async () => {
    const value = name.trim();
    if (!value) return next();
    setBusy(true);
    try {
      const updated = await api.setProfile({ name: value });
      setApp({ profile: updated });
      next();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const problem = usernameProblem(username);
  const saveUsername = async () => {
    if (!username) return next();
    if (problem) return;
    setBusy(true);
    try {
      await api.setUsername({ username });
      next();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const primary = kind === "name" ? saveName : kind === "username" ? saveUsername : async () => next();
  const primaryLabel = kind === "look" ? t("setup.start") : t("setup.continue");
  const canSkip = kind !== "look";

  return (
    <div className="onb">
      {!mobile && <BrandPanel />}
      <div className="onb-main">
        <div className="onb-col">
          <TopBar steps={2} />
          {mobile && <MobileBrand />}
          <form
            className="onb-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void primary();
            }}
          >
            <div>
              <p className="onb-lead" style={{ margin: 0, fontWeight: 700, color: "var(--accent-text)" }}>{t("setup.progress", { current: step + 1, total: STEPS.length })}</p>
              <h2 className="onb-h2">{t(`setup.${kind}.title`)}</h2>
              <p className="onb-lead">{t(`setup.${kind}.lead`)}</p>
            </div>

            {kind === "name" && (
              <TextField
                label={t("setup.name.label")}
                value={name}
                maxLength={64}
                autoFocus
                size="lg"
                placeholder={t("setup.name.placeholder")}
                onChange={(e) => setName(e.currentTarget.value)}
                error={error}
              />
            )}

            {kind === "username" && (
              <TextField
                label={t("setup.username.label")}
                value={username}
                maxLength={32}
                autoFocus
                size="lg"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                left={<span className="username-prefix">@</span>}
                placeholder={t("setup.username.placeholder")}
                onChange={(e) => setUsername(e.currentTarget.value.toLowerCase().replace(/^@+/, "").trim())}
                error={error ?? (problem ? t(problem) : null)}
                description={t("setup.username.hint")}
              />
            )}

            {kind === "look" && (
              <div className="setup-look">
                <AppearanceSection />
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={busy || (kind === "username" && !!problem)}>
              {busy ? t("setup.saving") : primaryLabel}
            </button>
            {canSkip && (
              <button type="button" className="link-btn" onClick={next} disabled={busy}>
                {t("setup.skip")}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
