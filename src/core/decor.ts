/**
 * Things that make rooms look lived in without being furniture the player places: a lamp
 * from each ceiling, rugs under sofas, beds and tables, pictures on free stretches of wall,
 * cabinets over kitchen counters, and railings on stairs and round stairwells. They follow
 * from the rooms and furniture, so they move and change with them, and cost nothing.
 */

import { Vec2, interiorPoint, pointInPolygon, projectOntoSegment } from "./geometry";
import type { Furniture } from "./furniture";
import { type House, type Wall, stairDirection, stairOutline } from "./model";
import { STAIR_LENGTH, STAIR_WIDTH } from "./rules";
import { type Room, analyzeRooms } from "./rooms";

export interface Rug {
  level: number;
  at: Vec2;
  /** Along the rug's width; its depth runs at right angles. */
  along: Vec2;
  width: number;
  depth: number;
  /** Which of the rug designs. */
  pattern: number;
}

export interface Picture {
  level: number;
  /** The middle of the picture, on the wall's face, in plan. */
  at: Vec2;
  /** Along the wall, and out of it into the room. */
  along: Vec2;
  out: Vec2;
  width: number;
  height: number;
  /** Height of its middle above the floor. */
  y: number;
  art: number;
}

export interface CeilingLamp {
  level: number;
  at: Vec2;
  /** How far it hangs below the ceiling. */
  drop: number;
  /** How far its pool of light on the floor reaches: not past the room's walls. */
  reach: number;
}

/** Wall cabinets over a kitchen counter. */
export interface WallCabinets {
  level: number;
  /** Middle of their back, on the wall's face. */
  at: Vec2;
  along: Vec2;
  out: Vec2;
  width: number;
}

/** A railing: along a stair flight's open side, or round the stairwell above it. */
export interface StairRail {
  stair: number;
  /** The storey the flight starts on. */
  level: number;
  /** A flight's side rail climbs from `a` to `b`; a stairwell rail is level, on the floor above. */
  kind: "flight" | "well";
  a: Vec2;
  b: Vec2;
}

export interface Decor {
  lamps: CeilingLamp[];
  rugs: Rug[];
  pictures: Picture[];
  cabinets: WallCabinets[];
  rails: StairRail[];
}

/** Rooms that get pictures on their walls. */
const PICTURE_ROOMS = new Set(["Living", "Bedroom", "Hall", "Office"]);
/** Furniture tall enough that no picture hangs above it. */
const TALL = 1.3;

export function decorate(house: House): Decor {
  const out: Decor = { lamps: [], rugs: [], pictures: [], cabinets: [], rails: [] };
  for (const level of house.levelList()) {
    const analysis = analyzeRooms(house, level);
    if (!analysis.ok) continue;
    const rooms = analysis.value.rooms.filter((r) => r.type && r.type !== "Void");
    const furniture = house.furniture.filter((f) => f.level === level);
    const walls = house.wallsOn(level).filter((w) => !w.boundary);
    for (const room of rooms) {
      if (room.area >= 2) {
        const at = interiorPoint(room.polygon);
        out.lamps.push({ level, at, drop: room.type === "Living" || room.type === "Kitchen" ? 0.6 : 0.3, reach: Math.min(1.8, edgeDistance(at, room.polygon) - 0.1) });
      }
      const inRoom = furniture.filter((f) => pointInPolygon(f.at, room.polygon));
      out.rugs.push(...rugsFor(room, inRoom));
      if (room.type && PICTURE_ROOMS.has(room.type)) out.pictures.push(...picturesFor(house, room, walls, inRoom));
    }
    for (const f of furniture) {
      if (f.kind !== "Counter") continue;
      const c = cabinetsOver(house, f, walls);
      if (c) out.cabinets.push(c);
    }
    out.rails.push(...stairRails(house, level));
  }
  return out;
}

// --- Rugs ----------------------------------------------------------------------------

