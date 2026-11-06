/** The clients who commission houses, easiest first, and the architect's career. */

import type { Client } from "./brief";
import { type Difficulty, withDifficulty } from "./difficulty";
import { generateClient, nextSeed } from "./generate";
import { type Setting, starterPlots } from "./plot";
import { type Abilities, type TechniqueId, type Tier, TIER_STARS, abilities, technique, techniquesFor, tierFor } from "./progression";

const [suburban, lakeside, hillside] = starterPlots();

export const CLIENTS: Client[] = [
  {
    id: "lindgren",
    text: {
      en: {
        name: "Margit & Sven Lindgren",
        who: "A retired couple selling the family home",
        story:
          "The children have moved out and the stairs in our old house are getting too much. We'd like something small and easy to keep, all on one level, with doors wide enough for a wheelchair one day. Room for the grandchildren to stay over would be lovely.",
      },
      sv: {
        name: "Margit och Sven Lindgren",
        who: "Ett pensionärspar som säljer familjehuset",
        story:
          "Barnen har flyttat ut och trapporna i vårt gamla hus börjar bli för mycket. Vi vill ha något litet och lättskött, allt på ett plan, med dörrar som är breda nog för en rullstol en dag. Plats för barnbarnen att sova över vore underbart.",
      },
    },
    plot: lakeside,
    budget: 65_000,
    items: [
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 1, minArea: 12 } },
      { must: true, req: { kind: "rooms", room: "Bathroom", count: 1, minArea: 5 } },
      { must: true, req: { kind: "rooms", room: "Kitchen", count: 1 } },
      { must: true, req: { kind: "rooms", room: "Living", count: 1, minArea: 20 } },
      { must: true, req: { kind: "doorWidth", min: 0.9 } },
      { must: true, req: { kind: "floorArea", max: 95 } },
      { must: true, req: { kind: "storeys", max: 1 } },
      { must: false, req: { kind: "rooms", room: "Bedroom", count: 2, minArea: 8 } },
      { must: false, req: { kind: "connected", a: "Kitchen", b: "Living" } },
      { must: false, req: { kind: "roofStyle", styles: ["Hip"] } },
      { must: false, req: { kind: "windowArea", room: "Living", min: 4 } },
    ],
  },
  {
    id: "haddad",
    text: {
      en: {
        name: "Noor Haddad",
        who: "A software developer who works from home",
        story:
          "I spend most days at my desk, so the office matters more than anything: quiet, with plenty of daylight. Otherwise I don't need much. I like clean, modern lines, and I'd rather not spend everything I have.",
      },
      sv: {
        name: "Noor Haddad",
        who: "En systemutvecklare som jobbar hemifrån",
        story:
          "Jag sitter vid skrivbordet största delen av dagarna, så arbetsrummet betyder mer än allt annat: tyst och med mycket dagsljus. I övrigt behöver jag inte mycket. Jag gillar rena, moderna linjer, och jag vill helst inte göra av med allt jag har.",
      },
    },
    plot: suburban,
    budget: 50_000,
    items: [
      { must: true, req: { kind: "rooms", room: "Office", count: 1, minArea: 8 } },
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 1, minArea: 9 } },
      { must: true, req: { kind: "rooms", room: "Bathroom", count: 1 } },
      { must: true, req: { kind: "rooms", room: "Kitchen", count: 1 } },
      { must: true, req: { kind: "rooms", room: "Living", count: 1, minArea: 16 } },
      { must: false, req: { kind: "roofStyle", styles: ["Flat"] } },
      { must: false, req: { kind: "windowArea", room: "Office", min: 2.5 } },
      { must: false, req: { kind: "connected", a: "Kitchen", b: "Living" } },
      { must: false, req: { kind: "underBudget", share: 0.85 } },
    ],
  },
  {
    id: "andersson",
    text: {
      en: {
        name: "The Andersson family",
        who: "Two parents, two kids and a dog",
        story:
          "Our flat is bursting at the seams. Each of the kids needs their own room, we need a decent bedroom for ourselves, and the kitchen is where we all end up, so it should open onto the living room. A garage for the car and the bikes would be a dream, and so would having the bedrooms upstairs.",
      },
      sv: {
        name: "Familjen Andersson",
        who: "Två föräldrar, två barn och en hund",
        story:
          "Vår lägenhet håller på att spricka i sömmarna. Båda barnen behöver ett eget rum, vi behöver ett ordentligt sovrum för oss själva, och köket är där vi alla hamnar, så det ska ha en dörr rakt in till vardagsrummet. Ett garage för bilen och cyklarna vore en dröm, och likaså att ha sovrummen på övervåningen.",
      },
    },
    plot: suburban,
    budget: 85_000,
    items: [
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 3, minArea: 9 } },
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 1, minArea: 12 } },
      { must: true, req: { kind: "rooms", room: "Bathroom", count: 1, minArea: 4 } },
      { must: true, req: { kind: "rooms", room: "Kitchen", count: 1, minArea: 8 } },
      { must: true, req: { kind: "rooms", room: "Living", count: 1, minArea: 20 } },
      { must: true, req: { kind: "connected", a: "Kitchen", b: "Living" } },
      { must: false, req: { kind: "rooms", room: "Garage", count: 1 } },
      { must: false, req: { kind: "rooms", room: "WC", count: 1 } },
      { must: false, req: { kind: "rooms", room: "Utility", count: 1 } },
      { must: false, req: { kind: "wallMaterial", material: "Wood" } },
      { must: false, req: { kind: "rooms", room: "Bedroom", count: 3, minArea: 9, floor: "upper" } },
    ],
  },
  {
    id: "berg",
    text: {
      en: {
        name: "Lars Berg",
        who: "A retired carpenter with a lifetime of tools",
        story:
          "I need a proper workshop: a big garage I can fit the van and the workbench in. The house itself can be modest, but it has to be timber. I've built with wood all my life and I'm not living in anything else. Wooden floors too, naturally.",
      },
      sv: {
        name: "Lars Berg",
        who: "En pensionerad snickare med ett helt livs verktyg",
        story:
          "Jag behöver en riktig verkstad: ett stort garage där både bussen och hyvelbänken får plats. Själva huset kan vara enkelt, men det ska vara av trä. Jag har byggt i trä i hela mitt liv och tänker inte bo i något annat. Trägolv också, förstås.",
      },
    },
    plot: lakeside,
    budget: 52_000,
    items: [
      { must: true, req: { kind: "rooms", room: "Garage", count: 1, minArea: 30 } },
      { must: true, req: { kind: "wallMaterial", material: "Wood" } },
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 1, minArea: 10 } },
      { must: true, req: { kind: "rooms", room: "Bathroom", count: 1 } },
      { must: true, req: { kind: "rooms", room: "Kitchen", count: 1 } },
      { must: true, req: { kind: "rooms", room: "Living", count: 1, minArea: 15 } },
      { must: false, req: { kind: "rooms", room: "Storage", count: 1, minArea: 3 } },
      { must: false, req: { kind: "roofMaterial", material: "Metal" } },
      { must: false, req: { kind: "roofStyle", styles: ["Gable"] } },
      { must: false, req: { kind: "floorFinish", finish: "Wood" } },
    ],
  },
  {
    id: "okafor",
    text: {
      en: {
        name: "The Okafor family",
        who: "Parents, four children and a grandmother",
        story:
          "We are a big household and we want everyone under one roof, including Grandma, who needs her own room and a bathroom close by. Mornings are chaos, so two bathrooms at least. Grandma can't manage stairs, so her room has to be on the ground floor. We have a big plot on the hill, so don't hold back.",
      },
      sv: {
        name: "Familjen Okafor",
        who: "Föräldrar, fyra barn och en mormor",
        story:
          "Vi är ett stort hushåll och vill ha alla under samma tak, också mormor, som behöver ett eget rum och ett badrum i närheten. Morgnarna är kaos, så minst två badrum. Mormor klarar inte trappor, så hennes rum måste ligga på bottenvåningen. Vi har en stor tomt i sluttningen, så håll inte igen.",
      },
    },
    plot: hillside,
    budget: 105_000,
    items: [
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 5, minArea: 9 } },
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 1, minArea: 14 } },
      { must: true, req: { kind: "rooms", room: "Bathroom", count: 2, minArea: 4 } },
      { must: true, req: { kind: "rooms", room: "Kitchen", count: 1, minArea: 12 } },
      { must: true, req: { kind: "rooms", room: "Living", count: 1, minArea: 30 } },
      { must: true, req: { kind: "doorWidth", min: 0.9 } },
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 1, minArea: 9, floor: "ground" } },
      { must: false, req: { kind: "everyFloor", room: "Bathroom" } },
      { must: false, req: { kind: "rooms", room: "Garage", count: 1, minArea: 20 } },
      { must: false, req: { kind: "rooms", room: "Utility", count: 1 } },
      { must: false, req: { kind: "rooms", room: "Office", count: 1 } },
      { must: false, req: { kind: "wallMaterial", material: "Brick" } },
      { must: false, req: { kind: "windowArea", room: "Living", min: 6 } },
    ],
  },
];

