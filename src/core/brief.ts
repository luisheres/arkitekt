/**
 * Clients and their briefs: what they must have, what they wish for, what they can pay,
 * and how they react when you present a design.
 */

import { type PriceList, estimate, totalCost } from "./cost";
import { GARDEN_PLANTS, INDOOR_PLANTS } from "./furniture";
import { type FloorFinish, type House, type PaintColor, type RoofMaterial, type RoofStyle, type RoomType, WALL_FAMILY, type WallMaterial } from "./model";
import type { Plot } from "./plot";
import { area, percent } from "./i18n/format";
import { en } from "./i18n/en";
import type { Lang, Messages } from "./i18n/types";
import { ROOM_INFO, type Room, analyzeHouse, voidArea } from "./rooms";
import { validate } from "./validate";
import { openingAbove } from "./edit";
import { balconySun } from "./features";
import type { Abilities } from "./progression";

export type Requirement =
  /** At least `count` rooms of a type, each at least `minArea` m², optionally on the ground floor or upstairs. */
  | { kind: "rooms"; room: RoomType; count: number; minArea?: number; floor?: "ground" | "upper" }
  /** How many storeys the house has. */
  | { kind: "storeys"; min?: number; max?: number }
  /** A room of this type on every storey. */
  | { kind: "everyFloor"; room: RoomType }
  | { kind: "floorArea"; min?: number; max?: number }
  | { kind: "wallMaterial"; material: WallMaterial }
  | { kind: "roofStyle"; styles: RoofStyle[] }
  | { kind: "roofMaterial"; material: RoofMaterial }
  /** Every door at least this wide (step-free, wheelchair-friendly). */
  | { kind: "doorWidth"; min: number }
  /** A room of type `a` joined to one of type `b` by a door or open plan. */
  | { kind: "connected"; a: RoomType; b: RoomType }
  /** The room of this type with the most glass has at least `min` m² of windows. */
  | { kind: "windowArea"; room: RoomType; min: number }
  /** This floor finish in every room of a type, or in every dry room when no type is given. */
  | { kind: "floorFinish"; finish: FloorFinish; room?: RoomType }
  /** Construction cost at most this share of the budget. */
  | { kind: "underBudget"; share: number }
  /** At least one balcony. */
  | { kind: "balcony" }
  /** A terrace on the ground, against the house. */
  | { kind: "terrace" }
  /** A terrace or balcony with at least this many hours of sun (at the spring equinox). */
  | { kind: "sunnyTerrace"; minHours: number }
  /** A balcony or terrace that gets the evening sun (in summer). */
  | { kind: "sunsetView" }
  /** A fireplace (with its chimney). */
  | { kind: "fireplace" }
  /** At least this many trees, shrubs, flower beds or hedges in the garden. */
  | { kind: "gardenPlants"; min: number }
  /** At least this many plants in pots indoors. */
  | { kind: "indoorPlants"; min: number }
  /** A room of this type painted this colour. */
  | { kind: "paint"; room: RoomType; color: PaintColor }
  /** A room of this type with the floor above opened up: double height. */
  | { kind: "doubleHeight"; room: RoomType };

export interface BriefItem {
  req: Requirement;
  /** Must-haves decide whether the client accepts; wishes raise the fee. */
  must: boolean;
}

/** A client's words, in one language. */
export interface ClientText {
  name: string;
  /** One line: who they are. */
  who: string;
  /** What they say when they hand over the brief. */
  story: string;
}

export interface Client {
  id: string;
  text: Record<Lang, ClientText>;
  plot: Plot;
  budget: number;
  /** The budget the fee is reckoned on, when the difficulty changed `budget`. */
  feeBudget?: number;
  items: BriefItem[];
}

export function describeRequirement(r: Requirement, m: Messages = en): string {
  return m.requirement(r);
}

export interface ItemResult {
  item: BriefItem;
  text: string;
  met: boolean;
  /** Where the design stands, e.g. "2 of 3" or "11.5 m²". */
  detail: string;
}

