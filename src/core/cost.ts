/** Construction costs. */

import { analyzeLayout } from "./layout";
import { type FurnitureKind, PLANT_PRICE } from "./furniture";
import type { FenceStyle } from "./model";
import type { FloorFinish, House, OpeningKind, PaintColor, RoofMaterial, WallMaterial } from "./model";
import type { Plot } from "./plot";
import { analyzeHouse, voidArea } from "./rooms";
import { earthworks, exposedFoundationArea, foundationColumns, retainingArea, shapedGround, siteLevel } from "./site";
import { accessRoutes, routeLength } from "./access";
import { altanLayout, altanSteps, chimneyLength, doorApproaches, fenceLayout } from "./features";
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
  glassDoorBase: number;
  glassDoorM2: number;
  /** A passage: a lintel and trim round the opening. */
  passageBase: number;
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
  /** Per m² of balcony (floor and railing). */
  balconyM2: number;
  /** Per m² of terrace on the ground. */
  terraceM2: number;
  fireplace: number;
  chimneyM: number;
  /** Per dormer, plus per metre of its width. */
  dormerBase: number;
  dormerM: number;
  skylight: number;
  /** A column under a house on columns: its footing, and per metre of height. */
  column: number;
  columnM: number;
  /** A metre of fence, by style, and a garden gate. */
  fenceM: Record<FenceStyle, number>;
  gate: number;
  /** Per outside step, and per metre of ramp. */
  step: number;
  rampM: number;
  /** Per m² of painted wall (any colour but white). */
  paintM2: number;
  /** Per m³ of earth dug away or filled in to level the ground. */
  earthM3: number;
  /** Per m³ dug out for a basement. */
  basementDigM3: number;
  /** Per m² of a basement's outer walls (waterproof concrete). */
  basementWallM2: number;
  /** Per m² of stone retaining wall where the ground is cut or filled deep. */
  retainingWallM2: number;
  /** Per light well outside a basement window. */
  lightWell: number;
  /** Per m² of driveway (asphalt or gravel) and of paved path. */
  asphaltM2: number;
  gravelM2: number;
  pathM2: number;
  /** Per plant, by kind. */
  plants: Partial<Record<FurnitureKind, number>>;
}

