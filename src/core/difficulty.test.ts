import { describe, expect, it } from "vitest";
import { CLIENTS, careerClient, clientById, clientOffers, newCareer } from "./clients";
import { HARD_MARGIN, typicalCost, withDifficulty } from "./difficulty";
import { generateClient } from "./generate";
import { TIERS } from "./progression";

const sample = [...CLIENTS, ...TIERS.flatMap((t) => Array.from({ length: 15 }, (_, i) => generateClient(i * 41 + 5, t)))];

describe("difficulty", () => {
  it("makes budgets roomier on easy and tighter on hard", () => {
    for (const c of sample) {
      const [easy, moderate, hard] = (["easy", "moderate", "hard"] as const).map((d) => withDifficulty(c, d).budget);
      expect(easy, c.id).toBeGreaterThan(moderate);
      expect(hard, c.id).toBeLessThanOrEqual(moderate);
    }
    // Most clients have room to tighten.
    expect(sample.filter((c) => withDifficulty(c, "hard").budget < c.budget).length).toBeGreaterThan(sample.length * 0.8);
  });

  it("never makes a hard budget too small for a plain house that meets the brief", () => {
    for (const c of sample) {
      const hard = withDifficulty(c, "hard").budget;
      expect(hard >= typicalCost(c) * HARD_MARGIN || hard === c.budget, c.id).toBe(true);
    }
  });

  it("keeps the fee reckoned on the moderate budget", () => {
    const c = clientById("lindgren")!;
    expect(withDifficulty(c, "easy").feeBudget).toBe(c.budget);
    expect(withDifficulty(c, "hard").feeBudget).toBe(c.budget);
    expect(withDifficulty(c, "moderate")).toBe(c);
  });

  it("follows the career: offers and clients carry its difficulty; old careers are moderate", () => {
    const lindgren = clientById("lindgren")!;
    expect(clientOffers(newCareer("easy"))[0].budget).toBe(withDifficulty(lindgren, "easy").budget);
    expect(clientOffers(newCareer("hard"))[0].budget).toBe(withDifficulty(lindgren, "hard").budget);
    const { difficulty: _, ...old } = newCareer();
    expect(careerClient(old, lindgren)).toBe(lindgren);
  });
});
