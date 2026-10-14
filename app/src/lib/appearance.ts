// Visual preferences kept on this device: design direction (A "classic warm" or
// B "floating panels"), color theme (light, dark or following the system), whether
// notifications show the message text, text size and the width of the chat list pane.
// Direction and theme are applied as data attributes on <html>, where the design tokens
// in styles/tokens.css pick them up. Text size is applied as webview zoom (Tauri) or CSS zoom.

import { create } from "zustand";
import { IS_TAURI } from "./api";

export type Direction = "A" | "B";
export type ThemePref = "light" | "dark" | "auto";
export type Scheme = "light" | "dark";

/** Text size choices (zoom factor of the whole UI). */
export const TEXT_SCALES = [0.85, 1, 1.15, 1.3] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

/** Chat list pane width on desktop (px), see layout/PaneResizer. */
export const LIST_WIDTH = { min: 280, max: 560, default: 372 } as const;

export function clampListWidth(w: number): number {
  return Math.round(Math.min(LIST_WIDTH.max, Math.max(LIST_WIDTH.min, w)));
}

const KEY = "chatapp-appearance";
const LEGACY_SCHEME_KEY = "chatapp-color-scheme";

interface Stored {
  direction: Direction;
  theme: ThemePref;
  notifPreview: boolean;
  textScale: TextScale;
  listWidth: number;
}

function load(): Stored {
  const out: Stored = { direction: "A", theme: "auto", notifPreview: false, textScale: 1, listWidth: LIST_WIDTH.default };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Stored>;
      if (v.direction === "A" || v.direction === "B") out.direction = v.direction;
      if (v.theme === "light" || v.theme === "dark" || v.theme === "auto") out.theme = v.theme;
      if (typeof v.notifPreview === "boolean") out.notifPreview = v.notifPreview;
      if (TEXT_SCALES.includes(v.textScale as TextScale)) out.textScale = v.textScale as TextScale;
      if (typeof v.listWidth === "number" && Number.isFinite(v.listWidth)) out.listWidth = clampListWidth(v.listWidth);
    } else {
      // Carry over the color scheme chosen with the previous UI.
      const legacy = localStorage.getItem(LEGACY_SCHEME_KEY);
      if (legacy === "light" || legacy === "dark" || legacy === "auto") out.theme = legacy;
    }
  } catch {
    /* storage unavailable: defaults */
  }
  return out;
}

function save(v: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function resolve(theme: ThemePref, systemDark: boolean): Scheme {
  return theme === "auto" ? (systemDark ? "dark" : "light") : theme;
}

interface AppearanceStore extends Stored {
  systemDark: boolean;
  /** Theme actually shown. */
  scheme: Scheme;
  setDirection: (d: Direction) => void;
  setTheme: (t: ThemePref) => void;
  /** Flips between light and dark (used by the quick toggle buttons). */
  toggleScheme: () => void;
  setNotifPreview: (v: boolean) => void;
  setTextScale: (v: TextScale) => void;
  /** Width of the chat list / settings menu pane; pass null to reset to the default. */
  setListWidth: (w: number | null) => void;
}

const initial = load();
const initialDark = media?.matches ?? false;

export const useAppearance = create<AppearanceStore>()((set, get) => {
  const update = (patch: Partial<Stored & { systemDark: boolean }>) => {
    const s = { ...get(), ...patch };
    const next = { ...patch, scheme: resolve(s.theme, s.systemDark) };
    set(next);
    save({ direction: s.direction, theme: s.theme, notifPreview: s.notifPreview, textScale: s.textScale, listWidth: s.listWidth });
  };
  return {
    ...initial,
    systemDark: initialDark,
    scheme: resolve(initial.theme, initialDark),
    setDirection: (direction) => update({ direction }),
    setTheme: (theme) => update({ theme }),
    toggleScheme: () => update({ theme: get().scheme === "dark" ? "light" : "dark" }),
    setNotifPreview: (notifPreview) => update({ notifPreview }),
    setTextScale: (textScale) => update({ textScale }),
    setListWidth: (w) => update({ listWidth: w === null ? LIST_WIDTH.default : clampListWidth(w) }),
  };
});

export const getAppearance = useAppearance.getState;

let appliedScale: number | null = null;

/**
 * Zoom factor applied with CSS `zoom` on <html> (browser / mock mode), 1 otherwise.
 * Pointer coordinates are not scaled by CSS zoom, so code that converts mouse
 * movements into CSS pixels divides by this.
 */
export function cssZoom(): number {
  return IS_TAURI ? 1 : (appliedScale ?? 1);
}

function applyTextScale(scale: number) {
  if (scale === appliedScale) return;
  appliedScale = scale;
  const root = document.documentElement;
  if (IS_TAURI) {
    // Real page zoom of the webview: layout, viewport units and events all stay consistent.
    void import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(scale))
      .catch(() => undefined);
    return;
  }
  root.style.setProperty("zoom", scale === 1 ? "" : String(scale));
  // Viewport units are multiplied by the zoom too; the layout and onboarding stylesheets divide by this.
  root.style.setProperty("--app-zoom", String(scale));
}

function apply() {
  const { direction, scheme, textScale } = useAppearance.getState();
  const root = document.documentElement;
  root.dataset.direction = direction;
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;
  applyTextScale(textScale);
}

if (typeof document !== "undefined") {
  apply();
  useAppearance.subscribe(apply);
  media?.addEventListener("change", (e) => {
    const s = useAppearance.getState();
    useAppearance.setState({ systemDark: e.matches, scheme: resolve(s.theme, e.matches) });
  });
}

/** Deterministic avatar hue (0-359) for an id, used by the oklch avatar colors. */
export function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
