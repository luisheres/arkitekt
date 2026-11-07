import { describe, expect, it } from "vitest";
import {
  CLIENTS,
  type Career,
  buyTechnique,
  cannotBuy,
  careerAbilities,
  careerMoney,
  careerStars,
  careerTier,
  clientById,
  clientNeeds,
  clientOffers,
  completeCommission,
  freePlayClient,
  newCareer,
  starsToNextTier,
} from "./clients";
import { defaultPrices, estimate, totalCost } from "./cost";
import { generateClient } from "./generate";
import { Vec2 } from "./geometry";
import { House } from "./model";
import { TECHNIQUES, TIER_MIN_BUDGET, TIERS, type Tier, abilities, missingTechniques, pricesWith, technique, tierFor } from "./progression";
import { validate } from "./validate";

const v = (x: number, y: number) => new Vec2(x, y);
const rich = (money: number): Career => ({ ...newCareer(), earnings: money });

describe("techniques", () => {
  it("start with a basic kit and add what each technique unlocks", () => {
    const start = abilities([]);
    expect([...start.walls].sort()).toEqual(["Plaster", "Wood"]);
    expect([...start.roofStyles]).toEqual(["Gable"]);
    expect(start.maxStoreys).toBe(1);
    expect(start.garageDoors || start.openPlan).toBe(false);
    const more = abilities(["brick", "twoStoreys", "garage", "hipRoof"]);
    expect(more.walls.has("Brick") && more.roofStyles.has("Hip") && more.garageDoors).toBe(true);
    expect(more.maxStoreys).toBe(2);
    expect(abilities("all").maxStoreys).toBe(3);
  });

  it("cost money, need their prerequisites and are bought once", () => {
    expect(cannotBuy(newCareer(), "brick")).toBe("money");
    expect(cannotBuy(rich(100_000), "stone")).toBe("needs");
    let c = buyTechnique(rich(10_000), "brick");
    expect(c.techniques).toEqual(["brick"]);
    expect(careerMoney(c)).toBe(2_000);
    expect(cannotBuy(c, "brick")).toBe("owned");
    expect(buyTechnique(c, "stone")).toBe(c);
    c = buyTechnique({ ...c, earnings: c.earnings + 30_000 }, "stone");
    expect(careerAbilities(c).walls.has("Stone")).toBe(true);
  });

  it("make building cheaper and fees larger", () => {
    const base = defaultPrices();
    const cheaper = pricesWith(base, abilities(["prefab", "bulkBuying"]));
    expect(cheaper.wallM2.Brick).toBeCloseTo(base.wallM2.Brick * 0.9 * 0.95, 6);
    expect(cheaper.foundationM2).toBeCloseTo(base.foundationM2 * 0.95, 6);
    expect(abilities(["marketing"]).feePoints).toBe(2);
  });

  it("find what a design uses that is not learned yet", () => {
    const h = new House();
    const ids = h.addWallLoop([v(4, 4), v(14, 4), v(14, 12), v(4, 12)], 2.7, "Brick");
    h.addGarageDoor(ids[0], 5, 2.5, 2.1);
    h.roof = { style: "Hip", pitchDeg: 30, overhang: 0.3, material: "Tiles" };
    expect(missingTechniques(h, abilities([]))).toEqual(["brick", "hipRoof", "tileRoof", "garage"]);
    expect(missingTechniques(h, abilities(["brick", "hipRoof", "tileRoof", "garage"]))).toEqual([]);
    expect(missingTechniques(h, abilities("all"))).toEqual([]);
    const issues = validate(h, freePlayClient("suburban").plot, Number.POSITIVE_INFINITY, defaultPrices(), abilities([]));
    expect(issues.filter((i) => i.kind === "NotLearned")).toHaveLength(4);
  });

  it("have a name and a text in every language, and a known prerequisite", async () => {
    const { en } = await import("./i18n/en");
    const { sv } = await import("./i18n/sv");
    for (const t of TECHNIQUES) {
      for (const m of [en, sv]) expect(m.technique[t.id].name.length).toBeGreaterThan(0);
      if (t.requires) expect(technique(t.requires).price).toBeLessThan(t.price);
    }
  });
});

