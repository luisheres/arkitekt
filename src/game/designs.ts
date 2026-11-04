/**
 * Saved designs, kept in the browser's local storage. Saving can fail when storage is
 * full or unavailable; callers report that to the player.
 */

import type { SavedDesign } from "../core";

const KEY = "architect.designs.v1";

export function listDesigns(): SavedDesign[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedDesign[]) : [];
    return list.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** Add or replace a design (by id). Throws when the browser cannot store it. */
export function putDesign(d: SavedDesign): void {
  const others = listDesigns().filter((x) => x.id !== d.id);
  localStorage.setItem(KEY, JSON.stringify([d, ...others]));
}

export function deleteDesign(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(listDesigns().filter((x) => x.id !== id)));
  } catch {
    // Nothing to do: the list stays as it was.
  }
}

export function newDesignId(): string {
  return `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
