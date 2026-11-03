import { describe, expect, it } from "vitest";
import {
  addRectangle,
  addWallChain,
  clampOffset,
  corners,
  interiorNormal,
  moveCorner,
  moveWall,
  nearestWall,
  placeOpening,
  snapPoint,
} from "./edit";
import { Vec2 } from "./geometry";
import { History } from "./history";
import { defaultPrices } from "./cost";
import { validate } from "./validate";
import { House } from "./model";
import { starterPlots } from "./plot";
import { cottage } from "./samples";

const v = (x: number, y: number) => new Vec2(x, y);

function room(): House {
  const h = new House();
  addRectangle(h, v(5, 5), v(15, 12), 2.7, "Plaster");
  return h;
}

describe("snapping", () => {
  it("prefers a nearby anchor over the grid", () => {
    expect(snapPoint(v(3.12, 4.9), [v(3.1, 4.95)], 0.2, 0.5)).toEqual({ point: v(3.1, 4.95), anchored: true });
  });

  it("falls back to the grid", () => {
    expect(snapPoint(v(3.3, 4.8), [v(10, 10)], 0.2, 0.5)).toEqual({ point: v(3.5, 5), anchored: false });
  });

  it("leaves the point alone with no grid", () => {
    expect(snapPoint(v(3.33, 4.81), [], 0.2, 0).point).toEqual(v(3.33, 4.81));
  });
});

describe("rooms and walls", () => {
  it("a dragged rectangle becomes a closed room, front wall first", () => {
    const h = new House();
    addRectangle(h, v(15, 12), v(5, 5), 2.7, "Wood");
    expect(h.floorArea()).toBeCloseTo(70);
    expect(h.walls[0].start).toEqual(v(5, 5));
    expect(h.walls[0].end).toEqual(v(15, 5));
  });

  it("refuses a rectangle thinner than a wall may be", () => {
    expect(addRectangle(new House(), v(0, 0), v(0.5, 6), 2.7, "Wood")).toBeNull();
  });

  it("an open chain plus its closing wall forms a footprint", () => {
    const h = new House();
    const pts = [v(0, 0), v(6, 0), v(6, 5), v(0, 5)];
    addWallChain(h, pts, false, 2.7, "Brick");
    expect(h.walls).toHaveLength(3);
    expect(h.footprint().ok).toBe(false);
    addWallChain(h, [v(0, 5), v(0, 0)], false, 2.7, "Brick");
    expect(h.floorArea()).toBeCloseTo(30);
  });

  it("lists each corner once", () => {
    expect(corners(room())).toHaveLength(4);
  });

  it("moving a corner keeps both walls joined", () => {
    const h = room();
    moveCorner(h, v(15, 12), v(17, 12));
    expect(h.footprint().ok).toBe(true);
    expect(h.floorArea()).toBeCloseTo(70 + 7); // a triangle 2 wide and 7 tall is added
  });

  it("pushing a wall out resizes the room and keeps it rectangular", () => {
    const h = room();
    const front = h.walls[0];
    const original = { start: front.start, end: front.end };
    // The front wall runs +x, so its left normal is +y (into the house): -1 pushes it out.
    moveWall(h, front.id, original, -1);
    expect(h.floorArea()).toBeCloseTo(80);
    // Distances are from the original position, so repeated drags do not accumulate.
    moveWall(h, front.id, original, -2);
    expect(h.floorArea()).toBeCloseTo(90);
    expect(h.walls[1].start).toEqual(v(15, 3));
  });

  it("interior normal points into the house for either wall direction", () => {
    const h = room();
    expect(interiorNormal(h, h.walls[0]).y).toBeCloseTo(1); // front wall: inside is +y
    const back = h.walls[2]; // runs from (15,12) to (5,12)
    expect(interiorNormal(h, back).y).toBeCloseTo(-1);
  });
});

