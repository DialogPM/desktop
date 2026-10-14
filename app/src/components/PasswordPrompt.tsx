// Account password confirmation for destructive actions (deleting for everyone, wiping):
// someone with a moment at an unlocked computer cannot do them. The core checks it again.

import { modals } from "@mantine/modals";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { errorText } from "../store/actions";
import { PasswordField } from "./Field";

function PasswordPrompt({
  description,
  confirmLabel,
  onDone,
}: {
  description?: string;
  confirmLabel: string;
  onDone: (password: string) => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (await api.verifyPassword({ password })) onDone(password);
      else setError(t("password.wrong"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="onb-stack" style={{ gap: 14 }} onSubmit={(e) => (e.preventDefault(), void submit())}>
      {description && (
        <p className="hint" style={{ margin: 0 }}>
          {description}
        </p>
      )}
      <PasswordField
        label={t("password.confirmAction")}
        value={password}
        onChange={(e) => setPassword(e.currentTarget.value)}
        autoComplete="current-password"
        autoFocus
      />
      {error && <div className="error-text">{error}</div>}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={() => modals.closeAll()}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn btn-danger" disabled={!password || busy}>
          {confirmLabel}
        </button>
      </div>
    </form>
  );
}

/** Asks for the account password; resolves with it once checked, or null if cancelled. */
export function askPassword(opts: { title: string; description?: string; confirmLabel: string }): Promise<string | null> {
  return new Promise((resolve) => {
    let result: string | null = null;
    const id = modals.open({
      title: opts.title,
      size: 440,
      onClose: () => resolve(result),
      children: (
        <PasswordPrompt
          description={opts.description}
          confirmLabel={opts.confirmLabel}
          onDone={(password) => {
            result = password;
            modals.close(id);
          }}
        />
      ),
    });
  });
}
