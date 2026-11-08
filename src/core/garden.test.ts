import { describe, expect, it } from "vitest";
import { accessRoutes } from "./access";
import { evaluateBrief } from "./brief";
import { freePlayClient } from "./clients";
import { costLines, defaultPrices } from "./cost";
import { addGardenPlant } from "./furnish";
import { FENCE_INSET, fenceLayout } from "./features";
import { GARDEN_PLANTS, GARDEN_THINGS, isOutdoor } from "./furniture";
import { Vec2 } from "./geometry";
import { House } from "./model";
import { allPlots, plotById } from "./plot";
import { sceneryFor } from "./scenery";

const v = (x: number, y: number) => new Vec2(x, y);
/** A 10 x 8 house with a front door and a garage door, both towards the street (y = 0). */
const make = () => {
  const h = new House();
  const ids = h.addWallLoop([v(5, 8), v(15, 8), v(15, 16), v(5, 16)], 2.7, "Plaster");
  h.addDoor(ids[0], 2, 1, 2.1);
  h.addGarageDoor(ids[0], 7, 2.5, 2.1);
  return h;
};

describe("fences", () => {
  const suburban = plotById("suburban")!;

  it("run round the plot, with a gate for the path and a gap for the drive", () => {
    const h = make();
    h.fence = "Picket";
    const f = fenceLayout(h, suburban);
    const perimeter = 2 * (suburban.width + suburban.depth - 4 * FENCE_INSET);
    const gaps = f.gaps.reduce((s, g) => s + g.a.distance(g.b), 0);
    expect(f.length).toBeCloseTo(perimeter - gaps, 6);
    expect(f.gaps.filter((g) => g.gate)).toHaveLength(1);
    expect(f.gaps.filter((g) => !g.gate)).toHaveLength(1);
    // Both on the street side.
    for (const g of f.gaps) expect(g.a.y).toBeCloseTo(FENCE_INSET, 6);
    // Runs never cross a gap.
    for (const [a, b] of f.runs) for (const g of f.gaps) expect(Math.min(a.x, b.x) >= Math.max(g.a.x, g.b.x) - 1e-9 || Math.max(a.x, b.x) <= Math.min(g.a.x, g.b.x) + 1e-9 || a.y !== b.y || Math.abs(a.y - g.a.y) > 1e-9).toBe(true);
  });

  it("are paid for by the metre, plus the gate, and saved with the design", () => {
    const h = make();
    expect(costLines(h, defaultPrices(), suburban).some((l) => l.what.kind === "fence")).toBe(false);
    h.fence = "Board";
    const lines = costLines(h, defaultPrices(), suburban);
    const fence = lines.find((l) => l.what.kind === "fence")!;
    expect(fence.amount).toBeCloseTo(fenceLayout(h, suburban).length * defaultPrices().fenceM.Board, 6);
    expect(lines.find((l) => l.what.kind === "gate")!.quantity).toBe(1);
    expect(House.fromJSON(JSON.parse(JSON.stringify(h))).fence).toBe("Board");
  });
});

describe("garden things", () => {
  it("stand outside, cost something, and are not plants", () => {
    for (const k of GARDEN_THINGS) {
      expect(isOutdoor(k)).toBe(true);
      expect(GARDEN_PLANTS).not.toContain(k);
      expect(defaultPrices().plants[k]).toBeGreaterThan(0);
    }
    expect(isOutdoor("Sofa")).toBe(false);
  });

  it("go in a free spot in the garden, and a swing satisfies a family's wish", () => {
    const h = make();
    const plot = freePlayClient("suburban").plot;
    const id = addGardenPlant(h, plot, "Swing");
    expect(id).not.toBeNull();
    const client = { ...freePlayClient("suburban"), items: [{ req: { kind: "playGarden" as const }, must: false }] };
    expect(evaluateBrief(make(), client, defaultPrices())[0].met).toBe(false);
    expect(evaluateBrief(h, client, defaultPrices())[0].met).toBe(true);
  });
});

describe("where garden things go", () => {
  it("in the back garden, away from the road, and never on the drive or the path", () => {
    const h = make();
    const plot = plotById("suburban")!; // the street runs along the front (y = 0)
    for (const k of GARDEN_THINGS) expect(addGardenPlant(h, plot, k), k).not.toBeNull();
    const shed = h.furniture.find((f) => f.kind === "Shed")!;
    expect(shed.at.y).toBeGreaterThan(16); // behind the house
    const routes = accessRoutes(h, plot).routes;
    for (const f of h.furniture)
      for (const r of routes)
        for (const p of r.points) expect(Math.abs(p.x - f.at.x) > f.width / 2 || Math.abs(p.y - f.at.y) > f.depth / 2, `${f.kind} on the ${r.kind}`).toBe(true);
  });
});

describe("trees", () => {
  it("include oaks, maples, willows by the water and stumps in the woods", () => {
    const kinds = new Set(allPlots().flatMap((p) => sceneryFor(p).trees.map((t) => t.kind)));
    for (const k of ["oak", "maple", "willow", "stump"] as const) expect(kinds.has(k), k).toBe(true);
    for (const p of allPlots()) {
      const s = sceneryFor(p);
      for (const t of s.trees.filter((t) => t.kind === "willow")) expect(s.waterDistance(t.at.x, t.at.y), p.id).toBeLessThan(15);
    }
  });
});
