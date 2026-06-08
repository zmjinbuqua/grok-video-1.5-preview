import ko from "./ko.json";
import en from "./en.json";
import zhCN from "./zh-CN.json";
import { useAppStore } from "../store/useAppStore";

export type Locale = "ko" | "en" | "zh-CN";

const dictionaries = { ko, en, "zh-CN": zhCN } as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;

function getPath(obj: AnyRec, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => {
    if (o == null) return undefined;
    return (o as AnyRec)[k];
  }, obj);
}

function format(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{(\w+)\}/g, (_m, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

/**
 * Module-level translator: works outside React components (e.g. inside zustand
 * store actions, timers, async callbacks). Reads the current locale from the
 * store at call time so switching languages re-translates without caching stale
 * strings.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const locale = useAppStore.getState().locale;
  return translate(locale, key, vars);
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const primary = getPath(dictionaries[locale], key);
  const fallback =
    typeof primary === "string" ? primary : getPath(dictionaries.en, key);
  const raw = typeof fallback === "string" ? fallback : key;
  return vars ? format(raw, vars) : raw;
}

/**
 * React hook for components. Re-renders on locale change.
 */
export function useI18n() {
  const locale = useAppStore((s) => s.locale);
  return {
    locale,
    t: (key: string, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
  };
}

export const SUPPORTED_LOCALES: readonly Locale[] = ["zh-CN", "ko", "en"];

export function loadLocale(): Locale {
  try {
    const raw = localStorage.getItem("ima2.locale");
    const userSet = localStorage.getItem("ima2.locale.userSet") === "1";
    if (raw === "zh-CN") return raw;
    if (!userSet && raw === "en") return "zh-CN";
    if (raw === "ko" || raw === "en") return raw;
  } catch {
    /* storage disabled */
  }

  if (typeof navigator !== "undefined") {
    const nav = navigator.language || "";
    if (nav.toLowerCase().startsWith("zh")) return "zh-CN";
    if (nav.toLowerCase().startsWith("ko")) return "ko";
  }
  return "zh-CN";
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem("ima2.locale", locale);
    localStorage.setItem("ima2.locale.userSet", "1");
  } catch {
    /* storage disabled */
  }
}
