/**
 * The campaign's progression: building techniques bought with the money you earn, and
 * client tiers opened by your reputation (the stars clients give you).
 *
 * You start with a basic kit (wood and plaster facades, gable roofs with shingles, a few
 * floor finishes, one storey). Everything else is a technique in the Workshop, with a
 * price and sometimes another technique it builds on. Free play has every technique.
 */

import type { Requirement } from "./brief";
import type { PriceList } from "./cost";
import {
  FLOOR_FINISHES,
  type FloorFinish,
  type House,
  ROOF_MATERIALS,
  ROOF_STYLES,
  type RoofMaterial,
  type RoofStyle,
  WALL_MATERIALS,
  type WallMaterial,
} from "./model";
import { GARDEN_PLANTS, INDOOR_PLANTS } from "./furniture";
import { Vec2, pointInPolygon } from "./geometry";
import { analyzeHouse } from "./rooms";

export const TECHNIQUE_IDS = [
  "faluRed",
  "brick",
  "stone",
  "hipRoof",
  "metalRoof",
  "flatRoof",
  "tileRoof",
  "woodFloor",
  "stoneFloor",
  "concrete",
  "paint",
  "houseplants",
  "landscaping",
  "openPlan",
  "garage",
  "twoStoreys",
  "threeStoreys",
  "balconies",
  "basement",
  "doubleHeight",
  "glassDoors",
  "fireplace",
  "terraces",
  "dormers",
  "skylights",
  "prefab",
  "carpenters",
  "marketing",
  "bulkBuying",
] as const;
export type TechniqueId = (typeof TECHNIQUE_IDS)[number];

export type Branch = "facades" | "roofs" | "floors" | "interiors" | "garden" | "structure" | "business";
export const BRANCHES: readonly Branch[] = ["facades", "roofs", "floors", "interiors", "garden", "structure", "business"];

/** What a technique makes possible. */
export type Unlock =
  | { kind: "wall"; material: WallMaterial }
  | { kind: "roofStyle"; style: RoofStyle }
  | { kind: "roofMaterial"; material: RoofMaterial }
  | { kind: "floor"; finish: FloorFinish }
  | { kind: "storeys"; count: number }
  | { kind: "garageDoors" }
  | { kind: "openPlan" }
  /** Painting rooms other colours than white. */
  | { kind: "paint" }
  /** Plants in pots indoors. */
  | { kind: "houseplants" }
  /** Trees, shrubs, flower beds and hedges in the garden. */
  | { kind: "garden" }
  | { kind: "balconies" }
  | { kind: "basement" }
  /** Openings in a floor, for double-height rooms below. */
  | { kind: "doubleHeight" }
  | { kind: "glassDoors" }
  | { kind: "fireplace" }
  | { kind: "terraces" }
  | { kind: "dormers" }
  | { kind: "skylights" }
  /** Cheaper parts: a share off what they cost. */
  | { kind: "discount"; on: "walls" | "floors" | "all"; share: number }
  /** A larger fee: this many percentage points of the budget on top. */
  | { kind: "fee"; points: number };

export interface Technique {
  id: TechniqueId;
  branch: Branch;
  price: number;
  requires?: TechniqueId;
  unlocks: Unlock;
}