describe("tiers and clients", () => {
  it("open with reputation", () => {
    expect(tierFor(0)).toBe(1);
    expect(tierFor(5)).toBe(2);
    expect(tierFor(14)).toBe(3);
    expect(tierFor(100)).toBe(4);
    const c = completeCommission(completeCommission(newCareer(), "a", 5000, 3), "b", 5000, 2);
    expect(careerStars(c)).toBe(5);
    expect(careerTier(c)).toBe(2);
    expect(starsToNextTier(c)).toEqual({ tier: 3, needed: 9 });
  });

  it("generate bigger jobs at higher tiers, reproducible from their id", () => {
    for (const tier of TIERS) {
      const budgets: number[] = [];
      for (let seed = 1; seed < 200; seed += 9) {
        const c = generateClient(seed, tier);
        expect(clientById(c.id)).toEqual(c);
        expect(c.budget).toBeGreaterThanOrEqual(TIER_MIN_BUDGET[tier]);
        for (const lang of ["en", "sv"] as const) expect(Object.values(c.text[lang]).every((t) => t.length > 0 && !/undefined/.test(t))).toBe(true);
        budgets.push(c.budget);
      }
      const avg = budgets.reduce((a, b) => a + b, 0) / budgets.length;
      if (tier < 4) expect(avg, `tier ${tier}`).toBeLessThan(TIER_MIN_BUDGET[(tier + 1) as Tier] * 1.3);
    }
  });

  it("offer three clients, at least one buildable with what has been learned", () => {
    let c = newCareer();
    for (let n = 0; n < 12; n++) {
      const offers = clientOffers(c);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map((o) => o.id)).size).toBe(3);
      expect(offers.some((o) => clientNeeds(o, careerAbilities(c)).length === 0)).toBe(true);
      c = completeCommission(c, offers[0].id, 10_000, 2);
    }
    // Asking for other clients changes the offers.
    const before = clientOffers(c).map((o) => o.id);
    expect(clientOffers({ ...c, refreshes: 1 }).map((o) => o.id)).not.toEqual(before);
  });

  it("start the story with the written clients, each at its tier", () => {
    expect(clientOffers(newCareer())[0].id).toBe(CLIENTS[0].id);
    // Andersson (tier 2) waits until the career reaches tier 2.
    let c = completeCommission(completeCommission(newCareer(), "lindgren", 5000, 1), "haddad", 5000, 1);
    expect(clientOffers(c).map((o) => o.id)).not.toContain("andersson");
    c = completeCommission(c, "x", 5000, 3);
    expect(clientOffers(c)[0].id).toBe("andersson");
  });

  it("lists what a client's must-haves need", () => {
    const berg = clientById("berg")!;
    expect(clientNeeds(berg, abilities([]))).toEqual(["garage"]);
    expect(clientNeeds(berg, abilities(["garage"]))).toEqual([]);
  });

  it("free play has a plot and no budget", () => {
    const f = freePlayClient("lakeside");
    expect(f.plot.setting).toBe("lakeside");
    expect(f.budget).toBe(Number.POSITIVE_INFINITY);
    expect(clientById(f.id)).toEqual(f);
  });
});

