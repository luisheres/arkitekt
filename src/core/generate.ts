/**
 * Generated clients, for when the hand-written ones have all been served (or turned
 * down). A client is generated from a seed and a tier, so its id ("gen<tier>-<seed>") is
 * all that needs saving: the same id always gives the same household, brief, plot and
 * budget. Higher tiers bring bigger households, finer plots, premium materials and
 * larger budgets. Ids without a tier ("gen-<seed>") are from before tiers and keep
 * their old briefs.
 */

import type { BriefItem, Client, ClientText } from "./brief";
import type { Lang } from "./i18n/types";
import { ROOF_STYLES, type RoofStyle, type RoomType, WALL_MATERIALS, type WallMaterial } from "./model";
import { type Plot, type Setting, starterPlots } from "./plot";
import { TIER_MIN_BUDGET, type Tier } from "./progression";

/** Small, fast, seedable random numbers (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SURNAMES = ["Svensson", "Nilsson", "Berglund", "Holm", "Ek", "Lund", "Sandberg", "Novak", "Garcia", "Chen", "Mensah", "Karimi", "Virtanen", "Larsen", "Murphy", "Rossi"];
const FIRST = ["Anna", "Erik", "Sara", "Johan", "Leila", "Mikael", "Elin", "Omar", "Maja", "Jonas", "Hanna", "Viktor", "Aisha", "Lars", "Ingrid", "Tomas"];

/** Typical sizes of rooms a brief does not give a minimum for, to estimate a budget. */
const TYPICAL_AREA: Record<RoomType, number> = {
  Living: 18,
  Kitchen: 8,
  Bedroom: 10,
  Bathroom: 5,
  WC: 2,
  Hall: 6,
  Office: 8,
  Utility: 4,
  Garage: 18,
  Storage: 3,
};

type Archetype = "family" | "couple" | "retirees" | "remote" | "villa" | "signature";

/** Who calls at each tier. */
const ARCHETYPES: Record<Tier, Archetype[]> = {
  1: ["couple", "remote", "retirees"],
  2: ["family", "couple", "remote", "retirees"],
  3: ["family", "villa"],
  4: ["villa", "signature"],
};

/** Where each tier's clients have bought land. */
const PLOTS: Record<Tier, Setting[]> = { 1: ["suburban"], 2: ["suburban", "lakeside"], 3: ["lakeside", "hillside"], 4: ["hillside"] };

/** The facades and roofs each tier's clients dream of. */
const WALLS: Record<Tier, WallMaterial[]> = { 1: ["Wood", "Plaster", "FaluRed"], 2: ["FaluRed", "Brick", "Wood"], 3: ["Brick", "Stone", "FaluRed"], 4: ["Stone", "Brick"] };
const ROOFS: Record<Tier, RoofStyle[]> = { 1: ["Gable", "Hip"], 2: ["Hip", "Flat", "Gable"], 3: ["Flat", "Gable", "Hip"], 4: ["Flat", "Hip"] };

/** Rooms grow with the tier: minimum sizes are scaled by this. */
const SIZE: Record<Tier, number> = { 1: 1, 2: 1.15, 3: 1.35, 4: 1.6 };

/** Finer houses cost more per m²: budgets are scaled by this. */
const QUALITY: Record<Tier, number> = { 1: 1, 2: 1.1, 3: 1.25, 4: 1.4 };

interface Draft {
  text: Record<Lang, ClientText>;
  musts: BriefItem["req"][];
  wishes: BriefItem["req"][];
}

