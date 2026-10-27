import { useSyncExternalStore } from "react";
import en from "./messages/en.json";
import fr from "./messages/fr.json";

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_LABELS: Record<Locale, string> = { en: "English", fr: "Français" };
export const MESSAGES = { en, fr } as const;

const KEY = "stockwise.locale";
const listeners = new Set<() => void>();

function isLocale(v: unknown): v is Locale {
  return LOCALES.includes(v as Locale);
}

function current(): Locale {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLocale(saved)) return saved;
  } catch {}
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function setLocale(locale: Locale) {
  try {
    localStorage.setItem(KEY, locale);
  } catch {}
  document.documentElement.lang = locale;
  listeners.forEach((l) => l());
}

export function useLocale(): Locale {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => "en",
  );
}
