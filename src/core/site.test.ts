import { describe, expect, it } from "vitest";
import { costLines, defaultPrices } from "./cost";
import { Vec2, pointInPolygon } from "./geometry";
import { House } from "./model";
import { groundHeight, plotById, starterPlots } from "./plot";
import { earthworks, shapedGround, siteLevel } from "./site";

const v = (x: number, y: number) => new Vec2(x, y);
const box = (h: House, x0: number, y0: number, x1: number, y1: number, level = 0) => h.addWallLoop([v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)], 2.7, "Plaster", level);

describe("building on a slope", () => {
  const slope = plotById("slope")!;

  it("stands the house on a level platform at the average height of the ground under it", () => {
    const h = new House();
    box(h, 8, 10, 18, 18);
    const level = siteLevel(h, slope);
    const [low, high] = [groundHeight(slope, 13, 10), groundHeight(slope, 13, 18)];
    expect(level).toBeGreaterThan(low);
    expect(level).toBeLessThan(high);
    // The ground is level under and around the house, and natural further away.
    const ground = shapedGround(h, slope);
    expect(ground(13, 14)).toBeCloseTo(level, 9);
    expect(ground(13, 18.5)).toBeCloseTo(level, 9);
    expect(ground(13, 25)).toBeCloseTo(groundHeight(slope, 13, 25), 9);
  });

  it("digs and fills about as much as it must, and costs more higher up the slope", () => {
    const h = new House();
    box(h, 8, 10, 18, 18);
    const { cut, fill } = earthworks(h, slope);
    expect(cut).toBeGreaterThan(5);
    expect(fill).toBeGreaterThan(5);
    const line = costLines(h, defaultPrices(), slope).find((l) => l.what.kind === "earthworks")!;
    expect(line.group).toBe("groundworks");
    expect(line.amount).toBeCloseTo((cut + fill) * 55, 6);
    // A bigger house on the same slope moves more earth.
    const big = new House();
    box(big, 6, 8, 26, 30);
    const e = earthworks(big, slope);
    expect(e.cut + e.fill).toBeGreaterThan(cut + fill);
  });

  it("moves no earth on a flat plot", () => {
    const h = new House();
    box(h, 5, 5, 15, 15);
    expect(earthworks(h, starterPlots()[0])).toEqual({ cut: 0, fill: 0, basement: 0 });
    expect(costLines(h, defaultPrices(), starterPlots()[0]).some((l) => l.group === "groundworks")).toBe(false);
  });
});

describe("moving and turning the house", async () => {
  const { moveHouse, rotateHouse, setRoomType } = await import("./edit");
  const { addFurnitureAt, addGardenPlant } = await import("./furnish");
  const { analyzeHouse } = await import("./rooms");
  const { validate } = await import("./validate");
  const make = () => {
    const h = new House();
    const ids = box(h, 6, 6, 16, 12);
    h.addWall(v(11, 6), v(11, 12), 2.7, "Plaster");
    h.addDoor(ids[0], 2, 1, 2.1);
    setRoomType(h, v(8, 9), "Living", 0);
    setRoomType(h, v(14, 9), "Bedroom", 0);
    h.addStair(0, v(9, 8), 0);
    addFurnitureAt(h, "Sofa", v(8, 10), 0);
    addGardenPlant(h, starterPlots()[0], "Shrub");
    return h;
  };

  it("moves everything in the house together, but leaves the garden", () => {
    const h = make();
    const shrub = h.furniture.find((f) => f.kind === "Shrub")!.at;
    const labels = h.labels.map((l) => l.at.add(v(1.5, -0.5)));
    moveHouse(h, v(1.5, -0.5));
    expect(h.walls[0].start).toEqual(v(7.5, 5.5));
    expect(h.labels.map((l) => l.at)).toEqual(labels);
    expect(h.stairs[0].at).toEqual(v(10.5, 7.5));
    expect(h.furniture.find((f) => f.kind === "Sofa")!.at).toEqual(v(9.5, 9.5));
    expect(h.furniture.find((f) => f.kind === "Shrub")!.at).toEqual(shrub);
  });

  it("turns a quarter at a time, and four turns bring it back", () => {
    const h = make();
    const before = JSON.stringify(h.toJSON());
    const problems = () => validate(h, starterPlots()[0], Infinity, defaultPrices()).map((i) => i.kind).sort();
    const problemsBefore = problems();
    rotateHouse(h, 1);
    // A 10 x 6 house becomes 6 x 10 about the same middle.
    const xs = h.walls.flatMap((w) => [w.start.x, w.end.x]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 9);
    expect(h.stairs[0].facing).toBe(1);
    expect(analyzeHouse(h).rooms.map((r) => r.type).sort()).toEqual(["Bedroom", "Living"]);
    expect(problems()).toEqual(problemsBefore);
    rotateHouse(h, 1);
    rotateHouse(h, 1);
    rotateHouse(h, 1);
    expect(JSON.stringify(h.toJSON())).toBe(before);
    rotateHouse(h, -1);
    rotateHouse(h, 1);
    expect(JSON.stringify(h.toJSON())).toBe(before);
  });

  it("changes the earthworks when the house moves up a slope", () => {
    const slope = plotById("slope")!;
    const h = new House();
    box(h, 8, 6, 18, 12);
    const low = siteLevel(h, slope);
    moveHouse(h, v(0, 12));
    expect(siteLevel(h, slope)).toBeGreaterThan(low + 0.8);
  });
});

