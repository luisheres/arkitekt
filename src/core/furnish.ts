/**
 * Basic furniture, placed automatically from what each room is used for: a bed against
 * a wall away from the door, a sofa facing a TV, a toilet and sink in a bathroom.
 * Furniture stands against real walls (not room boundaries) where it can, keeps
 * doorways, stairs and (for tall pieces) windows clear, and never overlaps.
 *
 * Placement works in a frame aligned with the room: the largest rectangle that fits in
 * it, with u along one side and v along the other.
 */

import { SNAP_EPS, Vec2, pointInPolygon, projectOntoSegment, removeCollinear, segmentsIntersect } from "./geometry";
import { FURNITURE_SIZE, type Furniture, type FurnitureKind } from "./furniture";
import { type House, type Opening, type RoomType, stairDirection, stairOutline } from "./model";
import { type Room, analyzeRooms } from "./rooms";

/** A box in the room frame. */
interface Box {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

const overlaps = (a: Box, b: Box, gap = 0) => a.u0 < b.u1 + gap && b.u0 < a.u1 + gap && a.v0 < b.v1 + gap && b.v0 < a.v1 + gap;

/** Sides of the room frame: 0 at v = 0, 1 at u = width, 2 at v = depth, 3 at u = 0. */
type Side = 0 | 1 | 2 | 3;

interface Placement {
  box: Box;
  side: Side | null;
  /** Position along the side (for wall pieces). */
  t: number;
  width: number;
  depth: number;
  /** Facing in the room frame. */
  face: Vec2;
}

type How =
  | { at: "wall"; prefer?: "awayFromDoor" | "window" | "opposite" }
  | { at: "center"; clearance: number; alongLong?: boolean }
  | { at: "front"; gap: number }
  | { at: "beside"; side: -1 | 1 }
  | { at: "around" };

interface Spec {
  kind: FurnitureKind;
  /** Widths to try, largest first. */
  widths: number[];
  depth: number;
  height: number;
  how: How;
}

const spec = (kind: FurnitureKind, widths: number | number[], depth: number, height: number, how: How): Spec => ({
  kind,
  widths: Array.isArray(widths) ? widths : [widths],
  depth,
  height,
  how,
});

/** What goes in each kind of room, most important first. */
function program(type: RoomType, area: number): Spec[] {
  switch (type) {
    case "Bedroom":
      return area >= 11
        ? [
            spec("Bed", 1.6, 2.1, 0.55, { at: "wall", prefer: "awayFromDoor" }),
            spec("Nightstand", 0.45, 0.4, 0.5, { at: "beside", side: -1 }),
            spec("Nightstand", 0.45, 0.4, 0.5, { at: "beside", side: 1 }),
            spec("Wardrobe", [1.6, 1.2, 0.8], 0.6, 2.0, { at: "wall" }),
          ]
        : [spec("SingleBed", 0.9, 2.0, 0.5, { at: "wall", prefer: "awayFromDoor" }), spec("Wardrobe", [1.2, 0.8], 0.6, 2.0, { at: "wall" })];
    case "Living":
      return [
        spec("Sofa", [2.2, 1.8], 0.9, 0.8, { at: "wall", prefer: "awayFromDoor" }),
        spec("CoffeeTable", 1.1, 0.6, 0.42, { at: "front", gap: 0.45 }),
        spec("TvUnit", [1.6, 1.2], 0.45, 0.5, { at: "wall", prefer: "opposite" }),
        spec("Armchair", 0.85, 0.85, 0.8, { at: "wall" }),
      ];
    case "Kitchen":
      return [
        spec("Counter", [3.0, 2.4, 1.8, 1.2], 0.62, 0.9, { at: "wall", prefer: "window" }),
        spec("Fridge", 0.6, 0.65, 1.85, { at: "wall" }),
        ...(area >= 11 ? [spec("DiningTable", [1.6, 1.2], 0.9, 0.75, { at: "center", clearance: 0.7 }), spec("Chair", 0.45, 0.45, 0.9, { at: "around" })] : []),
      ];
    case "Bathroom":
      return [
        area >= 5.5 ? spec("Bathtub", 1.7, 0.75, 0.55, { at: "wall", prefer: "awayFromDoor" }) : spec("Shower", 0.9, 0.9, 2.0, { at: "wall", prefer: "awayFromDoor" }),
        spec("Toilet", 0.4, 0.65, 0.75, { at: "wall" }),
        spec("Sink", 0.6, 0.45, 0.85, { at: "wall" }),
      ];
    case "WC":
      return [spec("Toilet", 0.4, 0.65, 0.75, { at: "wall", prefer: "awayFromDoor" }), spec("Sink", 0.45, 0.35, 0.85, { at: "wall" })];
    case "Office":
      return [
        spec("Desk", [1.4, 1.1], 0.7, 0.75, { at: "wall", prefer: "window" }),
        spec("OfficeChair", 0.55, 0.55, 0.95, { at: "front", gap: 0.05 }),
        spec("Bookshelf", [0.9, 0.6], 0.35, 1.9, { at: "wall" }),
      ];
    case "Hall":
      return [spec("Bench", [1.0, 0.7], 0.4, 0.45, { at: "wall" })];
    case "Utility":
      return [spec("Washer", 0.6, 0.6, 0.85, { at: "wall" }), spec("Washer", 0.6, 0.6, 0.85, { at: "wall" }), spec("Sink", 0.5, 0.45, 0.85, { at: "wall" })];
    case "Garage":
      return [spec("Car", 1.8, 4.4, 1.45, { at: "center", clearance: 0.45, alongLong: true }), spec("Workbench", [1.6, 1.2], 0.6, 0.9, { at: "wall" })];
    case "Storage":
      return [spec("Shelf", [1.2, 0.8], 0.4, 1.9, { at: "wall" }), spec("Shelf", [1.2, 0.8], 0.4, 1.9, { at: "wall" })];
  }
}

/** A rectangle in plan: origin corner, unit axes, and lengths. */
interface Frame {
  origin: Vec2;
  u: Vec2;
  v: Vec2;
  a: number;
  b: number;
}

/** The largest rectangle inside the room, aligned with its first side. */
function roomFrame(poly: readonly Vec2[]): Frame | null {
  const p = removeCollinear(poly);
  const u = p[1].sub(p[0]).normalize();
  const v = new Vec2(-u.y, u.x);
  // Room corners in a frame aligned with the first side.
  const local = p.map((q) => new Vec2(q.sub(p[0]).dot(u), q.sub(p[0]).dot(v)));
  const us = [...new Set(local.map((q) => Math.round(q.x * 1000) / 1000))].sort((x, y) => x - y);
  const vs = [...new Set(local.map((q) => Math.round(q.y * 1000) / 1000))].sort((x, y) => x - y);
  const inside = (x: number, y: number) => {
    const q = p[0].add(u.scale(x)).add(v.scale(y));
    return pointInPolygon(q, poly) || poly.some((c, i) => {
      const d = poly[(i + 1) % poly.length];
      return c.add(d.sub(c).normalize().scale(projectOntoSegment(q, c, d))).distance(q) < 1e-3;
    });
  };
  let best: Frame | null = null;
  for (let i = 0; i < us.length; i++)
    for (let j = i + 1; j < us.length; j++)
      for (let k = 0; k < vs.length; k++)
        for (let l = k + 1; l < vs.length; l++) {
          const [u0, u1, v0, v1] = [us[i], us[j], vs[k], vs[l]];
          const area = (u1 - u0) * (v1 - v0);
          if (best && area <= best.a * best.b) continue;
          // Corners and points along the edges must lie in the room.
          let ok = true;
          for (let s = 0; s <= 8 && ok; s++) {
            const f = s / 8;
            ok = inside(u0 + (u1 - u0) * f, v0) && inside(u0 + (u1 - u0) * f, v1) && inside(u0, v0 + (v1 - v0) * f) && inside(u1, v0 + (v1 - v0) * f) && inside((u0 + u1) / 2, v0 + (v1 - v0) * f);
          }
          if (ok) best = { origin: p[0].add(u.scale(u0)).add(v.scale(v0)), u, v, a: u1 - u0, b: v1 - v0 };
        }
  return best;
}

/** Furnish every labelled room of the house. */
export function furnish(house: House): Furniture[] {
  const out: Furniture[] = [];
  for (let level = 0; level < house.levels; level++) {
    const analysis = analyzeRooms(house, level);
    if (!analysis.ok) continue;
    for (const room of analysis.value.rooms) if (room.type) out.push(...furnishRoom(house, room));
  }
  return out;
}

/** Wall clearance: furniture stands this far from the wall's centerline. */
const INSET = 0.15;

export function furnishRoom(house: House, room: Room): Furniture[] {
  if (!room.type) return [];
  const frame = roomFrame(room.polygon);
  if (!frame) return [];
  const { u, v } = frame;
  // Usable box, inset from the walls.
  const origin = frame.origin.add(u.scale(INSET)).add(v.scale(INSET));
  const [A, B] = [frame.a - 2 * INSET, frame.b - 2 * INSET];
  if (A < 0.5 || B < 0.5) return [];
  const toLocal = (p: Vec2) => new Vec2(p.sub(origin).dot(u), p.sub(origin).dot(v));
  const toPlan = (x: number, y: number) => origin.add(u.scale(x)).add(v.scale(y));
  const level = room.level;
  const walls = house.wallsOn(level);

  // Segments in the room frame, and what to keep clear around them.
  const blocked: Box[] = [];
  const windowZones: Box[] = [];
  const segBox = (o: Opening, depth: number): Box | null => {
    const w = house.wall(o.wall);
    if (!w) return null;
    const d = w.direction();
    const [a, b] = [toLocal(w.start.add(d.scale(o.left()))), toLocal(w.start.add(d.scale(o.right())))];
    const horizontal = Math.abs(a.y - b.y) < Math.abs(a.x - b.x);
    const [px, py] = horizontal ? [0.1, depth] : [depth, 0.1];
    return { u0: Math.min(a.x, b.x) - px, u1: Math.max(a.x, b.x) + px, v0: Math.min(a.y, b.y) - py, v1: Math.max(a.y, b.y) + py };
  };
  for (const d of room.doors) {
    // The car parks right behind the garage door; only doors for people need a clear path.
    if (d.opening.kind === "GarageDoor") continue;
    const box = segBox(d.opening, Math.max(1.0, d.opening.width + 0.1));
    if (box) blocked.push(box);
  }
  for (const w of room.windows) {
    const box = segBox(w, 0.7);
    if (box) windowZones.push(box);
  }
  // Stairs on this floor, or arriving from below, with room to step on and off.
  for (const s of house.stairs) {
    if (s.level !== level && s.level + 1 !== level) continue;
    const dir = stairDirection(s);
    const corners = stairOutline(s).flatMap((c) => [c, c.add(dir.scale(1.0)), c.sub(dir.scale(1.0))]).map(toLocal);
    blocked.push({ u0: Math.min(...corners.map((c) => c.x)), u1: Math.max(...corners.map((c) => c.x)), v0: Math.min(...corners.map((c) => c.y)), v1: Math.max(...corners.map((c) => c.y)) });
  }

  // Which sides are real walls (not open room boundaries).
  const sideSegment = (s: Side): [Vec2, Vec2] =>
    [
      [toPlan(0, -INSET), toPlan(A, -INSET)],
      [toPlan(A + INSET, 0), toPlan(A + INSET, B)],
      [toPlan(0, B + INSET), toPlan(A, B + INSET)],
      [toPlan(-INSET, 0), toPlan(-INSET, B)],
    ][s] as [Vec2, Vec2];
  const isWall = (s: Side) => {
    const [a, b] = sideSegment(s);
    const mid = a.add(b).scale(0.5);
    return walls.some((w) => !w.boundary && w.start.add(w.direction().scale(projectOntoSegment(mid, w.start, w.end))).distance(mid) < 0.05 + SNAP_EPS);
  };
  const sideLength = (s: Side) => (s % 2 === 0 ? A : B);
  const inward: Record<Side, Vec2> = { 0: new Vec2(0, 1), 1: new Vec2(-1, 0), 2: new Vec2(0, -1), 3: new Vec2(1, 0) };
  const wallBox = (s: Side, t: number, w: number, d: number): Box => {
    switch (s) {
      case 0:
        return { u0: t - w / 2, u1: t + w / 2, v0: 0, v1: d };
      case 1:
        return { u0: A - d, u1: A, v0: t - w / 2, v1: t + w / 2 };
      case 2:
        return { u0: t - w / 2, u1: t + w / 2, v0: B - d, v1: B };
      case 3:
        return { u0: 0, u1: d, v0: t - w / 2, v1: t + w / 2 };
    }
  };

  const placed: Placement[] = [];
  const out: Furniture[] = [];
  const fits = (box: Box, tall: boolean) =>
    box.u0 >= -1e-6 &&
    box.v0 >= -1e-6 &&
    box.u1 <= A + 1e-6 &&
    box.v1 <= B + 1e-6 &&
    !blocked.some((z) => overlaps(box, z)) &&
    !(tall && windowZones.some((z) => overlaps(box, z))) &&
    !placed.some((p) => overlaps(box, p.box, 0.05));
  const emit = (s: Spec, p: Placement) => {
    placed.push(p);
    const c = toPlan((p.box.u0 + p.box.u1) / 2, (p.box.v0 + p.box.v1) / 2);
    out.push({ kind: s.kind, level, at: c, facing: u.scale(p.face.x).add(v.scale(p.face.y)).normalize(), width: p.width, depth: p.depth, height: s.height });
  };

  const doorCenter = blocked.length ? new Vec2((blocked[0].u0 + blocked[0].u1) / 2, (blocked[0].v0 + blocked[0].v1) / 2) : new Vec2(A / 2, B / 2);
  const sideMid = (s: Side) => [new Vec2(A / 2, 0), new Vec2(A, B / 2), new Vec2(A / 2, B), new Vec2(0, B / 2)][s];
  const hasWindow = (s: Side) => windowZones.some((z) => overlaps(z, wallBox(s, sideLength(s) / 2, sideLength(s), 0.05)));

  // Pieces placed "beside", "in front of" or "around" refer to the last main piece
  // (the bed, sofa or table), not to whatever was placed just before.
  let anchor: Placement | undefined;
  for (const s of program(room.type, room.area)) {
    const prev = anchor;
    const main = s.how.at === "wall" || s.how.at === "center";
    const count = placed.length;
    const tall = s.height > 1.0;
    let done = false;
    for (const width of s.widths) {
      if (done) break;
      const how = s.how;
      if (how.at === "wall") {
        const sides = ([0, 1, 2, 3] as Side[]).filter((x) => sideLength(x) >= width);
        const score = (x: Side) => {
          let sc = (isWall(x) ? 100 : 0) + sideLength(x);
          if (how.prefer === "awayFromDoor") sc += sideMid(x).distance(doorCenter) * 5;
          if (how.prefer === "window" && hasWindow(x)) sc += 50;
          if (how.prefer === "opposite" && prev && prev.side !== null && x === (prev.side + 2) % 4) sc += 80;
          return sc;
        };
        for (const side of sides.sort((x, y) => score(y) - score(x))) {
          const len = sideLength(side);
          for (let k = 0; k <= 2 * Math.ceil(len / 0.1) && !done; k++) {
            const t = len / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.1;
            const box = wallBox(side, t, width, s.depth);
            if (fits(box, tall)) {
              emit(s, { box, side, t, width, depth: s.depth, face: inward[side] });
              done = true;
            }
          }
          if (done) break;
        }
      } else if (how.at === "beside" && prev?.side !== null && prev) {
        const t = prev.t + how.side * (prev.width / 2 + 0.05 + width / 2);
        const box = wallBox(prev.side!, t, width, s.depth);
        if (fits(box, tall)) {
          emit(s, { box, side: prev.side, t, width, depth: s.depth, face: inward[prev.side!] });
          done = true;
        }
      } else if (how.at === "front" && prev) {
        const c = new Vec2((prev.box.u0 + prev.box.u1) / 2, (prev.box.v0 + prev.box.v1) / 2).add(prev.face.scale(prev.depth / 2 + how.gap + s.depth / 2));
        const across = Math.abs(prev.face.x) > 0.5;
        const [hu, hv] = across ? [s.depth / 2, width / 2] : [width / 2, s.depth / 2];
        const box = { u0: c.x - hu, u1: c.x + hu, v0: c.y - hv, v1: c.y + hv };
        if (fits(box, tall)) {
          emit(s, { box, side: null, t: 0, width, depth: s.depth, face: prev.face.neg() });
          done = true;
        }
      } else if (how.at === "center") {
        // Lengthwise along the room's longer side when asked (cars), else across the room.
        const alongU = how.alongLong ? A >= B : A < B;
        const [hu, hv] = alongU ? [s.depth / 2, width / 2] : [width / 2, s.depth / 2];
        const cl = how.clearance;
        let best: Box | null = null;
        for (let x = hu + cl; x <= A - hu - cl + 1e-6; x += 0.1)
          for (let y = hv + cl; y <= B - hv - cl + 1e-6; y += 0.1) {
            const box = { u0: x - hu, u1: x + hu, v0: y - hv, v1: y + hv };
            const clear = { u0: box.u0 - cl, u1: box.u1 + cl, v0: box.v0 - cl, v1: box.v1 + cl };
            // The piece itself must fit, with walking room around it.
            if (!fits(box, tall) || blocked.some((z) => overlaps(clear, z)) || placed.some((p) => overlaps(clear, p.box))) continue;
            const d = new Vec2(x - A / 2, y - B / 2).length();
            if (!best || d < new Vec2((best.u0 + best.u1) / 2 - A / 2, (best.v0 + best.v1) / 2 - B / 2).length()) best = box;
          }
        if (best) {
          emit(s, { box: best, side: null, t: 0, width, depth: s.depth, face: alongU ? new Vec2(1, 0) : new Vec2(0, 1) });
          done = true;
        }
      } else if (how.at === "around" && prev) {
        // Chairs along both long sides of the table, facing it.
        const t = prev.box;
        const alongU = t.u1 - t.u0 >= t.v1 - t.v0;
        const n = (alongU ? t.u1 - t.u0 : t.v1 - t.v0) >= 1.4 ? 2 : 1;
        const g = 0.12;
        for (let i = 0; i < n; i++) {
          const f = (i + 0.5) / n;
          for (const sgn of [-1, 1]) {
            const c = alongU
              ? new Vec2(t.u0 + (t.u1 - t.u0) * f, sgn < 0 ? t.v0 - g - s.depth / 2 : t.v1 + g + s.depth / 2)
              : new Vec2(sgn < 0 ? t.u0 - g - s.depth / 2 : t.u1 + g + s.depth / 2, t.v0 + (t.v1 - t.v0) * f);
            const box = { u0: c.x - width / 2, u1: c.x + width / 2, v0: c.y - width / 2, v1: c.y + width / 2 };
            if (box.u0 >= 0 && box.v0 >= 0 && box.u1 <= A && box.v1 <= B && !blocked.some((z) => overlaps(box, z))) {
              const face = alongU ? new Vec2(0, -sgn) : new Vec2(-sgn, 0);
              placed.push({ box, side: null, t: 0, width, depth: s.depth, face });
              out.push({ kind: s.kind, level, at: toPlan(c.x, c.y), facing: u.scale(face.x).add(v.scale(face.y)).normalize(), width, depth: s.depth, height: s.height });
            }
          }
        }
        done = true;
      }
    }
    if (main && placed.length > count) anchor = placed[placed.length - 1];
  }
  return out;
}

/** The furniture's footprint corners in plan, for drawing and tests. */
export function furnitureOutline(f: Furniture): Vec2[] {
  const n = f.facing;
  const side = new Vec2(-n.y, n.x);
  const [hw, hd] = [f.width / 2, f.depth / 2];
  return [f.at.add(side.scale(hw)).add(n.scale(hd)), f.at.sub(side.scale(hw)).add(n.scale(hd)), f.at.sub(side.scale(hw)).sub(n.scale(hd)), f.at.add(side.scale(hw)).sub(n.scale(hd))];
}

/** Whether two furniture footprints overlap; touching does not count. */
export function furnitureOverlap(a: Furniture, b: Furniture): boolean {
  // Shrink slightly so pieces standing side by side do not count as overlapping.
  const shrink = (f: Furniture) => furnitureOutline({ ...f, width: f.width - 0.02, depth: f.depth - 0.02 });
  const [pa, pb] = [shrink(a), shrink(b)];
  if (pa.some((p) => pointInPolygon(p, pb)) || pb.some((p) => pointInPolygon(p, pa))) return true;
  return pa.some((p, i) => pb.some((q, j) => segmentsIntersect(p, pa[(i + 1) % 4], q, pb[(j + 1) % 4])));
}

/** The pieces of furniture standing in a room (their centers are inside it). */
export function furnitureIn(house: House, room: Room): Furniture[] {
  return house.furniture.filter((f) => f.level === room.level && pointInPolygon(f.at, room.polygon));
}

/** The room containing `at` on `level`, if the storey's rooms can be found. */
function roomOn(house: House, at: Vec2, level: number): Room | undefined {
  const analysis = analyzeRooms(house, level);
  return analysis.ok ? analysis.value.rooms.find((r) => pointInPolygon(at, r.polygon)) : undefined;
}

/** Replace the furniture in the room containing `at` with the automatic layout for its use. */
export function refurnishRoomAt(house: House, at: Vec2, level = 0): void {
  const room = roomOn(house, at, level);
  if (!room) return;
  for (const f of furnitureIn(house, room)) house.removeFurniture(f.id!);
  for (const f of furnishRoom(house, room)) house.addFurniture(f);
}

/** Take all furniture out of the room containing `at`. */
export function clearRoomFurnitureAt(house: House, at: Vec2, level = 0): void {
  const room = roomOn(house, at, level);
  if (room) for (const f of furnitureIn(house, room)) house.removeFurniture(f.id!);
}

/** Furnish every room with a use, replacing all furniture (for saves from before furniture was stored). */
export function furnishAll(house: House): void {
  house.furniture = [];
  for (const f of furnish(house)) house.addFurniture(f);
}

/** Add a piece of a standard size at `at`, facing `facing` (default: towards the street). */
export function addFurnitureAt(house: House, kind: FurnitureKind, at: Vec2, level = 0, facing = new Vec2(0, -1)): number {
  return house.addFurniture({ kind, level, at, facing, ...FURNITURE_SIZE[kind] });
}

/** The top-most piece of furniture under `p` on `level`. */
export function furnitureAt(house: House, p: Vec2, level = 0): Furniture | undefined {
  return [...house.furniture].reverse().find((f) => f.level === level && pointInPolygon(p, furnitureOutline(f)));
}

/** Turn a piece a quarter turn (counter-clockwise in plan) about its center. */
export function rotateFurniture(f: Furniture): void {
  f.facing = new Vec2(-f.facing.y + 0, f.facing.x + 0);
}

/**
 * Plant something in the garden: in the first free spot, front garden first, clear of the
 * house (and a path's width around it) and of everything else in the garden.
 */
export function addGardenPlant(house: House, plot: { width: number; depth: number }, kind: FurnitureKind): number | null {
  const size = FURNITURE_SIZE[kind];
  const footprint = house.footprint(0);
  const fp = footprint.ok ? footprint.value : null;
  const others = house.furniture.filter((f) => f.level === 0);
  const fits = (at: Vec2) => {
    const piece: Furniture = { kind, level: 0, at, facing: new Vec2(0, -1), ...size };
    const outline = furnitureOutline(piece);
    if (outline.some((p) => p.x < 0.3 || p.y < 0.3 || p.x > plot.width - 0.3 || p.y > plot.depth - 0.3)) return false;
    if (fp) {
      // A metre's path around the house.
      const wider = furnitureOutline({ ...piece, width: size.width + 2, depth: size.depth + 2 });
      if ([at, ...wider].some((p) => pointInPolygon(p, fp)) || fp.some((p) => pointInPolygon(p, wider))) return false;
    }
    return !others.some((o) => furnitureOverlap(o, piece));
  };
  const step = 0.5;
  for (let y = size.depth / 2 + 0.4; y < plot.depth; y += step) {
    for (let x = size.width / 2 + 0.4; x < plot.width; x += step) {
      const at = new Vec2(x, y);
      if (fits(at)) return house.addFurniture({ kind, level: 0, at, facing: new Vec2(0, -1), ...size });
    }
  }
  return null;
}
