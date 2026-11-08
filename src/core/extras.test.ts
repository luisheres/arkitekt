import { describe, expect, it } from "vitest";
import { evaluateBrief } from "./brief";
import { freePlayClient } from "./clients";
import { costLines, defaultPrices } from "./cost";
import { addGardenPlant, addFurnitureAt } from "./furnish";
import { balconyOutline, placeBalcony, setRoomPaint, setRoomType } from "./edit";
import { Vec2 } from "./geometry";
import { House } from "./model";
import { abilities, missingTechniques, techniquesFor } from "./progression";
import { validate } from "./validate";

const v = (x: number, y: number) => new Vec2(x, y);
const plot = freePlayClient("suburban").plot;

/** A two-storey box with a room on each floor. */
function twoStoreys(): { h: House; up: number[] } {
  const h = new House();
  const pts = [v(5, 7), v(13, 7), v(13, 13), v(5, 13)];
  const down = h.addWallLoop(pts, 2.7, "Plaster");
  h.addDoor(down[0], 2, 1, 2.1);
  setRoomType(h, v(9, 10), "Living", 0);
  const level = h.addLevel();
  const up = h.addWallLoop(pts, 2.7, "Plaster", level);
  setRoomType(h, v(9, 10), "Bedroom", level);
  return { h, up };
}

describe("balconies", () => {
  it("stick out from the outer face of their wall, and need a door", () => {
    const { h, up } = twoStoreys();
    const id = placeBalcony(h, up[0])!;
    const outline = balconyOutline(h, h.balcony(id)!)!;
    // The front wall runs along y = 7; outside is towards the street (smaller y).
    expect(Math.max(...outline.map((p) => p.y))).toBeLessThan(7);
    expect(Math.min(...outline.map((p) => p.y))).toBeCloseTo(7 - 0.1 - 1.4, 1);
    const kinds = () => validate(h, plot, Infinity, defaultPrices()).map((i) => i.kind);
    expect(kinds()).toContain("BalconyNeedsDoor");
    h.addDoor(up[0], 4, 1, 2.1);
    expect(kinds()).not.toContain("BalconyNeedsDoor");
  });

  it("on the ground floor are terraces, and go when their wall goes", () => {
    const { h } = twoStoreys();
    const ground = h.wallsOn(0)[0];
    placeBalcony(h, ground.id);
    expect(validate(h, plot, Infinity, defaultPrices()).map((i) => i.kind)).not.toContain("BalconyOnGroundFloor");
    h.removeWall(ground.id);
    expect(h.balconies).toHaveLength(0);
  });

  it("cost by area, survive a save, and need the Balconies technique", () => {
    const { h, up } = twoStoreys();
    placeBalcony(h, up[0]);
    const line = costLines(h, defaultPrices()).find((l) => l.what.kind === "balcony")!;
    expect(line.group).toBe("extras");
    expect(line.amount).toBeCloseTo(3 * 1.4 * 900, 6);
    expect(House.fromJSON(JSON.parse(JSON.stringify(h.toJSON()))).balconies).toEqual(h.balconies);
    expect(missingTechniques(h, abilities(["twoStoreys", "woodFloor"]))).toEqual(["balconies"]);
  });
});

describe("paint and plants", () => {
  it("paint rooms, at a price, once learned", () => {
    const { h } = twoStoreys();
    setRoomPaint(h, v(9, 10), "Mint", 0);
    expect(costLines(h, defaultPrices()).some((l) => l.what.kind === "paint" && l.what.color === "Mint")).toBe(true);
    expect(missingTechniques(h, abilities(["twoStoreys", "woodFloor"]))).toEqual(["paint"]);
    setRoomPaint(h, v(9, 10), "White", 0);
    expect(h.labels.every((l) => l.paint === undefined)).toBe(true);
  });

  it("plant the garden in free spots, clear of the house and of each other", () => {
    const { h } = twoStoreys();
    const fp = h.footprint(0);
    for (let i = 0; i < 8; i++) expect(addGardenPlant(h, plot, i % 2 ? "Shrub" : "GardenTree")).not.toBeNull();
    const garden = h.furniture.filter((f) => f.kind === "Shrub" || f.kind === "GardenTree");
    expect(garden).toHaveLength(8);
    for (const f of garden) {
      expect(f.at.x).toBeGreaterThan(0);
      expect(f.at.x).toBeLessThan(plot.width);
      if (fp.ok) expect(f.at.x < 4 || f.at.x > 14 || f.at.y < 6 || f.at.y > 14).toBe(true);
    }
    expect(missingTechniques(h, abilities(["twoStoreys", "woodFloor"]))).toEqual(["landscaping"]);
  });

  it("count towards wishes for plants, balconies and paint", () => {
    const { h, up } = twoStoreys();
    addFurnitureAt(h, "Plant", v(6, 8), 0);
    addFurnitureAt(h, "TallPlant", v(12, 8), 0);
    addGardenPlant(h, plot, "FlowerBed");
    h.addDoor(up[0], 4, 1, 2.1);
    placeBalcony(h, up[0]);
    setRoomPaint(h, v(9, 10), "Sky", 1);
    const client = {
      ...freePlayClient("suburban"),
      budget: 1e9,
      items: [
        { must: false, req: { kind: "indoorPlants" as const, min: 2 } },
        { must: false, req: { kind: "gardenPlants" as const, min: 1 } },
        { must: false, req: { kind: "balcony" as const } },
        { must: false, req: { kind: "paint" as const, room: "Bedroom" as const, color: "Sky" as const } },
        { must: false, req: { kind: "paint" as const, room: "Living" as const, color: "Sky" as const } },
      ],
    };
    expect(evaluateBrief(h, client, defaultPrices()).map((r) => r.met)).toEqual([true, true, true, true, false]);
    expect(techniquesFor({ kind: "balcony" }, abilities([]))).toEqual(["twoStoreys", "balconies"]);
    expect(techniquesFor({ kind: "paint", room: "Bedroom", color: "White" }, abilities([]))).toEqual([]);
  });
});
