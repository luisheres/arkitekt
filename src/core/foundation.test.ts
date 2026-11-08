import { describe, expect, it } from "vitest";
import { evaluateBrief } from "./brief";
import { freePlayClient } from "./clients";
import { costLines, defaultPrices } from "./cost";
import { altanLayout, altanSteps, altanTerraces, placeAltan, raisedDoors } from "./features";
import { Vec2, pointInPolygon } from "./geometry";
import { House } from "./model";
import { plotById } from "./plot";
import { abilities, missingTechniques } from "./progression";
import { earthworks, exposedBase, foundationColumns, shapedGround, siteLevel, standingOutline } from "./site";
import { groundHeight } from "./plot";

const v = (x: number, y: number) => new Vec2(x, y);
const steep = plotById("skislope")!;
const flat = plotById("suburban")!;
/** A 12 x 8 house with a front door and a glass door at the back. */
const make = () => {
  const h = new House();
  const ids = h.addWallLoop([v(8, 8), v(20, 8), v(20, 16), v(8, 16)], 2.7, "FaluRed");
  const door = h.addDoor(ids[0], 3, 1, 2.1);
  h.addGlassDoor(ids[2], 6, 2.4, 2.1);
  return { h, ids, door };
};
const kinds = (h: House, plot = steep) => costLines(h, defaultPrices(), plot).map((l) => l.what.kind);

describe("a house on columns", () => {
  it("stands on columns from the ground up to its floor, with no foundation wall showing", () => {
    const { h } = make();
    expect(exposedBase(h, steep).length).toBeGreaterThan(0);
    expect(foundationColumns(h, steep)).toEqual([]);
    h.foundation = "Columns";
    expect(exposedBase(h, steep)).toEqual([]);
    const cols = foundationColumns(h, steep);
    expect(cols.length).toBeGreaterThan(4);
    const level = siteLevel(h, steep);
    const outline = standingOutline(h)!;
    for (const c of cols) {
      expect(c.top).toBe(level);
      expect(c.ground).toBeLessThan(level);
      expect(pointInPolygon(c.at, outline)).toBe(true);
    }
    expect(kinds(h)).toContain("columns");
    expect(kinds(h)).not.toContain("exposedFoundation");
  });

  it("leaves the ground as it is downhill and under the house, so less earth is moved", () => {
    const { h } = make();
    const plinthFill = earthworks(h, steep).fill;
    h.foundation = "Columns";
    expect(earthworks(h, steep).fill).toBeLessThan(plinthFill);
    // Under the house, downhill, the ground is the natural ground.
    const ground = shapedGround(h, steep);
    const level = siteLevel(h, steep);
    const low = [v(10, 9), v(18, 9), v(10, 15), v(18, 15)].find((p) => groundHeight(steep, p.x, p.y) < level - 0.3)!;
    expect(ground(low.x, low.y)).toBeCloseTo(groundHeight(steep, low.x, low.y), 6);
  });

  it("not with a basement, nor on flat ground", () => {
    const { h } = make();
    h.foundation = "Columns";
    expect(foundationColumns(h, flat)).toEqual([]);
    h.basement = true;
    expect(foundationColumns(h, steep)).toEqual([]);
  });
});

describe("the altan", () => {
  it("runs round the house, joined at the corners, and its open edges are all outside", () => {
    const { h } = make();
    placeAltan(h, 2);
    const a = altanLayout(h)!;
    expect(a.pieces).toHaveLength(8); // four sides, four corners
    const t = h.walls[0].thickness;
    const [w, d] = [12 + t, 8 + t];
    expect(a.area).toBeCloseTo((w + 4) * (d + 4) - w * d, 0);
    for (const bit of a.edge) {
      const m = bit.a.add(bit.b).scale(0.5).add(bit.out.scale(0.1));
      expect(pointInPolygon(m, standingOutline(h)!)).toBe(false);
    }
  });

  it("along one wall is a strip as long as that side of the house", () => {
    const { h, ids } = make();
    h.altan = { depth: 2.5, walls: [ids[2]] };
    const a = altanLayout(h)!;
    expect(a.pieces).toHaveLength(1);
    expect(a.area).toBeCloseTo((12 + h.walls[0].thickness) * 2.5, 0);
  });

  it("has steps down when it stands above the ground, and a door onto it needs none of its own", () => {
    const { h, ids, door } = make();
    h.foundation = "Columns";
    h.altan = { depth: 2.4, walls: [ids[0]] };
    const floor = siteLevel(h, steep) + 0.05;
    const ground = shapedGround(h, steep);
    expect(altanSteps(h, floor, ground)?.steps ?? 0).toBeGreaterThan(0);
    expect(raisedDoors(h, floor, ground).map((r) => r.opening)).not.toContain(door);
    expect(altanSteps(h, 0.05, () => 0)).toBeNull();
  });

  it("is a terrace for the client and costs like one; it needs the Terraces technique", () => {
    const { h, ids } = make();
    const client = { ...freePlayClient("suburban"), items: [{ req: { kind: "terrace" as const }, must: false }, { req: { kind: "sunnyTerrace" as const, minHours: 6 }, must: false }] };
    const [before] = evaluateBrief(h, client, defaultPrices());
    expect(before.met).toBe(false);
    h.altan = { depth: 2.4, walls: [ids[0]] }; // the south side: plenty of sun
    const [terrace, sunny] = evaluateBrief(h, client, defaultPrices());
    expect(terrace.met).toBe(true);
    expect(sunny.met).toBe(true);
    expect(altanTerraces(h)).toHaveLength(1);
    const line = costLines(h, defaultPrices(), flat).find((l) => l.what.kind === "altan")!;
    expect(line.amount).toBeCloseTo(altanLayout(h)!.area * defaultPrices().terraceM2, 6);
    expect(missingTechniques(h, abilities(["woodFloor"]))).toContain("terraces");
  });

  it("and the foundation are saved with the design", () => {
    const { h, ids } = make();
    h.foundation = "Columns";
    h.altan = { depth: 3, walls: [ids[1], ids[2]] };
    const back = House.fromJSON(JSON.parse(JSON.stringify(h)));
    expect(back.foundation).toBe("Columns");
    expect(back.altan).toEqual({ depth: 3, walls: [ids[1], ids[2]] });
    expect(JSON.stringify(make().h)).not.toContain("foundation");
  });
});
