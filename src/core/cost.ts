/** Construction costs. */

import { analyzeLayout } from "./layout";
import type { House, RoofMaterial, WallMaterial } from "./model";
import { buildRoof, coveringArea } from "./roof";

/** Unit prices for building components. Money is in whole currency units. */
export interface PriceList {
  /** Per m² of net wall face (openings subtracted). */
  wallM2: Record<WallMaterial, number>;
  /** Per m² of interior partition wall (both faces finished). */
  interiorWallM2: number;
  windowBase: number;
  windowM2: number;
  doorBase: number;
  doorM2: number;
  garageDoorBase: number;
  garageDoorM2: number;
  /** Per m² of roof covering. */
  roofM2: Record<RoofMaterial, number>;
  /** Per m² of ground-floor area. */
  foundationM2: number;
  /** Per m² of upper-storey floor (the structure between storeys). */
  upperFloorM2: number;
  /** Per flight of stairs. */
  stairs: number;
}

export function defaultPrices(): PriceList {
  return {
    wallM2: { Wood: 120, Brick: 220, Plaster: 150 },
    interiorWallM2: 70,
    windowBase: 300,
    windowM2: 450,
    doorBase: 600,
    doorM2: 300,
    garageDoorBase: 1500,
    garageDoorM2: 250,
    roofM2: { Shingles: 60, Metal: 90, Tiles: 110 },
    foundationM2: 180,
    upperFloorM2: 140,
    stairs: 3500,
  };
}

export interface CostBreakdown {
  walls: number;
  interiorWalls: number;
  windows: number;
  doors: number;
  roof: number;
  foundation: number;
  /** Floors of the upper storeys. */
  floors: number;
  stairs: number;
}

export function totalCost(c: CostBreakdown): number {
  return c.walls + c.interiorWalls + c.windows + c.doors + c.roof + c.foundation + c.floors + c.stairs;
}

/**
 * Price every component of the house. Parts that cannot be built yet (an unclosed
 * footprint, an impossible roof) cost nothing; validation reports those separately.
 */
export function estimate(house: House, prices: PriceList): CostBreakdown {
  const c: CostBreakdown = { walls: 0, interiorWalls: 0, windows: 0, doors: 0, roof: 0, foundation: 0, floors: 0, stairs: 0 };

  // Until a storey's walls enclose something, every wall is priced as an exterior wall.
  const layouts = Array.from({ length: house.levels }, (_, k) => analyzeLayout(house, k));
  for (const wall of house.walls) {
    if (wall.boundary) continue; // room boundaries are not built
    const holes = house.openingsIn(wall.id).reduce((s, o) => s + o.area(), 0);
    const net = Math.max(wall.grossArea() - holes, 0);
    const layout = layouts[wall.level];
    if (layout?.ok && !layout.value.exterior.has(wall.id)) c.interiorWalls += net * prices.interiorWallM2;
    else c.walls += net * prices.wallM2[wall.material];
  }

  for (const o of house.openings) {
    if (o.kind === "Window") c.windows += prices.windowBase + o.area() * prices.windowM2;
    else if (o.kind === "Door") c.doors += prices.doorBase + o.area() * prices.doorM2;
    else c.doors += prices.garageDoorBase + o.area() * prices.garageDoorM2;
  }

  const geom = buildRoof(house);
  if (house.roof && geom.ok) c.roof = coveringArea(geom.value) * prices.roofM2[house.roof.material];
  // Where a storey is larger than the one above it, its slab is a flat roof (a terrace).
  for (let k = 0; k < house.topLevel(); k++) {
    const exposed = Math.max(house.floorArea(k) - house.floorArea(k + 1), 0);
    c.roof += exposed * prices.roofM2[house.roof?.material ?? "Metal"];
  }

  c.foundation = house.floorArea(0) * prices.foundationM2;
  for (let k = 1; k < house.levels; k++) c.floors += house.floorArea(k) * prices.upperFloorM2;
  c.stairs = house.stairs.length * prices.stairs;
  return c;
}
