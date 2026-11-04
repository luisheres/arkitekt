import { describe, expect, it } from "vitest";
import { Vec2 } from "./geometry";
import { starterPlots } from "./plot";
import { STREET, inLake, sceneryFor } from "./scenery";

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
});