function draft(kind: Archetype, rnd: () => number, tier?: Tier): Draft {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const surname = pick(SURNAMES);
  const a = pick(FIRST);
  const b = pick(FIRST.filter((f) => f !== a));
  const roof = pick(tier ? ROOFS[tier] : ROOF_STYLES);
  const wall = pick(tier ? WALLS[tier] : WALL_MATERIALS);
  // (Only tiered clients pick this, so clients from before tiers stay the same.)
  const premium: WallMaterial = tier ? pick<WallMaterial>(["Brick", "Stone"]) : "Brick";

  switch (kind) {
    case "family": {
      const kids = 1 + Math.floor(rnd() * 3);
      return {
        text: {
          en: {
            name: `The ${surname} family`,
            who: `Two parents and ${kids === 1 ? "a child" : `${kids} children`}`,
            story: `We need room to grow. ${kids === 1 ? "Our child needs a room" : "Each of the children needs a room"} of their own, we need a proper bedroom for ourselves, and the kitchen is where we all end up, so it should open onto the living room.`,
          },
          sv: {
            name: `Familjen ${surname}`,
            who: `Två föräldrar och ${kids === 1 ? "ett barn" : `${kids} barn`}`,
            story: `Vi behöver plats att växa. ${kids === 1 ? "Vårt barn behöver" : "Varje barn behöver"} ett eget rum, vi behöver ett ordentligt sovrum för oss själva, och köket är där vi alla hamnar, så det ska vara öppet mot vardagsrummet.`,
          },
        },
        musts: [
          { kind: "rooms", room: "Bedroom", count: kids + 1, minArea: 9 },
          { kind: "rooms", room: "Bedroom", count: 1, minArea: 12 },
          { kind: "rooms", room: "Bathroom", count: 1, minArea: 4 },
          { kind: "rooms", room: "Kitchen", count: 1, minArea: 8 },
          { kind: "rooms", room: "Living", count: 1, minArea: 18 + 2 * kids },
          { kind: "connected", a: "Kitchen", b: "Living" },
        ],
        wishes: [
          { kind: "rooms", room: "WC", count: 1 },
          { kind: "rooms", room: "Garage", count: 1 },
          { kind: "rooms", room: "Utility", count: 1 },
          { kind: "rooms", room: "Bedroom", count: kids + 1, minArea: 9, floor: "upper" },
          { kind: "wallMaterial", material: wall },
          { kind: "floorFinish", finish: "Wood", room: "Living" },
        ],
      };
    }
    case "couple":
      return {
        text: {
          en: {
            name: `${a} & ${b} ${surname}`,
            who: "A young couple buying their first house",
            story: "We have saved for years for a place of our own. Nothing grand: a good bedroom, a bright living room and a kitchen we can cook in together. If there is room to work from home now and then, even better.",
          },
          sv: {
            name: `${a} och ${b} ${surname}`,
            who: "Ett ungt par som köper sitt första hus",
            story: "Vi har sparat i flera år till något eget. Inget stort: ett bra sovrum, ett ljust vardagsrum och ett kök där vi kan laga mat tillsammans. Finns det plats att jobba hemifrån ibland är det ännu bättre.",
          },
        },
        musts: [
          { kind: "rooms", room: "Bedroom", count: 1, minArea: 12 },
          { kind: "rooms", room: "Bathroom", count: 1 },
          { kind: "rooms", room: "Kitchen", count: 1 },
          { kind: "rooms", room: "Living", count: 1, minArea: 18 },
        ],
        wishes: [
          { kind: "rooms", room: "Office", count: 1 },
          { kind: "rooms", room: "WC", count: 1 },
          { kind: "roofStyle", styles: [roof] },
          { kind: "windowArea", room: "Living", min: 4 },
          { kind: "floorFinish", finish: "Wood" },
          { kind: "underBudget", share: 0.9 },
        ],
      };
    case "retirees":
      return {
        text: {
          en: {
            name: `${a} & ${b} ${surname}`,
            who: "A retired couple moving somewhere smaller",
            story: "We want everything on one level and easy to look after, with doors wide enough for a walker or a wheelchair. A room for visiting family would be welcome, and a big window to watch the garden from.",
          },
          sv: {
            name: `${a} och ${b} ${surname}`,
            who: "Ett pensionärspar som flyttar till något mindre",
            story: "Vi vill ha allt på ett plan och lättskött, med dörrar breda nog för en rollator eller rullstol. Ett rum för familj på besök vore välkommet, och ett stort fönster att se ut över trädgården från.",
          },
        },
        musts: [
          { kind: "storeys", max: 1 },
          { kind: "doorWidth", min: 0.9 },
          { kind: "rooms", room: "Bedroom", count: 1, minArea: 12 },
          { kind: "rooms", room: "Bathroom", count: 1, minArea: 5 },
          { kind: "rooms", room: "Kitchen", count: 1 },
          { kind: "rooms", room: "Living", count: 1, minArea: 20 },
        ],
        wishes: [
          { kind: "rooms", room: "Bedroom", count: 2, minArea: 8 },
          { kind: "roofStyle", styles: ["Hip"] },
          { kind: "windowArea", room: "Living", min: 4 },
          { kind: "wallMaterial", material: wall },
          { kind: "floorFinish", finish: "Wood", room: "Bedroom" },
        ],
      };
    case "remote":
      return {
        text: {
          en: {
            name: `${a} ${surname}`,
            who: "Works from home most of the week",
            story: "My office is where I spend my days, so it has to be quiet and full of daylight. The rest can be simple. I would rather keep some of the budget for the garden.",
          },
          sv: {
            name: `${a} ${surname}`,
            who: "Jobbar hemifrån större delen av veckan",
            story: "Arbetsrummet är där jag tillbringar dagarna, så det måste vara tyst och fullt av dagsljus. Resten kan vara enkelt. Jag sparar hellre en del av budgeten till trädgården.",
          },
        },
        musts: [
          { kind: "rooms", room: "Office", count: 1, minArea: 8 },
          { kind: "rooms", room: "Bedroom", count: 1, minArea: 9 },
          { kind: "rooms", room: "Bathroom", count: 1 },
          { kind: "rooms", room: "Kitchen", count: 1 },
          { kind: "rooms", room: "Living", count: 1, minArea: 16 },
        ],
        wishes: [
          { kind: "windowArea", room: "Office", min: 2.5 },
          { kind: "roofStyle", styles: [roof] },
          { kind: "connected", a: "Kitchen", b: "Living" },
          { kind: "underBudget", share: 0.85 },
          { kind: "floorFinish", finish: "Wood", room: "Office" },
        ],
      };
    case "villa":
      return {
        text: {
          en: {
            name: `The ${surname} family`,
            who: "A family that has done well, with plenty of guests",
            story: `We love having people over, so the kitchen and living room must be big and open to each other. Everyone needs their own bedroom, there must be a guest room, an office, and a garage for two cars. And we would like the house to look solid: ${premium === "Stone" ? "stone" : "brick"} walls.`,
          },
          sv: {
            name: `Familjen ${surname}`,
            who: "En familj som har lyckats, med mycket gäster",
            story: `Vi älskar att ha folk hemma, så köket och vardagsrummet måste vara stora och öppna mot varandra. Alla behöver ett eget sovrum, det ska finnas ett gästrum, ett kontor och ett garage för två bilar. Och huset ska se gediget ut: väggar av ${premium === "Stone" ? "sten" : "tegel"}.`,
          },
        },
        musts: [
          { kind: "rooms", room: "Bedroom", count: 4, minArea: 10 },
          { kind: "rooms", room: "Bedroom", count: 1, minArea: 16 },
          { kind: "rooms", room: "Bathroom", count: 2, minArea: 5 },
          { kind: "rooms", room: "Kitchen", count: 1, minArea: 14 },
          { kind: "rooms", room: "Living", count: 1, minArea: 32 },
          { kind: "rooms", room: "Office", count: 1, minArea: 9 },
          { kind: "rooms", room: "Garage", count: 1, minArea: 30 },
          { kind: "connected", a: "Kitchen", b: "Living" },
          { kind: "wallMaterial", material: premium },
        ],
        wishes: [
          { kind: "rooms", room: "WC", count: 1 },
          { kind: "rooms", room: "Utility", count: 1 },
          { kind: "windowArea", room: "Living", min: 8 },
          { kind: "roofMaterial", material: "Tiles" },
          { kind: "storeys", min: 2 },
          { kind: "everyFloor", room: "Bathroom" },
          { kind: "floorFinish", finish: "Stone", room: "Hall" },
        ],
      };
    case "signature":
      return {
        text: {
          en: {
            name: `${a} & ${b} ${surname}`,
            who: "Two artists who want a house to remember",
            story: "We want a house people will talk about. A huge living room with walls of glass, a big studio for our work, stone walls, a bathroom on every floor and room for all our friends to stay. Make it special.",
          },
          sv: {
            name: `${a} och ${b} ${surname}`,
            who: "Två konstnärer som vill ha ett hus att minnas",
            story: "Vi vill ha ett hus som folk pratar om. Ett enormt vardagsrum med väggar av glas, en stor ateljé för vårt arbete, stenväggar, ett badrum på varje våning och plats för alla våra vänner att sova över. Gör det speciellt.",
          },
        },
        musts: [
          { kind: "rooms", room: "Living", count: 1, minArea: 45 },
          { kind: "rooms", room: "Kitchen", count: 1, minArea: 16 },
          { kind: "rooms", room: "Office", count: 1, minArea: 20 },
          { kind: "rooms", room: "Bedroom", count: 3, minArea: 12 },
          { kind: "rooms", room: "Bedroom", count: 1, minArea: 20 },
          { kind: "rooms", room: "Bathroom", count: 3, minArea: 5 },
          { kind: "rooms", room: "Garage", count: 1, minArea: 30 },
          { kind: "storeys", min: 2 },
          { kind: "everyFloor", room: "Bathroom" },
          { kind: "wallMaterial", material: "Stone" },
          { kind: "windowArea", room: "Living", min: 10 },
        ],
        wishes: [
          { kind: "roofStyle", styles: [roof] },
          { kind: "floorFinish", finish: "Stone", room: "Living" },
          { kind: "floorFinish", finish: "Wood", room: "Bedroom" },
          { kind: "rooms", room: "Utility", count: 1 },
          { kind: "storeys", min: 3 },
          { kind: "underBudget", share: 0.9 },
        ],
      };
  }
}