describe("basements", async () => {
  const { addBasement, setRoomType } = await import("./edit");
  const { validate } = await import("./validate");
  const { abilities, missingTechniques } = await import("./progression");
  const { analyzeHouse } = await import("./rooms");
  const flat = starterPlots()[0];
  const make = () => {
    const h = new House();
    const ids = box(h, 5, 6, 15, 14);
    h.addDoor(ids[0], 2, 1, 2.1);
    h.addWindow(ids[0], 6, 1.4, 1.2, 0.9);
    setRoomType(h, v(10, 10), "Living", 0);
    h.roof = { style: "Gable", pitchDeg: 30, overhang: 0.4, material: "Shingles" };
    return h;
  };
  const kinds = (h: House) => validate(h, flat, Infinity, defaultPrices()).map((i) => i.kind);

  it("are dug under the ground floor, with concrete walls along its outline", () => {
    const h = make();
    expect(addBasement(h)).toBe(-1);
    expect(h.lowestLevel()).toBe(-1);
    expect(h.levelList()).toEqual([-1, 0]);
    expect(h.wallsOn(-1)).toHaveLength(4);
    expect(h.wallsOn(-1).every((w) => w.material === "Concrete")).toBe(true);
    expect(h.levelBase(-1)).toBeLessThan(-2.4);
    expect(House.fromJSON(JSON.parse(JSON.stringify(h.toJSON()))).basement).toBe(true);
    // It is not counted in the floor area, but its rooms are rooms.
    expect(h.floorArea()).toBeCloseTo(80, 6);
    setRoomType(h, v(10, 10), "Storage", -1);
    expect(analyzeHouse(h).rooms.map((r) => [r.level, r.type])).toContainEqual([-1, "Storage"]);
  });

  it("need stairs down, no doors or windows out, and to fit under the house", () => {
    const h = make();
    addBasement(h);
    setRoomType(h, v(10, 10), "Storage", -1);
    expect(kinds(h)).toContain("NoStairsToBasement");
    h.addStair(-1, v(7, 8), 0);
    expect(kinds(h)).not.toContain("NoStairsToBasement");
    h.addWindow(h.wallsOn(-1)[0].id, 5, 1, 0.6, 1.5);
    expect(kinds(h)).toContain("OpeningBelowGround");
    h.removeOpening(h.openings.find((o) => h.levelOf(o.wall) === -1)!.id);
    expect(kinds(h)).not.toContain("BasementOutsideHouse");
    // A basement bigger than the house above.
    const big = make();
    big.basement = true;
    big.addWallLoop([v(5, 6), v(15, 6), v(15, 17), v(5, 17)], 2.4, "Concrete", -1);
    expect(kinds(big)).toContain("BasementOutsideHouse");
  });

  it("cost the digging and the walls, put the foundation under them, and need the technique", () => {
    const h = make();
    addBasement(h);
    const lines = costLines(h, defaultPrices(), flat);
    const dig = lines.find((l) => l.what.kind === "basementDig")!;
    expect(dig.quantity).toBeCloseTo(80 * h.basementDepth(), 6);
    expect(lines.find((l) => l.what.kind === "basementWalls")!.group).toBe("groundworks");
    expect(lines.some((l) => l.what.kind === "facade" && l.what.material === "Concrete")).toBe(false);
    expect(lines.find((l) => l.what.kind === "upperFloors")!.quantity).toBeCloseTo(80, 6);
    expect(missingTechniques(h, abilities(["woodFloor"]))).toEqual(["basement"]);
    h.removeBasement();
    expect(h.wallsOn(-1)).toHaveLength(0);
    expect(h.basement).toBe(false);
  });
});

