import { describe, expect, it } from "vitest";
import { accessRoutes, outsideDoors, routeLength, snapPathPoint } from "./access";
import { costLines, defaultPrices } from "./cost";
import { Vec2 } from "./geometry";
import { House } from "./model";
import { plotById } from "./plot";
import { validate } from "./validate";

const v = (x: number, y: number) => new Vec2(x, y);
const suburban = plotById("suburban")!; // street along the front (y = 0)
/** A 10 x 8 house with a front door and a garage door, both towards the street. */
const make = () => {
  const h = new House();
  const ids = h.addWallLoop([v(5, 8), v(15, 8), v(15, 16), v(5, 16)], 2.7, "Plaster");
  const door = h.addDoor(ids[0], 2, 1, 2.1);
  const garage = h.addGarageDoor(ids[0], 7, 2.5, 2.1);
  const at = (id: number) => outsideDoors(h).find((d) => d.opening === id)!.at;
  return { h, door, garage, at };
};
const kinds = (h: House) => validate(h, suburban, Infinity, defaultPrices()).map((i) => i.kind);

describe("paths and drives, laid by the player", () => {
  it("are not laid on their own", () => {
    const { h } = make();
    expect(accessRoutes(h, suburban).routes).toEqual([]);
    expect(costLines(h, defaultPrices(), suburban).some((l) => l.what.kind === "footpath" || l.what.kind === "driveway")).toBe(false);
  });

  it("lead to the door they end at, and cost by the square metre and the surface", () => {
    const { h, door, at } = make();
    const end = at(door);
    const id = h.addPath("path", [v(end.x, 0), v(end.x, 3), end], "Paving");
    const [r] = accessRoutes(h, suburban).routes;
    expect(r.id).toBe(id);
    expect(r.opening).toBe(door);
    expect(r.width).toBe(1.2);
    const path = costLines(h, defaultPrices(), suburban).find((l) => l.what.kind === "footpath")!;
    expect(path.quantity).toBeCloseTo(routeLength(r) * 1.2, 9);
    h.path(id)!.kind = "drive";
    h.path(id)!.surface = "Gravel";
    const drive = costLines(h, defaultPrices(), suburban).find((l) => l.what.kind === "driveway")!;
    expect(drive.what).toEqual({ kind: "driveway", surface: "gravel" });
    expect(drive.amount).toBeCloseTo(routeLength(r) * 3 * defaultPrices().gravelM2, 6);
  });

  it("a garage door needs a drive to it from the road (or joined to one that is)", () => {
    const { h, garage, at } = make();
    expect(kinds(h)).toContain("GarageDoorUnreachable");
    const g = at(garage);
    // A path is not enough.
    const id = h.addPath("path", [v(g.x, 0), g], "Paving");
    expect(kinds(h)).toContain("GarageDoorUnreachable");
    h.path(id)!.kind = "drive";
    expect(kinds(h)).not.toContain("GarageDoorUnreachable");
    // Not from the road: a drive in the middle of the garden.
    h.path(id)!.points = [v(g.x, 4), g];
    expect(kinds(h)).toContain("GarageDoorUnreachable");
    // Joined to a drive that comes from the road.
    h.addPath("drive", [v(g.x + 6, 0), v(g.x + 6, 4), v(g.x, 4)], "Tarmac");
    expect(kinds(h)).not.toContain("GarageDoorUnreachable");
  });

  it("snap to doorsteps and to the road's edge while being laid", () => {
    const { h, door, at } = make();
    const end = at(door);
    const s = snapPathPoint(h, suburban, end.add(v(0.4, -0.5)), 0.25);
    expect(s.door?.opening).toBe(door);
    expect(s.point.distance(end)).toBeLessThan(1e-9);
    const road = snapPathPoint(h, suburban, v(10.1, 0.6), 0.25);
    expect(road.road).toBe(true);
    expect(road.point.y).toBeCloseTo(0, 9);
    expect(snapPathPoint(h, suburban, v(20.1, 20.1), 0.5).point).toEqual(v(20, 20));
  });

  it("are saved with the design", () => {
    const { h } = make();
    h.addPath("drive", [v(1, 0), v(1, 5)], "Gravel");
    const back = House.fromJSON(JSON.parse(JSON.stringify(h)));
    expect(back.paths).toHaveLength(1);
    expect(back.paths[0]).toMatchObject({ kind: "drive", surface: "Gravel" });
    expect(back.paths[0].points[1]).toEqual(v(1, 5));
  });
});
