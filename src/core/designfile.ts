/**
 * Saved designs: a house together with the client it is for, so a commission can be
 * picked up again later, and the file format for exporting and importing them.
 */

import { clientById } from "./clients";
import { House, type HouseJson } from "./model";

export const DESIGN_FORMAT = "architect-design";
export const DESIGN_VERSION = 1;

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

/** A design as a file to download. */
export function designToFile(d: SavedDesign): string {
  return JSON.stringify({ format: DESIGN_FORMAT, version: DESIGN_VERSION, name: d.name, clientId: d.clientId, savedAt: d.savedAt, house: d.house, thumbnail: d.thumbnail }, null, 1);
}

/**
 * Read a design file, checking it is one and that its house and client make sense.
 * Returns null for anything else. The design gets the given new id.
 */
export function parseDesignFile(text: string, id: string): SavedDesign | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.format !== DESIGN_FORMAT || typeof d.version !== "number" || d.version > DESIGN_VERSION) return null;
  if (typeof d.name !== "string" || typeof d.clientId !== "string" || !clientById(d.clientId)) return null;
  const house = d.house as HouseJson | undefined;
  if (!house || !Array.isArray(house.walls) || !Array.isArray(house.openings) || typeof house.nextId !== "number") return null;
  try {
    // Must load as a house; reject files that do not.
    House.fromJSON(house).floorArea();
  } catch {
    return null;
  }
  return {
    id,
    name: d.name.slice(0, 120),
    clientId: d.clientId,
    savedAt: typeof d.savedAt === "number" ? d.savedAt : Date.now(),
    house,
    thumbnail: typeof d.thumbnail === "string" && d.thumbnail.startsWith("data:image/") ? d.thumbnail : undefined,
  };
}