export interface Commission {
  clientId: string;
  fee: number;
  stars: number;
  /** When it was sold (ms since 1970). Commissions from before careers had a history lack these. */
  at?: number;
  tier?: Tier;
  budget?: number;
  /** The house: floor area, what it cost to build, and a small picture (data URL). */
  area?: number;
  cost?: number;
  thumbnail?: string;
}

/** Only the most recent sales keep their picture, so a long career still fits in storage. */
export const PICTURES_KEPT = 24;

/** The tier of each written client: the campaign's story, from small to grand. */
export const STORY_TIER: Record<string, Tier> = { lindgren: 1, haddad: 1, andersson: 2, berg: 2, okafor: 3 };

export interface Career {
  /** Everything ever earned in fees. */
  earnings: number;
  completed: Commission[];
  /** Clients the player turned down; they do not come back. */
  declined?: string[];
  /** Spent in the Workshop. */
  spent?: number;
  /** Techniques learned, in the order they were bought. */
  techniques?: TechniqueId[];
  /** When each technique was learned (missing for techniques bought before this was kept). */
  learnedAt?: Partial<Record<TechniqueId, number>>;
  /** How many times the player asked for other clients. */
  refreshes?: number;
  /** How tight budgets are; moderate for careers from before difficulties. */
  difficulty?: Difficulty;
}

