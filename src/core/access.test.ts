import { describe, expect, it } from "vitest";
import { accessRoutes, routeLength } from "./access";
import { costLines, defaultPrices } from "./cost";
import { Vec2 } from "./geometry";
import { House } from "./model";
import { plotById } from "./plot";
import { validate } from "./validate";

const v = (x: number, y: number) => new Vec2(x, y);
/** A 10 x 8 house with a front door (towards y = 0) and a garage door on a chosen wall. */
const make = (garageWall: 0 | 2) => {
  const h = new House();
  const ids = h.addWallLoop([v(5, 8), v(15, 8), v(15, 16), v(5, 16)], 2.7, "Plaster");
  h.addDoor(ids[0], 2, 1, 2.1);
  h.addGarageDoor(ids[garageWall], 6, 2.5, 2.1);
  return h;
};

describe("driveways and paths", () => {
  const suburban = plotById("suburban")!; // street along the front

  it("lead from the road to the front door and each garage door", () => {
    const { routes, unreachable } = accessRoutes(make(0), suburban);
    expect(unreachable).toEqual([]);
    expect(routes.map((r) => r.kind).sort()).toEqual(["drive", "path"]);
    for (const r of routes) expect(r.points[0].y).toBeCloseTo(0, 6); // starts at the street
    expect(routes.find((r) => r.kind === "drive")!.surface).toBe("asphalt");
  });

  it("cost more when the garage faces away from the road", () => {
    const toward = routeLength(accessRoutes(make(0), suburban).routes.find((r) => r.kind === "drive")!);
    const away = routeLength(accessRoutes(make(2), suburban).routes.find((r) => r.kind === "drive")!);
    expect(away).toBeGreaterThan(toward + 10);
    const drive = (h: House) => costLines(h, defaultPrices(), suburban).find((l) => l.what.kind === "driveway")!.amount;
    expect(drive(make(2))).toBeGreaterThan(drive(make(0)));
  });

  it("come in from wherever the road is, gravel off a gravel track", () => {
    const slope = plotById("slope")!; // the street is behind
    const back = accessRoutes(make(0), slope).routes;
    for (const r of back) expect(r.points[0].y).toBeCloseTo(slope.depth, 6);
    const clearing = plotById("clearing")!;
    expect(accessRoutes(make(0), clearing).routes.find((r) => r.kind === "drive")!.surface).toBe("gravel");
  });

  it("report a garage door no car can reach", () => {
    const h = new House();
    const ids = h.addWallLoop([v(3, 3), v(13, 3), v(13, 11), v(3, 11)], 2.7, "Plaster");
    h.addDoor(ids[0], 2, 1, 2.1);
    h.addGarageDoor(ids[3], 4, 2.5, 2.1); // faces the plot's side edge, 3 m away
    expect(validate(h, plotById("suburban")!, Infinity, defaultPrices()).map((i) => i.kind)).toContain("GarageDoorUnreachable");
  });
});
