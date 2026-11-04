/**
 * Clients and their briefs: what they must have, what they wish for, what they can pay,
 * and how they react when you present a design.
 */

import { type PriceList, estimate, totalCost } from "./cost";
import type { House, RoofMaterial, RoofStyle, RoomType, WallMaterial } from "./model";
import type { Plot } from "./plot";
import { area, percent } from "./i18n/format";
import { en } from "./i18n/en";
import type { Lang, Messages } from "./i18n/types";
import { type Room, analyzeRooms } from "./rooms";
import { validate } from "./validate";

export type Requirement =
  /** At least `count` rooms of a type, each at least `minArea` m². */
  | { kind: "rooms"; room: RoomType; count: number; minArea?: number }
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
  /** Construction cost at most this share of the budget. */
  | { kind: "underBudget"; share: number };

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
  const analysis = analyzeRooms(house);
  const rooms: Room[] = analysis.ok ? analysis.value.rooms : [];
  const ofType = (t: RoomType) => rooms.filter((r) => r.type === t);
  const cost = totalCost(estimate(house, prices));
  const doors = house.openings.filter((o) => o.kind === "Door");

  const check = (r: Requirement): [boolean, string] => {
    switch (r.kind) {
      case "rooms": {
        const n = ofType(r.room).filter((x) => x.area >= (r.minArea ?? 0) - 1e-6).length;
        return [n >= r.count, m.brief.countOf(Math.min(n, r.count), r.count)];
      }
      case "floorArea": {
        const a = house.floorArea();
        return [a > 0 && a >= (r.min ?? 0) - 1e-6 && a <= (r.max ?? Infinity) + 1e-6, area(m, a)];
      }
      case "wallMaterial": {
        const exterior = analysis.ok ? house.walls.filter((w) => analysis.value.layout.exterior.has(w.id)) : house.walls;
        const other = exterior.filter((w) => w.material !== r.material).length;
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
        const ok = ofType(r.a).some((x) => x.doors.some((d) => d.to >= 0 && rooms[d.to].type === r.b) || x.openTo.some((i) => rooms[i].type === r.b));
        return [ok, ok ? m.brief.yes : m.brief.no];
      }
      case "windowArea": {
        const best = Math.max(0, ...ofType(r.room).map((x) => x.windows.reduce((s, o) => s + o.area(), 0)));
        return [best >= r.min - 1e-6, area(m, best)];
      }
      case "underBudget":
        return [house.floorArea() > 0 && cost <= r.share * client.budget, percent(m, cost / client.budget)];
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

/** Present a design to the client. */
export function presentDesign(house: House, client: Client, prices: PriceList, m: Messages = en): Verdict {
  const results = evaluateBrief(house, client, prices, m);
  const issues = validate(house, client.plot, client.budget, prices);
  const problems = [
    ...issues.map((i) => m.issue(i)),
    ...results.filter((r) => r.item.must && !r.met).map((r) => m.brief.missing(r.text, r.detail)),
  ];
  const wishes = results.filter((r) => !r.item.must);
  const wishesMet = wishes.filter((r) => r.met).length;
  const ratio = wishes.length ? wishesMet / wishes.length : 1;
  const stars = ratio >= 0.999 ? 3 : ratio >= 0.5 ? 2 : 1;
  const accepted = problems.length === 0;
  const fee = accepted ? Math.round((client.budget * BASE_FEE_SHARE * (1 + 0.5 * ratio)) / 100) * 100 : 0;
  const quote = !accepted ? m.brief.quoteRejected : stars === 3 ? m.brief.quoteThreeStars : stars === 2 ? m.brief.quoteTwoStars : m.brief.quoteOneStar;
  return { accepted, problems, wishesMet, wishesTotal: wishes.length, stars, fee, quote };
}
