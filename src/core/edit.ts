/**
 * Editing operations used by the house editor: snapping, moving corners and walls,
 * placing openings. They work on the plain model, so they are unit-tested here and
 * the UI only translates pointer input into calls.
 */

import { SNAP_EPS, Vec2, pointInPolygon, projectOntoSegment } from "./geometry";
import { House, type OpeningId, type OpeningKind, type Wall, type WallId, type WallMaterial } from "./model";
import { DOOR_WIDTH, MIN_LINTEL, MIN_OPENING_SIZE, MIN_WALL_LENGTH, OPENING_END_MARGIN } from "./validate";

/** Grid spacing for snapping, in meters. */
export const GRID_STEP = 0.5;
/** Spacing for sliding openings along a wall, in meters. */
export const OPENING_STEP = 0.05;

export const DEFAULT_WALL_HEIGHT = 2.7;
export const DEFAULT_WALL_MATERIAL: WallMaterial = "Plaster";

/** Default sizes for new openings. */
export const DEFAULT_OPENING: Record<OpeningKind, { width: number; height: number; sill: number }> = {
  Window: { width: 1.2, height: 1.3, sill: 0.9 },
  Door: { width: 1.0, height: 2.1, sill: 0 },
};

export const roundTo = (x: number, step: number): number => Math.round(x / step) * step;

export function snapToGrid(p: Vec2, step: number): Vec2 {
  return new Vec2(roundTo(p.x, step), roundTo(p.y, step));
}

/** The distinct wall endpoints of the house. */
export function corners(house: House): Vec2[] {
  const out: Vec2[] = [];
  for (const w of house.walls) {
    for (const p of [w.start, w.end]) {
      if (!out.some((q) => q.distance(p) < SNAP_EPS)) out.push(p);
    }
  }
  return out;
}

export interface Snap {
  point: Vec2;
  /** True when the point snapped to one of the anchors rather than the grid. */
  anchored: boolean;
}

/**
 * Snap `p` to the nearest anchor within `radius`, or else to the grid. A `step` of 0
 * leaves the point where it is when no anchor is close.
 */
export function snapPoint(p: Vec2, anchors: readonly Vec2[], radius: number, step: number): Snap {
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
  return { point: step > 0 ? snapToGrid(p, step) : p, anchored: false };
}

/** Move every wall endpoint at `from` to `to`, so walls meeting at that corner stay joined. */
export function moveCorner(house: House, from: Vec2, to: Vec2): void {
  for (const w of house.walls) {
    if (w.start.distance(from) < SNAP_EPS) w.start = to;
    if (w.end.distance(from) < SNAP_EPS) w.end = to;
  }
}

/**
 * Move a wall sideways so it ends up `distance` from where it was (positive along its
 * left normal), dragging the corners it shares with its neighbours along.
 */
export function moveWall(house: House, id: WallId, original: { start: Vec2; end: Vec2 }, distance: number): void {
  const wall = house.wall(id);
  if (!wall) return;
  const shift = leftNormal(wall).scale(distance);
  const [start, end] = [wall.start, wall.end];
  moveCorner(house, start, original.start.add(shift));
  moveCorner(house, end, original.end.add(shift));
}

/** Unit normal pointing to the left of the wall's direction (plan coordinates). */
export function leftNormal(wall: Wall): Vec2 {
  const d = wall.direction();
  return new Vec2(-d.y, d.x);
}

/** Unit normal pointing into the house, or the left normal when the walls are not closed. */
export function interiorNormal(house: House, wall: Wall): Vec2 {
  const n = leftNormal(wall);
  const fp = house.footprint();
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
export function nearestWall(house: House, p: Vec2, maxDistance: number): WallHit | null {
  let best: WallHit | null = null;
  for (const wall of house.walls) {
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
  if (!wall) return null;
  const d = DEFAULT_OPENING[kind];
  const minWidth = kind === "Door" ? DOOR_WIDTH[0] : MIN_OPENING_SIZE;
  const width = Math.min(d.width, roundTo(wall.length() - 2 * OPENING_END_MARGIN, 0.1));
  const height = Math.min(d.height, roundTo(wall.height - MIN_LINTEL - d.sill, 0.1));
  if (width < minWidth || height < MIN_OPENING_SIZE) return null;
  const at = roundTo(clampOffset(wall, width, offset), OPENING_STEP);
  return kind === "Door" ? house.addDoor(wallId, at, width, height) : house.addWindow(wallId, at, width, height, d.sill);
}

/** Add walls along `points`, joining the last point back to the first when `closed`. */
export function addWallChain(
  house: House,
  points: readonly Vec2[],
  closed: boolean,
  height: number,
  material: WallMaterial,
): WallId[] {
  if (closed) return house.addWallLoop(points, height, material);
  const ids: WallId[] = [];
  for (let i = 0; i + 1 < points.length; i++) ids.push(house.addWall(points[i], points[i + 1], height, material));
  return ids;
}

/**
 * Add a rectangular room spanning corners `a` and `b`, front wall first (the wall facing
 * the street, at low y). Returns null when a side would be shorter than a wall may be.
 */
export function addRectangle(house: House, a: Vec2, b: Vec2, height: number, material: WallMaterial): WallId[] | null {
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  if (x1 - x0 < MIN_WALL_LENGTH || y1 - y0 < MIN_WALL_LENGTH) return null;
  return house.addWallLoop([new Vec2(x0, y0), new Vec2(x1, y0), new Vec2(x1, y1), new Vec2(x0, y1)], height, material);
}
