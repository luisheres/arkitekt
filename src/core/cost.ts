/** Construction costs. */

import { analyzeLayout } from "./layout";
import type { FloorFinish, House, OpeningKind, RoofMaterial, WallMaterial } from "./model";
import { analyzeHouse } from "./rooms";
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
  /** Per m² of floor finish. */
  floorM2: Record<FloorFinish, number>;
  /** Per m² of ground-floor area. */
  foundationM2: number;
  /** Per m² of upper-storey floor (the structure between storeys). */
  upperFloorM2: number;
  /** Per flight of stairs. */
  stairs: number;
}

export function defaultPrices(): PriceList {
  return {
    wallM2: { Wood: 120, FaluRed: 130, Brick: 220, Plaster: 150, Stone: 320 },
    interiorWallM2: 70,
    windowBase: 300,
    windowM2: 450,
    doorBase: 600,
    doorM2: 300,
    garageDoorBase: 1500,
    garageDoorM2: 250,
    roofM2: { Shingles: 60, Metal: 90, Tiles: 110 },
    floorM2: { Wood: 70, Laminate: 35, Tiles: 80, Stone: 140, Carpet: 30, Concrete: 15 },
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
  /** Floor finishes in every room. */
  finishes: number;
  stairs: number;
}

export function totalCost(c: CostBreakdown): number {
  return c.walls + c.interiorWalls + c.windows + c.doors + c.roof + c.foundation + c.floors + c.finishes + c.stairs;
}

/** The big groups of a cost breakdown. */
export type CostGroup = "facade" | "interiorWalls" | "openings" | "roof" | "floors" | "stairs";

/** What a line of the breakdown pays for. */
export type CostWhat =
  | { kind: "facade"; material: WallMaterial }
  | { kind: "interiorWalls" }
  | { kind: "opening"; opening: OpeningKind }
  | { kind: "roofCovering"; material: RoofMaterial }
  | { kind: "terrace"; material: RoofMaterial }
  | { kind: "foundation" }
  | { kind: "upperFloors" }
  | { kind: "finish"; finish: FloorFinish }
  | { kind: "stairs" };

/** One line of the breakdown: how much of what, and what it costs. */
export interface CostLine {
  group: CostGroup;
  what: CostWhat;
  /** m² for surfaces; a count for windows, doors and stairs. */
  quantity: number;
  unit: "m2" | "pieces";
  amount: number;
}

/** The order the groups are listed in. */
export const COST_GROUPS: readonly CostGroup[] = ["facade", "roof", "floors", "openings", "interiorWalls", "stairs"];

/**
 * Every cost of the house, line by line (each material, finish and kind of opening on its
 * own line), grouped into facade, interior walls, openings, roof, floors and stairs.
 * Lines that cost nothing are left out. Parts that cannot be built yet (an unclosed
 * footprint, an impossible roof) cost nothing; validation reports those separately.
 */
export function costLines(house: House, prices: PriceList): CostLine[] {
  const lines = new Map<string, CostLine>();
  const add = (group: CostGroup, what: CostWhat, quantity: number, unit: CostLine["unit"], amount: number) => {
    const key = JSON.stringify(what);
    const line = lines.get(key);
    if (line) {
      line.quantity += quantity;
      line.amount += amount;
    } else lines.set(key, { group, what, quantity, unit, amount });
  };

  // Until a storey's walls enclose something, every wall is priced as an exterior wall.
  const layouts = Array.from({ length: house.levels }, (_, k) => analyzeLayout(house, k));
  for (const wall of house.walls) {
    if (wall.boundary) continue; // room boundaries are not built
    const holes = house.openingsIn(wall.id).reduce((s, o) => s + o.area(), 0);
    const net = Math.max(wall.grossArea() - holes, 0);
    const layout = layouts[wall.level];
    if (layout?.ok && !layout.value.exterior.has(wall.id)) add("interiorWalls", { kind: "interiorWalls" }, net, "m2", net * prices.interiorWallM2);
    else add("facade", { kind: "facade", material: wall.material }, net, "m2", net * prices.wallM2[wall.material]);
  }

  for (const o of house.openings) {
    const [base, perM2] =
      o.kind === "Window" ? [prices.windowBase, prices.windowM2] : o.kind === "Door" ? [prices.doorBase, prices.doorM2] : [prices.garageDoorBase, prices.garageDoorM2];
    add("openings", { kind: "opening", opening: o.kind }, 1, "pieces", base + o.area() * perM2);
  }

  const geom = buildRoof(house);
  if (house.roof && geom.ok) {
    const covering = coveringArea(geom.value);
    add("roof", { kind: "roofCovering", material: house.roof.material }, covering, "m2", covering * prices.roofM2[house.roof.material]);
  }
  // Where a storey is larger than the one above it, its slab is a flat roof (a terrace).
  for (let k = 0; k < house.topLevel(); k++) {
    const exposed = Math.max(house.floorArea(k) - house.floorArea(k + 1), 0);
    const material = house.roof?.material ?? "Metal";
    add("roof", { kind: "terrace", material }, exposed, "m2", exposed * prices.roofM2[material]);
  }

  const ground = house.floorArea(0);
  add("floors", { kind: "foundation" }, ground, "m2", ground * prices.foundationM2);
  for (let k = 1; k < house.levels; k++) add("floors", { kind: "upperFloors" }, house.floorArea(k), "m2", house.floorArea(k) * prices.upperFloorM2);
  for (const room of analyzeHouse(house).rooms) add("floors", { kind: "finish", finish: room.floor }, room.area, "m2", room.area * prices.floorM2[room.floor]);
  if (house.stairs.length) add("stairs", { kind: "stairs" }, house.stairs.length, "pieces", house.stairs.length * prices.stairs);

  return [...lines.values()].filter((l) => l.amount > 0);
}

/** Price every component of the house, by kind. */
export function estimate(house: House, prices: PriceList): CostBreakdown {
  const c: CostBreakdown = { walls: 0, interiorWalls: 0, windows: 0, doors: 0, roof: 0, foundation: 0, floors: 0, finishes: 0, stairs: 0 };
  const field: Record<CostWhat["kind"], keyof CostBreakdown> = {
    facade: "walls",
    interiorWalls: "interiorWalls",
    opening: "doors",
    roofCovering: "roof",
    terrace: "roof",
    foundation: "foundation",
    upperFloors: "floors",
    finish: "finishes",
    stairs: "stairs",
  };
  for (const l of costLines(house, prices)) {
    c[l.what.kind === "opening" && l.what.opening === "Window" ? "windows" : field[l.what.kind]] += l.amount;
  }
  return c;
}
