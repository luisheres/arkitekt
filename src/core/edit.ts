/**
 * Editing operations used by the house editor: snapping, drawing and moving walls,
 * placing openings, naming rooms. They work on the plain model, so they are unit-tested
 * here and the UI only translates pointer input into calls.
 */

import { SNAP_EPS, Vec2, pointInPolygon, projectOntoSegment } from "./geometry";
import { isGardenPlant } from "./furniture";
import { analyzeLayout } from "./layout";
import { BALCONY_LIMITS, type Balcony, type BalconyId, type FloorFinish, House, type LabelId, type PaintColor, type StairId, type OpeningId, type OpeningKind, type RoomType, type Wall, type WallId, type WallMaterial } from "./model";
import { type Room, analyzeRooms, roomAt } from "./rooms";
import { DOOR_WIDTH, GARAGE_DOOR_WIDTH, MIN_LINTEL, MIN_OPENING_SIZE, MIN_WALL_LENGTH, OPENING_END_MARGIN } from "./rules";

/** Grid spacing for snapping, in meters. */
export const GRID_STEP = 0.5;
/** Spacing for sliding openings along a wall, in meters. */
export const OPENING_STEP = 0.05;

export const DEFAULT_WALL_MATERIAL: WallMaterial = "Plaster";

/** Default sizes for new openings. */
export const DEFAULT_OPENING: Record<OpeningKind, { width: number; height: number; sill: number }> = {
  Window: { width: 1.2, height: 1.3, sill: 0.9 },
  Door: { width: 0.9, height: 2.1, sill: 0 },
  GarageDoor: { width: 2.5, height: 2.1, sill: 0 },
};

export const roundTo = (x: number, step: number): number => Math.round(x / step) * step;

export function snapToGrid(p: Vec2, step: number): Vec2 {
  return new Vec2(roundTo(p.x, step), roundTo(p.y, step));
}

/** The distinct wall endpoints of one storey. */
export function corners(house: House, level = 0): Vec2[] {
  const out: Vec2[] = [];
  for (const w of house.wallsOn(level)) {
    for (const p of [w.start, w.end]) {
      if (!out.some((q) => q.distance(p) < SNAP_EPS)) out.push(p);
    }
  }
  return out;
}

export interface Snap {
  point: Vec2;
  /** True when the point snapped to an anchor or onto a wall rather than to the grid. */
  anchored: boolean;
}

/**
 * Snap `p` to the nearest anchor within `radius`; failing that, onto the nearest of
 * `lines` (walls) within `radius`, keeping the grid position along it; failing that, to
 * the grid. A `step` of 0 means no grid.
 */
export function snapPoint(p: Vec2, anchors: readonly Vec2[], radius: number, step: number, lines: readonly (readonly [Vec2, Vec2])[] = []): Snap {
  let best: Vec2 | null = null;
  let bestDist = radius;
  for (const a of anchors) {
    const d = a.distance(p);
    if (d <= bestDist) {
      best = a;
      bestDist = d;
    }
  }
  if (best) return { point: best, anchored: true };

  const grid = step > 0 ? snapToGrid(p, step) : p;
  let onLine: Vec2 | null = null;
  bestDist = radius;
  for (const [a, b] of lines) {
    const d = b.sub(a).normalize();
    const nearest = a.add(d.scale(projectOntoSegment(p, a, b)));
    const dist = nearest.distance(p);
    if (dist <= bestDist) {
      bestDist = dist;
      onLine = a.add(d.scale(projectOntoSegment(grid, a, b)));
    }
  }
  if (onLine) return { point: onLine, anchored: true };
  return { point: grid, anchored: false };
}

