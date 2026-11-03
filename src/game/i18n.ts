/**
 * The language the game is shown in, chosen once per page load: a saved choice, else
 * the browser's preferred language. Changing it saves and reloads the page.
 */

import { type Lang, LANGS, type Messages, messages, pickLang } from "../core";

const KEY = "architect.lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && (LANGS as readonly string[]).includes(saved)) return saved as Lang;
  } catch {
    // Storage unavailable: fall back to the browser's language.
  }
  return pickLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

export const lang: Lang = initialLang();

/** The current language's messages. */
export const m: Messages = messages(lang);

/** Switch language: remember the choice and reload so every view is rebuilt in it. */
export function setLang(next: Lang, beforeReload: () => void): void {
  if (next === lang) return;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    return; // Without storage the choice could not survive the reload.
  }
  beforeReload();
  location.reload();
}

type UiKey = { [K in keyof Messages["ui"]]: Messages["ui"][K] extends string ? K : never }[keyof Messages["ui"]];

/**
 * Translate the static page: `data-i18n` sets text, `data-i18n-html` sets markup,
 * `data-i18n-title` and `data-i18n-label` set the title and aria-label. Values are keys
 * of `Messages["ui"]`.
 */
export function translatePage(root: ParentNode = document): void {
  document.documentElement.lang = lang;
  document.title = m.ui.title;
  const text = (key: string | undefined) => (key ? (m.ui[key as UiKey] ?? key) : "");
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = text(el.dataset.i18n);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-html]")) el.innerHTML = text(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-title]")) el.title = text(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-label]")) el.setAttribute("aria-label", text(el.dataset.i18nLabel));
}
