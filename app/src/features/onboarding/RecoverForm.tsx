import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccountNumberInput } from "../../components/AccountNumberInput";
import { Icon } from "../../components/Icon";
import { PasswordPairFields } from "../../components/PasswordPairFields";
import { api } from "../../lib/api";
import { usePasswordPair } from "../../lib/password";
import { defaultDeviceName } from "../../lib/platform";
import { enterApp, errorText } from "../../store/actions";

const WORD_COUNT = 24;

function splitWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\d+[.)]/g, " ")
    .split(/[\s,;]+/)
    .filter(Boolean);
}

export function RecoverForm({ serverUrl, onBack }: { serverUrl: string; onBack: () => void }) {
  const { t } = useTranslation();
  const [number, setNumber] = useState("");
  const [words, setWords] = useState<string[]>(() => Array(WORD_COUNT).fill(""));
  const pair = usePasswordPair();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const filled = words.filter((w) => w.trim()).length;
  const valid = number.length === 16 && filled === WORD_COUNT && pair.valid;

  const setWord = (i: number, raw: string) => {
    const parts = splitWords(raw);
    if (parts.length > 1) {
      // Pasting several words fills the following fields.
      setWords((prev) => {
        const next = prev.slice();
        parts.slice(0, WORD_COUNT - i).forEach((w, k) => (next[i + k] = w));
        return next;
      });
      const focus = Math.min(WORD_COUNT - 1, i + parts.length);
      requestAnimationFrame(() => refs.current[focus]?.focus());
      return;
    }
    setWords((prev) => prev.map((w, j) => (j === i ? raw.trim().toLowerCase() : w)));
  };

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.recover({
        server_url: serverUrl,
        number,
        mnemonic: words.map((w) => w.trim().toLowerCase()),
        new_password: pair.password,
        device_name: defaultDeviceName(),
      });
      await enterApp();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <form
      className="onb-stack"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <button type="button" className="back-link" onClick={onBack}>
        <Icon name="back" size={16} />
        {t("common.back")}
      </button>
      <div>
        <h2 className="onb-h2">{t("onboarding.recover.title")}</h2>
        <p className="onb-lead">{t("onboarding.recover.subtitle")}</p>
      </div>
      <AccountNumberInput label={t("onboarding.accountNumber")} value={number} onChange={setNumber} autoFocus size="lg" />
      <div className="field">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="field-label">{t("onboarding.recover.words")}</span>
          <span className="mono" style={{ fontSize: 12, color: filled === WORD_COUNT ? "var(--accent-text)" : "var(--muted)" }}>
            {filled}/{WORD_COUNT}
          </span>
        </div>
        <div className="field-desc" style={{ marginTop: -2 }}>
          {t("onboarding.recover.pasteHint")}
        </div>
        <div className="seed-grid">
          {words.map((w, i) => (
            <label className="seed-word" key={i}>
              <b>{i + 1}</b>
              <input
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={w}
                aria-label={t("onboarding.seed.wordN", { n: i + 1 })}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setWord(i, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if ((e.key === " " || e.key === "Enter") && w.trim()) {
                    e.preventDefault();
                    refs.current[i + 1]?.focus();
                  }
                }}
              />
            </label>
          ))}
        </div>
      </div>
      <PasswordPairFields pair={pair} size="lg" />
      {error && <div className="error-text">{error}</div>}
      <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
        <Icon name="key" size={18} />
        {t("onboarding.recover.submit")}
      </button>
    </form>
  );
}