/** Wall ends of other walls that touch `wall` somewhere between its ends (T-junctions). */
function attachedPoints(house: House, wall: Wall): Vec2[] {
  const out: Vec2[] = [];
  const len = wall.length();
  for (const other of house.wallsOn(wall.level)) {
    if (other === wall) continue;
    for (const p of [other.start, other.end]) {
      const t = projectOntoSegment(p, wall.start, wall.end);
      const foot = wall.start.add(wall.direction().scale(t));
      if (foot.distance(p) < SNAP_EPS && t > SNAP_EPS && t < len - SNAP_EPS && !out.some((q) => q.distance(p) < SNAP_EPS)) out.push(p);
    }
  }
  return out;
}

function moveEndsAt(house: House, from: Vec2, to: Vec2, level: number): void {
  for (const w of house.wallsOn(level)) {
    if (w.start.distance(from) < SNAP_EPS) w.start = to;
    if (w.end.distance(from) < SNAP_EPS) w.end = to;
  }
}

/**
 * Move several corners at once. Walls meeting at a corner stay joined, and walls ending
 * on a moved wall (T-junctions) stay attached: they keep their distance from the wall
 * end that did not move, or shift along when the whole wall moves.
 */
export function moveCorners(house: House, moves: readonly { from: Vec2; to: Vec2 }[], level = 0, depth = 0): void {
  const moved = (p: Vec2) => moves.find((m) => m.from.distance(p) < SNAP_EPS);
  const touched = house.wallsOn(level).filter((w) => moved(w.start) || moved(w.end));
  const keep = touched.map((w) => {
    const [ms, me] = [moved(w.start), moved(w.end)];
    const len = w.length();
    return attachedPoints(house, w).map((p) => {
      const s = p.distance(w.start);
      // Where the point goes, given the wall's new ends.
      return (start: Vec2, end: Vec2): [Vec2, Vec2] => {
        const d = end.sub(start).normalize();
        const newLen = start.distance(end);
        let along: number;
        if (ms && me) along = ms.to.sub(ms.from).distance(me.to.sub(me.from)) < 1e-9 ? s : (s / len) * newLen;
        else if (ms) along = newLen - (len - s); // the end stayed: keep the distance from it
        else along = s;
        return [p, start.add(d.scale(Math.min(Math.max(along, SNAP_EPS * 2), newLen - SNAP_EPS * 2)))];
      };
    });
  });
  for (const m of moves) moveEndsAt(house, m.from, m.to, level);
  // Walls attached to the moved walls follow, and so on down the chain of attachments.
  const follow = touched.flatMap((w, i) => keep[i].map((place) => place(w.start, w.end))).map(([from, to]) => ({ from, to }));
  const real = follow.filter((m) => m.from.distance(m.to) > 1e-9);
  if (real.length === 0) return;
  if (depth < 6) moveCorners(house, real, level, depth + 1);
  else for (const m of real) moveEndsAt(house, m.from, m.to, level);
}

/** Move every wall end at `from` (on `level`) to `to`. */
export function moveCorner(house: House, from: Vec2, to: Vec2, level = 0): void {
  moveCorners(house, [{ from, to }], level);
}

/**
 * Move a wall sideways so it ends up `distance` from where it was (positive along its
 * left normal), dragging the corners it shares with its neighbours along.
 */
export function moveWall(house: House, id: WallId, original: { start: Vec2; end: Vec2 }, distance: number): void {
  const wall = house.wall(id);
  if (!wall) return;
  const shift = leftNormal(wall).scale(distance);
  moveCorners(
    house,
    [
      { from: wall.start, to: original.start.add(shift) },
      { from: wall.end, to: original.end.add(shift) },
    ],
    wall.level,
  );
}

/** Unit normal pointing to the left of the wall's direction (plan coordinates). */
export function leftNormal(wall: Wall): Vec2 {
  const d = wall.direction();
  return new Vec2(-d.y, d.x);
}

/** Unit normal pointing into the house, or the left normal when that is unclear. */
export function interiorNormal(house: House, wall: Wall): Vec2 {
  const n = leftNormal(wall);
  const fp = house.footprint(wall.level);
  if (!fp.ok) return n;
  const mid = wall.start.add(wall.end).scale(0.5);
  return pointInPolygon(mid.add(n.scale(wall.thickness)), fp.value) ? n : n.neg();
}

