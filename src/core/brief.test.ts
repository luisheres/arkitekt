import { describe, expect, it } from "vitest";
import { describeRequirement, evaluateBrief, presentDesign } from "./brief";
import { CLIENTS, clientById, completeCommission, newCareer, nextClient } from "./clients";
import { defaultPrices, estimate, totalCost } from "./cost";
import { addRectangle, setRoomType } from "./edit";
import { Vec2 } from "./geometry";
import { House, type RoomType, type Roof, type WallMaterial } from "./model";
import { validate } from "./validate";

const v = (x: number, y: number) => new Vec2(x, y);
const prices = defaultPrices();

/** Compact description of a test house: outer rectangle, partitions, openings, rooms. */
interface Spec {
  outer: [number, number, number, number];
  material: WallMaterial;
  partitions: [number, number, number, number][];
  /** [wall start x, y] picks the wall that starts there; offset along it. */
  doors: [number, number, number][];
  windows: [number, number, number, number][]; // x, y of wall start, offset, width
  rooms: [number, number, RoomType][];
  roof: Roof;
}

function build(s: Spec): House {
  const h = new House();
  const [x0, y0, x1, y1] = s.outer;
  addRectangle(h, v(x0, y0), v(x1, y1), 2.7, s.material);
  for (const [ax, ay, bx, by] of s.partitions) h.addWall(v(ax, ay), v(bx, by), 2.7, s.material);
  const wallAt = (x: number, y: number) => {
    const w = h.walls.find((w) => w.start.distance(v(x, y)) < 1e-6);
    if (!w) throw new Error(`no wall starts at ${x},${y}`);
    return w.id;
  };
  for (const [x, y, off] of s.doors) h.addDoor(wallAt(x, y), off, 0.9, 2.1);
  for (const [x, y, off, width] of s.windows) h.addWindow(wallAt(x, y), off, width, 1.3, 0.9);
  for (const [x, y, type] of s.rooms) setRoomType(h, v(x, y), type);
  h.roof = s.roof;
  return h;
}

/** Margit & Sven: 10 x 8.5 m on the lakeside lot. Front: living + kitchen; back: bedroom, bath, guest room. */
const lindgren: Spec = {
  outer: [9, 8, 19, 16.5],
  material: "Plaster",
  partitions: [
    [9, 12.5, 19, 12.5],
    [15, 8, 15, 12.5],
    [13, 12.5, 13, 16.5],
    [15.5, 12.5, 15.5, 16.5],
  ],
  doors: [
    [9, 8, 3.3], // front door into the living room
    [15, 8, 2.25], // living - kitchen
    [9, 12.5, 2], // living - bedroom
    [9, 12.5, 5], // living - bathroom
    [9, 12.5, 8.25], // kitchen - guest room
  ],
  windows: [
    [9, 8, 1.5, 2.0],
    [9, 8, 4.9, 1.8],
    [9, 8, 8, 1.2],
    [19, 16.5, 1.75, 1.2], // back wall runs from x=19 to x=9
    [19, 16.5, 8, 1.2],
  ],
  rooms: [
    [12, 10, "Living"],
    [17, 10, "Kitchen"],
    [11, 14.5, "Bedroom"],
    [14, 14.5, "Bathroom"],
    [17, 14.5, "Bedroom"],
  ],
  roof: { style: "Hip", pitchDeg: 30, overhang: 0.5, material: "Shingles" },
};

/** The Anderssons: 12 x 10 m on the suburban lot. Front: living, kitchen, bath; back: three bedrooms. */
const andersson: Spec = {
  outer: [4, 6, 16, 16],
  material: "Wood",
  partitions: [
    [4, 11, 16, 11],
    [10, 6, 10, 11],
    [14, 6, 14, 11],
    [8, 11, 8, 16],
    [12, 11, 12, 16],
  ],
  doors: [
    [4, 6, 3], // front door into the living room
    [10, 6, 2.5], // living - kitchen
    [14, 6, 2.5], // kitchen - bathroom
    [4, 11, 2], // living - master bedroom
    [4, 11, 5], // living - bedroom 2
    [4, 11, 9], // kitchen - bedroom 3
  ],
  windows: [
    [4, 6, 1.2, 1.6],
    [4, 6, 4.8, 1.6],
    [4, 6, 8, 1.6],
    [16, 16, 2, 1.2],
    [16, 16, 6, 1.2],
    [16, 16, 10, 1.6],
  ],
  rooms: [
    [7, 8, "Living"],
    [12, 8, "Kitchen"],
    [15, 8, "Bathroom"],
    [6, 13, "Bedroom"],
    [10, 13, "Bedroom"],
    [14, 13, "Bedroom"],
  ],
  roof: { style: "Gable", pitchDeg: 30, overhang: 0.4, material: "Shingles" },
};