function rugsFor(room: Room, inRoom: Furniture[]): Rug[] {
  const rugs: Rug[] = [];
  const pattern = (room.level * 7 + room.index * 3) % 4;
  const add = (at: Vec2, along: Vec2, width: number, depth: number) => {
    // Shrink it until it lies inside the room, clear of the walls.
    for (let k = 0; k < 4; k++, width *= 0.85, depth *= 0.85) {
      const across = new Vec2(-along.y, along.x);
      const corners = [-1, 1].flatMap((s) => [-1, 1].map((t) => at.add(along.scale((s * width) / 2)).add(across.scale((t * depth) / 2))));
      if (corners.every((c) => pointInPolygon(c, room.polygon) && inside(c, room.polygon, 0.15))) {
        rugs.push({ level: room.level, at, along, width, depth, pattern });
        return;
      }
    }
  };
  const acrossOf = (f: Furniture) => new Vec2(f.facing.y, -f.facing.x);
  const table = inRoom.find((f) => f.kind === "CoffeeTable");
  const sofa = inRoom.find((f) => f.kind === "Sofa");
  if (table) add(table.at, acrossOf(table), table.width + 1.4, table.depth + 1.3);
  else if (sofa) add(sofa.at.add(sofa.facing.scale(sofa.depth / 2 + 0.8)), acrossOf(sofa), sofa.width + 0.3, 1.6);
  for (const bed of inRoom.filter((f) => f.kind === "Bed" || f.kind === "SingleBed")) {
    // Under the foot two thirds of the bed, wider than it.
    add(bed.at.add(bed.facing.scale(bed.depth * 0.2)), acrossOf(bed), bed.width + 1.1, bed.depth * 0.75);
  }
  const dining = inRoom.find((f) => f.kind === "DiningTable");
  if (dining && room.type !== "Kitchen") add(dining.at, acrossOf(dining), dining.width + 1.3, dining.depth + 1.3);
  return rugs;
}

/** Whether `p` is at least `margin` from every edge of `poly`. */
function inside(p: Vec2, poly: readonly Vec2[], margin: number): boolean {
  return edgeDistance(p, poly) >= margin;
}

/** How far `p` is from the nearest edge of `poly`. */
function edgeDistance(p: Vec2, poly: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
    const t = projectOntoSegment(p, a, b);
    best = Math.min(best, a.add(b.sub(a).normalize().scale(t)).distance(p));
  }
  return best;
}

// --- Pictures ------------------------------------------------------------------------

/** The stretches of a wall's side facing into `room`, clear of openings and tall furniture. */
function freeStretches(house: House, wall: Wall, room: Room, inRoom: Furniture[]): { side: 1 | -1; u0: number; u1: number }[] {
  const len = wall.length();
  const d = wall.direction();
  const left = new Vec2(-d.y, d.x);
  const out: { side: 1 | -1; u0: number; u1: number }[] = [];
  const openings = house.openingsIn(wall.id);
  for (const side of [1, -1] as const) {
    const face = wall.thickness / 2;
    const free = (u: number) => {
      const p = wall.start.add(d.scale(u)).add(left.scale(side * (face + 0.2)));
      if (!pointInPolygon(p, room.polygon)) return false;
      if (openings.some((o) => u > o.left() - 0.3 && u < o.right() + 0.3)) return false;
      // Not above tall furniture, or behind anything standing against this stretch of wall.
      return !inRoom.some((f) => f.height > TALL && Math.abs(f.at.sub(p).dot(d)) < f.width / 2 + 0.2 && Math.abs(f.at.sub(p).dot(left)) < f.depth / 2 + 0.6);
    };
    let start: number | null = null;
    const step = 0.1;
    for (let u = 0.3; u <= len - 0.3 + 1e-9; u += step) {
      if (free(u)) start ??= u;
      else if (start !== null) {
        out.push({ side, u0: start, u1: u - step });
        start = null;
      }
    }
    if (start !== null) out.push({ side, u0: start, u1: len - 0.3 });
  }
  return out.filter((s) => s.u1 - s.u0 >= 0.9);
}