describe("a campaign", () => {
  /**
   * An average player: picks the best-paying client they can build for (buying the
   * techniques it needs when they can), gets two stars a house, and grants about half
   * of the wishes.
   */
  function play(houses: number): { tierAt: Record<number, number>; career: Career; budgets: number[] } {
    let c = newCareer();
    const tierAt: Record<number, number> = {};
    const budgets: number[] = [];
    for (let n = 1; n <= houses; n++) {
      const offers = [...clientOffers(c)].sort((a, b) => b.budget - a.budget);
      let pick = offers.find((o) => clientNeeds(o, careerAbilities(c)).length === 0)!;
      for (const o of offers) {
        if (o.budget <= pick.budget) break;
        const needs = clientNeeds(o, careerAbilities(c));
        if (needs.reduce((s, id) => s + technique(id).price, 0) <= careerMoney(c)) {
          for (const id of needs) c = buyTechnique(c, id);
          pick = o;
          break;
        }
      }
      const fee = Math.round(pick.budget * (0.08 + careerAbilities(c).feePoints / 100) * 1.3);
      c = completeCommission(c, pick.id, fee, 2);
      budgets.push(pick.budget);
      const tier = careerTier(c);
      tierAt[tier] ??= n;
    }
    return { tierAt, career: c, budgets };
  }

  it("reaches the top tier around the fifteenth house", () => {
    const { tierAt, budgets } = play(20);
    expect(tierAt[2]).toBeGreaterThanOrEqual(2);
    expect(tierAt[2]).toBeLessThanOrEqual(4);
    expect(tierAt[3]).toBeLessThanOrEqual(8);
    expect(tierAt[4]).toBeGreaterThanOrEqual(13);
    expect(tierAt[4]).toBeLessThanOrEqual(16);
    // And can afford the top tier's jobs soon after reaching it.
    expect(budgets.slice(tierAt[4], tierAt[4] + 3).some((b) => b >= TIER_MIN_BUDGET[4])).toBe(true);
  });

  it("can learn most techniques by the end, but not all at once", () => {
    const { career } = play(16);
    const all = TECHNIQUES.reduce((s, t) => s + t.price, 0);
    expect(career.earnings).toBeGreaterThan(all * 0.8);
    const halfway = play(6).career;
    expect(halfway.earnings).toBeLessThan(all * 0.5);
  });

  it("keeps costs and validation in line with what was learned", () => {
    const h = new House();
    h.addWallLoop([v(4, 4), v(12, 4), v(12, 10), v(4, 10)], 2.7, "Plaster");
    const base = defaultPrices();
    const cheap = totalCost(estimate(h, pricesWith(base, abilities(["prefab"]))));
    expect(cheap).toBeLessThan(totalCost(estimate(h, base)));
  });
});

describe("career history", () => {
  it("tells the career house by house, with tiers opening on the way", async () => {
    const { careerHistory, PICTURES_KEPT } = await import("./clients");
    let c = newCareer();
    for (let i = 0; i < 4; i++) c = completeCommission(c, `gen1-${i}`, 5000, 2, { at: i, budget: 60_000, thumbnail: "data:image/jpeg;base64,x" });
    const h = careerHistory(c);
    expect(h.map((p) => p.earned)).toEqual([5000, 10000, 15000, 20000]);
    expect(h.map((p) => p.stars)).toEqual([2, 4, 6, 8]);
    expect(h.map((p) => p.tierUp)).toEqual([null, null, 2, null]);
    expect(h[3].commission.budget).toBe(60_000);
    // Old pictures are let go, so the save stays small.
    for (let i = 0; i < PICTURES_KEPT; i++) c = completeCommission(c, `x${i}`, 1, 1, { thumbnail: "data:image/jpeg;base64,x" });
    expect(c.completed.filter((x) => x.thumbnail).length).toBe(PICTURES_KEPT);
    expect(c.completed[0].thumbnail).toBeUndefined();
  });

  it("remembers when techniques were learned", () => {
    const c = buyTechnique(rich(10_000), "brick", 1234);
    expect(c.learnedAt).toEqual({ brick: 1234 });
  });
});

describe("client variety", () => {
  it("brings many kinds of households, wishing for many kinds of things", () => {
    const whos = new Set<string>();
    const wishes = new Set<string>();
    for (const tier of TIERS)
      for (let seed = 1; seed < 400; seed += 7) {
        const c = generateClient(seed, tier);
        whos.add(c.text.en.who);
        for (const i of c.items) wishes.add(i.req.kind);
      }
    expect(whos.size).toBeGreaterThanOrEqual(14);
    for (const kind of ["balcony", "gardenPlants", "indoorPlants", "paint", "wallMaterial", "windowArea", "connected", "doubleHeight"]) expect(wishes, kind).toContain(kind);
  });

  it("keeps clients from before tiers exactly as they were", () => {
    // gen-1234 was generated before tiers existed; its brief must not change under it.
    const c = generateClient(1234);
    expect(c.items.every((i) => !["balcony", "gardenPlants", "indoorPlants", "paint"].includes(i.req.kind))).toBe(true);
  });
});