export const TECHNIQUES: readonly Technique[] = [
  { id: "faluRed", branch: "facades", price: 3_000, unlocks: { kind: "wall", material: "FaluRed" } },
  { id: "brick", branch: "facades", price: 8_000, unlocks: { kind: "wall", material: "Brick" } },
  { id: "stone", branch: "facades", price: 30_000, requires: "brick", unlocks: { kind: "wall", material: "Stone" } },
  { id: "concrete", branch: "facades", price: 10_000, unlocks: { kind: "wall", material: "Concrete" } },
  { id: "paint", branch: "interiors", price: 2_500, unlocks: { kind: "paint" } },
  { id: "houseplants", branch: "interiors", price: 2_000, unlocks: { kind: "houseplants" } },
  { id: "landscaping", branch: "garden", price: 5_000, unlocks: { kind: "garden" } },
  { id: "hipRoof", branch: "roofs", price: 3_000, unlocks: { kind: "roofStyle", style: "Hip" } },
  { id: "metalRoof", branch: "roofs", price: 4_000, unlocks: { kind: "roofMaterial", material: "Metal" } },
  { id: "flatRoof", branch: "roofs", price: 8_000, requires: "metalRoof", unlocks: { kind: "roofStyle", style: "Flat" } },
  { id: "tileRoof", branch: "roofs", price: 15_000, unlocks: { kind: "roofMaterial", material: "Tiles" } },
  { id: "woodFloor", branch: "floors", price: 4_000, unlocks: { kind: "floor", finish: "Wood" } },
  { id: "stoneFloor", branch: "floors", price: 18_000, unlocks: { kind: "floor", finish: "Stone" } },
  { id: "openPlan", branch: "structure", price: 4_000, unlocks: { kind: "openPlan" } },
  { id: "garage", branch: "structure", price: 6_000, unlocks: { kind: "garageDoors" } },
  { id: "twoStoreys", branch: "structure", price: 9_000, unlocks: { kind: "storeys", count: 2 } },
  { id: "threeStoreys", branch: "structure", price: 40_000, requires: "twoStoreys", unlocks: { kind: "storeys", count: 3 } },
  { id: "balconies", branch: "structure", price: 12_000, requires: "twoStoreys", unlocks: { kind: "balconies" } },
  { id: "basement", branch: "structure", price: 14_000, unlocks: { kind: "basement" } },
  { id: "doubleHeight", branch: "structure", price: 10_000, requires: "twoStoreys", unlocks: { kind: "doubleHeight" } },
  { id: "glassDoors", branch: "structure", price: 4_000, unlocks: { kind: "glassDoors" } },
  { id: "fireplace", branch: "interiors", price: 6_000, unlocks: { kind: "fireplace" } },
  { id: "terraces", branch: "garden", price: 3_500, unlocks: { kind: "terraces" } },
  { id: "dormers", branch: "roofs", price: 7_000, unlocks: { kind: "dormers" } },
  { id: "skylights", branch: "roofs", price: 3_000, unlocks: { kind: "skylights" } },
  { id: "prefab", branch: "business", price: 12_000, unlocks: { kind: "discount", on: "walls", share: 0.1 } },
  { id: "carpenters", branch: "business", price: 14_000, unlocks: { kind: "discount", on: "floors", share: 0.1 } },
  { id: "marketing", branch: "business", price: 25_000, unlocks: { kind: "fee", points: 2 } },
  { id: "bulkBuying", branch: "business", price: 50_000, requires: "prefab", unlocks: { kind: "discount", on: "all", share: 0.05 } },
];

export const technique = (id: TechniqueId): Technique => TECHNIQUES.find((t) => t.id === id)!;

/** What can be built, from the starter kit and the techniques learned. */
export interface Abilities {
  walls: ReadonlySet<WallMaterial>;
  roofStyles: ReadonlySet<RoofStyle>;
  roofMaterials: ReadonlySet<RoofMaterial>;
  floors: ReadonlySet<FloorFinish>;
  maxStoreys: number;
  garageDoors: boolean;
  openPlan: boolean;
  paint: boolean;
  houseplants: boolean;
  garden: boolean;
  balconies: boolean;
  basement: boolean;
  doubleHeight: boolean;
  glassDoors: boolean;
  fireplace: boolean;
  terraces: boolean;
  dormers: boolean;
  skylights: boolean;
  /** Price factors (1 = full price). */
  wallFactor: number;
  floorFactor: number;
  allFactor: number;
  /** Extra fee, in percentage points of the budget. */
  feePoints: number;
  /** Whether everything is open (free play). */
  all: boolean;
}

const STARTER = {
  walls: ["Wood", "Plaster"] as WallMaterial[],
  roofStyles: ["Gable"] as RoofStyle[],
  roofMaterials: ["Shingles"] as RoofMaterial[],
  floors: ["Laminate", "Tiles", "Carpet", "Concrete"] as FloorFinish[],
};