function picturesFor(house: House, room: Room, walls: Wall[], inRoom: Furniture[]): Picture[] {
  const stretches = walls.flatMap((wall) => freeStretches(house, wall, room, inRoom).map((s) => ({ wall, ...s })));
  stretches.sort((a, b) => b.u1 - b.u0 - (a.u1 - a.u0));
  const count = room.type === "Living" && room.area > 20 ? 2 : 1;
  const pictures: Picture[] = [];
  const used = new Set<number>();
  for (const s of stretches) {
    if (pictures.length >= count) break;
    if (used.has(s.wall.id)) continue;
    used.add(s.wall.id);
    const d = s.wall.direction();
    const out = new Vec2(-d.y, d.x).scale(s.side);
    const width = Math.min(1.1, (s.u1 - s.u0) * 0.6);
    const u = (s.u0 + s.u1) / 2;
    pictures.push({
      level: room.level,
      at: s.wall.start.add(d.scale(u)).add(out.scale(s.wall.thickness / 2)),
      along: d,
      out,
      width,
      height: width * (room.type === "Hall" ? 1.2 : 0.72),
      y: 1.55,
      art: (room.level * 5 + room.index * 2 + pictures.length) % 5,
    });
  }
  return pictures;
}

// --- Kitchen ---------------------------------------------------------------------------

/** Cabinets over a counter standing against a wall, unless a window is in the way. */
function cabinetsOver(house: House, f: Furniture, walls: Wall[]): WallCabinets | null {
  const back = f.at.sub(f.facing.scale(f.depth / 2));
  for (const wall of walls) {
    const u = projectOntoSegment(back, wall.start, wall.end);
    const d = wall.direction();
    const onWall = wall.start.add(d.scale(u));
    if (onWall.distance(back) > wall.thickness / 2 + 0.15) continue;
    if (Math.abs(f.facing.dot(d)) > 0.1) continue;
    const [u0, u1] = [u - f.width / 2, u + f.width / 2];
    const blocked = house.openingsIn(wall.id).some((o) => o.right() > u0 && o.left() < u1 && o.top() > 1.4);
    if (blocked) return null;
    return { level: f.level, at: onWall.add(f.facing.scale(wall.thickness / 2)), along: d, out: f.facing, width: f.width };
  }
  return null;
}

// --- Stairs ----------------------------------------------------------------------------

/** Whether a solid wall runs along the segment a–b (within a hand's breadth of it). */
function alongWall(walls: Wall[], a: Vec2, b: Vec2): boolean {
  const mid = a.add(b).scale(0.5);
  return walls.some((w) => {
    if (w.boundary) return false;
    const near = (p: Vec2) => {
      const t = projectOntoSegment(p, w.start, w.end);
      return w.start.add(w.direction().scale(t)).distance(p) < w.thickness / 2 + 0.15;
    };
    return near(mid) && (near(a) || near(b));
  });
}

function stairRails(house: House, level: number): StairRail[] {
  const rails: StairRail[] = [];
  const here = house.wallsOn(level);
  const above = house.wallsOn(level + 1);
  for (const s of house.stairs) {
    if (s.level !== level || level + 1 >= house.levels) continue;
    const d = stairDirection(s);
    const n = new Vec2(-d.y, d.x);
    const [hl, hw] = [STAIR_LENGTH / 2, STAIR_WIDTH / 2];
    // The flight's sides, from the bottom step to the top.
    for (const side of [1, -1]) {
      const a = s.at.sub(d.scale(hl)).add(n.scale(side * hw));
      const b = s.at.add(d.scale(hl)).add(n.scale(side * hw));
      if (!alongWall(here, a, b)) rails.push({ stair: s.id, level, kind: "flight", a, b });
    }
    // Round the hole upstairs: every edge but the one you step off at.
    const hole = stairOutline(s);
    for (let i = 0; i < hole.length; i++) {
      const [a, b] = [hole[i], hole[(i + 1) % hole.length]];
      const mid = a.add(b).scale(0.5);
      if (mid.sub(s.at).dot(d) > hl - 0.01) continue; // the top end: the way off the stairs
      if (!alongWall(above, a, b)) rails.push({ stair: s.id, level, kind: "well", a, b });
    }
  }
  return rails;
}