describe("briefs", () => {
  it("describes requirements in plain words", () => {
    expect(describeRequirement({ kind: "rooms", room: "Bedroom", count: 3, minArea: 9 })).toBe("3 bedrooms of at least 9 m²");
    expect(describeRequirement({ kind: "rooms", room: "Office", count: 1 })).toBe("An office");
    expect(describeRequirement({ kind: "connected", a: "Kitchen", b: "Living" })).toBe("A door or open plan between the kitchen and the living room");
  });

  it("an empty plot meets no must-haves and is rejected", () => {
    const client = CLIENTS[0];
    expect(evaluateBrief(new House(), client, prices).filter((r) => r.item.must && r.met)).toEqual([]);
    const verdict = presentDesign(new House(), client, prices);
    expect(verdict.accepted).toBe(false);
    expect(verdict.fee).toBe(0);
  });

  for (const [id, spec, expectedWishes] of [
    ["lindgren", lindgren, 4],
    ["andersson", andersson, 1],
  ] as const) {
    it(`a reference design for ${id} is valid, within budget and accepted`, () => {
      const client = clientById(id)!;
      const house = build(spec);
      expect(validate(house, client.plot, client.budget, prices).map((i) => i.kind)).toEqual([]);
      const results = evaluateBrief(house, client, prices);
      expect(results.filter((r) => r.item.must && !r.met).map((r) => `${r.text}: ${r.detail}`)).toEqual([]);
      const cost = totalCost(estimate(house, prices));
      // The budget leaves room for wishes, but not lavishly.
      expect(cost / client.budget).toBeGreaterThan(0.6);
      expect(cost / client.budget).toBeLessThan(0.95);
      const verdict = presentDesign(house, client, prices);
      expect(verdict.accepted).toBe(true);
      expect(verdict.wishesMet).toBe(expectedWishes);
      expect(verdict.fee).toBeGreaterThan(client.budget * 0.08);
    });
  }

  it("unmet must-haves are listed when presenting", () => {
    const client = clientById("lindgren")!;
    const house = build({ ...lindgren, rooms: lindgren.rooms.filter(([, , t]) => t !== "Kitchen") });
    const verdict = presentDesign(house, client, prices);
    expect(verdict.accepted).toBe(false);
    expect(verdict.problems).toEqual(["Missing: a kitchen (0 of 1)"]);
  });

  it("narrow doors fail an accessibility brief", () => {
    const client = clientById("lindgren")!;
    const house = build(lindgren);
    house.openings[1].width = 0.8;
    const door = evaluateBrief(house, client, prices).find((r) => r.item.req.kind === "doorWidth")!;
    expect([door.met, door.detail]).toEqual([false, "1 door too narrow"]);
  });

  it("every client's plot fits a house of the floor area they need", () => {
    for (const c of CLIENTS) {
      const minArea = c.items
        .filter((i) => i.must && i.req.kind === "rooms")
        .reduce((s, i) => s + (i.req.kind === "rooms" ? i.req.count * (i.req.minArea ?? 5) : 0), 0);
      const p = c.plot;
      expect((p.width - 2 * p.setback) * (p.depth - 2 * p.setback), c.id).toBeGreaterThan(minArea * 1.5);
    }
  });
});

describe("career", () => {
  it("serves clients in order, then starts over", () => {
    let career = newCareer();
    const seen: string[] = [];
    for (let i = 0; i < CLIENTS.length + 1; i++) {
      const c = nextClient(career);
      seen.push(c.id);
      career = completeCommission(career, c.id, 1000, 2);
    }
    expect(seen).toEqual([...CLIENTS.map((c) => c.id), CLIENTS[0].id]);
    expect(career.earnings).toBe(1000 * (CLIENTS.length + 1));
  });
});
