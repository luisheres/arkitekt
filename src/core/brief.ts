/**
 * Clients and their briefs: what they must have, what they wish for, what they can pay,
 * and how they react when you present a design.
 */

import { type PriceList, estimate, totalCost } from "./cost";
import type { House, RoofMaterial, RoofStyle, RoomType, WallMaterial } from "./model";
import type { Plot } from "./plot";
import { ROOM_INFO, type Room, analyzeRooms } from "./rooms";
import { describeIssue, validate } from "./validate";

export type Requirement =
  /** At least `count` rooms of a type, each at least `minArea` m². */
  | { kind: "rooms"; room: RoomType; count: number; minArea?: number }
  | { kind: "floorArea"; min?: number; max?: number }
  | { kind: "wallMaterial"; material: WallMaterial }
  | { kind: "roofStyle"; styles: RoofStyle[] }
  | { kind: "roofMaterial"; material: RoofMaterial }
  /** Every door at least this wide (step-free, wheelchair-friendly). */
  | { kind: "doorWidth"; min: number }
  /** A door directly between a room of type `a` and one of type `b`. */
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

export interface Client {
  id: string;
  name: string;
  /** One line: who they are. */
  who: string;
  /** What they say when they hand over the brief. */
  story: string;
  plot: Plot;
  budget: number;
  items: BriefItem[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const roomWord = (t: RoomType) => (t === "WC" ? "WC" : ROOM_INFO[t].name.toLowerCase());
const m2 = (x: number) => `${Number(x.toFixed(1))} m²`;

export function describeRequirement(r: Requirement): string {
  switch (r.kind) {
    case "rooms": {
      const name = roomWord(r.room);
      const what = r.count === 1 ? `${/^[aeio]/.test(name) ? "An" : "A"} ${name}` : `${r.count} ${name === "storage" ? "storage rooms" : `${name}s`}`;
      return r.minArea ? `${what} of at least ${m2(r.minArea)}` : what;
    }
    case "floorArea":
      if (r.min !== undefined && r.max !== undefined) return `Floor area between ${m2(r.min)} and ${m2(r.max)}`;
      return r.min !== undefined ? `Floor area of at least ${m2(r.min)}` : `Floor area of at most ${m2(r.max ?? 0)}`;
    case "wallMaterial":
      return `${r.material} exterior walls`;
    case "roofStyle":
      return `A ${r.styles.map((s) => s.toLowerCase()).join(" or ")} roof`;
    case "roofMaterial":
      return `A roof covered in ${r.material.toLowerCase()}`;
    case "doorWidth":
      return `Every door at least ${r.min} m wide`;
    case "connected":
      return `A door between the ${roomWord(r.a)} and the ${roomWord(r.b)}`;
    case "windowArea":
      return `At least ${m2(r.min)} of windows in the ${roomWord(r.room)}`;
    case "underBudget":
      return `Costs at most ${Math.round(r.share * 100)}% of the budget`;
  }
}

export interface ItemResult {
  item: BriefItem;
  text: string;
  met: boolean;
  /** Where the design stands, e.g. "2 of 3" or "11.5 m²". */
  detail: string;
}

/** Check each item of a brief against a design. */
export function evaluateBrief(house: House, client: Client, prices: PriceList): ItemResult[] {
  const analysis = analyzeRooms(house);
  const rooms: Room[] = analysis.ok ? analysis.value.rooms : [];
  const ofType = (t: RoomType) => rooms.filter((r) => r.type === t);
  const cost = totalCost(estimate(house, prices));
  const doors = house.openings.filter((o) => o.kind === "Door");

  const check = (r: Requirement): [boolean, string] => {
    switch (r.kind) {
      case "rooms": {
        const n = ofType(r.room).filter((x) => x.area >= (r.minArea ?? 0) - 1e-6).length;
        return [n >= r.count, `${Math.min(n, r.count)} of ${r.count}`];
      }
      case "floorArea": {
        const a = house.floorArea();
        return [a > 0 && a >= (r.min ?? 0) - 1e-6 && a <= (r.max ?? Infinity) + 1e-6, m2(a)];
      }
      case "wallMaterial": {
        const exterior = analysis.ok ? house.walls.filter((w) => analysis.value.layout.exterior.has(w.id)) : house.walls;
        const other = exterior.filter((w) => w.material !== r.material).length;
        return [exterior.length > 0 && other === 0, other === 0 ? "yes" : `${plural(other, "wall")} not ${r.material.toLowerCase()}`];
      }
      case "roofStyle":
        return [!!house.roof && r.styles.includes(house.roof.style), house.roof?.style.toLowerCase() ?? "no roof"];
      case "roofMaterial":
        return [house.roof?.material === r.material, house.roof?.material.toLowerCase() ?? "no roof"];
      case "doorWidth": {
        const narrow = doors.filter((d) => d.width < r.min - 1e-6).length;
        if (doors.length === 0) return [false, "no doors"];
        return [narrow === 0, narrow === 0 ? "yes" : `${plural(narrow, "door")} too narrow`];
      }
      case "connected": {
        const ok = ofType(r.a).some((x) => x.doors.some((d) => d.to >= 0 && rooms[d.to].type === r.b));
        return [ok, ok ? "yes" : "no"];
      }
      case "windowArea": {
        const best = Math.max(0, ...ofType(r.room).map((x) => x.windows.reduce((s, o) => s + o.area(), 0)));
        return [best >= r.min - 1e-6, m2(best)];
      }
      case "underBudget":
        return [cost <= r.share * client.budget, `${Math.round((cost / client.budget) * 100)}%`];
    }
  };

  return client.items.map((item) => {
    const [met, detail] = check(item.req);
    return { item, text: describeRequirement(item.req), met, detail };
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
export function presentDesign(house: House, client: Client, prices: PriceList): Verdict {
  const results = evaluateBrief(house, client, prices);
  const issues = validate(house, client.plot, client.budget, prices);
  const problems = [
    ...issues.map(describeIssue),
    ...results.filter((r) => r.item.must && !r.met).map((r) => `Missing: ${r.text.charAt(0).toLowerCase()}${r.text.slice(1)} (${r.detail})`),
  ];
  const wishes = results.filter((r) => !r.item.must);
  const wishesMet = wishes.filter((r) => r.met).length;
  const ratio = wishes.length ? wishesMet / wishes.length : 1;
  const stars = ratio >= 0.999 ? 3 : ratio >= 0.5 ? 2 : 1;
  const accepted = problems.length === 0;
  const fee = accepted ? Math.round((client.budget * BASE_FEE_SHARE * (1 + 0.5 * ratio)) / 100) * 100 : 0;
  const quote = !accepted
    ? "We like where this is going, but we can't sign off on it yet."
    : stars === 3
      ? "It's everything we hoped for. When can they start building?"
      : stars === 2
        ? "This will make a lovely home. Thank you!"
        : "It does what we asked. We'll take it.";
  return { accepted, problems, wishesMet, wishesTotal: wishes.length, stars, fee, quote };
}