/** What the techniques `owned` make possible; "all" for free play. */
export function abilities(owned: readonly TechniqueId[] | "all"): Abilities {
  if (owned === "all") {
    return {
      walls: new Set(WALL_MATERIALS),
      roofStyles: new Set(ROOF_STYLES),
      roofMaterials: new Set(ROOF_MATERIALS),
      floors: new Set(FLOOR_FINISHES),
      maxStoreys: 3,
      garageDoors: true,
      openPlan: true,
      paint: true,
      houseplants: true,
      garden: true,
      balconies: true,
      basement: true,
      doubleHeight: true,
      glassDoors: true,
      fireplace: true,
      terraces: true,
      dormers: true,
      skylights: true,
      wallFactor: 1,
      floorFactor: 1,
      allFactor: 1,
      feePoints: 0,
      all: true,
    };
  }
  const walls = new Set(STARTER.walls);
  const roofStyles = new Set(STARTER.roofStyles);
  const roofMaterials = new Set(STARTER.roofMaterials);
  const floors = new Set(STARTER.floors);
  const a = { maxStoreys: 1, garageDoors: false, openPlan: false, paint: false, houseplants: false, garden: false, balconies: false, basement: false, doubleHeight: false, glassDoors: false, fireplace: false, terraces: false, dormers: false, skylights: false, wallFactor: 1, floorFactor: 1, allFactor: 1, feePoints: 0 };
  for (const id of owned) {
    const u = technique(id)?.unlocks;
    if (!u) continue;
    switch (u.kind) {
      case "wall":
        walls.add(u.material);
        break;
      case "roofStyle":
        roofStyles.add(u.style);
        break;
      case "roofMaterial":
        roofMaterials.add(u.material);
        break;
      case "floor":
        floors.add(u.finish);
        break;
      case "storeys":
        a.maxStoreys = Math.max(a.maxStoreys, u.count);
        break;
      case "garageDoors":
        a.garageDoors = true;
        break;
      case "openPlan":
        a.openPlan = true;
        break;
      case "paint":
      case "houseplants":
      case "garden":
      case "balconies":
      case "basement":
      case "doubleHeight":
      case "glassDoors":
      case "fireplace":
      case "terraces":
      case "dormers":
      case "skylights":
        a[u.kind] = true;
        break;
      case "discount":
        if (u.on === "walls") a.wallFactor *= 1 - u.share;
        else if (u.on === "floors") a.floorFactor *= 1 - u.share;
        else a.allFactor *= 1 - u.share;
        break;
      case "fee":
        a.feePoints += u.points;
        break;
    }
  }
  return { walls, roofStyles, roofMaterials, floors, ...a, all: false };
}

/** The technique that unlocks something, or null when it is in the starter kit. */
export function techniqueFor(u: Unlock): TechniqueId | null {
  const same = (a: Unlock, b: Unlock) => JSON.stringify(a) === JSON.stringify(b);
  return TECHNIQUES.find((t) => same(t.unlocks, u))?.id ?? null;
}

/** Unit prices after the business techniques' discounts. */
export function pricesWith(base: PriceList, a: Abilities): PriceList {
  const scale = <K extends string>(r: Record<K, number>, f: number) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v as number) * f])) as Record<K, number>;
  const w = a.wallFactor * a.allFactor;
  const f = a.floorFactor * a.allFactor;
  const all = a.allFactor;
  return {
    wallM2: scale(base.wallM2, w),
    interiorWallM2: base.interiorWallM2 * w,
    windowBase: base.windowBase * all,
    windowM2: base.windowM2 * all,
    doorBase: base.doorBase * all,
    doorM2: base.doorM2 * all,
    garageDoorBase: base.garageDoorBase * all,
    glassDoorBase: base.glassDoorBase * all,
    glassDoorM2: base.glassDoorM2 * all,
    passageBase: base.passageBase * all,
    garageDoorM2: base.garageDoorM2 * all,
    roofM2: scale(base.roofM2, all),
    floorM2: scale(base.floorM2, f),
    foundationM2: base.foundationM2 * f,
    upperFloorM2: base.upperFloorM2 * f,
    stairs: base.stairs * all,
    balconyM2: base.balconyM2 * all,
    terraceM2: base.terraceM2 * all,
    fireplace: base.fireplace * all,
    chimneyM: base.chimneyM * all,
    dormerBase: base.dormerBase * all,
    dormerM: base.dormerM * all,
    skylight: base.skylight * all,
    fenceM: { Picket: base.fenceM.Picket * all, Board: base.fenceM.Board * all },
    column: base.column * all,
    columnM: base.columnM * all,
    gate: base.gate * all,
    step: base.step * all,
    rampM: base.rampM * all,
    paintM2: base.paintM2 * all,
    earthM3: base.earthM3 * all,
    basementDigM3: base.basementDigM3 * all,
    basementWallM2: base.basementWallM2 * w,
    retainingWallM2: base.retainingWallM2 * all,
    lightWell: base.lightWell * all,
    asphaltM2: base.asphaltM2 * all,
    gravelM2: base.gravelM2 * all,
    pathM2: base.pathM2 * all,
    plants: scale(base.plants as Record<string, number>, all),
  };
}