export interface WallHit {
  wall: Wall;
  /** Distance along the wall from its start to the closest point. */
  offset: number;
  /** Distance from the query point to the wall's centerline. */
  distance: number;
}

/** The wall whose centerline is closest to `p`, if within `maxDistance`. */
export function nearestWall(house: House, p: Vec2, maxDistance: number, level = 0): WallHit | null {
  let best: WallHit | null = null;
  for (const wall of house.wallsOn(level)) {
    const offset = projectOntoSegment(p, wall.start, wall.end);
    const distance = wall.start.add(wall.direction().scale(offset)).distance(p);
    if (distance <= maxDistance && (!best || distance < best.distance)) best = { wall, offset, distance };
  }
  return best;
}

/** Keep an opening of `width` centered near `offset` while staying clear of the wall ends. */
export function clampOffset(wall: Wall, width: number, offset: number): number {
  const lo = OPENING_END_MARGIN + width * 0.5;
  const hi = wall.length() - OPENING_END_MARGIN - width * 0.5;
  return lo > hi ? wall.length() * 0.5 : Math.min(Math.max(offset, lo), hi);
}

/**
 * Add a window or door of the default size centered near `offset`, shrunk to fit short
 * or low walls. Returns null when the wall is too small for any opening of that kind.
 */
export function placeOpening(house: House, wallId: WallId, kind: OpeningKind, offset: number): OpeningId | null {
  const wall = house.wall(wallId);
  if (!wall || wall.boundary) return null; // a boundary has no wall to put it in
  const d = DEFAULT_OPENING[kind];
  const minWidth = kind === "Door" ? DOOR_WIDTH[0] : kind === "GarageDoor" ? GARAGE_DOOR_WIDTH[0] : MIN_OPENING_SIZE;
  const width = Math.min(d.width, roundTo(wall.length() - 2 * OPENING_END_MARGIN, 0.1));
  const height = Math.min(d.height, roundTo(wall.height - MIN_LINTEL - d.sill, 0.1));
  if (width < minWidth || height < MIN_OPENING_SIZE) return null;
  const at = roundTo(clampOffset(wall, width, offset), OPENING_STEP);
  if (kind === "Door") return house.addDoor(wallId, at, width, height);
  if (kind === "GarageDoor") return house.addGarageDoor(wallId, at, width, height);
  return house.addWindow(wallId, at, width, height, d.sill);
}

/**
 * Add a wall from `a` to `b`, leaving out the stretches already covered by existing walls
 * on the same line, so walls can be traced along existing ones without doubling up.
 */
/** Where new walls go: on which storey, and whether they are room boundaries. */
export interface WallOptions {
  level?: number;
  boundary?: boolean;
}

export function addWallClipped(house: House, a: Vec2, b: Vec2, height: number, material: WallMaterial, { level = 0, boundary = false }: WallOptions = {}): WallId[] {
  const len = a.distance(b);
  if (len < SNAP_EPS) return [];
  const d = b.sub(a).scale(1 / len);
  const n = new Vec2(-d.y, d.x);
  const covered: [number, number][] = [];
  for (const w of house.wallsOn(level)) {
    if (Math.abs(w.direction().cross(d)) > 1e-6) continue;
    if (Math.abs(w.start.sub(a).dot(n)) > SNAP_EPS) continue;
    const [t0, t1] = [w.start.sub(a).dot(d), w.end.sub(a).dot(d)].sort((x, y) => x - y);
    if (t1 > SNAP_EPS && t0 < len - SNAP_EPS) covered.push([Math.max(t0, 0), Math.min(t1, len)]);
  }
  covered.sort((x, y) => x[0] - y[0]);
  const ids: WallId[] = [];
  let cursor = 0;
  const add = (from: number, to: number) => {
    if (to - from > SNAP_EPS) ids.push(house.addWall(a.add(d.scale(from)), a.add(d.scale(to)), height, material, boundary, level));
  };
  for (const [t0, t1] of covered) {
    add(cursor, t0);
    cursor = Math.max(cursor, t1);
  }
  add(cursor, len);
  return ids;
}

