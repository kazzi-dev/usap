import type { LanguageCode } from "@usap/shared";

export interface LanguageOption {
  code: LanguageCode;
  /** English name. */
  label: string;
  /** Name in the language itself, so people recognize their own. */
  native: string;
}

// `satisfies` makes TypeScript fail if a LanguageCode is ever missing here.
const OPTIONS = {
  en: { code: "en", label: "English", native: "English" },
  tl: { code: "tl", label: "Tagalog", native: "Tagalog" },
  ceb: { code: "ceb", label: "Cebuano", native: "Bisaya" },
  ja: { code: "ja", label: "Japanese", native: "日本語" },
} satisfies Record<LanguageCode, LanguageOption>;

export const LANGUAGE_OPTIONS: LanguageOption[] = Object.values(OPTIONS);

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  typeof value === "string" && value in OPTIONS;

export const languageLabel = (code: LanguageCode | null | undefined): string =>
  code ? `${OPTIONS[code].label}` : "";

/** First-visit default, from the browser's language settings. */
export function guessLanguage(): LanguageCode {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "ja") return "ja";
    if (base === "fil" || base === "tl") return "tl";
    if (base === "ceb") return "ceb";
    if (base === "en") return "en";
  }
  return "en";
}
