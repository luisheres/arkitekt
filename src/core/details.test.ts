import { describe, expect, it } from "vitest";
import { freePlayClient } from "./clients";
import { costLines, defaultPrices } from "./cost";
import { placeTerrace, setRoomType } from "./edit";
import { doorApproaches, raisedDoors, dormerShape, placeDormer } from "./features";
import { Vec2, pointInPolygon } from "./geometry";
import { House } from "./model";
import { plotById } from "./plot";
import { shapedGround, siteLevel } from "./site";
import { abilities, missingTechniques } from "./progression";
import { buildRoof, roofHeightAt } from "./roof";

const v = (x: number, y: number) => new Vec2(x, y);
const plot = freePlayClient("suburban").plot;
const unwrap = <T,>(r: { ok: true; value: T } | { ok: false }): T => {
  if (!r.ok) throw new Error("expected ok");
  return r.value;
};

/** A 10 x 8 house with a front door and a window, under a gable roof (ridge along x). */
const make = () => {
  const h = new House();
  const ids = h.addWallLoop([v(5, 6), v(15, 6), v(15, 14), v(5, 14)], 2.7, "Plaster");
  const door = h.addDoor(ids[0], 2, 1, 2.1);
  const window = h.addWindow(ids[0], 6, 1.2, 1.2, 0.9);
  setRoomType(h, v(10, 10), "Living", 0);
  h.roof = { style: "Gable", pitchDeg: 35, overhang: 0.4, material: "Tiles" };
  return { h, ids, door, window };
};

describe("roof edges", () => {
  it("a gable roof has two eaves, a ridge, four verges and four down pipes", () => {
    const { h } = make();
    const { edges } = unwrap(buildRoof(h));
    expect(edges.eaves).toHaveLength(2);
    expect(edges.ridges).toHaveLength(1);
    expect(edges.verges).toHaveLength(4);
    expect(edges.downpipes).toHaveLength(4);
    // The eaves run the house's length plus the overhang at both ends, and point away from the middle.
    for (const e of edges.eaves) {
      expect(Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z)).toBeCloseTo(10.8, 6);
      expect(Math.sign(e.out.y)).toBe(Math.sign((e.a.z + e.b.z) / 2 - 10));
    }
  });

  it("a hip roof has eaves all round, and hips instead of verges", () => {
    const { h } = make();
    h.roof!.style = "Hip";
    const { edges } = unwrap(buildRoof(h));
    expect(edges.eaves).toHaveLength(4);
    expect(edges.ridges).toHaveLength(5);
    expect(edges.verges).toHaveLength(0);
  });

  it("on an L, no gutter runs under the other wing's roof and no pipe stands inside the house", () => {
    const h = new House();
    h.addWallLoop([v(0, 0), v(12, 0), v(12, 6), v(6, 6), v(6, 12), v(0, 12)], 2.7, "Plaster");
    h.roof = { style: "Gable", pitchDeg: 35, overhang: 0.4, material: "Tiles" };
    const g = unwrap(buildRoof(h));
    for (const e of [...g.edges.eaves, ...g.edges.ridges]) {
      const mid = v((e.a.x + e.b.x) / 2, (e.a.z + e.b.z) / 2);
      expect(roofHeightAt(g, mid)!).toBeLessThan((e.a.y + e.b.y) / 2 + 0.05);
    }
    const fp = unwrap(h.footprint(0));
    for (const d of g.edges.downpipes) expect(pointInPolygon(d.at, fp)).toBe(false);
    expect(g.edges.downpipes.length).toBeGreaterThanOrEqual(4);
  });
});

