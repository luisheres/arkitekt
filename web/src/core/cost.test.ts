import { describe, expect, it } from "vitest";
import { defaultPrices, estimate } from "./cost";
import { Vec2 } from "./geometry";
import { House } from "./model";

const v = (x: number, y: number) => new Vec2(x, y);

describe("costs", () => {
  it("openings reduce wall cost but add their own", () => {
    const h = new House();
    const ids = h.addWallLoop([v(0, 0), v(10, 0), v(10, 5), v(0, 5)], 2.5, "Wood");
    const p = defaultPrices();
    const bare = estimate(h, p);
    expect(bare.walls).toBeCloseTo(30 * 2.5 * 120, 6);
    expect(bare.foundation).toBeCloseTo(50 * 180, 3);

    h.addWindow(ids[0], 5, 2, 1, 1);
    const withWindow = estimate(h, p);
    expect(bare.walls - withWindow.walls).toBeCloseTo(2 * 120, 3);
    expect(withWindow.windows).toBeCloseTo(300 + 2 * 450, 6);
  });

  it("roof cost depends on material", () => {
    const h = new House();
    h.addWallLoop([v(0, 0), v(8, 0), v(8, 6), v(0, 6)], 2.7, "Plaster");
    const p = defaultPrices();
    h.roof = { style: "Gable", pitchDeg: 30, overhang: 0.3, material: "Shingles" };
    const cheap = estimate(h, p).roof;
    h.roof = { ...h.roof, material: "Tiles" };
    const dear = estimate(h, p).roof;
    expect(cheap).toBeGreaterThan(0);
    expect(dear).toBeGreaterThan(cheap);
  });
});
