import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon";

interface Props {
  title: ReactNode;
  onBack?: () => void;
  /** Show an "X" instead of an arrow. */
  close?: boolean;
  right?: ReactNode;
}

/** 66px header of secondary panes (info, settings content, new chat...). */
export function PaneHeader({ title, onBack, close, right }: Props) {
  const { t } = useTranslation();
  return (
    <div className="pane-head" data-compact={!!onBack}>
      {onBack && (
        <button type="button" className="icon-btn" data-size="40" onClick={onBack} aria-label={close ? t("common.close") : t("common.back")}>
          <Icon name={close ? "x" : "back"} size={close ? 20 : 21} />
        </button>
      )}
      <div className="pane-head-title truncate">{title}</div>
      {right}
    </div>
  );
}