describe("steps and ramps", () => {
  const low = () => -0.5;
  it("a door above the ground gets steps only when the player adds them, about 17 cm each", () => {
    const { h, door } = make();
    expect(doorApproaches(h, 0.05, low)).toHaveLength(0);
    expect(raisedDoors(h, 0.05, low).map((a) => a.opening)).toEqual([door]);
    h.opening(door)!.approach = "steps";
    const [a] = doorApproaches(h, 0.05, low);
    expect(a.opening).toBe(door);
    expect(a.rise).toBeCloseTo(0.55, 6);
    expect(a.steps).toBe(3);
    expect(a.ramp).toBe(false);
    // It points out of the house, towards the street (−y).
    expect(a.out.y).toBeLessThan(-0.99);
  });

  it("or a ramp at 1 in 12", () => {
    const { h, door } = make();
    h.opening(door)!.approach = "ramp";
    const [a] = doorApproaches(h, 0.05, low);
    expect(a.ramp).toBe(true);
    expect(a.length).toBeCloseTo(0.55 * 12, 6);
  });

  it("not when the door is level with the ground, or opens onto a terrace", () => {
    const { h, ids, door } = make();
    h.opening(door)!.approach = "steps";
    expect(doorApproaches(h, 0.05, () => 0)).toHaveLength(0);
    placeTerrace(h, ids[0]);
    const terrace = h.balconies[0];
    terrace.offset = 2;
    expect(doorApproaches(h, 0.05, low)).toHaveLength(0);
  });

  it("are paid for", () => {
    const { h, door } = make();
    h.opening(door)!.approach = "steps";
    const steps = (lines: ReturnType<typeof costLines>) => lines.filter((l) => l.what.kind === "steps" || l.what.kind === "ramp");
    // The suburban plot is flat: a floor 5 cm up needs no steps.
    expect(steps(costLines(h, defaultPrices(), plot))).toHaveLength(0);
    // On a slope, every raised door's steps are on the bill.
    const slope = plotById("slope")!;
    const ways = doorApproaches(h, siteLevel(h, slope) + 0.05, shapedGround(h, slope));
    const lines = steps(costLines(h, defaultPrices(), slope));
    expect(lines.filter((l) => l.what.kind === "steps").reduce((s, l) => s + l.quantity, 0)).toBe(ways.reduce((s, a) => s + a.steps, 0));
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(ways.reduce((s, a) => s + a.steps * defaultPrices().step, 0), 6);
  });
});

describe("skylights", () => {
  it("lie in the slope, cost less than a dormer, and need their own technique", () => {
    const { h, ids } = make();
    const id = placeDormer(h, ids[0], true)!;
    const d = h.dormer(id)!;
    expect(d.skylight).toBe(true);
    expect(dormerShape(h, d)).not.toBeNull();
    const sky = costLines(h, defaultPrices(), plot).find((l) => l.what.kind === "skylight")!;
    d.skylight = undefined;
    const dormer = costLines(h, defaultPrices(), plot).find((l) => l.what.kind === "dormer")!;
    expect(sky.amount).toBeLessThan(dormer.amount / 2);
    d.skylight = true;
    const missing = missingTechniques(h, abilities(["woodFloor"]));
    expect(missing).toContain("skylights");
    expect(missing).not.toContain("dormers");
  });
});

describe("window styles and frame colours", () => {
  it("are saved with the design", () => {
    const { h, window, door, ids } = make();
    Object.assign(h.opening(window)!, { style: "Cottage", color: "Green" });
    h.opening(door)!.approach = "ramp";
    placeDormer(h, ids[0], true);
    const back = House.fromJSON(JSON.parse(JSON.stringify(h)));
    expect(back.opening(window)).toMatchObject({ style: "Cottage", color: "Green" });
    expect(back.opening(door)!.approach).toBe("ramp");
    // Saves from before steps were a choice marked only ramps.
    const old = JSON.parse(JSON.stringify(h));
    for (const o of old.openings) if (o.approach) [o.ramp, o.approach] = [true, undefined];
    expect(House.fromJSON(old).opening(door)!.approach).toBe("ramp");
    expect(back.dormers[0].skylight).toBe(true);
    // Plain ones stay plain: nothing extra is written.
    const plain = JSON.parse(JSON.stringify(make().h));
    for (const o of plain.openings) expect(Object.keys(o)).not.toContain("style");
  });
});
