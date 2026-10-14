import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cssZoom, LIST_WIDTH, useAppearance } from "../../lib/appearance";

/**
 * Vertical drag handle between the chat list (or settings menu) pane and the main pane.
 * Drag to resize, double-click to reset, arrow keys for small steps. The width is kept in
 * the appearance prefs and applied as --list-w on .shell.
 */
export function PaneResizer() {
  const { t } = useTranslation();
  const width = useAppearance((s) => s.listWidth);
  const setWidth = useAppearance((s) => s.setListWidth);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; w: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // Start from the width actually shown (it can be capped on narrow windows).
    const pane = e.currentTarget.parentElement?.previousElementSibling as HTMLElement | null;
    const shown = pane ? pane.getBoundingClientRect().width / cssZoom() : width;
    start.current = { x: e.clientX, w: shown };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.dataset.resizing = "true";
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    setWidth(start.current.w + (e.clientX - start.current.x) / cssZoom());
  };

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    start.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    delete document.body.dataset.resizing;
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 16;
    if (e.key === "ArrowLeft") setWidth(width - step);
    else if (e.key === "ArrowRight") setWidth(width + step);
    else if (e.key === "Home") setWidth(LIST_WIDTH.min);
    else if (e.key === "End") setWidth(LIST_WIDTH.max);
    else return;
    e.preventDefault();
  };

  return (
    <div className="pane-resizer">
      <div
        className="pane-resizer-hit"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("layout.resizeList")}
        aria-valuemin={LIST_WIDTH.min}
        aria-valuemax={LIST_WIDTH.max}
        aria-valuenow={width}
        title={t("layout.resizeHint")}
        tabIndex={0}
        data-dragging={dragging}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={() => setWidth(null)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
