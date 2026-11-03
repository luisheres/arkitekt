/**
 * Plan analysis: treats the walls as a planar graph to find the rooms they enclose, the
 * outline of the whole house, and which walls are exterior.
 *
 * Walls may meet at their ends or end somewhere along another wall (a T-junction); a
 * wall is split into segments wherever another wall touches it. Loose wall ends are
 * pruned away before looking for rooms and reported separately.
 */

import { SNAP_EPS, Vec2, isSimplePolygon, signedArea } from "./geometry";
import type { FootprintError, House, Wall, WallId } from "./model";
import { type Result, err, ok } from "./result";

/** Thickness of interior (partition) walls, in meters. */
export const INTERIOR_WALL_THICKNESS = 0.12;

/** Index of the area outside the house in {@link WallSegment.left} / `right`. */
export const OUTSIDE = -1;

/** A piece of a wall between two points where other walls touch it. */
export interface WallSegment {
  wall: WallId;
  /** Distances along the wall from its start. */
  from: number;
  to: number;
  /**
   * What lies to the left and right of the wall (looking from its start to its end):
   * a room index or {@link OUTSIDE}. Null for loose segments that enclose nothing.
   */
  left: number | null;
  right: number | null;
}

export interface Layout {
  /** Enclosed areas, counter-clockwise. */
  rooms: Vec2[][];
  /** Outer boundary of the house, counter-clockwise. */
  outline: Vec2[];
  segments: WallSegment[];
  /** Walls with outside on one side. */
  exterior: Set<WallId>;
  /** Wall ends connected to nothing. */
  looseEnds: { wall: WallId; at: Vec2 }[];
}

interface Piece {
  wall: Wall;
  from: number;
  to: number;
  a: number; // vertex at `from`
  b: number; // vertex at `to`
}

/** Distance from `p` to segment a-b, and how far along the segment its foot lies. */
function footOnSegment(p: Vec2, a: Vec2, b: Vec2): { t: number; distance: number } {
  const ab = b.sub(a);
  const len = ab.length();
  const t = len < 1e-12 ? 0 : p.sub(a).dot(ab) / len;
  const clamped = Math.min(Math.max(t, 0), len);
  return { t, distance: a.add(ab.scale(len < 1e-12 ? 0 : clamped / len)).distance(p) };
}

/** Where two segments cross, if they properly cross (not just touch at an end). */
function crossing(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): Vec2 | null {
  const r = p2.sub(p1);
  const s = q2.sub(q1);
  const denom = r.cross(s);
  if (Math.abs(denom) < 1e-12) return null;
  const t = q1.sub(p1).cross(s) / denom;
  const u = q1.sub(p1).cross(r) / denom;
  const e = 1e-6;
  return t > e && t < 1 - e && u > e && u < 1 - e ? p1.add(r.scale(t)) : null;
}