export function newCareer(difficulty: Difficulty = "moderate"): Career {
  return { earnings: 0, completed: [], spent: 0, techniques: [], refreshes: 0, difficulty };
}

/** A client as this career meets them: with the budget of its difficulty. */
export const careerClient = (c: Career, client: Client): Client => withDifficulty(client, c.difficulty ?? "moderate");

/** The tier a client belongs to. */
export function clientTier(client: Client): Tier {
  const tiered = /^gen([1-4])-/.exec(client.id);
  return tiered ? (Number(tiered[1]) as Tier) : (STORY_TIER[client.id] ?? 1);
}

/** Money to spend: everything earned less what the Workshop cost. */
export const careerMoney = (c: Career): number => c.earnings - (c.spent ?? 0);

/** Reputation: every star clients have given. */
export const careerStars = (c: Career): number => c.completed.reduce((s, x) => s + x.stars, 0);

export const careerTier = (c: Career): Tier => tierFor(careerStars(c));

export const careerAbilities = (c: Career): Abilities => abilities(c.techniques ?? []);

/** Why a technique cannot be bought yet, or null when it can. */
export function cannotBuy(c: Career, id: TechniqueId): "owned" | "needs" | "money" | null {
  const t = technique(id);
  const owned = c.techniques ?? [];
  if (owned.includes(id)) return "owned";
  if (t.requires && !owned.includes(t.requires)) return "needs";
  if (careerMoney(c) < t.price) return "money";
  return null;
}

/** Buy a technique; the career unchanged when it cannot be bought. */
export function buyTechnique(c: Career, id: TechniqueId, at = Date.now()): Career {
  if (cannotBuy(c, id)) return c;
  return { ...c, spent: (c.spent ?? 0) + technique(id).price, techniques: [...(c.techniques ?? []), id], learnedAt: { ...c.learnedAt, [id]: at } };
}

/** The techniques a client's must-haves need that the career has not learned. */
export function clientNeeds(client: Client, a: Abilities): TechniqueId[] {
  const ids = new Set<TechniqueId>();
  for (const i of client.items) if (i.must) for (const t of techniquesFor(i.req, a)) ids.add(t);
  return [...ids];
}

/**
 * The clients to choose from: the next written client the career's tier has reached, and
 * generated clients at the career's tier (one a tier lower, a smaller job, once there is
 * one). At least one of them can be built with the techniques already learned.
 */
