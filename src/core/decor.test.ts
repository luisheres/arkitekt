import { describe, expect, it } from "vitest";
import { decorate } from "./decor";
import { addStoreyAbove, setRoomType } from "./edit";
import { FURNITURE_SIZE, type FurnitureKind } from "./furniture";
import { Vec2, pointInPolygon } from "./geometry";
import { House } from "./model";

const v = (x: number, y: number) => new Vec2(x, y);

/** A 10 x 8 house: living room (x < 10, with a window on the front) and kitchen (x > 10). */
const make = () => {
  const h = new House();
  const ids = h.addWallLoop([v(0, 0), v(16, 0), v(16, 8), v(0, 8)], 2.7, "Plaster");
  const inner = h.addWall(v(10, 0), v(10, 8), 2.7, "Plaster");
  h.addDoor(ids[0], 12, 1, 2.1);
  h.addDoor(inner, 4, 0.9, 2.1);
  h.addWindow(ids[0], 5, 1.4, 1.2, 0.9);
  setRoomType(h, v(5, 4), "Living", 0);
  setRoomType(h, v(13, 4), "Kitchen", 0);
  const put = (kind: FurnitureKind, at: Vec2, facing: Vec2) => h.addFurniture({ kind, level: 0, at, facing, ...FURNITURE_SIZE[kind] });
  return { h, ids, inner, put };
};

describe("rooms decorated", () => {
  it("a lamp hangs in every room", () => {
    const { h } = make();
    const d = decorate(h);
    expect(d.lamps).toHaveLength(2);
  });

  it("a rug lies under the coffee table, inside the room", () => {
    const { h, put } = make();
    put("Sofa", v(5, 7.4), v(0, -1));
    put("CoffeeTable", v(5, 5.5), v(0, -1));
    const [rug] = decorate(h).rugs;
    expect(rug.at.distance(v(5, 5.5))).toBeLessThan(1e-9);
    expect(rug.width).toBeGreaterThan(2);
    // It runs along the table's long side (x), and every corner is inside the living room.
    expect(Math.abs(rug.along.x)).toBeCloseTo(1, 6);
    for (const s of [-1, 1]) for (const t of [-1, 1]) expect(pointInPolygon(rug.at.add(v((s * rug.width) / 2, (t * rug.depth) / 2)), [v(0, 0), v(10, 0), v(10, 8), v(0, 8)])).toBe(true);
  });

  it("a rug against a wall shrinks to fit", () => {
    const { h, put } = make();
    put("CoffeeTable", v(5, 7.2), v(0, -1));
    const [rug] = decorate(h).rugs;
    expect(rug.at.y + rug.depth / 2).toBeLessThan(8 - 0.1);
  });

  it("pictures hang on free wall, never over a window or a bookcase", () => {
    const { h, put } = make();
    put("Bookshelf", v(0.5, 4), v(1, 0));
    const pictures = decorate(h).pictures;
    expect(pictures.length).toBeGreaterThan(0);
    for (const p of pictures) {
      // Not on the front wall's stretch with the window (x 4.3 – 5.7).
      if (Math.abs(p.at.y) < 0.2) expect(Math.abs(p.at.x - 5)).toBeGreaterThan(0.7 + p.width / 2);
      // Not above the bookshelf against the left wall.
      if (Math.abs(p.at.x) < 0.2) expect(Math.abs(p.at.y - 4)).toBeGreaterThan(0.45 + p.width / 2);
      // Facing into the living room.
      expect(pointInPolygon(p.at.add(p.out.scale(0.5)), [v(0, 0), v(10, 0), v(10, 8), v(0, 8)])).toBe(true);
    }
    // None in the kitchen.
    expect(pictures.every((p) => p.at.x < 10.1)).toBe(true);
  });

  it("wall cabinets go over a counter, but not over a window", () => {
    const { h, ids, put } = make();
    put("Counter", v(13, 7.69), v(0, -1));
    expect(decorate(h).cabinets).toHaveLength(1);
    h.addWindow(ids[2], 3, 1.2, 1.2, 0.9); // the back wall runs from x 16 to 0: 3 m along is x = 13
    expect(decorate(h).cabinets).toHaveLength(0);
  });
});

describe("stair railings", () => {
  it("rail the open sides of a flight and round the stairwell, not along walls or where you step off", () => {
    const { h } = make();
    addStoreyAbove(h);
    // Against the left wall, climbing towards +y.
    const id = h.addStair(0, v(0.6, 3.5), 0);
    const s = h.stair(id)!;
    const rails = decorate(h).rails.filter((r) => r.stair === id);
    const flight = rails.filter((r) => r.kind === "flight");
    const well = rails.filter((r) => r.kind === "well");
    expect(flight).toHaveLength(1);
    expect(well.length).toBeGreaterThanOrEqual(1);
    expect(well.length).toBeLessThanOrEqual(2);
    expect(s).toBeDefined();
  });
});