describe("openings", () => {
  it("finds the nearest wall and where along it", () => {
    const hit = nearestWall(room(), v(8, 5.2), 0.5);
    expect(hit?.wall.id).toBe(1);
    expect(hit?.offset).toBeCloseTo(3);
    expect(hit?.distance).toBeCloseTo(0.2);
    expect(nearestWall(room(), v(10, 8), 0.5)).toBeNull();
  });

  it("clamps an opening clear of the wall ends", () => {
    const wall = room().walls[0]; // 10 m long
    expect(clampOffset(wall, 1.2, 0)).toBeCloseTo(0.9);
    expect(clampOffset(wall, 1.2, 10)).toBeCloseTo(9.1);
    expect(clampOffset(wall, 1.2, 4)).toBe(4);
  });

  it("placing a door near a corner yields a sellable house", () => {
    const plot = starterPlots()[0];
    const h = room();
    h.roof = { style: "Gable", pitchDeg: 35, overhang: 0.4, material: "Shingles" };
    const id = placeOpening(h, h.walls[0].id, "Door", 0.1);
    expect(id).not.toBeNull();
    expect(h.opening(id!)?.offset).toBeCloseTo(0.75); // 0.3 m margin + half of 0.9 m
    expect(validate(h, plot, 1e9, defaultPrices())).toEqual([]);
  });

  it("shrinks openings to fit small walls and refuses tiny ones", () => {
    const h = new House();
    const [w] = addWallChain(h, [v(0, 0), v(1.5, 0)], false, 2.7, "Wood");
    const id = placeOpening(h, w, "Window", 0.75)!;
    expect(h.opening(id)?.width).toBeCloseTo(0.9);
    const [tiny] = addWallChain(h, [v(0, 2), v(1, 2)], false, 2.7, "Wood");
    expect(placeOpening(h, tiny, "Door", 0.5)).toBeNull();
  });

  it("existing samples keep their openings clear of the ends", () => {
    const h = cottage(starterPlots()[0]);
    for (const o of h.openings) {
      const wall = h.wall(o.wall)!;
      expect(clampOffset(wall, o.width, o.offset)).toBeCloseTo(o.offset);
    }
  });
});

describe("history", () => {
  const snap = (n: number) => ({ walls: [], openings: [], roof: null, nextId: n });

  it("undoes and redoes in order", () => {
    const hist = new History();
    hist.record(snap(0));
    hist.record(snap(1));
    expect(hist.undo(snap(2))).toEqual(snap(1));
    expect(hist.undo(snap(1))).toEqual(snap(0));
    expect(hist.undo(snap(0))).toBeNull();
    expect(hist.redo(snap(0))).toEqual(snap(1));
    expect(hist.redo(snap(1))).toEqual(snap(2));
    expect(hist.canRedo()).toBe(false);
  });

  it("a new edit clears the redo stack", () => {
    const hist = new History();
    hist.record(snap(0));
    hist.undo(snap(1));
    hist.record(snap(0));
    expect(hist.canRedo()).toBe(false);
  });

  it("merges quick edits with the same key", () => {
    const hist = new History();
    hist.record(snap(0), "pitch", 1000);
    hist.record(snap(1), "pitch", 1500);
    hist.record(snap(2), "pitch", 2000);
    expect(hist.undo(snap(3))).toEqual(snap(0));
    expect(hist.canUndo()).toBe(false);
  });

  it("does not merge across keys or long pauses", () => {
    const hist = new History();
    hist.record(snap(0), "pitch", 1000);
    hist.record(snap(1), "overhang", 1100);
    hist.record(snap(2), "overhang", 9000);
    expect(hist.undo(snap(3))).toEqual(snap(2));
    expect(hist.undo(snap(2))).toEqual(snap(1));
    expect(hist.undo(snap(1))).toEqual(snap(0));
  });

  it("drops the oldest steps beyond its limit", () => {
    const hist = new History(2);
    [0, 1, 2].forEach((n) => hist.record(snap(n)));
    hist.undo(snap(3));
    hist.undo(snap(2));
    expect(hist.canUndo()).toBe(false);
  });
});
