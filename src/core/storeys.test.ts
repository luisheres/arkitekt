import { describe, expect, it } from "vitest";
import { evaluateBrief } from "./brief";
import { CLIENTS } from "./clients";
import { defaultPrices, estimate } from "./cost";
import { addRectangle, addStoreyAbove, moveCorner, placeStair, setRoomType } from "./edit";
import { Vec2 } from "./geometry";
import { House } from "./model";
import { starterPlots } from "./plot";
import { analyzeHouse } from "./rooms";
import { buildRoof } from "./roof";
import { FLOOR_STRUCTURE } from "./rules";
import { validate } from "./validate";

const v = (x: number, y: number) => new Vec2(x, y);
const plot = starterPlots()[0];
const prices = defaultPrices();

/** The wall on `level` that starts at (x, y). */
function wallAt(h: House, level: number, x: number, y: number): number {
  const w = h.wallsOn(level).find((w) => w.start.distance(v(x, y)) < 1e-6);
  if (!w) throw new Error(`no wall on ${level} starts at ${x},${y}`);
  return w.id;
}

/**
 * A 10 x 8 m two-storey house. Ground: living room at the front, hall with the stairs
 * and a kitchen at the back. Upstairs: two bedrooms at the front, landing and bathroom.
 */
function twoStoreys(): House {
  const h = new House();
  addRectangle(h, v(5, 5), v(15, 13), 2.7, "Plaster");
  h.addWall(v(5, 9), v(15, 9), 2.7, "Plaster");
  h.addWall(v(9, 9), v(9, 13), 2.7, "Plaster");
  h.addDoor(wallAt(h, 0, 5, 5), 5, 0.9, 2.1); // front door
  h.addDoor(wallAt(h, 0, 5, 9), 2, 0.9, 2.1); // living - hall
  h.addDoor(wallAt(h, 0, 5, 9), 7, 0.9, 2.1); // living - kitchen
  h.addWindow(wallAt(h, 0, 5, 5), 2.5, 1.6, 1.3, 0.9);
  h.addWindow(wallAt(h, 0, 15, 13), 3, 1.2, 1.3, 0.9); // back wall runs from x=15 to x=5
  setRoomType(h, v(10, 7), "Living");
  setRoomType(h, v(7, 11), "Hall");
  setRoomType(h, v(12, 11), "Kitchen");

  const up = addStoreyAbove(h);
  h.addWall(v(5, 9), v(15, 9), 2.5, "Plaster", false, up);
  h.addWall(v(9, 9), v(9, 13), 2.5, "Plaster", false, up);
  h.addWall(v(10, 5), v(10, 9), 2.5, "Plaster", false, up);
  h.addDoor(wallAt(h, up, 5, 9), 2, 0.9, 2.1); // landing - bedroom 1
  h.addDoor(wallAt(h, up, 9, 9), 2, 0.9, 2.1); // landing - bathroom
  h.addDoor(wallAt(h, up, 10, 5), 2, 0.9, 2.1); // bedroom 1 - bedroom 2
  h.addWindow(wallAt(h, up, 5, 5), 2.5, 1.2, 1.2, 0.9);
  h.addWindow(wallAt(h, up, 5, 5), 7.5, 1.2, 1.2, 0.9);
  setRoomType(h, v(7, 7), "Bedroom", up);
  setRoomType(h, v(12, 7), "Bedroom", up);
  setRoomType(h, v(7, 11), "Hall", up);
  setRoomType(h, v(12, 11), "Bathroom", up);

  placeStair(h, 0, v(7, 11), 0); // in the hall, climbing away from the street
  h.roof = { style: "Gable", pitchDeg: 30, overhang: 0.4, material: "Shingles" };
  return h;
}