/** Add walls along `points`, joining the last point back to the first when `closed`. */
export function addWallChain(
  house: House,
  points: readonly Vec2[],
  closed: boolean,
  height: number,
  material: WallMaterial,
  options: WallOptions = {},
): WallId[] {
  const ids: WallId[] = [];
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) ids.push(...addWallClipped(house, points[i], points[(i + 1) % points.length], height, material, options));
  return ids;
}

/**
 * Add a rectangular room spanning corners `a` and `b`, front wall first (the wall facing
 * the street, at low y). Sides that run along existing walls are not doubled. Returns
 * null when a side would be shorter than a wall may be.
 */
export function addRectangle(house: House, a: Vec2, b: Vec2, height: number, material: WallMaterial, level = 0): WallId[] | null {
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  if (x1 - x0 < MIN_WALL_LENGTH || y1 - y0 < MIN_WALL_LENGTH) return null;
  return addWallChain(house, [new Vec2(x0, y0), new Vec2(x1, y0), new Vec2(x1, y1), new Vec2(x0, y1)], true, height, material, { level });
}

/**
 * Say what the room containing `at` is used for (null clears it). Reuses the room's
 * existing label, so the label stays where the player put it.
 */
export function setRoomType(house: House, at: Vec2, type: RoomType | null, level = 0): LabelId | null {
  const analysis = analyzeRooms(house, level);
  if (!analysis.ok) return null;
  const room = roomAt(analysis.value.rooms, at);
  if (!room) return null;
  const [first, ...rest] = room.labels;
  rest.forEach((l) => house.removeLabel(l.id));
  if (type === null) {
    if (first) house.removeLabel(first.id);
    return null;
  }
  if (first) {
    first.type = type;
    return first.id;
  }
  return house.addLabel(type, room.anchor, level);
}

/**
 * Start a new storey on top of the house, with exterior walls along the outline of the
 * storey below (same height and material), ready to be divided into rooms.
 */
/**
 * Dig a basement under the house, with concrete outer walls along the ground floor's.
 * Returns its level (-1), or null when the ground floor's walls do not enclose it yet.
 */
export function addBasement(house: House): number | null {
  if (house.basement) return -1;
  const layout = analyzeLayout(house, 0);
  if (!layout.ok) return null;
  house.basement = true;
  for (const w of house.wallsOn(0)) if (layout.value.exterior.has(w.id)) house.addWall(w.start, w.end, BASEMENT_HEIGHT, "Concrete", false, -1);
  return -1;
}

export function addStoreyAbove(house: House): number {
  const below = house.topLevel();
  const level = house.addLevel();
  const layout = analyzeLayout(house, below);
  if (layout.ok) {
    for (const w of house.wallsOn(below)) {
      if (layout.value.exterior.has(w.id)) house.addWall(w.start, w.end, w.height, w.material, false, level);
    }
  }
  return level;
}

/**
 * Put a flight of stairs on `level` centered at `at`, climbing in `facing` (quarter
 * turns). Returns null when there is no storey above for it to lead to.
 */
export function placeStair(house: House, level: number, at: Vec2, facing = 0): StairId | null {
  if (level + 1 >= house.levels) return null;
  return house.addStair(level, at, facing);
}

/** Choose the floor finish of the (labelled) room containing `at`. Returns false for unlabelled rooms. */
/** Paint the inside walls of the room at `at` (white takes the paint off). */
export function setRoomPaint(house: House, at: Vec2, paint: PaintColor, level = 0): boolean {
  const analysis = analyzeRooms(house, level);
  if (!analysis.ok) return false;
  const label = roomAt(analysis.value.rooms, at)?.labels[0];
  if (!label) return false;
  if (paint === "White") delete label.paint;
  else label.paint = paint;
  return true;
}

