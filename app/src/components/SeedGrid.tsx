import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon";

/** The 24 recovery words in a 3-column grid, blurred until "Show phrase" is pressed. */
export function SeedGrid({ words, onReveal }: { words: string[]; onReveal?: () => void }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <div className="seed-wrap">
      <div className="seed-grid" data-hidden={!shown} data-testid="seed-grid" aria-hidden={!shown}>
        {words.map((w, i) => (
          <div className="seed-word" key={i}>
            <b>{i + 1}</b>
            <span>{w}</span>
          </div>
        ))}
      </div>
      {!shown && (
        <div className="seed-reveal">
          <button
            type="button"
            onClick={() => {
              setShown(true);
              onReveal?.();
            }}
          >
            <Icon name="eye" size={17} />
            {t("onboarding.seed.reveal")}
          </button>
        </div>
      )}
    </div>
  );
}
