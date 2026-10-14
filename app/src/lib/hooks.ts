import { useMediaQuery } from "@mantine/hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** Phone-sized layout: one pane at a time. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)", window.matchMedia("(max-width: 767px)").matches, {
    getInitialValueInEffect: false,
  });
}

export function useLocale(): string {
  const { i18n } = useTranslation();
  return i18n.language;
}

/** Re-renders periodically (for relative times such as "last seen"). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Long press for touch devices. Returns pointer handlers; `onLongPress` gets the
 * pointer position. Mouse input is ignored (right click is used on desktop).
 */
export function useLongPress(onLongPress: (x: number, y: number) => void, ms = 450) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      const { clientX, clientY } = e;
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(15);
        onLongPress(clientX, clientY);
      }, ms);
    },
    [ms, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current) return;
      if (Math.abs(e.clientX - start.current.x) > 10 || Math.abs(e.clientY - start.current.y) > 10) clear();
    },
    [clear],
  );

  /** Call from onClick to suppress the click that follows a long press. */
  const consumeClick = useCallback(() => {
    if (fired.current) {
      fired.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp: clear, onPointerCancel: clear, onPointerLeave: clear },
    consumeClick,
  };
}
