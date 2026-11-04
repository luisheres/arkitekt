/**
 * Generated clients, for when the hand-written ones have all been served (or turned
 * down). A client is generated from a seed, so its id ("gen-<seed>") is all that needs
 * saving: the same seed always gives the same household, brief, plot and budget.
 */

import type { BriefItem, Client, ClientText } from "./brief";
import type { Lang } from "./i18n/types";
import { ROOF_STYLES, type RoomType, WALL_MATERIALS } from "./model";
import { starterPlots } from "./plot";

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

type Archetype = "family" | "couple" | "retirees" | "remote";

interface Draft {
  text: Record<Lang, ClientText>;
  musts: BriefItem["req"][];
  wishes: BriefItem["req"][];
}

function draft(kind: Archetype, rnd: () => number): Draft {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const surname = pick(SURNAMES);
  const a = pick(FIRST);
  const b = pick(FIRST.filter((f) => f !== a));
  const roof = pick(ROOF_STYLES);
  const wall = pick(WALL_MATERIALS);

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
export function budgetFor(items: readonly BriefItem[]): number {
  const area = neededArea(items) * 1.9;
  return Math.ceil((area * 650 * 1.2) / 5000) * 5000;
}

/** The client for a seed. */
export function generateClient(seed: number): Client {
  const rnd = random(seed);
  const kind = (["family", "couple", "retirees", "remote"] as const)[Math.floor(rnd() * 4)];
  const d = draft(kind, rnd);
  // Three or four of the archetype's wishes.
  const wishes = [...d.wishes].sort(() => rnd() - 0.5).slice(0, 3 + Math.floor(rnd() * 2));
  const items: BriefItem[] = [...d.musts.map((req) => ({ req, must: true })), ...wishes.map((req) => ({ req, must: false }))];
  const plots = starterPlots();
  return { id: `gen-${seed}`, text: d.text, plot: plots[Math.floor(rnd() * plots.length)], budget: budgetFor(items), items };
}

/** The seed for the generated client after `after` (or the first one). */
export function nextSeed(after: string | undefined, served: number): number {
  const prev = after?.startsWith("gen-") ? Number(after.slice(4)) : served * 7919 + 17;
  return (Math.imul(prev ^ 0x5bd1e995, 2654435761) >>> 0) % 1_000_000;
}