/** Floor area the must-have rooms need at least, from their minimum (or typical) sizes. */
export function neededArea(items: readonly BriefItem[]): number {
  let total = 0;
  const byType = new Map<RoomType, number>();
  for (const { req, must } of items) {
    if (!must || req.kind !== "rooms") continue;
    // Several requirements can name the same type ("3 bedrooms", "1 of at least 12 m²"):
    // count the larger total for that type.
    const area = req.count * (req.minArea ?? TYPICAL_AREA[req.room]);
    byType.set(req.room, Math.max(byType.get(req.room) ?? 0, area));
  }
  for (const a of byType.values()) total += a;
  return total;
}

/**
 * A budget that pays for the must-haves with some room for wishes: needed room area,
 * plus walls, halls and circulation, at a typical cost per m², with a margin.
 */
export function budgetFor(items: readonly BriefItem[], tier: Tier = 1): number {
  const area = neededArea(items) * 1.9;
  return Math.ceil((area * 650 * 1.2 * QUALITY[tier]) / 5000) * 5000;
}

/** What a household asks for on top at higher tiers. */
function tierExtras(kind: Archetype, tier: Tier): BriefItem["req"][] {
  if (kind === "villa" || kind === "signature") return [];
  const extras: BriefItem["req"][] = [];
  if (tier >= 2 && kind !== "retirees") extras.push({ kind: "rooms", room: "WC", count: 1 });
  if (tier >= 3) {
    extras.push({ kind: "rooms", room: "Bathroom", count: 2, minArea: 5 }, { kind: "rooms", room: "Garage", count: 1, minArea: 20 });
    if (kind !== "remote") extras.push({ kind: "rooms", room: "Office", count: 1, minArea: 8 });
  }
  return extras;
}

