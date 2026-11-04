import { describe, expect, it } from "vitest";
import { addRectangle, addStoreyAbove, placeStair, setRoomType } from "./edit";
import { type Furniture, furnish, furnitureOutline, furnitureOverlap } from "./furnish";
import { Vec2, pointInPolygon } from "./geometry";
import { House, stairOutline } from "./model";
import { analyzeHouse } from "./rooms";

const v = (x: number, y: number) => new Vec2(x, y);

/** Front: bedroom (5..10) and bathroom (10..13), garage (13..19); back: open kitchen + living. */
function home(): House {
  const h = new House();
  addRectangle(h, v(5, 5), v(19, 15), 2.7, "Plaster");
  h.addWall(v(5, 9), v(19, 9), 2.7, "Plaster");
  h.addWall(v(10, 5), v(10, 9), 2.7, "Plaster");
  h.addWall(v(13, 5), v(13, 9), 2.7, "Plaster");
  h.addBoundary(v(11, 9), v(11, 15));
  const wallAt = (x: number, y: number) => h.walls.find((w) => w.start.distance(v(x, y)) < 1e-6)!.id;
  h.addDoor(wallAt(5, 9), 2.5, 0.9, 2.1); // kitchen - bedroom (x = 7.5)
  h.addDoor(wallAt(5, 9), 6.5, 0.9, 2.1); // living - bathroom (x = 11.5)
  h.addDoor(wallAt(5, 9), 11, 0.9, 2.1); // living - garage (x = 16)
  h.addDoor(wallAt(19, 15), 3, 0.9, 2.1); // front door, back wall (x = 16)
  h.addWindow(wallAt(5, 5), 2.5, 1.2, 1.2, 0.9);
  setRoomType(h, v(7, 7), "Bedroom");
  setRoomType(h, v(11.5, 7), "Bathroom");
  setRoomType(h, v(16, 7), "Garage");
  setRoomType(h, v(8, 12), "Kitchen");
  setRoomType(h, v(15, 12), "Living");
  return h;
}

const ofKind = (fs: Furniture[], kind: Furniture["kind"]) => fs.filter((f) => f.kind === kind);

describe("furniture", () => {
  it("furnishes each room for its use", () => {
    const fs = furnish(home());
    expect(ofKind(fs, "Bed")).toHaveLength(1);
    expect(ofKind(fs, "Nightstand")).toHaveLength(2);
    expect(ofKind(fs, "Toilet")).toHaveLength(1);
    expect(ofKind(fs, "Car")).toHaveLength(1);
    expect(ofKind(fs, "Counter")).toHaveLength(1);
    expect(ofKind(fs, "Sofa")).toHaveLength(1);
    expect(ofKind(fs, "CoffeeTable")).toHaveLength(1);
  });

  it("keeps every piece inside its room, without overlaps", () => {
    const h = home();
    const fs = furnish(h);
    const rooms = analyzeHouse(h).rooms;
    for (const f of fs) {
      const room = rooms.find((r) => pointInPolygon(f.at, r.polygon))!;
      expect(room, f.kind).toBeDefined();
      for (const c of furnitureOutline(f)) expect(pointInPolygon(c, room.polygon), `${f.kind} corner`).toBe(true);
    }
    for (let i = 0; i < fs.length; i++)
      for (let j = i + 1; j < fs.length; j++) expect(furnitureOverlap(fs[i], fs[j]), `${fs[i].kind} / ${fs[j].kind}`).toBe(false);
  });

  it("keeps doorways clear", () => {
    const h = home();
    const fs = furnish(h);
    for (const o of h.openings.filter((o) => o.kind === "Door")) {
      const w = h.wall(o.wall)!;
      const at = w.start.add(w.direction().scale(o.offset));
      const n = new Vec2(-w.direction().y, w.direction().x);
      for (const p of [at.add(n.scale(0.6)), at.sub(n.scale(0.6))]) {
        expect(fs.some((f) => pointInPolygon(p, furnitureOutline(f))), `door ${o.id}`).toBe(false);
      }
    }
  });

  it("the bed's head stands against a wall, facing into the room", () => {
    const bed = ofKind(furnish(home()), "Bed")[0];
    const head = bed.at.sub(bed.facing.scale(bed.depth / 2));
    // The bedroom spans x 5..10, y 5..9: the head is near one of its walls.
    const toWall = Math.min(head.x - 5, 10 - head.x, head.y - 5, 9 - head.y);
    expect(toWall).toBeLessThan(0.2);
  });

  it("leaves stairs and their landings free, upstairs too", () => {
    const h = new House();
    addRectangle(h, v(5, 5), v(13, 11), 2.7, "Plaster");
    h.addDoor(h.walls[0].id, 4, 0.9, 2.1);
    setRoomType(h, v(9, 8), "Living");
    addStoreyAbove(h);
    setRoomType(h, v(9, 8), "Bedroom", 1);
    placeStair(h, 0, v(6, 8), 0);
    const fs = furnish(h);
    const stairs = stairOutline(h.stairs[0]);
    expect(fs.some((f) => f.level === 1 && f.kind === "Bed")).toBe(true);
    for (const f of fs) {
      expect(furnitureOutline(f).some((c) => pointInPolygon(c, stairs)), f.kind).toBe(false);
      expect(stairs.some((c) => pointInPolygon(c, furnitureOutline(f))), f.kind).toBe(false);
    }
  });

  it("a car parks behind the garage door", () => {
    const h = new House();
    addRectangle(h, v(5, 5), v(11, 9), 2.7, "Plaster"); // 6 x 4 m
    h.addGarageDoor(h.walls[0].id, 3, 2.5, 2.1);
    setRoomType(h, v(8, 7), "Garage");
    const car = ofKind(furnish(h), "Car")[0];
    expect(car).toBeDefined();
    expect(Math.abs(car.facing.x)).toBeCloseTo(1); // lengthwise along the garage
  });

  it("rooms without a use stay empty", () => {
    const h = new House();
    addRectangle(h, v(5, 5), v(10, 9), 2.7, "Plaster");
    expect(furnish(h)).toEqual([]);
  });
});
