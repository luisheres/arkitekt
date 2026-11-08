import { describe, expect, it } from "vitest";
import { Vec2 } from "./geometry";
import { SETTINGS, allPlots, groundHeight, plotById, sideEdge, starterPlots } from "./plot";
import { inWater, sceneryFor } from "./scenery";

const plots = allPlots();
const onPlot = (plot: { width: number; depth: number }, p: Vec2, margin = 0) => p.x > -margin && p.x < plot.width + margin && p.y > -margin && p.y < plot.depth + margin;

describe("all plots", () => {
  it("are thirty, with their own ids, names in every language, tiers and access", () => {
    expect(plots).toHaveLength(30);
    expect(new Set(plots.map((p) => p.id)).size).toBe(30);
    for (const p of plots) {
      expect(p.name.en.length && p.name.sv.length).toBeTruthy();
      expect(p.tiers.length).toBeGreaterThan(0);
      expect(plotById(p.id)).toBe(p);
      expect(p.access).toBeDefined();
    }
    for (const tier of [1, 2, 3, 4]) expect(plots.filter((p) => p.tiers.includes(tier)).length, `tier ${tier}`).toBeGreaterThanOrEqual(6);
    for (const setting of SETTINGS) expect(plots.some((p) => p.setting === setting), setting).toBe(true);
    // Roads come from every side, and in every way.
    expect(new Set(plots.map((p) => p.access.side)).size).toBe(4);
    expect(new Set(plots.map((p) => p.access.layout)).size).toBe(5);
  });

  it("keep the plot's own ground, and keep water, roads and scenery off it", () => {
    for (const plot of plots) {
      const s = sceneryFor(plot);
      for (const [x, y] of [[0, 0], [plot.width, plot.depth], [plot.width / 2, plot.depth / 2]]) expect(s.height(x, y), plot.id).toBeCloseTo(groundHeight(plot, x, y), 6);
      for (let x = 0; x <= plot.width; x += 2) for (let y = 0; y <= plot.depth; y += 2) expect(inWater(s, new Vec2(x, y)), `${plot.id} water at ${x},${y}`).toBe(false);
      for (const t of s.trees) if (onPlot(plot, t.at)) expect(t.kind, plot.id).toBe("bush");
      for (const t of s.trees) expect(inWater(s, t.at), `${plot.id} tree in water`).toBe(false);
      for (const n of s.neighbors) expect(onPlot(plot, n.at, 3), `${plot.id} neighbour`).toBe(false);
      for (const l of s.landmarks) if (l.kind !== "footbridge") expect(onPlot(plot, l.at, 1), `${plot.id} ${l.kind}`).toBe(false);
      expect(s.trees.length, plot.id).toBeGreaterThan(10);
      if (s.water) expect(s.water.level, plot.id).toBeLessThan(Math.min(groundHeight(plot, 0, plot.depth), groundHeight(plot, plot.width, 0)));
    }
  });

  it("reach every plot by road on its access side", () => {
    for (const plot of plots) {
      const s = sceneryFor(plot);
      const e = sideEdge(plot, plot.access.side);
      const near = Math.min(...s.roads.flatMap((r) => r.points.map((p) => distanceToSegment(p, e.a, e.b))));
      expect(near, plot.id).toBeLessThan(ROAD_REACH);
      // No road crosses the plot.
      for (const r of s.roads) for (const p of r.points) expect(onPlot(plot, p, -0.6), `${plot.id} road on plot`).toBe(false);
    }
  });

  it("give each kind of surroundings its own character", () => {
    const covers = (id: string) => {
      const plot = plotById(id)!;
      const s = sceneryFor(plot);
      const seen = new Set<string>();
      for (let x = -80; x < plot.width + 80; x += 4) for (let y = -60; y < plot.depth + 80; y += 4) seen.add(s.surface(x, y));
      return seen;
    };
    expect(covers("farm")).toContain("field1");
    expect(covers("mountain")).toContain("snow");
    expect(covers("seaside")).toContain("sand");
    expect(sceneryFor(plotById("seaside")!).water?.kind).toBe("sea");
    expect(sceneryFor(plotById("riverside")!).water?.kind).toBe("river");
    expect(sceneryFor(plotById("townplot")!).neighbors.length).toBeGreaterThanOrEqual(10);
    expect(sceneryFor(plotById("culdesac")!).roads[0].turning).toBeDefined();
    expect(sceneryFor(plotById("clearing")!).roads.map((r) => r.kind)).toContain("gravel");
    expect(sceneryFor(plotById("farm")!).landmarks.map((l) => l.kind)).toEqual(expect.arrayContaining(["barn", "windmill"]));
    expect(sceneryFor(plotById("mill")!).landmarks.map((l) => l.kind)).toEqual(expect.arrayContaining(["millRuin", "footbridge"]));
  });

  it("makes plots of the same kind differ: different lakes, different rivers", () => {
    const lakes = ["lakeside", "bay", "reeds", "lakeview"].map((id) => sceneryFor(plotById(id)!).water!);
    const centres = lakes.map((l) => l.outline.reduce((a, b) => a.add(b), new Vec2(0, 0)).scale(1 / l.outline.length));
    for (let i = 0; i < centres.length; i++) for (let j = i + 1; j < centres.length; j++) expect(centres[i].distance(centres[j])).toBeGreaterThan(10);
    expect(lakes.filter((l) => l.islands.length).length).toBeGreaterThanOrEqual(2);
    // A river winds and changes width.
    const river = sceneryFor(plotById("riverside")!).water!.river!;
    expect(Math.max(...river.widths) - Math.min(...river.widths)).toBeGreaterThan(1.5);
  });

  it("looks the same every time", () => {
    const [a, b] = [sceneryFor(plotById("pinewood")!), sceneryFor(plotById("pinewood")!)];
    expect(a).toBe(b);
  });
});

const ROAD_REACH = 12;

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = b.sub(a);
  const t = Math.min(Math.max(p.sub(a).dot(ab) / ab.dot(ab), 0), 1);
  return a.add(ab.scale(t)).distance(p);
}

describe("the lie of the land", () => {
  it("is flat on the original plots and slopes on others, always level with the street at the front", () => {
    for (const plot of starterPlots()) expect(plot.terrain).toBeUndefined();
    const slope = plotById("skislope")!;
    expect(groundHeight(slope, slope.width / 2, slope.depth)).toBeGreaterThan(5);
    for (const plot of allPlots()) for (const x of [0, plot.width / 2, plot.width]) expect(groundHeight(plot, x, 0), plot.id).toBeCloseTo(0, 9);
    expect(allPlots().filter((p) => p.terrain).length).toBeGreaterThanOrEqual(15);
  });
});
