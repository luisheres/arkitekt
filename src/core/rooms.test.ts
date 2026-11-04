import { describe, expect, it } from "vitest";
import { defaultPrices, estimate } from "./cost";
import { addRectangle, addWallClipped, moveWall, placeOpening, setRoomType, snapPoint } from "./edit";
import { Vec2, signedArea } from "./geometry";
import { OUTSIDE, analyzeLayout } from "./layout";
import { House } from "./model";
import { analyzeRooms } from "./rooms";
import { validate } from "./validate";
import { starterPlots } from "./plot";

const v = (x: number, y: number) => new Vec2(x, y);

/** A 10 x 7 house at (5,5) split by an interior wall at x = 10 into two 5 x 7 rooms. */
function twoRooms(): House {
  const h = new House();
  addRectangle(h, v(5, 5), v(15, 12), 2.7, "Plaster");
  h.addWall(v(10, 5), v(10, 12), 2.7, "Plaster");
  return h;
}

function rooms(h: House) {
  const r = analyzeRooms(h);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

describe("layout", () => {
  it("finds the rooms on each side of an interior wall", () => {
    const layout = analyzeLayout(twoRooms());
    if (!layout.ok) throw new Error("no layout");
    expect(layout.value.rooms.map((r) => signedArea(r)).sort()).toEqual([35, 35]);
    expect(signedArea(layout.value.outline)).toBeCloseTo(70);
    // The four outer walls are exterior, the partition is not.
    expect(layout.value.exterior.size).toBe(4);
    const inner = layout.value.segments.filter((s) => s.wall === 5);
    expect(inner).toHaveLength(1);
    expect(inner[0].left).not.toBe(OUTSIDE);
    expect(inner[0].right).not.toBe(OUTSIDE);
    // Outer walls touched by the partition are split in two.
    expect(layout.value.segments.filter((s) => s.wall === 1)).toHaveLength(2);
  });

  it("three rooms from a T of interior walls", () => {
    const h = twoRooms();
    h.addWall(v(10, 9), v(15, 9), 2.7, "Plaster");
    expect(analyzeLayout(h).ok && rooms(h).rooms.map((r) => r.area).sort((a, b) => a - b)).toEqual([15, 20, 35]);
  });

  it("ignores loose interior stubs for the rooms but reports them", () => {
    const h = twoRooms();
    h.addWall(v(12, 5), v(12, 8), 2.7, "Plaster");
    const r = rooms(h);
    expect(r.rooms).toHaveLength(2);
    expect(r.layout.looseEnds).toEqual([{ wall: 6, at: v(12, 8) }]);
  });

  it("rejects crossing walls", () => {
    const h = twoRooms();
    h.addWall(v(7, 8), v(13, 8), 2.7, "Plaster"); // crosses the partition
    const layout = analyzeLayout(h);
    expect(!layout.ok && layout.error).toEqual({ kind: "Crossing", x: 10, y: 8 });
  });

  it("rejects walls on top of each other", () => {
    const h = twoRooms();
    h.addWall(v(6, 5), v(9, 5), 2.7, "Plaster");
    const layout = analyzeLayout(h);
    expect(!layout.ok && layout.error.kind).toBe("Overlap");
  });

  it("an open outline is still an error", () => {
    const h = new House();
    h.addWallLoop([v(0, 0), v(5, 0), v(5, 5), v(0, 5)], 2.7, "Wood");
    h.removeWall(h.walls[3].id);
    const layout = analyzeLayout(h);
    expect(!layout.ok && layout.error.kind).toBe("Open");
  });
});

describe("drawing along existing walls", () => {
  it("skips the stretch already covered", () => {
    const h = twoRooms();
    // Front wall runs 5..15 at y = 5; trace 3..8 along it: only 3..5 is new.
    const ids = addWallClipped(h, v(3, 5), v(8, 5), 2.7, "Wood");
    expect(ids).toHaveLength(1);
    expect(h.wall(ids[0])!.start).toEqual(v(3, 5));
    expect(h.wall(ids[0])!.end).toEqual(v(5, 5));
  });

  it("a room drawn against the house shares the common wall", () => {
    const h = twoRooms();
    addRectangle(h, v(15, 5), v(20, 9), 2.7, "Wood"); // garage on the side
    const r = rooms(h);
    expect(r.rooms.map((x) => x.area).sort((a, b) => a - b)).toEqual([20, 35, 35]);
  });

  it("snaps onto a wall while keeping the grid position along it", () => {
    const lines = [[v(5, 5.25), v(15, 5.25)] as const];
    expect(snapPoint(v(8.3, 5.4), [], 0.3, 0.5, lines)).toEqual({ point: v(8.5, 5.25), anchored: true });
  });
});

describe("moving walls with partitions attached", () => {
  it("pushing an outer wall keeps the partition attached and fixed in place", () => {
    const h = twoRooms();
    const front = h.walls[0];
    moveWall(h, front.id, { start: front.start, end: front.end }, -2); // front out by 2 m
    const partition = h.wall(5)!;
    expect(partition.start).toEqual(v(10, 3));
    expect(rooms(h).rooms.map((r) => r.area)).toEqual([45, 45]);
  });

  it("pushing a side wall keeps the partition where it was", () => {
    const h = twoRooms();
    const right = h.walls[1]; // x = 15, runs +y; left normal is -x (inward)
    moveWall(h, right.id, { start: right.start, end: right.end }, -3);
    expect(h.wall(5)!.start).toEqual(v(10, 5));
    expect(rooms(h).rooms.map((r) => r.area).sort((a, b) => a - b)).toEqual([35, 56]);
  });
});

describe("rooms", () => {
  it("labels give rooms a type; setting the type twice reuses the label", () => {
    const h = twoRooms();
    setRoomType(h, v(7, 8), "Bedroom");
    setRoomType(h, v(8, 6), "Office");
    expect(h.labels).toHaveLength(1);
    const r = rooms(h);
    expect(r.rooms.map((x) => x.type).sort()).toEqual(["Office", null].sort());
    setRoomType(h, v(7, 8), null);
    expect(h.labels).toHaveLength(0);
  });

  it("doors connect rooms; rooms without a way in are unreachable", () => {
    const h = twoRooms();
    h.addDoor(h.walls[0].id, 2.5, 0.9, 2.1); // front door into the right-hand room (x 5..10)
    let r = rooms(h);
    expect(r.rooms.filter((x) => x.reachable)).toHaveLength(1);
    h.addDoor(5, 3.5, 0.9, 2.1); // door in the partition
    r = rooms(h);
    expect(r.rooms.every((x) => x.reachable)).toBe(true);
  });

  it("flags windows in interior walls and openings blocked by a junction", () => {
    const h = twoRooms();
    const win = h.addWindow(5, 3.5, 1.2, 1.2, 0.9);
    const blocked = h.addWindow(h.walls[0].id, 5, 1.2, 1.2, 0.9); // centered on the partition
    const r = rooms(h);
    expect(r.misplaced.map((m) => [m.opening.id, m.reason])).toEqual([
      [win, "InteriorWindow"],
      [blocked, "AcrossJunction"],
    ]);
  });

  it("checks room rules when validating", () => {
    const plot = starterPlots()[0];
    const h = twoRooms();
    h.roof = { style: "Gable", pitchDeg: 30, overhang: 0.4, material: "Shingles" };
    h.addDoor(h.walls[0].id, 2.5, 0.9, 2.1);
    setRoomType(h, v(7, 8), "Bedroom");
    setRoomType(h, v(12, 8), "Garage");
    const kinds = validate(h, plot, 1e9, defaultPrices()).map((i) => i.kind).sort();
    expect(kinds).toEqual(["GarageNeedsGarageDoor", "RoomNeedsWindow", "RoomUnreachable"]);
  });

  it("interior walls cost less than exterior ones", () => {
    const h = twoRooms();
    const c = estimate(h, defaultPrices());
    expect(c.interiorWalls).toBeCloseTo(7 * 2.7 * 70);
    expect(c.walls).toBeCloseTo(34 * 2.7 * 150);
  });
});

describe("open plan", () => {
  /** The two-room house, but divided by a room boundary instead of a wall. */
  function openPlan(): House {
    const h = new House();
    addRectangle(h, v(5, 5), v(15, 12), 2.7, "Plaster");
    h.addBoundary(v(10, 5), v(10, 12));
    return h;
  }

  it("a boundary divides space into rooms that are open to each other", () => {
    const r = rooms(openPlan());
    expect(r.rooms).toHaveLength(2);
    expect(r.rooms[0].openTo).toEqual([1]);
    expect(r.layout.exterior.has(5)).toBe(false);
  });

  it("one front door and one window serve the whole open space", () => {
    const h = openPlan();
    h.addDoor(h.walls[0].id, 2.5, 0.9, 2.1); // into the room at x 5..10
    h.addWindow(h.walls[0].id, 7.5, 1.2, 1.2, 0.9); // in the room at x 10..15
    const r = rooms(h);
    expect(r.rooms.every((x) => x.reachable && x.daylit)).toBe(true);
    setRoomType(h, v(7, 8), "Kitchen");
    setRoomType(h, v(12, 8), "Living");
    h.roof = { style: "Gable", pitchDeg: 30, overhang: 0.4, material: "Shingles" };
    expect(validate(h, starterPlots()[0], 1e9, defaultPrices())).toEqual([]);
  });

  it("boundaries are not built or paid for", () => {
    const withWall = estimate(twoRooms(), defaultPrices());
    const open = estimate(openPlan(), defaultPrices());
    expect(open.interiorWalls).toBe(0);
    expect(open.walls).toBeCloseTo(withWall.walls);
  });

  it("no windows or doors on a boundary, and no boundary as an outer wall", () => {
    const h = openPlan();
    expect(placeOpening(h, 5, "Door", 3.5)).toBeNull();
    h.addDoor(5, 3.5, 0.9, 2.1); // forced in anyway
    h.walls[1].boundary = true; // the right-hand outer wall
    const kinds = validate(h, starterPlots()[0], 1e9, defaultPrices()).map((i) => i.kind);
    expect(kinds).toContain("OpeningInBoundary");
    expect(kinds).toContain("BoundaryOnOutside");
  });

  it("round-trips through JSON", () => {
    const h = openPlan();
    expect(House.fromJSON(JSON.parse(JSON.stringify(h))).walls[4].boundary).toBe(true);
  });
});
