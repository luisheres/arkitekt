import { describe, expect, it } from "vitest";
import { evaluateBrief } from "./brief";
import { freePlayClient } from "./clients";
import { costLines, defaultPrices } from "./cost";
import { addStoreyAbove, placeTerrace, setRoomType } from "./edit";
import { chimneys, dormerShape, placeDormer } from "./features";
import { Vec2 } from "./geometry";
import { House } from "./model";
import { abilities, missingTechniques } from "./progression";
import { analyzeHouse } from "./rooms";
import { buildRoof, roofHeightAt } from "./roof";
import { validate } from "./validate";

const v = (x: number, y: number) => new Vec2(x, y);
const plot = freePlayClient("suburban").plot;
const kinds = (h: House) => validate(h, plot, Infinity, defaultPrices()).map((i) => i.kind);

/** A 10 x 8 house with a gable roof (ridge along x), split into two rooms by a wall at x = 10. */
const make = () => {
  const h = new House();
  const ids = h.addWallLoop([v(5, 6), v(15, 6), v(15, 14), v(5, 14)], 2.7, "Plaster");
  const inner = h.addWall(v(10, 6), v(10, 14), 2.7, "Plaster");
  h.addDoor(ids[0], 2, 1, 2.1);
  setRoomType(h, v(7, 10), "Living", 0);
  setRoomType(h, v(13, 10), "Bedroom", 0);
  h.roof = { style: "Gable", pitchDeg: 35, overhang: 0.4, material: "Tiles" };
  return { h, ids, inner };
};

describe("glass doors and passages", () => {
  it("a glass door is a way in and lets daylight in", () => {
    const { h, ids } = make();
    expect(analyzeHouse(h).rooms.find((r) => r.type === "Bedroom")!.daylit).toBe(false);
    h.addGlassDoor(ids[1], 4, 1.8, 2.1);
    expect(analyzeHouse(h).rooms.find((r) => r.type === "Bedroom")!.daylit).toBe(true);
    expect(missingTechniques(h, abilities(["woodFloor"]))).toContain("glassDoors");
  });

  it("a passage joins two rooms without a door, and only inside", () => {
    const { h, inner, ids } = make();
    expect(kinds(h)).toContain("RoomUnreachable");
    h.addPassage(inner, 4, 1.4, 2.2);
    expect(kinds(h)).not.toContain("RoomUnreachable");
    h.addPassage(ids[2], 3, 1.4, 2.2);
    expect(kinds(h)).toContain("PassageInOuterWall");
  });
});

describe("fireplaces and chimneys", () => {
  it("a chimney rises from the fireplace through the roof, and is priced by its height", () => {
    const { h } = make();
    h.addFurniture({ kind: "Fireplace", level: 0, at: v(7, 13.6), facing: v(0, -1), width: 1.4, depth: 0.6, height: 1.2 });
    const [c] = chimneys(h);
    const roof = buildRoof(h);
    expect(roof.ok).toBe(true);
    if (!roof.ok) return;
    expect(c.top).toBeGreaterThan(roofHeightAt(roof.value, c.at)! + 0.5);
    const line = costLines(h, defaultPrices(), plot).find((l) => l.what.kind === "chimney")!;
    expect(line.quantity).toBeCloseTo(c.top - c.base, 6);
    expect(costLines(h, defaultPrices(), plot).some((l) => l.what.kind === "fireplace")).toBe(true);
    const client = { ...freePlayClient("suburban"), items: [{ must: false, req: { kind: "fireplace" as const } }] };
    expect(evaluateBrief(h, client, defaultPrices())[0].met).toBe(true);
  });
});

describe("dormers", () => {
  it("stand in a slope over an eave wall, not on a gable end or a flat roof", () => {
    const { h, ids } = make();
    const eave = placeDormer(h, ids[0])!;
    expect(dormerShape(h, h.dormer(eave)!)).not.toBeNull();
    expect(kinds(h)).not.toContain("DormerNotOnSlope");
    placeDormer(h, ids[1]); // the gable end
    expect(kinds(h)).toContain("DormerNotOnSlope");
    h.roof = { ...h.roof!, style: "Flat", pitchDeg: 2 };
    expect(kinds(h).filter((k) => k === "DormerNotOnSlope")).toHaveLength(2);
  });

  it("light the top-floor room under them", () => {
    const { h, ids } = make();
    addStoreyAbove(h);
    setRoomType(h, v(10, 10), "Bedroom", 1);
    const up = h.wallsOn(1).find((w) => w.start.y === 6 && w.end.y === 6)!;
    expect(analyzeHouse(h).rooms.find((r) => r.level === 1)!.daylit).toBe(false);
    placeDormer(h, up.id);
    expect(analyzeHouse(h).rooms.find((r) => r.level === 1)!.daylit).toBe(true);
    void ids;
  });
});

describe("terraces", () => {
  it("are ground-floor balconies: a cheap deck, needing a door out", () => {
    const { h, ids } = make();
    placeTerrace(h, ids[2]);
    expect(kinds(h)).toContain("BalconyNeedsDoor");
    expect(kinds(h)).not.toContain("BalconyOnGroundFloor");
    h.addGlassDoor(ids[2], 5, 1.8, 2.1);
    expect(kinds(h)).not.toContain("BalconyNeedsDoor");
    const deck = costLines(h, defaultPrices(), plot).find((l) => l.what.kind === "deck")!;
    expect(deck.amount).toBeCloseTo(4 * 2.5 * 180, 6);
    expect(missingTechniques(h, abilities(["woodFloor", "glassDoors", "tileRoof"]))).toEqual(["terraces"]);
  });
});
