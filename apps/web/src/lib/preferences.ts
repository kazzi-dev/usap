import type { LanguageCode } from "@usap/shared";
import { guessLanguage, isLanguageCode } from "./languages";

const NAME_KEY = "usap:name";
const LANGUAGE_KEY = "usap:lang";

// localStorage can throw (private mode, blocked storage), so never let it break the app.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export const loadDisplayName = (): string => read(NAME_KEY) ?? "";
export const saveDisplayName = (name: string): void => write(NAME_KEY, name);

export function loadLanguage(): LanguageCode {
  const saved = read(LANGUAGE_KEY);
  return isLanguageCode(saved) ? saved : guessLanguage();
}
export const saveLanguage = (lang: LanguageCode): void => write(LANGUAGE_KEY, lang);