/** Check each item of a brief against a design. */
export function evaluateBrief(house: House, client: Client, prices: PriceList, m: Messages = en): ItemResult[] {
  const analysis = analyzeHouse(house);
  const rooms: Room[] = analysis.rooms;
  const ofType = (t: RoomType) => rooms.filter((r) => r.type === t);
  /** The room a door or open link points to, on the same storey. */
  const sameLevel = (r: Room, index: number) => rooms.find((x) => x.level === r.level && x.index === index);
  const storeys = Array.from({ length: house.levels }, (_, k) => k).filter((k) => house.wallsOn(k).length > 0).length;
  const cost = totalCost(estimate(house, prices, client.plot));
  const doors = house.openings.filter((o) => o.kind === "Door" || o.kind === "GlassDoor" || o.kind === "Passage");

  const check = (r: Requirement): [boolean, string] => {
    switch (r.kind) {
      case "rooms": {
        const onFloor = (x: Room) => (r.floor === "ground" ? x.level === 0 : r.floor === "upper" ? x.level > 0 : true);
        const n = ofType(r.room).filter((x) => onFloor(x) && x.area >= (r.minArea ?? 0) - 1e-6).length;
        return [n >= r.count, m.brief.countOf(Math.min(n, r.count), r.count)];
      }
      case "floorArea": {
        const a = house.floorArea() - voidArea(house);
        return [a > 0 && a >= (r.min ?? 0) - 1e-6 && a <= (r.max ?? Infinity) + 1e-6, area(m, a)];
      }
      case "wallMaterial": {
        const family = WALL_FAMILY[r.material];
        const exterior = house.walls.filter((w) => {
          if (w.boundary || w.level < 0) return false;
          const level = analysis.levels[w.level];
          return !level?.ok || level.value.layout.exterior.has(w.id);
        });
        const other = exterior.filter((w) => WALL_FAMILY[w.material] !== family).length;
        return [exterior.length > 0 && other === 0, other === 0 ? m.brief.yes : m.brief.wallsNotMaterial(other, r.material)];
      }
      case "roofStyle":
        return [!!house.roof && r.styles.includes(house.roof.style), house.roof ? m.roofStyle[house.roof.style].toLowerCase() : m.brief.noRoof];
      case "roofMaterial":
        return [house.roof?.material === r.material, house.roof ? m.roofMaterial[house.roof.material].toLowerCase() : m.brief.noRoof];
      case "doorWidth": {
        const narrow = doors.filter((d) => d.width < r.min - 1e-6).length;
        if (doors.length === 0) return [false, m.brief.noDoors];
        return [narrow === 0, narrow === 0 ? m.brief.yes : m.brief.doorsTooNarrow(narrow)];
      }
      case "connected": {
        const ok = ofType(r.a).some((x) => x.doors.some((d) => d.to >= 0 && sameLevel(x, d.to)?.type === r.b) || x.openTo.some((i) => sameLevel(x, i)?.type === r.b));
        return [ok, ok ? m.brief.yes : m.brief.no];
      }
      case "windowArea": {
        const best = Math.max(0, ...ofType(r.room).map((x) => x.windows.reduce((s, o) => s + o.area(), 0)));
        return [best >= r.min - 1e-6, area(m, best)];
      }
      case "floorFinish": {
        // Without a room type: every room where the finish is allowed (wet rooms and garages are exempt).
        const target = r.room ? ofType(r.room) : rooms.filter((x) => x.type && ROOM_INFO[x.type].floors.includes(r.finish));
        const wrong = target.filter((x) => x.floor !== r.finish).length;
        return [target.length > 0 && wrong === 0, m.brief.countOf(target.length - wrong, target.length)];
      }
      case "storeys":
        return [storeys > 0 && storeys >= (r.min ?? 0) && storeys <= (r.max ?? Infinity), String(storeys)];
      case "everyFloor": {
        const have = new Set(ofType(r.room).filter((x) => x.level >= 0).map((x) => x.level)).size;
        return [storeys > 0 && have >= storeys, m.brief.countOf(Math.min(have, storeys), storeys)];
      }
      case "underBudget":
        return [house.floorArea() > 0 && cost <= r.share * client.budget, percent(m, cost / client.budget)];
      case "balcony": {
        const n = house.balconies.filter((b) => (house.wall(b.wall)?.level ?? 0) > 0).length;
        return [n > 0, String(n)];
      }
      case "terrace": {
        const n = house.balconies.filter((b) => house.wall(b.wall)?.level === 0).length;
        return [n > 0, String(n)];
      }
      case "sunnyTerrace": {
        const best = Math.max(0, ...house.balconies.map((b) => balconySun(house, b).hours));
        return [best >= r.minHours, m.brief.hoursOfSun(best)];
      }
      case "sunsetView": {
        const ok = house.balconies.some((b) => balconySun(house, b).sunset);
        return [ok, ok ? m.brief.yes : m.brief.no];
      }
      case "fireplace": {
        const n = house.furniture.filter((f) => f.kind === "Fireplace").length;
        return [n > 0, String(n)];
      }
      case "gardenPlants": {
        const n = house.furniture.filter((f) => GARDEN_PLANTS.includes(f.kind)).length;
        return [n >= r.min, m.brief.countOf(Math.min(n, r.min), r.min)];
      }
      case "indoorPlants": {
        const n = house.furniture.filter((f) => INDOOR_PLANTS.includes(f.kind)).length;
        return [n >= r.min, m.brief.countOf(Math.min(n, r.min), r.min)];
      }
      case "doubleHeight": {
        const tall = ofType(r.room).some((x) => !!openingAbove(house, x.anchor, x.level));
        return [tall, tall ? m.brief.yes : m.brief.no];
      }
      case "paint": {
        const these = ofType(r.room);
        return [these.some((x) => x.paint === r.color), these.length ? m.paintColor[these[0].paint].toLowerCase() : m.brief.no];
      }
    }
  };

  return client.items.map((item) => {
    const [met, detail] = check(item.req);
    return { item, text: m.requirement(item.req), met, detail };
  });
}