/** The techniques a design uses that are not learned yet, in catalogue order. */
export function missingTechniques(house: House, a: Abilities): TechniqueId[] {
  if (a.all) return [];
  const need = new Set<TechniqueId>();
  const want = (ok: boolean, u: Unlock) => {
    const t = techniqueFor(u);
    if (!ok && t) need.add(t);
  };
  // The open edges round an opening to below come with double height, not open plan.
  const rooms = analyzeHouse(house).rooms;
  const edgesAnOpening = (w: { start: Vec2; end: Vec2; level: number }) => {
    const mid = w.start.add(w.end).scale(0.5);
    const d = w.end.sub(w.start).normalize();
    const n = new Vec2(-d.y, d.x).scale(0.1);
    return [mid.add(n), mid.sub(n)].some((p) => rooms.some((r) => r.level === w.level && r.type === "Void" && pointInPolygon(p, r.polygon)));
  };
  for (const w of house.walls) {
    if (w.boundary) want(a.openPlan || edgesAnOpening(w), { kind: "openPlan" });
    // (A basement's walls are concrete because they hold back the earth, not as a facade.)
    else if (w.level >= 0) want(a.walls.has(w.material), { kind: "wall", material: w.material });
  }
  if (house.basement) want(a.basement, { kind: "basement" });
  if (house.roof) {
    want(a.roofStyles.has(house.roof.style), { kind: "roofStyle", style: house.roof.style });
    want(a.roofMaterials.has(house.roof.material), { kind: "roofMaterial", material: house.roof.material });
  }
  for (const o of house.openings) if (o.kind === "GarageDoor") want(a.garageDoors, { kind: "garageDoors" });
  for (const r of analyzeHouse(house).rooms) {
    if (r.type === "Void") {
      want(a.doubleHeight, { kind: "doubleHeight" });
      continue;
    }
    want(a.floors.has(r.floor), { kind: "floor", finish: r.floor });
    if (r.paint !== "White") want(a.paint, { kind: "paint" });
  }
  for (const f of house.furniture) {
    if (f.kind === "Fireplace") want(a.fireplace, { kind: "fireplace" });
    if (INDOOR_PLANTS.includes(f.kind)) want(a.houseplants, { kind: "houseplants" });
    if (GARDEN_PLANTS.includes(f.kind)) want(a.garden, { kind: "garden" });
  }
  if (house.altan) want(a.terraces, { kind: "terraces" });
  for (const b of house.balconies) {
    if (house.wall(b.wall)?.level === 0) want(a.terraces, { kind: "terraces" });
    else want(a.balconies, { kind: "balconies" });
  }
  for (const d of house.dormers) want(d.skylight ? a.skylights : a.dormers, { kind: d.skylight ? "skylights" : "dormers" });
  for (const o of house.openings) {
    if (o.kind === "GlassDoor") want(a.glassDoors, { kind: "glassDoors" });
    if (o.kind === "Passage") want(a.openPlan, { kind: "openPlan" });
  }
  for (let n = 2; n <= Math.min(house.levels, 3); n++) want(a.maxStoreys >= n, { kind: "storeys", count: n });
  return TECHNIQUE_IDS.filter((t) => need.has(t));
}

