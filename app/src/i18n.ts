import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { BRAND_NAME } from "./brand";
import en from "./locales/en.json";
import it from "./locales/it.json";
import ro from "./locales/ro.json";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ro", label: "Română" },
  { code: "it", label: "Italiano" },
] as const;

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
  resources: { en: { translation: en }, ro: { translation: ro }, it: { translation: it } },
  lng: detectLanguage(),
  fallbackLng: "en",
  // `{{appName}}` in any string is the brand name (src/brand.ts, generated from branding.json).
  interpolation: { escapeValue: false, defaultVariables: { appName: BRAND_NAME } },
  returnNull: false,
});

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export default i18n;