export function setRoomFloor(house: House, at: Vec2, floor: FloorFinish, level = 0): boolean {
  const analysis = analyzeRooms(house, level);
  if (!analysis.ok) return false;
  const label = roomAt(analysis.value.rooms, at)?.labels[0];
  if (!label) return false;
  label.floor = floor;
  return true;
}

// --- Balconies -----------------------------------------------------------------------

/** The direction a wall's outside faces (away from the house). */
export function outwardNormal(house: House, wall: Wall): Vec2 {
  return interiorNormal(house, wall).neg();
}

/** A balcony's floor outline: along its wall, sticking out from the outer face. */
export function balconyOutline(house: House, b: Balcony): Vec2[] | null {
  const wall = house.wall(b.wall);
  if (!wall) return null;
  const d = wall.direction();
  const out = outwardNormal(house, wall);
  const mid = wall.start.add(d.scale(b.offset)).add(out.scale(wall.thickness / 2));
  const half = d.scale(b.width / 2);
  const far = out.scale(b.depth);
  return [mid.sub(half), mid.add(half), mid.add(half).add(far), mid.sub(half).add(far)];
}

/** Keep a balcony's middle on its wall, with all of it along the wall. */
export function clampBalcony(wall: Wall, b: { offset: number; width: number }): number {
  const half = Math.min(b.width, wall.length()) / 2;
  return Math.min(Math.max(b.offset, half), wall.length() - half);
}

/** Put a balcony in the middle of an outer wall, as wide as fits (at most 3 m). */
export function placeBalcony(house: House, wallId: WallId): BalconyId | null {
  const wall = house.wall(wallId);
  if (!wall || wall.boundary) return null;
  const width = Math.min(3, Math.max(BALCONY_LIMITS.width[0], wall.length() - 0.6));
  return house.addBalcony(wallId, wall.length() / 2, width, 1.4);
}

// --- The whole house ---------------------------------------------------------------------

/** A basement's walls are a little lower than the storeys above. */
export const BASEMENT_HEIGHT = 2.4;

/**
 * A coordinate without floating-point dust (and without -0, which JSON loses). Points that
 * land within a tenth of a millimetre of the 5 cm grid go onto it, so turning back and
 * forth does not drift.
 */
const clean = (x: number): number => {
  const grid = Math.round(x * 20) / 20;
  return (Math.abs(x - grid) < 1e-4 ? grid : Number(x.toFixed(6))) + 0;
};

/** Move the whole house (walls, rooms, stairs and furniture; not the garden's plants). */
export function moveHouse(house: House, delta: Vec2): void {
  const move = (p: Vec2) => new Vec2(clean(p.x + delta.x), clean(p.y + delta.y));
  for (const w of house.walls) [w.start, w.end] = [move(w.start), move(w.end)];
  for (const l of house.labels) l.at = move(l.at);
  for (const s of house.stairs) s.at = move(s.at);
  for (const f of house.furniture) if (!isGardenPlant(f.kind)) f.at = move(f.at);
}

/** The point the house turns about: the middle of all its walls, on the 10 cm grid. */
export function houseCentre(house: House): Vec2 | null {
  const points = house.walls.flatMap((w) => [w.start, w.end]);
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return new Vec2(roundTo((Math.min(...xs) + Math.max(...xs)) / 2, 0.1), roundTo((Math.min(...ys) + Math.max(...ys)) / 2, 0.1));
}

/**
 * Turn the whole house about its middle by `degrees` (positive turns +x towards +y,
 * anticlockwise in plan coordinates). Quarter turns keep walls on the grid; stairs and
 * furniture turn with it.
 */