/**
 * The client for a seed, at a tier; without a tier, a client as generated before tiers
 * (any household, any plot).
 */
export function generateClient(seed: number, tier?: Tier): Client {
  const rnd = random(seed);
  const kind = tier ? ARCHETYPES[tier][Math.floor(rnd() * ARCHETYPES[tier].length)] : (["family", "couple", "retirees", "remote"] as const)[Math.floor(rnd() * 4)];
  const d = draft(kind, rnd, tier);
  // Three or four of the archetype's wishes.
  const wishes = [...d.wishes].sort(() => rnd() - 0.5).slice(0, 3 + Math.floor(rnd() * 2));
  const size = tier && kind !== "villa" && kind !== "signature" ? SIZE[tier] : 1;
  const grow = (r: BriefItem["req"]): BriefItem["req"] => (r.kind === "rooms" && r.minArea ? { ...r, minArea: Math.round(r.minArea * size) } : r);
  const musts = [...d.musts.map(grow), ...(tier ? tierExtras(kind, tier) : [])];
  const items: BriefItem[] = [...musts.map((req) => ({ req, must: true })), ...wishes.map((req) => ({ req: grow(req), must: false }))];
  const plots = starterPlots();
  if (!tier) return { id: `gen-${seed}`, text: d.text, plot: plots[Math.floor(rnd() * plots.length)], budget: budgetFor(items), items };
  const settings = PLOTS[tier];
  const setting = settings[Math.floor(rnd() * settings.length)];
  const plot = plots.find((p) => p.setting === setting) as Plot;
  return { id: `gen${tier}-${seed}`, text: d.text, plot, budget: Math.max(budgetFor(items, tier), TIER_MIN_BUDGET[tier]), items };
}

/** The seed for the generated client after `after` (or the first one). */
export function nextSeed(after: string | undefined, served: number): number {
  const prev = after?.startsWith("gen-") ? Number(after.slice(4)) : served * 7919 + 17;
  return (Math.imul(prev ^ 0x5bd1e995, 2654435761) >>> 0) % 1_000_000;
}