/** The techniques a requirement cannot be met without. */
export function techniquesFor(r: Requirement, a: Abilities): TechniqueId[] {
  const needs: Unlock[] = [];
  switch (r.kind) {
    case "wallMaterial":
      if (!a.walls.has(r.material)) needs.push({ kind: "wall", material: r.material });
      break;
    case "roofStyle":
      if (!r.styles.some((s) => a.roofStyles.has(s))) needs.push({ kind: "roofStyle", style: r.styles[0] });
      break;
    case "roofMaterial":
      if (!a.roofMaterials.has(r.material)) needs.push({ kind: "roofMaterial", material: r.material });
      break;
    case "floorFinish":
      if (!a.floors.has(r.finish)) needs.push({ kind: "floor", finish: r.finish });
      break;
    case "storeys":
      if ((r.min ?? 1) > a.maxStoreys) needs.push({ kind: "storeys", count: Math.min(r.min ?? 1, 3) });
      break;
    case "rooms":
      if (r.room === "Garage" && !a.garageDoors) needs.push({ kind: "garageDoors" });
      if (r.floor === "upper" && a.maxStoreys < 2) needs.push({ kind: "storeys", count: 2 });
      break;
    case "balcony":
      if (!a.balconies) needs.push({ kind: "balconies" });
      if (a.maxStoreys < 2) needs.push({ kind: "storeys", count: 2 });
      break;
    case "gardenPlants":
    case "playGarden":
    case "kitchenGarden":
      if (!a.garden) needs.push({ kind: "garden" });
      break;
    case "indoorPlants":
      if (!a.houseplants) needs.push({ kind: "houseplants" });
      break;
    case "paint":
      if (r.color !== "White" && !a.paint) needs.push({ kind: "paint" });
      break;
    case "fireplace":
      if (!a.fireplace) needs.push({ kind: "fireplace" });
      break;
    case "terrace":
    case "sunnyTerrace":
    case "sunsetView":
      if (!a.terraces) needs.push({ kind: "terraces" });
      break;
    case "doubleHeight":
      if (!a.doubleHeight) needs.push({ kind: "doubleHeight" });
      if (a.maxStoreys < 2) needs.push({ kind: "storeys", count: 2 });
      break;
    default:
      break;
  }
  const ids = [...new Set(needs.map(techniqueFor).filter((t): t is TechniqueId => t !== null))];
  // A technique that builds on another needs that one too.
  for (const id of [...ids]) {
    const req = technique(id).requires;
    if (req && !ids.includes(req) && !learnedVia(a, req)) ids.unshift(req);
  }
  // In the order they can be bought: what another builds on first.
  return ids.sort((x, y) => TECHNIQUE_IDS.indexOf(x) - TECHNIQUE_IDS.indexOf(y));
}

/** Whether the abilities include what technique `id` unlocks. */
function learnedVia(a: Abilities, id: TechniqueId): boolean {
  return canBuild(a, technique(id).unlocks);
}

/** Whether something can be built with these abilities. */
export function canBuild(a: Abilities, u: Unlock): boolean {
  switch (u.kind) {
    case "wall":
      return a.walls.has(u.material);
    case "roofStyle":
      return a.roofStyles.has(u.style);
    case "roofMaterial":
      return a.roofMaterials.has(u.material);
    case "floor":
      return a.floors.has(u.finish);
    case "storeys":
      return a.maxStoreys >= u.count;
    case "garageDoors":
      return a.garageDoors;
    case "openPlan":
      return a.openPlan;
    case "paint":
    case "houseplants":
    case "garden":
    case "balconies":
    case "basement":
    case "doubleHeight":
    case "glassDoors":
    case "fireplace":
    case "terraces":
    case "dormers":
    case "skylights":
      return a[u.kind];
    default:
      return a.all;
  }
}

/** The floor a room of a type gets: its usual finish, or the first allowed one that can be built. */
export function buildableFloor(usual: FloorFinish, allowed: readonly FloorFinish[], a: Abilities): FloorFinish {
  if (a.floors.has(usual)) return usual;
  return allowed.find((f) => a.floors.has(f)) ?? usual;
}

// --- Reputation and tiers -------------------------------------------------------------

export type Tier = 1 | 2 | 3 | 4;
export const TIERS: readonly Tier[] = [1, 2, 3, 4];

/** Stars needed for each tier: about 15 houses at two stars each reach the top. */
export const TIER_STARS: Record<Tier, number> = { 1: 0, 2: 5, 3: 14, 4: 28 };

/** The client tier a reputation opens. */
export function tierFor(stars: number): Tier {
  return ([...TIERS].reverse().find((t) => stars >= TIER_STARS[t]) ?? 1) as Tier;
}

/** The smallest budget of a tier's clients. */
export const TIER_MIN_BUDGET: Record<Tier, number> = { 1: 50_000, 2: 85_000, 3: 160_000, 4: 300_000 };