export function defaultPrices(): PriceList {
  return {
    wallM2: { Wood: 120, FaluRed: 130, Brick: 220, Plaster: 150, Stone: 320, Concrete: 200 },
    interiorWallM2: 70,
    windowBase: 300,
    windowM2: 450,
    doorBase: 600,
    doorM2: 300,
    garageDoorBase: 1500,
    garageDoorM2: 250,
    glassDoorBase: 900,
    glassDoorM2: 520,
    passageBase: 250,
    roofM2: { Shingles: 60, Metal: 90, Tiles: 110 },
    floorM2: { Wood: 70, Laminate: 35, Tiles: 80, Stone: 140, Carpet: 30, Concrete: 15 },
    foundationM2: 180,
    upperFloorM2: 140,
    stairs: 3500,
    balconyM2: 900,
    terraceM2: 180,
    fireplace: 3_800,
    chimneyM: 450,
    dormerBase: 2_400,
    dormerM: 900,
    skylight: 1_300,
    fenceM: { Picket: 220, Board: 310 },
    column: 650,
    columnM: 380,
    gate: 1_400,
    step: 140,
    rampM: 260,
    paintM2: 8,
    earthM3: 55,
    basementDigM3: 45,
    basementWallM2: 160,
    retainingWallM2: 180,
    lightWell: 1_100,
    asphaltM2: 55,
    gravelM2: 22,
    pathM2: 45,
    plants: { ...PLANT_PRICE },
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
  /** Balconies, plants and paint. */
  extras: number;
  /** Levelling the ground, and the basement's hole and walls. */
  groundworks: number;
}

export function totalCost(c: CostBreakdown): number {
  return c.walls + c.interiorWalls + c.windows + c.doors + c.roof + c.foundation + c.floors + c.finishes + c.stairs + c.extras + c.groundworks;
}

/** The big groups of a cost breakdown. */
export type CostGroup = "facade" | "interiorWalls" | "openings" | "roof" | "floors" | "stairs" | "extras" | "groundworks" | "access";

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
  | { kind: "stairs" }
  | { kind: "balcony" }
  | { kind: "deck" }
  | { kind: "fireplace" }
  | { kind: "chimney" }
  | { kind: "dormer" }
  | { kind: "skylight" }
  | { kind: "steps" }
  | { kind: "ramp" }
  | { kind: "earthworks" }
  | { kind: "basementDig" }
  | { kind: "basementWalls" }
  | { kind: "retainingWalls" }
  | { kind: "exposedFoundation" }
  | { kind: "driveway"; surface: "asphalt" | "gravel" }
  | { kind: "footpath" }
  | { kind: "lightWells" }
  | { kind: "plant"; plant: FurnitureKind }
  | { kind: "fence"; style: FenceStyle }
  | { kind: "altan" }
  | { kind: "columns" }
  | { kind: "gate" }
  | { kind: "paint"; color: PaintColor };

/** One line of the breakdown: how much of what, and what it costs. */
export interface CostLine {
  group: CostGroup;
  what: CostWhat;
  /** m² for surfaces; a count for windows, doors and stairs. */
  quantity: number;
  unit: "m2" | "m3" | "m" | "pieces";
  amount: number;
}

/** The order the groups are listed in. */
export const COST_GROUPS: readonly CostGroup[] = ["facade", "roof", "floors", "openings", "interiorWalls", "stairs", "extras", "groundworks", "access"];

/**
 * Every cost of the house, line by line (each material, finish and kind of opening on its
 * own line), grouped into facade, interior walls, openings, roof, floors and stairs.
 * Lines that cost nothing are left out. Parts that cannot be built yet (an unclosed
 * footprint, an impossible roof) cost nothing; validation reports those separately.
 */
export function costLines(house: House, prices: PriceList, plot?: Plot): CostLine[] {
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
  const layouts = new Map(house.levelList().map((k) => [k, analyzeLayout(house, k)]));
  for (const wall of house.walls) {
    if (wall.boundary) continue; // room boundaries are not built
    const holes = house.openingsIn(wall.id).reduce((s, o) => s + o.area(), 0);
    const net = Math.max(wall.grossArea() - holes, 0);
    const layout = layouts.get(wall.level);
    if (layout?.ok && !layout.value.exterior.has(wall.id)) add("interiorWalls", { kind: "interiorWalls" }, net, "m2", net * prices.interiorWallM2);
    // A basement's outer walls hold back the earth: concrete, whatever they look like.
    else if (wall.level < 0) add("groundworks", { kind: "basementWalls" }, net, "m2", net * prices.basementWallM2);
    else add("facade", { kind: "facade", material: wall.material }, net, "m2", net * prices.wallM2[wall.material]);
  }

  for (const o of house.openings) {
    const [base, perM2] =
      o.kind === "Window"
        ? [prices.windowBase, prices.windowM2]
        : o.kind === "Door"
          ? [prices.doorBase, prices.doorM2]
          : o.kind === "GlassDoor"
            ? [prices.glassDoorBase, prices.glassDoorM2]
            : o.kind === "Passage"
              ? [prices.passageBase, 0]
              : [prices.garageDoorBase, prices.garageDoorM2];
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

  // The foundation goes under the lowest storey; every storey above stands on a floor structure.
  const lowest = house.lowestLevel();
  const ground = house.floorArea(lowest);
  add("floors", { kind: "foundation" }, ground, "m2", ground * prices.foundationM2);
  // (No floor where a storey opens up to the one below.)
  for (let k = lowest + 1; k < house.levels; k++) {
    const area = Math.max(house.floorArea(k) - voidArea(house, k), 0);
    add("floors", { kind: "upperFloors" }, area, "m2", area * prices.upperFloorM2);
  }

  // Levelling the ground for the house, and digging out the basement.
  const earth = plot ? earthworks(house, plot) : { cut: 0, fill: 0, basement: house.basement ? house.floorArea(-1) * house.basementDepth() : 0 };
  if (earth.cut + earth.fill > 0.05) add("groundworks", { kind: "earthworks" }, earth.cut + earth.fill, "m3", (earth.cut + earth.fill) * prices.earthM3);
  if (earth.basement > 0) add("groundworks", { kind: "basementDig" }, earth.basement, "m3", earth.basement * prices.basementDigM3);
  const retaining = plot ? retainingArea(house, plot) : 0;
  if (retaining > 0.05) add("groundworks", { kind: "retainingWalls" }, retaining, "m2", retaining * prices.retainingWallM2);
  const foundation = plot ? exposedFoundationArea(house, plot) : 0;
  if (foundation > 0.05) add("groundworks", { kind: "exposedFoundation" }, foundation, "m2", foundation * prices.basementWallM2);
  const columns = plot ? foundationColumns(house, plot) : [];
  if (columns.length) add("groundworks", { kind: "columns" }, columns.length, "pieces", columns.reduce((s, c) => s + prices.column + (c.top - c.ground) * prices.columnM, 0));

  // The driveway to each garage and the path to the front door, from the road.
  if (plot)
    for (const r of accessRoutes(house, plot).routes) {
      const m2 = routeLength(r) * r.width;
      if (r.kind === "path") add("access", { kind: "footpath" }, m2, "m2", m2 * prices.pathM2);
      else add("access", { kind: "driveway", surface: r.surface === "gravel" ? "gravel" : "asphalt" }, m2, "m2", m2 * (r.surface === "gravel" ? prices.gravelM2 : prices.asphaltM2));
    }
  // A window in a basement's outer wall looks out into a light well dug beside it.
  const basementLayout = layouts.get(-1);
  const wells = house.openings.filter((o) => o.kind === "Window" && house.levelOf(o.wall) === -1 && basementLayout?.ok && basementLayout.value.exterior.has(o.wall)).length;
  if (wells) add("groundworks", { kind: "lightWells" }, wells, "pieces", wells * prices.lightWell);
  for (const room of analyzeHouse(house).rooms) {
    if (room.type === "Void") continue;
    add("floors", { kind: "finish", finish: room.floor }, room.area, "m2", room.area * prices.floorM2[room.floor]);
  }
  if (house.stairs.length) add("stairs", { kind: "stairs" }, house.stairs.length, "pieces", house.stairs.length * prices.stairs);

  // Balconies, plants, and paint on the walls of coloured rooms.
  for (const b of house.balconies) {
    const m2 = b.width * b.depth;
    // On the ground floor a balcony is a terrace: a deck on the ground, much cheaper.
    if (house.wall(b.wall)?.level === 0) add("extras", { kind: "deck" }, m2, "m2", m2 * prices.terraceM2);
    else add("extras", { kind: "balcony" }, m2, "m2", m2 * prices.balconyM2);
  }
  // Fireplaces and their chimneys, and dormers.
  const fireplaces = house.furniture.filter((f) => f.kind === "Fireplace").length;
  if (fireplaces) {
    add("extras", { kind: "fireplace" }, fireplaces, "pieces", fireplaces * prices.fireplace);
    const length = chimneyLength(house);
    add("extras", { kind: "chimney" }, length, "m", length * prices.chimneyM);
  }
  for (const d of house.dormers) {
    if (d.skylight) add("roof", { kind: "skylight" }, 1, "pieces", prices.skylight + d.width * prices.dormerM * 0.3);
    else add("roof", { kind: "dormer" }, 1, "pieces", prices.dormerBase + d.width * prices.dormerM);
  }
  // Steps (or a ramp) up to raised outside doors.
  if (plot) {
    const ground = shapedGround(house, plot);
    for (const a of doorApproaches(house, siteLevel(house, plot) + 0.05, ground)) {
      if (a.ramp) add("access", { kind: "ramp" }, a.length, "m", a.length * prices.rampM);
      else add("access", { kind: "steps" }, a.steps, "pieces", a.steps * prices.step);
    }
  }
  for (const f of house.furniture) {
    const price = prices.plants[f.kind];
    if (price) add("extras", { kind: "plant", plant: f.kind }, 1, "pieces", price);
  }
  // The altan: its deck, and the steps down from it.
  const altan = altanLayout(house);
  if (altan) add("extras", { kind: "altan" }, altan.area, "m2", altan.area * prices.terraceM2);
  if (altan && plot) {
    const down = altanSteps(house, siteLevel(house, plot) + 0.05, shapedGround(house, plot));
    if (down) add("access", { kind: "steps" }, down.steps, "pieces", down.steps * prices.step);
  }
  if (house.fence && plot) {
    const fence = fenceLayout(house, plot);
    add("extras", { kind: "fence", style: house.fence }, fence.length, "m", fence.length * prices.fenceM[house.fence]);
    const gates = fence.gaps.filter((g) => g.gate).length;
    if (gates) add("extras", { kind: "gate" }, gates, "pieces", gates * prices.gate);
  }
  for (const room of analyzeHouse(house).rooms) {
    if (room.paint === "White") continue;
    const perimeter = room.polygon.reduce((s, p, i) => s + p.distance(room.polygon[(i + 1) % room.polygon.length]), 0);
    const m2 = perimeter * house.storeyHeight(room.level);
    add("extras", { kind: "paint", color: room.paint }, m2, "m2", m2 * prices.paintM2);
  }

  return [...lines.values()].filter((l) => l.amount > 0);
}

/** Price every component of the house, by kind. */
export function estimate(house: House, prices: PriceList, plot?: Plot): CostBreakdown {
  const c: CostBreakdown = { walls: 0, interiorWalls: 0, windows: 0, doors: 0, roof: 0, foundation: 0, floors: 0, finishes: 0, stairs: 0, extras: 0, groundworks: 0 };
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
    balcony: "extras",
    deck: "extras",
    fireplace: "extras",
    chimney: "extras",
    dormer: "roof",
    skylight: "roof",
    fence: "extras",
    altan: "extras",
    columns: "groundworks",
    gate: "extras",
    steps: "groundworks",
    ramp: "groundworks",
    plant: "extras",
    paint: "extras",
    earthworks: "groundworks",
    basementDig: "groundworks",
    basementWalls: "groundworks",
    retainingWalls: "groundworks",
    exposedFoundation: "groundworks",
    driveway: "groundworks",
    footpath: "groundworks",
    lightWells: "groundworks",
  };
  for (const l of costLines(house, prices, plot)) {
    c[l.what.kind === "opening" && (l.what.opening === "Window" || l.what.opening === "GlassDoor") ? "windows" : field[l.what.kind]] += l.amount;
  }
  return c;
}