describe("storeys", () => {
  it("a two-storey house with stairs is valid", () => {
    const h = twoStoreys();
    expect(h.wallsOn(1).filter((w) => !w.boundary)).toHaveLength(7); // outline copied + 3 partitions
    expect(validate(h, plot, 1e9, prices).map((i) => i.kind)).toEqual([]);
    expect(h.floorArea()).toBeCloseTo(160);
    expect(h.floorArea(1)).toBeCloseTo(80);
  });

  it("the stairs make the upper rooms reachable", () => {
    const h = twoStoreys();
    expect(analyzeHouse(h).rooms.every((r) => r.reachable)).toBe(true);
    h.removeStair(h.stairs[0].id);
    const kinds = validate(h, plot, 1e9, prices).map((i) => i.kind);
    expect(kinds).toContain("NoStairs");
    expect(kinds.filter((k) => k === "RoomUnreachable")).toHaveLength(4);
  });

  it("stairs may not cut through walls or stand outside rooms", () => {
    const h = twoStoreys();
    h.stairs[0].at = v(9, 11); // straddles the hall/kitchen wall
    expect(validate(h, plot, 1e9, prices).map((i) => i.kind)).toContain("StairBlocked");
    expect(placeStair(h, 1, v(7, 11))).toBeNull(); // nothing above the top storey
  });

  it("an upper storey must rest on the one below", () => {
    const h = twoStoreys();
    moveCorner(h, v(15, 13), v(16, 13), 1);
    expect(validate(h, plot, 1e9, prices).map((i) => i.kind)).toContain("FloorNotSupported");
    // The ground floor's corner at the same spot did not move.
    expect(h.wallsOn(0).some((w) => w.start.distance(v(15, 13)) < 1e-6)).toBe(true);
  });

  it("an empty new storey is reported", () => {
    const h = new House();
    addRectangle(h, v(5, 5), v(15, 13), 2.7, "Plaster");
    h.addLevel();
    expect(validate(h, plot, 1e9, prices).map((i) => i.kind)).toContain("EmptyLevel");
  });

  it("prices the upper floor structure and the stairs, with one foundation", () => {
    const c = estimate(twoStoreys(), prices);
    expect(c.foundation).toBeCloseTo(80 * prices.foundationM2);
    expect(c.floors).toBeCloseTo(80 * prices.upperFloorM2);
    expect(c.stairs).toBe(prices.stairs);
  });

  it("a smaller upper storey leaves a flat roof (terrace) over the rest", () => {
    const h = twoStoreys();
    const full = estimate(h, prices).roof;
    moveCorner(h, v(15, 13), v(13, 13), 1);
    moveCorner(h, v(15, 5), v(13, 5), 1);
    expect(h.floorArea(1)).toBeCloseTo(64);
    // The pitched roof shrinks; the 16 m² terrace is paid at the covering's price.
    expect(estimate(h, prices).roof).toBeLessThan(full);
    expect(estimate(h, prices).roof).toBeGreaterThan(16 * prices.roofM2.Shingles);
  });

  it("the roof sits on the top storey", () => {
    const h = twoStoreys();
    const single = new House();
    addRectangle(single, v(5, 5), v(15, 13), 2.7, "Plaster");
    single.roof = h.roof;
    const [a, b] = [buildRoof(h), buildRoof(single)];
    if (!a.ok || !b.ok) throw new Error("no roof");
    // Raised by the ground storey and the floor structure (the copied outer walls are 2.7 m too).
    expect(a.value.peakHeight - b.value.peakHeight).toBeCloseTo(2.7 + FLOOR_STRUCTURE);
  });

  it("removing the top storey removes its walls, rooms and the stairs up to it", () => {
    const h = twoStoreys();
    h.removeTopLevel();
    expect(h.levels).toBe(1);
    expect(h.wallsOn(1)).toEqual([]);
    expect(h.labels.every((l) => l.level === 0)).toBe(true);
    expect(h.stairs).toEqual([]);
  });

  it("round-trips through JSON", () => {
    const h = twoStoreys();
    const back = House.fromJSON(JSON.parse(JSON.stringify(h)));
    expect(back.levels).toBe(2);
    expect(back.stairs).toEqual(h.stairs);
    expect(back.wallsOn(1)).toHaveLength(h.wallsOn(1).length);
    expect(validate(back, plot, 1e9, prices)).toEqual([]);
  });

  it("briefs can ask about storeys", () => {
    const h = twoStoreys();
    const client = {
      ...CLIENTS[0],
      items: [
        { must: true, req: { kind: "storeys" as const, max: 1 } },
        { must: true, req: { kind: "rooms" as const, room: "Bedroom" as const, count: 2, floor: "upper" as const } },
        { must: true, req: { kind: "rooms" as const, room: "Bedroom" as const, count: 1, floor: "ground" as const } },
        { must: true, req: { kind: "everyFloor" as const, room: "Hall" as const } },
      ],
    };
    expect(evaluateBrief(h, client, prices).map((r) => r.met)).toEqual([false, true, false, true]);
  });
});
