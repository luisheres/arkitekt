import { describe, expect, it } from "vitest";
import { costLines, defaultPrices, estimate, totalCost } from "./cost";
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

  it("itemises every cost by material, kind of opening and finish, adding up to the total", () => {
    const h = new House();
    const ids = h.addWallLoop([v(0, 0), v(10, 0), v(10, 5), v(0, 5)], 2.5, "Brick");
    h.walls.find((w) => w.id === ids[1])!.material = "Wood";
    h.addWindow(ids[0], 3, 1.2, 1, 1);
    h.addWindow(ids[0], 7, 1.2, 1, 1);
    h.roof = { style: "Gable", pitchDeg: 30, overhang: 0.3, material: "Tiles" };
    const p = defaultPrices();
    const lines = costLines(h, p);
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    expect(sum).toBeCloseTo(totalCost(estimate(h, p)), 6);

    const facade = lines.filter((l) => l.group === "facade").map((l) => l.what);
    expect(facade).toEqual([
      { kind: "facade", material: "Brick" },
      { kind: "facade", material: "Wood" },
    ]);
    const windows = lines.find((l) => l.what.kind === "opening")!;
    expect(windows).toMatchObject({ group: "openings", quantity: 2, unit: "pieces" });
    expect(windows.amount).toBeCloseTo(2 * (300 + 1.2 * 450), 6);
    expect(lines.find((l) => l.what.kind === "roofCovering")?.group).toBe("roof");
    expect(lines.every((l) => l.amount > 0)).toBe(true);
  });
});
