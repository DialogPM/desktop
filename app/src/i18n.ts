import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { BRAND_NAME } from "./brand";

/** Supported languages, in the order shown in Settings → Language and on the start screen.
 * Each one has a `locales/<code>.json`; the mobile app lists the same ones
 * (mobile/lib/l10n/i18n.dart, mobile/tool/gen_strings.py). */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ro", label: "Română" },
  { code: "it", label: "Italiano" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "tr", label: "Türkçe" },
  { code: "ru", label: "Русский" },
  { code: "uk", label: "Українська" },
  { code: "ar", label: "العربية" },
  { code: "fa", label: "فارسی" },
  { code: "hi", label: "हिन्दी" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "zh", label: "简体中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
] as const;

/** Languages written right to left: the whole window is mirrored (`dir` on <html>). */
const RTL: ReadonlySet<string> = new Set(["ar", "fa"]);

// Bundled with the app (no network): every locales/<code>.json, keyed by its code.
const files = import.meta.glob<Record<string, unknown>>("./locales/*.json", { eager: true, import: "default" });
const resources = Object.fromEntries(
  Object.entries(files).map(([path, translation]) => [path.slice("./locales/".length, -".json".length), { translation }]),
);

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "chatapp-language";

function detectLanguage(): LanguageCode {
  const supported = LANGUAGES.map((l) => l.code) as string[];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && supported.includes(saved)) return saved as LanguageCode;
  } catch {
    /* ignore */
  }
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l.slice(0, 2).toLowerCase();
    if (supported.includes(code)) return code as LanguageCode;
  }
  return "en";
}

export function setLanguage(code: LanguageCode) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
  void i18n.changeLanguage(code);
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: "en",
  // `{{appName}}` in any string is the brand name (src/brand.ts, generated from branding.json).
  interpolation: { escapeValue: false, defaultVariables: { appName: BRAND_NAME } },
  returnNull: false,
});

function applyDocumentLanguage(lng: string) {
  document.documentElement.lang = lng;
  document.documentElement.dir = RTL.has(lng) ? "rtl" : "ltr";
}
i18n.on("languageChanged", applyDocumentLanguage);
applyDocumentLanguage(i18n.language);

export default i18n;