/** Analyze the walls of a house. Fails when they do not enclose a single connected area. */
export function analyzeLayout(house: House): Result<Layout, FootprintError> {
  const walls = house.walls.filter((w) => w.length() > SNAP_EPS);
  if (walls.length === 0) return err({ kind: "NoWalls" });

  // Shared vertices: wall ends within SNAP_EPS of each other are one point.
  const vertices: Vec2[] = [];
  const vertexOf = (p: Vec2): number => {
    const i = vertices.findIndex((v) => v.distance(p) < SNAP_EPS);
    if (i >= 0) return i;
    vertices.push(p);
    return vertices.length - 1;
  };
  for (const w of walls) {
    vertexOf(w.start);
    vertexOf(w.end);
  }

  // Split every wall at the vertices lying along it.
  const pieces: Piece[] = [];
  for (const wall of walls) {
    const len = wall.length();
    const stops = [
      { t: 0, v: vertexOf(wall.start) },
      { t: len, v: vertexOf(wall.end) },
    ];
    vertices.forEach((p, v) => {
      if (stops.some((s) => s.v === v)) return;
      const { t, distance } = footOnSegment(p, wall.start, wall.end);
      if (distance < SNAP_EPS && t > SNAP_EPS && t < len - SNAP_EPS) stops.push({ t, v });
    });
    stops.sort((x, y) => x.t - y.t);
    for (let i = 0; i + 1 < stops.length; i++) {
      pieces.push({ wall, from: stops[i].t, to: stops[i + 1].t, a: stops[i].v, b: stops[i + 1].v });
    }
  }

  // Walls may not cross or run on top of each other.
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const [p, q] = [pieces[i], pieces[j]];
      if ((p.a === q.a && p.b === q.b) || (p.a === q.b && p.b === q.a)) {
        const mid = vertices[p.a].add(vertices[p.b]).scale(0.5);
        return err({ kind: "Overlap", x: mid.x, y: mid.y });
      }
      if (p.a === q.a || p.a === q.b || p.b === q.a || p.b === q.b) continue;
      const x = crossing(vertices[p.a], vertices[p.b], vertices[q.a], vertices[q.b]);
      if (x) return err({ kind: "Crossing", x: x.x, y: x.y });
    }
  }

  // Graph of pieces; prune loose ends repeatedly so only enclosing walls remain.
  const live = new Set(pieces.map((_, i) => i));
  const edgesAt = new Map<number, Set<number>>();
  pieces.forEach((p, i) => {
    for (const v of [p.a, p.b]) {
      if (!edgesAt.has(v)) edgesAt.set(v, new Set());
      edgesAt.get(v)!.add(i);
    }
  });
  const looseEnds: { wall: WallId; at: Vec2 }[] = [];
  const queue = [...edgesAt.keys()].filter((v) => edgesAt.get(v)!.size === 1);
  for (const v of queue) {
    const [i] = edgesAt.get(v)!;
    looseEnds.push({ wall: pieces[i].wall.id, at: vertices[v] });
  }
  while (queue.length) {
    const v = queue.pop()!;
    const edges = edgesAt.get(v)!;
    if (edges.size !== 1) continue;
    const [i] = edges;
    live.delete(i);
    const p = pieces[i];
    for (const u of [p.a, p.b]) {
      edgesAt.get(u)!.delete(i);
      if (u !== v && edgesAt.get(u)!.size === 1) queue.push(u);
    }
  }
  if (live.size === 0) {
    const at = looseEnds[0]?.at ?? walls[0].start;
    return err({ kind: "Open", x: at.x, y: at.y });
  }

  // Neighbours of each vertex, sorted counter-clockwise by angle.
  const neighbours = new Map<number, number[]>();
  for (const i of live) {
    const p = pieces[i];
    for (const [u, v] of [
      [p.a, p.b],
      [p.b, p.a],
    ]) {
      if (!neighbours.has(u)) neighbours.set(u, []);
      neighbours.get(u)!.push(v);
    }
  }
  const angle = (u: number, v: number) => Math.atan2(vertices[v].y - vertices[u].y, vertices[v].x - vertices[u].x);
  for (const [u, list] of neighbours) list.sort((x, y) => angle(u, x) - angle(u, y));

  // One connected building.
  const start = neighbours.keys().next().value!;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) for (const n of neighbours.get(stack.pop()!)!) if (!seen.has(n)) (seen.add(n), stack.push(n));
  if (seen.size !== neighbours.size) return err({ kind: "MultipleLoops" });

  // Trace faces, keeping each face on the left: from u->v, continue to the neighbour of
  // v just clockwise of u.
  const faceOf = new Map<string, number>();
  const faces: { poly: Vec2[]; area: number }[] = [];
  for (const [u0, list] of neighbours) {
    for (const v0 of list) {
      if (faceOf.has(`${u0}>${v0}`)) continue;
      const index = faces.length;
      const poly: Vec2[] = [];
      let [u, v] = [u0, v0];
      while (!faceOf.has(`${u}>${v}`)) {
        faceOf.set(`${u}>${v}`, index);
        poly.push(vertices[u]);
        const around = neighbours.get(v)!;
        const w = around[(around.indexOf(u) - 1 + around.length) % around.length];
        [u, v] = [v, w];
      }
      faces.push({ poly, area: signedArea(poly) });
    }
  }

  // Bounded faces are rooms; the single clockwise face is the outside.
  const outer = faces.reduce((best, f, i) => (f.area < faces[best].area ? i : best), 0);
  const roomIndex = new Map<number, number>();
  const rooms: Vec2[][] = [];
  faces.forEach((f, i) => {
    if (i !== outer && f.area > 1e-3) {
      roomIndex.set(i, rooms.length);
      rooms.push(f.poly);
    }
  });
  const outline = [...faces[outer].poly].reverse();
  if (!isSimplePolygon(outline)) return err({ kind: "SelfIntersecting" });
  if (rooms.length === 0 || Math.abs(signedArea(outline)) < 1e-3) return err({ kind: "Degenerate" });

  const side = (u: number, v: number): number => {
    const f = faceOf.get(`${u}>${v}`)!;
    return f === outer ? OUTSIDE : (roomIndex.get(f) ?? OUTSIDE);
  };
  const segments: WallSegment[] = pieces.map((p, i) =>
    live.has(i)
      ? { wall: p.wall.id, from: p.from, to: p.to, left: side(p.a, p.b), right: side(p.b, p.a) }
      : { wall: p.wall.id, from: p.from, to: p.to, left: null, right: null },
  );
  const exterior = new Set(segments.filter((s) => s.left === OUTSIDE || s.right === OUTSIDE).map((s) => s.wall));
  return ok({ rooms, outline, segments, exterior, looseEnds });
}

/** How thick a wall is drawn and built: exterior walls keep their own thickness. */
export function wallThickness(layout: Layout | null, wall: Wall): number {
  return !layout || layout.exterior.has(wall.id) ? wall.thickness : INTERIOR_WALL_THICKNESS;
}