export function rotateHouse(house: House, degrees: number): void {
  const c = houseCentre(house);
  if (!c) return;
  const quarter = degrees / 90;
  const a = (degrees * Math.PI) / 180;
  // Exact for quarter turns, so walls stay where they were on the grid.
  const [cos, sin] = Number.isInteger(quarter) ? [[1, 0, -1, 0][((quarter % 4) + 4) % 4], [0, 1, 0, -1][((quarter % 4) + 4) % 4]] : [Math.cos(a), Math.sin(a)];
  const turn = (v: Vec2) => new Vec2(v.x * cos - v.y * sin, v.x * sin + v.y * cos);
  const about = (p: Vec2) => {
    const q = c.add(turn(p.sub(c)));
    return new Vec2(clean(q.x), clean(q.y));
  };
  for (const w of house.walls) [w.start, w.end] = [about(w.start), about(w.end)];
  for (const l of house.labels) l.at = about(l.at);
  for (const s of house.stairs) {
    s.at = about(s.at);
    const facing = (((s.facing + quarter) % 4) + 4) % 4;
    s.facing = Math.abs(facing - Math.round(facing)) < 1e-6 ? Math.round(facing) % 4 : Number(facing.toFixed(9));
  }
  for (const f of house.furniture) {
    if (isGardenPlant(f.kind)) continue;
    f.at = about(f.at);
    const v = turn(f.facing);
    f.facing = new Vec2(clean(v.x), clean(v.y));
  }
}

// --- Double height ------------------------------------------------------------------------

/** The opening in the floor above the room at `at` on `level`, if it has one. */
export function openingAbove(house: House, at: Vec2, level: number): Room | null {
  const below = analyzeRooms(house, level);
  const room = below.ok ? roomAt(below.value.rooms, at) : undefined;
  const above = analyzeRooms(house, level + 1);
  if (!room || !above.ok) return null;
  return above.value.rooms.find((r) => r.type === "Void" && pointInPolygon(room.anchor, r.polygon)) ?? null;
}

/** Whether the segment a-b lies along a wall of a storey (so needs no new boundary). */
function alongWall(house: House, level: number, a: Vec2, b: Vec2): boolean {
  const on = (p: Vec2, w: Wall) => {
    const d = w.direction();
    const t = p.sub(w.start).dot(d);
    return t >= -SNAP_EPS && t <= w.length() + SNAP_EPS && w.start.add(d.scale(t)).distance(p) < SNAP_EPS;
  };
  return house.wallsOn(level).some((w) => on(a, w) && on(b, w));
}

/**
 * Make the room at `at` on `level` double height: open the floor above it. Upstairs, open
 * room boundaries go along its sides where there are no walls, and the space they enclose
 * becomes an opening to below. False when there is no storey above or no room here.
 */
export function makeDoubleHeight(house: House, at: Vec2, level: number): boolean {
  if (level + 1 >= house.levels) return false;
  const below = analyzeRooms(house, level);
  const room = below.ok ? roomAt(below.value.rooms, at) : undefined;
  if (!room) return false;
  const up = level + 1;
  room.polygon.forEach((a, i) => {
    const b = room.polygon[(i + 1) % room.polygon.length];
    if (!alongWall(house, up, a, b)) house.addBoundary(a, b, up);
  });
  const above = analyzeRooms(house, up);
  const target = above.ok ? roomAt(above.value.rooms, room.anchor) : undefined;
  if (!target) return false;
  setRoomType(house, target.anchor, "Void", up);
  // Nothing stays standing in mid-air.
  house.furniture = house.furniture.filter((f) => f.level !== up || !pointInPolygon(f.at, target.polygon));
  return true;
}

/** Close the floor above the room at `at` again (the boundaries upstairs stay). */
export function clearDoubleHeight(house: House, at: Vec2, level: number): boolean {
  const opening = openingAbove(house, at, level);
  if (!opening) return false;
  setRoomType(house, opening.anchor, null, level + 1);
  return true;
}