/** The architect's fee as a share of the client's budget, before the wish bonus. */
export const BASE_FEE_SHARE = 0.08;

export interface Verdict {
  accepted: boolean;
  /** Why the client says no: building problems and unmet must-haves. */
  problems: string[];
  wishesMet: number;
  wishesTotal: number;
  /** 1-3, from how many wishes were met. */
  stars: number;
  fee: number;
  /** What the client says. */
  quote: string;
}

/**
 * Present a design to the client. `can` is what the architect has learned (campaign):
 * designs using anything else are refused, and the Marketing technique raises the fee.
 */
export function presentDesign(house: House, client: Client, prices: PriceList, m: Messages = en, can?: Abilities): Verdict {
  const results = evaluateBrief(house, client, prices, m);
  const issues = validate(house, client.plot, client.budget, prices, can);
  const problems = [
    ...issues.map((i) => m.issue(i)),
    ...results.filter((r) => r.item.must && !r.met).map((r) => m.brief.missing(r.text, r.detail)),
  ];
  const wishes = results.filter((r) => !r.item.must);
  const wishesMet = wishes.filter((r) => r.met).length;
  const ratio = wishes.length ? wishesMet / wishes.length : 1;
  const stars = ratio >= 0.999 ? 3 : ratio >= 0.5 ? 2 : 1;
  const accepted = problems.length === 0;
  const share = BASE_FEE_SHARE + (can?.feePoints ?? 0) / 100;
  const fee = accepted ? Math.round(((client.feeBudget ?? client.budget) * share * (1 + 0.5 * ratio)) / 100) * 100 : 0;
  const quote = !accepted ? m.brief.quoteRejected : stars === 3 ? m.brief.quoteThreeStars : stars === 2 ? m.brief.quoteTwoStars : m.brief.quoteOneStar;
  return { accepted, problems, wishesMet, wishesTotal: wishes.length, stars, fee, quote };
}
