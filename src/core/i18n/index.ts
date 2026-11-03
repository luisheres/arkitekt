/** Languages: message catalogs and number formatting. */

import { en } from "./en";
import { sv } from "./sv";
import { LANGS, type Lang, type Messages } from "./types";

export * from "./format";
export * from "./types";
export { en, sv };

const CATALOGS: Record<Lang, Messages> = { en, sv };

export function messages(lang: Lang): Messages {
  return CATALOGS[lang];
}

/** The best supported language for a list of preferred locales, e.g. `navigator.languages`. */
export function pickLang(preferred: readonly string[]): Lang {
  for (const p of preferred) {
    const base = p.toLowerCase().split("-")[0] as Lang;
    if ((LANGS as readonly string[]).includes(base)) return base;
  }
  return "en";
}
