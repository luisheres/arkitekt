import { describe, expect, it } from "vitest";
import { Vec2 } from "./geometry";
import { SETTINGS, allPlots, groundHeight, plotById, starterPlots } from "./plot";
import { STREET, inLake, sceneryFor, treeLook } from "./scenery";

const [suburban, lakeside, hillside] = starterPlots();

describe("scenery", () => {
  it("keeps the plot and the street flat", () => {
    for (const plot of starterPlots()) {
      const s = sceneryFor(plot);
      for (let x = 0; x <= plot.width; x += 2) {
        for (let y = STREET.from; y <= plot.depth; y += 2) expect(Math.abs(s.height(x, y)), `${plot.setting} ${x},${y}`).toBeLessThan(1e-9);
      }
    }
  });

  it("puts a lake behind the lakeside plot, not on it", () => {
    const s = sceneryFor(lakeside);
    expect(s.lake).not.toBeNull();
    const lake = s.lake!;
    expect(lake.center.y - lake.ry).toBeGreaterThan(lakeside.depth + 3);
    expect(inLake(lake, new Vec2(lakeside.width / 2, lakeside.depth + 15))).toBe(true);
    expect(s.height(lakeside.width / 2, lakeside.depth + 15)).toBeLessThan(lake.level);
    // The jetty reaches from the garden out over the water.
    expect(inLake(lake, s.jetty!.to)).toBe(true);
    expect(sceneryFor(suburban).lake).toBeNull();
  });

  it("raises hills behind the hillside plot and drops the land in front", () => {
    const s = sceneryFor(hillside);
    expect(s.height(hillside.width / 2, hillside.depth + 30)).toBeGreaterThan(6);
    expect(s.height(hillside.width / 2, -35)).toBeLessThan(-6);
  });

  it("keeps trees, rocks and neighbours off the plot, the street and the water", () => {
    for (const plot of starterPlots()) {
      const s = sceneryFor(plot);
      expect(s.trees.length).toBeGreaterThan(30);
      for (const t of s.trees) {
        const onPlot = t.at.x > 0 && t.at.x < plot.width && t.at.y > 0 && t.at.y < plot.depth;
        // Garden bushes may stand in the plot's corners, outside the buildable area.
        if (onPlot) expect(t.kind === "bush" && (t.at.x < plot.setback || t.at.x > plot.width - plot.setback)).toBe(true);
        expect(t.at.y > STREET.from - 1 && t.at.y < STREET.to + 0.5, "street").toBe(false);
        if (s.lake) expect(inLake(s.lake, t.at), "lake").toBe(false);
      }
      for (const n of s.neighbors) {
        expect(n.at.x + n.width / 2 < 0 || n.at.x - n.width / 2 > plot.width || n.at.y + n.depth / 2 < STREET.from).toBe(true);
      }
    }
    expect(sceneryFor(suburban).neighbors.length).toBeGreaterThanOrEqual(4);
  });

  it("looks the same every time", () => {
    expect(sceneryFor(hillside).trees).toEqual(sceneryFor(hillside).trees);
  });

  it("gives some round trees blossom or apples, and only round trees", () => {
    const trees = [suburban, lakeside].flatMap((p) => sceneryFor(p).trees);
    const looks = new Set(trees.filter((t) => t.kind === "round").map(treeLook));
    expect(looks).toEqual(new Set(["plain", "blossom", "apple"]));
    expect(trees.filter((t) => t.kind !== "round").every((t) => treeLook(t) === "plain")).toBe(true);
  });
});

describe("all plots", () => {
  const plots = allPlots();

  it("are thirty, with their own ids, names in every language, and tiers that buy them", () => {
    expect(plots).toHaveLength(30);
    expect(new Set(plots.map((p) => p.id)).size).toBe(30);
    for (const p of plots) {
      expect(p.name.en.length && p.name.sv.length).toBeTruthy();
      expect(p.tiers.length).toBeGreaterThan(0);
      expect(plotById(p.id)).toBe(p);
    }
    for (const tier of [1, 2, 3, 4]) expect(plots.filter((p) => p.tiers.includes(tier)).length, `tier ${tier}`).toBeGreaterThanOrEqual(6);
    for (const setting of SETTINGS) expect(plots.some((p) => p.setting === setting), setting).toBe(true);
  });

  it("follow each plot's own ground, keep the street level, and keep scenery off them and out of the water", () => {
    for (const plot of plots) {
      const s = sceneryFor(plot);
      for (const [x, y] of [[0, 0], [plot.width, plot.depth], [plot.width / 2, plot.depth / 2]]) expect(s.height(x, y), plot.id).toBeCloseTo(groundHeight(plot, x, y), 6);
      for (const x of [0, plot.width / 2, plot.width]) expect(s.height(x, STREET.center), `${plot.id} street`).toBeCloseTo(0, 6);
      for (const t of s.trees) {
        const onPlot = t.at.x > 0 && t.at.x < plot.width && t.at.y > 0 && t.at.y < plot.depth;
        if (onPlot) expect(t.kind, plot.id).toBe("bush");
        expect(t.at.y > STREET.from - 1 && t.at.y < STREET.to + 0.5, `${plot.id} street`).toBe(false);
        if (s.lake) expect(inLake(s.lake, t.at), `${plot.id} water`).toBe(false);
      }
      expect(s.trees.length, plot.id).toBeGreaterThan(10);
      // Water never reaches the plot, and stays below it.
      if (s.lake) {
        for (const [x, y] of [[0, plot.depth], [plot.width, plot.depth], [plot.width / 2, plot.depth + 2]]) expect(inLake(s.lake, new Vec2(x, y)), plot.id).toBe(false);
        for (const [x, y] of [[0, plot.depth], [plot.width, plot.depth]]) expect(groundHeight(plot, x, y), plot.id).toBeGreaterThan(s.lake.level);
      }
    }
  });

  it("give each kind of surroundings its own ground", () => {
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
    expect(sceneryFor(plotById("seaside")!).lake?.kind).toBe("sea");
    expect(sceneryFor(plotById("riverside")!).lake?.kind).toBe("river");
    expect(sceneryFor(plotById("townplot")!).neighbors.length).toBeGreaterThanOrEqual(10);
  });
});

describe("the lie of the land", () => {
  it("is flat on the original plots and slopes on others, always level with the street at the front", () => {
    for (const plot of starterPlots()) expect(plot.terrain).toBeUndefined();
    const slope = plotById("skislope")!;
    expect(groundHeight(slope, slope.width / 2, slope.depth)).toBeGreaterThan(5);
    for (const plot of allPlots()) for (const x of [0, plot.width / 2, plot.width]) expect(groundHeight(plot, x, 0), plot.id).toBeCloseTo(0, 9);
    expect(allPlots().filter((p) => p.terrain).length).toBeGreaterThanOrEqual(15);
  });
});
