/**
 * Saved designs: a house together with the client it is for, so a commission (or a free
 * play house) can be picked up again later. They are kept in the browser's storage.
 */

import type { HouseJson } from "./model";

export interface SavedDesign {
  id: string;
  name: string;
  clientId: string;
  /** Milliseconds since 1970. */
  savedAt: number;
  house: HouseJson;
  /** A small picture of the house (data URL), if one was taken. */
  thumbnail?: string;
}