describe("double height", async () => {
  const { addStoreyAbove, clearDoubleHeight, makeDoubleHeight, openingAbove, setRoomType } = await import("./edit");
  const { validate } = await import("./validate");
  const { evaluateBrief } = await import("./brief");
  const { abilities, missingTechniques } = await import("./progression");
  const { freePlayClient } = await import("./clients");
  const { voidArea, analyzeHouse } = await import("./rooms");
  const flat = starterPlots()[0];
  /** Two storeys; downstairs a living room (left) and a kitchen (right). */
  const make = () => {
    const h = new House();
    const ids = box(h, 5, 6, 15, 14);
    h.addWall(v(10, 6), v(10, 14), 2.7, "Plaster");
    h.addDoor(ids[0], 2, 1, 2.1);
    setRoomType(h, v(7, 10), "Living", 0);
    setRoomType(h, v(12, 10), "Kitchen", 0);
    addStoreyAbove(h);
    setRoomType(h, v(10, 10), "Bedroom", 1);
    return h;
  };

  it("opens the floor above a room, splitting the storey above along its sides", () => {
    const h = make();
    expect(makeDoubleHeight(h, v(7, 10), 0)).toBe(true);
    const opening = openingAbove(h, v(7, 10), 0)!;
    expect(opening.level).toBe(1);
    expect(opening.area).toBeCloseTo(40, 6);
    expect(openingAbove(h, v(12, 10), 0)).toBeNull();
    expect(h.wallsOn(1).filter((w) => w.boundary)).toHaveLength(1);
    expect(voidArea(h, 1)).toBeCloseTo(40, 6);
    // The rest of the upper floor is still a bedroom.
    expect(analyzeHouse(h).rooms.filter((r) => r.level === 1).map((r) => r.type).sort()).toEqual(["Bedroom", "Void"]);
  });

  it("leaves out the floor over it, and is not floor area", () => {
    const h = make();
    const floorsBefore = costLines(h, defaultPrices(), flat).find((l) => l.what.kind === "upperFloors")!.quantity;
    makeDoubleHeight(h, v(7, 10), 0);
    expect(costLines(h, defaultPrices(), flat).find((l) => l.what.kind === "upperFloors")!.quantity).toBeCloseTo(floorsBefore - 40, 6);
    const client = { ...freePlayClient("suburban"), items: [{ must: false, req: { kind: "floorArea" as const, max: 125 } }, { must: false, req: { kind: "doubleHeight" as const, room: "Living" as const } }] };
    expect(evaluateBrief(h, client, defaultPrices()).map((r) => r.met)).toEqual([true, true]);
  });

  it("is a technique to learn, belongs on upper floors, and can be closed again", () => {
    const h = make();
    makeDoubleHeight(h, v(7, 10), 0);
    expect(missingTechniques(h, abilities(["twoStoreys", "woodFloor"]))).toEqual(["doubleHeight"]);
    const kinds = () => validate(h, flat, Infinity, defaultPrices()).map((i) => i.kind);
    expect(kinds()).not.toContain("VoidOnGroundFloor");
    // The opening is not a room: no room rules for it.
    const opening = openingAbove(h, v(7, 10), 0)!;
    const aboutOpening = validate(h, flat, Infinity, defaultPrices()).filter((i) => "room" in i && i.room.level === 1 && pointInPolygon(i.room.at, opening.polygon));
    expect(aboutOpening).toEqual([]);
    setRoomType(h, v(12, 10), "Void", 0);
    expect(kinds()).toContain("VoidOnGroundFloor");
    setRoomType(h, v(12, 10), "Kitchen", 0);
    expect(clearDoubleHeight(h, v(7, 10), 0)).toBe(true);
    expect(openingAbove(h, v(7, 10), 0)).toBeNull();
    expect(voidArea(h)).toBe(0);
  });
});
