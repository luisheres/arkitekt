import { describe, expect, it } from "vitest";
import { Vec2, signedArea } from "./geometry";
import { House, wallPieces } from "./model";

const v = (x: number, y: number) => new Vec2(x, y);

function rect(w: number, d: number): House {
  const h = new House();
  h.addWallLoop([v(0, 0), v(w, 0), v(w, d), v(0, d)], 2.7, "Plaster");
  return h;
}

describe("house model", () => {
  it("rectangle footprint is counter-clockwise", () => {
    const fp = rect(10, 7).footprint();
    if (!fp.ok) throw new Error("expected a footprint");
    expect(fp.value).toHaveLength(4);
    expect(signedArea(fp.value)).toBeCloseTo(70, 3);
  });

  it("walls in any order and direction close", () => {
    const h = new House();
    h.addWall(v(10, 7), v(10, 0), 2.7, "Wood");
    h.addWall(v(0, 0), v(10, 0), 2.7, "Wood");
    h.addWall(v(0, 7), v(0, 0), 2.7, "Wood");
    h.addWall(v(0, 7), v(10, 7), 2.7, "Wood");
    expect(h.floorArea()).toBeCloseTo(70, 3);
  });

  it("reports an open loop", () => {
    const h = rect(10, 7);
    h.removeWall(h.walls[h.walls.length - 1].id);
    const fp = h.footprint();
    expect(!fp.ok && fp.error.kind).toBe("Open");
  });

  it("an interior wall ending on the outer walls keeps the outline", () => {
    const h = rect(10, 7);
    h.addWall(v(5, 0), v(5, 7), 2.7, "Wood");
    expect(h.floorArea()).toBeCloseTo(70);
  });

  it("reports two separate rooms as multiple loops", () => {
    const h = rect(4, 4);
    h.addWallLoop([v(6, 0), v(9, 0), v(9, 3), v(6, 3)], 2.7, "Wood");
    const fp = h.footprint();
    expect(!fp.ok && fp.error).toEqual({ kind: "MultipleLoops" });
  });

  it("removing a wall removes its openings", () => {
    const h = rect(10, 7);
    const w = h.walls[0].id;
    h.addDoor(w, 5, 1, 2.1);
    h.removeWall(w);
    expect(h.openings).toHaveLength(0);
  });

  it("wall pieces tile the wall minus openings", () => {
    const h = rect(10, 7);
    const w = h.walls[0].id;
    h.addDoor(w, 2, 1, 2.1);
    h.addWindow(w, 6, 1.5, 1.2, 0.9);
    const wall = h.wall(w)!;
    const pieces = wallPieces(wall, h.openingsIn(w));
    const solid = pieces.reduce((s, p) => s + (p.u1 - p.u0) * (p.v1 - p.v0), 0);
    const total = (10 + wall.thickness) * 2.7;
    const holes = 1 * 2.1 + 1.5 * 1.2;
    expect(solid).toBeCloseTo(total - holes, 3);
    // Door: pier, lintel; window: pier, sill, lintel; final pier.
    expect(pieces).toHaveLength(6);
  });

  it("round-trips through JSON", () => {
    const h = rect(8, 6);
    h.addDoor(h.walls[0].id, 4, 1, 2.1);
    h.roof = { style: "Gable", pitchDeg: 30, overhang: 0.4, material: "Tiles" };
    const back = House.fromJSON(JSON.parse(JSON.stringify(h)));
    expect(back).toEqual(h);
    // Fresh ids continue after the restored ones.
    expect(back.addDoor(back.walls[1].id, 3, 1, 2.1)).toBe(h.addDoor(h.walls[1].id, 3, 1, 2.1));
  });
});
