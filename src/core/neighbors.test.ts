import { describe, expect, it } from "vitest";
import { chimneys } from "./features";
import { Vec2 } from "./geometry";
import { neighborHouse, pointAlong, polylineLength, townShops } from "./neighbors";
import { allPlots } from "./plot";
import { buildRoof } from "./roof";
import { analyzeHouse } from "./rooms";
import { sceneryFor } from "./scenery";

describe("neighbours' houses", () => {
  const all = allPlots().flatMap((p) => sceneryFor(p).neighbors.map((n) => ({ p, n })));

  it("are whole houses of the game: closed walls, a door that can be reached, a roof", () => {
    expect(all.length).toBeGreaterThan(50);
    for (const { p, n } of all) {
      const h = neighborHouse(n);
      const fp = h.footprint(0);
      expect(fp.ok, p.id).toBe(true);
      expect(buildRoof(h).ok, `${p.id} ${n.roofStyle}`).toBe(true);
      expect(analyzeHouse(h).rooms.every((r) => r.reachable), p.id).toBe(true);
      expect(h.levels).toBe(n.storeys);
      // Its front door faces -y, the way the neighbour faces once turned.
      const door = h.openings.find((o) => o.kind === "Door")!;
      expect(h.wall(door.wall)!.start.y).toBeCloseTo(-n.depth / 2, 9);
    }
  });

  it("are the same each time, and some have chimneys", () => {
    const { n } = all[0];
    expect(JSON.stringify(neighborHouse(n))).toBe(JSON.stringify(neighborHouse(n)));
    const withChimney = all.filter(({ n }) => {
      const h = neighborHouse(n);
      const roof = buildRoof(h);
      return chimneys(h, roof.ok ? roof.value : null).length > 0;
    });
    expect(withChimney.length).toBeGreaterThan(5);
    expect(withChimney.length).toBeLessThan(all.length);
  });

  it("in town, the nearest are a café, a bakery, a grocer and an ice-cream shop", () => {
    const town = allPlots().filter((p) => sceneryFor(p).setting === "town");
    expect(town.length).toBeGreaterThan(0);
    for (const p of town) {
      const shops = townShops(p);
      expect([...shops.values()].sort(), p.id).toEqual(["bakery", "cafe", "grocer", "icecream"].slice(0, shops.size).sort());
      expect(shops.size, p.id).toBeGreaterThan(0);
      for (const n of shops.keys()) expect(neighborHouse(n, shops.get(n)).openings.filter((o) => o.kind === "Window" && o.height > 1.5)).toHaveLength(2);
    }
    for (const p of allPlots().filter((p) => sceneryFor(p).setting !== "town")) expect(townShops(p).size).toBe(0);
  });
});

describe("moving along a road", () => {
  const line = [new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 5)];
  it("finds the point and direction at a distance, clamped to the ends", () => {
    expect(polylineLength(line)).toBe(15);
    expect(pointAlong(line, 4).at.x).toBeCloseTo(4, 9);
    const corner = pointAlong(line, 12);
    expect([corner.at.x, corner.at.y]).toEqual([10, 2]);
    expect([corner.dir.x, corner.dir.y]).toEqual([0, 1]);
    expect(pointAlong(line, 99).at.y).toBeCloseTo(5, 9);
    expect(pointAlong(line, -3).at.x).toBe(0);
  });
});
