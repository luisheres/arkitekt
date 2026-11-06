/**
 * Difficulty: how much money clients have. Easy budgets are roomy, moderate ones are as
 * the clients first said, hard ones are tight; but never so tight that a plain house
 * meeting the must-haves could not be built. The architect's fee is reckoned on the
 * moderate budget, so the campaign moves at the same pace at every difficulty.
 */

import type { Client } from "./brief";
import { type PriceList, defaultPrices, estimate, totalCost } from "./cost";
import { neededArea } from "./generate";
import { Vec2 } from "./geometry";
import { House, type WallMaterial } from "./model";

export const DIFFICULTIES = ["easy", "moderate", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const BUDGET_FACTOR: Record<Difficulty, number> = { easy: 1.25, moderate: 1, hard: 0.85 };

/** Hard budgets leave at least this much over a plain house that meets the brief. */
export const HARD_MARGIN = 1.1;

/**
 * Roughly what a plain house meeting a client's must-haves costs: the rooms they need
 * plus 30% for halls and walls, as a rectangle on as many storeys as they ask for, in the
 * facade they insist on, with a gable roof, partitions, a window per 10 m², a door per room
 * and simple floors.
 */
export function typicalCost(client: Client, prices: PriceList = defaultPrices()): number {
  const musts = client.items.filter((i) => i.must).map((i) => i.req);
  const storeys = Math.max(1, ...musts.map((r) => (r.kind === "storeys" ? (r.min ?? 1) : 1)));
  const material: WallMaterial = musts.find((r) => r.kind === "wallMaterial")?.material ?? "Plaster";
  const area = (neededArea(client.items) * 1.3) / storeys;
  const w = Math.sqrt(area * 1.4);
  const d = area / w;
  const h = new House();
  const corners = [new Vec2(0, 0), new Vec2(w, 0), new Vec2(w, d), new Vec2(0, d)];
  h.addWallLoop(corners, 2.7, material);
  for (let k = 1; k < storeys; k++) h.addWallLoop(corners, 2.7, material, h.addLevel());
  h.roof = { style: "Gable", pitchDeg: 30, overhang: 0.4, material: "Shingles" };
  const rooms = musts.reduce((s, r) => s + (r.kind === "rooms" ? r.count : 0), 1);
  const partitions = (w + d) * 1.2 * storeys * 2.7 * prices.interiorWallM2;
  const windows = ((area * storeys) / 10) * (prices.windowBase + 1.5 * prices.windowM2);
  const doors = rooms * (prices.doorBase + 1.8 * prices.doorM2) + (storeys - 1) * prices.stairs;
  const floors = area * storeys * prices.floorM2.Laminate;
  return totalCost(estimate(h, prices)) + partitions + windows + doors + floors;
}

/** A client's budget at a difficulty (the fee stays reckoned on the moderate budget). */
export function withDifficulty(client: Client, difficulty: Difficulty): Client {
  if (difficulty === "moderate" || !Number.isFinite(client.budget)) return client;
  let budget = client.budget * BUDGET_FACTOR[difficulty];
  if (difficulty === "hard") budget = Math.min(client.budget, Math.max(budget, typicalCost(client) * HARD_MARGIN));
  return { ...client, budget: Math.ceil(budget / 1000) * 1000, feeBudget: client.budget };
}