export function clientOffers(c: Career): Client[] {
  const tier = careerTier(c);
  const gone = new Set([...c.completed.map((x) => x.clientId), ...(c.declined ?? [])]);
  const offers: Client[] = [];
  // Written clients wait for their tier, and stop calling once the career has outgrown them.
  const story = CLIENTS.find((x) => !gone.has(x.id) && (STORY_TIER[x.id] ?? 1) <= tier && (STORY_TIER[x.id] ?? 1) >= tier - 1);
  if (story) offers.push(story);
  const tiers: Tier[] = [tier, tier, tier > 1 ? ((tier - 1) as Tier) : tier];
  let seed = Math.imul(c.completed.length * 131 + (c.refreshes ?? 0) * 977 + 7, 2654435761) >>> 0;
  const next = () => (seed = (Math.imul(seed ^ 0x5bd1e995, 2654435761) >>> 0) % 1_000_000);
  for (let i = 0; offers.length < 3; i++) {
    const client = generateClient(next(), tiers[i % tiers.length]);
    if (!gone.has(client.id)) offers.push(client);
  }
  // Make sure there is something the player can build now.
  const a = careerAbilities(c);
  for (let tries = 0; tries < 40 && offers.every((o) => clientNeeds(o, a).length > 0); tries++) {
    offers[offers.length - 1] = generateClient(next(), tiers[(tries + 1) % tiers.length]);
  }
  return offers.map((o) => careerClient(c, o));
}

/** Stars still needed for the next tier, or null at the top. */
export function starsToNextTier(c: Career): { tier: Tier; needed: number } | null {
  const tier = careerTier(c);
  if (tier === 4) return null;
  const next = (tier + 1) as Tier;
  return { tier: next, needed: TIER_STARS[next] - careerStars(c) };
}

/** The pretend client of free play: no brief, no budget, just a plot. */
export function freePlayClient(setting: Setting): Client {
  const plot = starterPlots().find((p) => p.setting === setting) ?? starterPlots()[0];
  const name = { en: "Free play", sv: "Fritt byggande" };
  const who = { en: "Build whatever you like", sv: "Bygg vad du vill" };
  return {
    id: `free-${plot.setting}`,
    text: { en: { name: name.en, who: who.en, story: "" }, sv: { name: name.sv, who: who.sv, story: "" } },
    plot,
    budget: Number.POSITIVE_INFINITY,
    items: [],
  };
}

export const isFreePlay = (client: Client): boolean => client.id.startsWith("free-");

export function clientById(id: string): Client | undefined {
  if (id.startsWith("free-")) return freePlayClient(id.slice(5) as Setting);
  if (id.startsWith("gen-")) return generateClient(Number(id.slice(4)));
  const tiered = /^gen([1-4])-(\d+)$/.exec(id);
  if (tiered) return generateClient(Number(tiered[2]), Number(tiered[1]) as Tier);
  return CLIENTS.find((c) => c.id === id);
}
/**
 * The next client to call: the first hand-written client not yet served or turned down,
 * else a newly generated one. `after` is the client just finished with, so generated
 * clients follow on from it rather than repeating.
 */
export function nextClient(career: Career, after?: string): Client {
  const gone = new Set([...career.completed.map((c) => c.clientId), ...(career.declined ?? [])]);
  return CLIENTS.find((c) => !gone.has(c.id)) ?? generateClient(nextSeed(after, career.completed.length + (career.declined?.length ?? 0)));
}

/** Turn a client down: they will not be called again. */
export function declineClient(career: Career, clientId: string): Career {
  return { ...career, declined: [...(career.declined ?? []), clientId] };
}

/** Record a sold design, with what is known about the sale. */
export function completeCommission(career: Career, clientId: string, fee: number, stars: number, details: Omit<Commission, "clientId" | "fee" | "stars"> = {}): Career {
  const completed = [...career.completed, { clientId, fee, stars, ...details }];
  const drop = completed.length - PICTURES_KEPT;
  for (let i = 0; i < drop; i++) if (completed[i].thumbnail) completed[i] = { ...completed[i], thumbnail: undefined };
  return { ...career, earnings: career.earnings + fee, completed };
}

/** One point of the career, after each house sold. */
export interface CareerPoint {
  /** 1 for the first house. */
  house: number;
  commission: Commission;
  /** Everything earned so far. */
  earned: number;
  /** Reputation so far. */
  stars: number;
  tier: Tier;
  /** The tier this house opened, if it did. */
  tierUp: Tier | null;
}

/** The career house by house: what was earned, the reputation and when tiers opened. */
export function careerHistory(c: Career): CareerPoint[] {
  let earned = 0;
  let stars = 0;
  let tier: Tier = 1;
  return c.completed.map((commission, i) => {
    earned += commission.fee;
    stars += commission.stars;
    const now = tierFor(stars);
    const tierUp = now > tier ? now : null;
    tier = now;
    return { house: i + 1, commission, earned, stars, tier: now, tierUp };
  });
}
