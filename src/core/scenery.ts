/**
 * The surroundings of a plot: the lie of the land, the roads that reach it, water (an
 * irregular lake with bays and islands, a winding river, a coastline), woods that grow in
 * patches with edges, field parcels, landmarks, and the neighbours' houses along their
 * roads. Every plot has its own layout (see LAYOUTS below), so two plots of the same kind
 * still feel different. The plot itself keeps its own ground (see plot.ts), so building
 * is unaffected.
 *
 * Everything is generated from fixed seeds, so a plot always looks the same, in the plan
 * and in 3D.
 */

import { Vec2, pointInPolygon } from "./geometry";
import type { WallMaterial } from "./model";
import { type Plot, type RoadKind, type Setting, type Side, groundHeight, sideEdge } from "./plot";

export type TreeKind = "round" | "birch" | "pine" | "bush";

export interface Tree {
  at: Vec2;
  kind: TreeKind;
  /** Scale: 1 is an average tree of its kind. */
  size: number;
  /** A round tree's look, when it is not left to chance (an orchard's apples). */
  look?: "plain" | "blossom" | "apple";
}

/** What the ground is, where it is not plain grass. */
export type Surface = "grass" | "sand" | "field1" | "field2" | "field3" | "snow";

/** A road: a centreline, its kind and width; a cul-de-sac ends in a turning circle. */
export interface Road {
  kind: RoadKind;
  points: Vec2[];
  width: number;
  turning?: { at: Vec2; radius: number };
}

export const ROAD_WIDTH: Record<RoadKind, number> = { main: 8, street: 6, lane: 4.5, gravel: 3 };

/** Water: a lake (an irregular outline, maybe with islands), a river (a winding band) or the sea (beyond a coastline). */
export interface Water {
  kind: "lake" | "river" | "sea";
  /** Height of the water surface. */
  level: number;
  /** The lake's or sea's outline; empty for a river. */
  outline: Vec2[];
  islands: Vec2[][];
  /** A river's centreline and its width at each point. */
  river: { points: Vec2[]; widths: number[] } | null;
  reeds: boolean;
  beach: boolean;
  cliff: boolean;
}

export interface Neighbor {
  /** Centre and size of the house's footprint. */
  at: Vec2;
  width: number;
  depth: number;
  facade: WallMaterial;
  /** Index into a list of cheerful roof colours. */
  roof: number;
  roofStyle: "gable" | "hip" | "flat";
  storeys: 1 | 2;
  /** The direction its front faces (radians, plan: 0 = +x, PI/2 = +y). */
  facing: number;
}

export type LandmarkKind =
  | "church"
  | "windmill"
  | "barn"
  | "silo"
  | "boathouse"
  | "lighthouse"
  | "skiLift"
  | "millRuin"
  | "playground"
  | "footbridge"
  | "sauna"
  | "cabin"
  | "haybales"
  | "fountain";

export interface Landmark {
  kind: LandmarkKind;
  at: Vec2;
  /** The direction it faces (radians, as for neighbours). */
  facing: number;
  size: number;
  /** The far end, for a footbridge or a ski lift. */
  to?: Vec2;
}

export interface Rock {
  at: Vec2;
  size: number;
}

export interface Jetty {
  from: Vec2;
  to: Vec2;
  width: number;
}

export interface Scenery {
  setting: Setting;
  water: Water | null;
  jetty: Jetty | null;
  roads: Road[];
  trees: Tree[];
  rocks: Rock[];
  neighbors: Neighbor[];
  landmarks: Landmark[];
  /** Dry-stone walls (polylines). */
  walls: Vec2[][];
  /** The sides of the garden with a hedge (not where the road comes in). */
  hedgeSides: Side[];
  /** Ground height at a plan point. */
  height(x: number, y: number): number;
  /** What covers the ground at a plan point. */
  surface(x: number, y: number): Surface;
  /** Distance to the water's edge: negative under water (capped at ±30 m; 30 with no water). */
  waterDistance(x: number, y: number): number;
}

// --- Small helpers --------------------------------------------------------------------

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Smooth, gentle bumps. */
const bumps = (x: number, y: number) => Math.sin(x * 0.11) * Math.cos(y * 0.09) + 0.6 * Math.sin(x * 0.047 + y * 0.061) + 0.3 * Math.cos(x * 0.21 - y * 0.17);

/** Smooth value noise in 0..1, features about `scale` metres across. */
function noise(seed: number, scale: number): (x: number, y: number) => number {
  const at = (i: number, j: number) => {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const one = (x: number, y: number) => {
    const [i, j] = [Math.floor(x), Math.floor(y)];
    const [fx, fy] = [x - i, y - j];
    const [sx, sy] = [fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)];
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return top + (bottom - top) * sy;
  };
  return (x, y) => 0.65 * one(x / scale, y / scale) + 0.35 * one((x / scale) * 2.3 + 17, (y / scale) * 2.3 + 5);
}

/** Smooth a polyline through its control points (Catmull-Rom), about `step` metres apart. */
function spline(control: readonly Vec2[], step = 4): Vec2[] {
  if (control.length < 3) return [...control];
  const out: Vec2[] = [];
  for (let i = 0; i < control.length - 1; i++) {
    const [p0, p1, p2, p3] = [control[Math.max(i - 1, 0)], control[i], control[i + 1], control[Math.min(i + 2, control.length - 1)]];
    const n = Math.max(1, Math.ceil(p1.distance(p2) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const [t2, t3] = [t * t, t * t * t];
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(new Vec2(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y)));
    }
  }
  out.push(control[control.length - 1]);
  return out;
}

interface Segment {
  a: Vec2;
  b: Vec2;
  /** Half-widths at each end (0 for plain outlines). */
  ha: number;
  hb: number;
  /** Which polyline it belongs to. */
  line: number;
}

/** Line segments in a grid, to find the nearest one to a point quickly (within `range`). */
class SegmentIndex {
  private readonly cells = new Map<number, Segment[]>();
  constructor(
    lines: readonly { points: readonly Vec2[]; halfWidths?: readonly number[]; closed?: boolean }[],
    private readonly range = 30,
    private readonly cell = 10,
  ) {
    lines.forEach((l, line) => {
      const n = l.closed ? l.points.length : l.points.length - 1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % l.points.length;
        const seg = { a: l.points[i], b: l.points[j], ha: l.halfWidths?.[i] ?? 0, hb: l.halfWidths?.[j] ?? 0, line };
        const [x0, x1] = [Math.min(seg.a.x, seg.b.x) - range, Math.max(seg.a.x, seg.b.x) + range];
        const [y0, y1] = [Math.min(seg.a.y, seg.b.y) - range, Math.max(seg.a.y, seg.b.y) + range];
        for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++)
          for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) {
            const key = cx * 100003 + cy;
            const list = this.cells.get(key);
            if (list) list.push(seg);
            else this.cells.set(key, [seg]);
          }
      }
    });
  }

  /** The nearest segment: distance to it, minus its half-width there; null beyond the range. */
  nearest(p: Vec2): { distance: number; edge: number; at: Vec2; line: number } | null {
    const list = this.cells.get(Math.floor(p.x / this.cell) * 100003 + Math.floor(p.y / this.cell));
    if (!list) return null;
    let best: { distance: number; edge: number; at: Vec2; line: number } | null = null;
    for (const s of list) {
      const ab = s.b.sub(s.a);
      const t = Math.min(Math.max(p.sub(s.a).dot(ab) / Math.max(ab.dot(ab), 1e-12), 0), 1);
      const q = s.a.add(ab.scale(t));
      const distance = q.distance(p);
      const edge = distance - (s.ha + (s.hb - s.ha) * t);
      if (distance <= this.range && (!best || edge < best.edge)) best = { distance, edge, at: q, line: s.line };
    }
    return best;
  }
}

/** An irregular blob: an ellipse whose radius wanders, for lakes and islands. */
function blob(center: Vec2, rx: number, ry: number, angle: number, rnd: () => number, roughness: number, n = 72): Vec2[] {
  const waves = [2, 3, 4, 5, 7].map((k) => ({ k, a: (roughness * (0.4 + rnd())) / k, phase: rnd() * Math.PI * 2 }));
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const r = 1 + waves.reduce((sum, w) => sum + w.a * Math.sin(w.k * t + w.phase), 0);
    const [x, y] = [Math.cos(t) * rx * r, Math.sin(t) * ry * r];
    return new Vec2(center.x + x * c - y * s, center.y + x * s + y * c);
  });
}

// --- Each plot's layout ----------------------------------------------------------------

/** Where something goes, in shares of the plot's width and depth (outside it: below 0 or above 1). */
type Spot = [fx: number, fy: number];

interface LakeSpec {
  kind: "lake";
  center: Spot;
  rx: number;
  ry: number;
  angle?: number;
  roughness: number;
  islands?: number;
  reeds?: boolean;
  beach?: boolean;
}
interface RiverSpec {
  kind: "river";
  /** Control points of the centreline, as spots. */
  path: Spot[];
  width: [min: number, max: number];
}
interface SeaSpec {
  kind: "sea";
  /** The coastline's control points, as spots, with the sea beyond (towards `towards`). */
  coast: Spot[];
  towards: Side;
  beach?: boolean;
  cliff?: boolean;
}

interface Layout {
  water?: LakeSpec | RiverSpec | SeaSpec;
  /** How likely a house is on each spot along the roads, and their spacing (m). */
  houses: number;
  spacing?: number;
  landmarks?: { kind: LandmarkKind; at: Spot; size?: number }[];
  /** Woods: how much of the land, and how dense. */
  woods: number;
  /** Rows of trees along the lanes. */
  avenues?: boolean;
  orchard?: boolean;
  fields?: boolean;
  stoneWalls?: boolean;
  jetty?: boolean;
  bridge?: boolean;
}

const LAYOUTS: Record<string, Layout> = {
  suburban: { houses: 0.9, spacing: 17, woods: 0.25, landmarks: [{ kind: "playground", at: [1.6, -0.6] }] },
  corner: { houses: 0.85, spacing: 17, woods: 0.2 },
  narrow: { houses: 1, spacing: 14, woods: 0.15, landmarks: [{ kind: "church", at: [3, -2.2] }] },
  culdesac: { houses: 1, woods: 0.3, landmarks: [{ kind: "playground", at: [-0.7, -0.8] }] },
  townplot: { houses: 1, spacing: 11, woods: 0.05, landmarks: [{ kind: "church", at: [0.5, -1.6] }, { kind: "fountain", at: [1.7, -0.9] }] },
  oldtown: { houses: 1, spacing: 11, woods: 0.05, stoneWalls: true, landmarks: [{ kind: "church", at: [-1.4, 0.4] }] },
  square: { houses: 1, spacing: 12, woods: 0.05, landmarks: [{ kind: "fountain", at: [0.5, -0.9] }, { kind: "church", at: [2.0, -1.6] }] },
  lakeside: {
    water: { kind: "lake", center: [0.5, 2.0], rx: 36, ry: 18, roughness: 0.25, reeds: true, beach: true },
    houses: 0.5,
    spacing: 22,
    woods: 0.4,
    jetty: true,
    landmarks: [{ kind: "boathouse", at: [0.9, 1.5] }],
  },
  bay: {
    water: { kind: "lake", center: [1.8, 1.7], rx: 32, ry: 22, angle: 0.6, roughness: 0.45, islands: 1, beach: true },
    houses: 0.3,
    spacing: 30,
    woods: 0.5,
    jetty: true,
    landmarks: [{ kind: "sauna", at: [1.4, 1.2] }],
  },
  reeds: {
    water: { kind: "lake", center: [0.4, 2.1], rx: 34, ry: 17, roughness: 0.35, islands: 2, reeds: true },
    houses: 0.3,
    spacing: 35,
    woods: 0.55,
    landmarks: [{ kind: "sauna", at: [0.95, 1.35] }],
  },
  lakeview: {
    water: { kind: "lake", center: [0.5, -1.4], rx: 55, ry: 26, roughness: 0.3, islands: 1, beach: true },
    houses: 0.2,
    spacing: 40,
    woods: 0.45,
    jetty: true,
    landmarks: [{ kind: "boathouse", at: [0.2, -0.45] }],
  },
  riverside: {
    water: { kind: "river", path: [[-8, 2.0], [-2, 1.7], [0.2, 1.5], [0.8, 1.6], [2, 1.35], [8, 2.1]], width: [9, 13] },
    houses: 0.7,
    spacing: 18,
    woods: 0.3,
    bridge: true,
  },
  mill: {
    water: { kind: "river", path: [[6, 2.6], [2.2, 1.8], [0.5, 1.45], [-0.2, 1.25], [-0.42, 0.75], [-0.45, 0], [-0.6, -1.5], [-1.2, -6]], width: [7, 10] },
    houses: 0.3,
    spacing: 40,
    woods: 0.4,
    bridge: true,
    landmarks: [{ kind: "millRuin", at: [-0.85, 1.1] }],
  },
  rivermeadow: {
    water: { kind: "river", path: [[-7, 1.8], [-1.5, 1.45], [0.3, 1.55], [0.9, 1.85], [1.6, 1.5], [7, 2.0]], width: [11, 15] },
    houses: 0,
    woods: 0.25,
    bridge: true,
    landmarks: [{ kind: "haybales", at: [1.8, 0.4] }],
  },
  clearing: { houses: 0, woods: 0.95 },
  pinewood: { houses: 0, woods: 0.9, landmarks: [{ kind: "cabin", at: [-1.4, 1.4] }] },
  birchgrove: {
    water: { kind: "lake", center: [1.75, 0.5], rx: 11, ry: 8, roughness: 0.3, reeds: true },
    houses: 0,
    woods: 0.85,
    landmarks: [{ kind: "sauna", at: [1.45, 0.85] }],
  },
  farm: {
    houses: 0.15,
    spacing: 60,
    woods: 0.1,
    fields: true,
    avenues: true,
    landmarks: [
      { kind: "barn", at: [1.85, 0.6] },
      { kind: "silo", at: [1.75, 1.15] },
      { kind: "windmill", at: [-2.4, 2.6] },
      { kind: "haybales", at: [-0.6, 1.6] },
    ],
  },
  meadow: { houses: 0.1, spacing: 70, woods: 0.15, fields: true, stoneWalls: true, landmarks: [{ kind: "windmill", at: [-1.6, 2.0] }, { kind: "haybales", at: [0.4, 1.7] }] },
  orchard: { houses: 0.1, spacing: 70, woods: 0.1, fields: true, orchard: true, avenues: true, landmarks: [{ kind: "barn", at: [-1.3, 0.5] }] },
  seaside: {
    water: { kind: "sea", coast: [[-8, 1.6], [-2, 1.5], [0.5, 1.4], [3, 1.55], [8, 1.35]], towards: "back", beach: true },
    houses: 0.45,
    spacing: 22,
    woods: 0.3,
    landmarks: [{ kind: "lighthouse", at: [2.8, 2.3] }],
  },
  dunes: {
    water: { kind: "sea", coast: [[-8, 1.8], [-2, 1.7], [0.5, 1.6], [2.5, 1.75], [8, 1.5]], towards: "back", beach: true },
    houses: 0,
    woods: 0.2,
    landmarks: [{ kind: "lighthouse", at: [-2.2, 2.3] }],
  },
  clifftop: {
    water: { kind: "sea", coast: [[-8, 1.3], [-1.5, 1.25], [0.5, 1.2], [2, 1.3], [8, 1.15]], towards: "back", cliff: true },
    houses: 0,
    woods: 0.15,
    landmarks: [{ kind: "lighthouse", at: [1.6, 1.1] }],
  },
  harbour: {
    water: { kind: "sea", coast: [[-8, 1.35], [-1, 1.32], [1, 1.3], [3, 1.4], [8, 1.3]], towards: "back" },
    houses: 0.9,
    spacing: 13,
    woods: 0.1,
    jetty: true,
    landmarks: [{ kind: "boathouse", at: [1.4, 1.25] }, { kind: "boathouse", at: [-0.5, 1.25] }, { kind: "lighthouse", at: [2.6, 2.4] }],
  },
  hillside: { houses: 0.5, spacing: 22, woods: 0.55, landmarks: [{ kind: "church", at: [1.6, -2.6] }] },
  slope: { houses: 0.7, spacing: 20, woods: 0.45 },
  valley: { houses: 0.3, spacing: 40, woods: 0.5, avenues: true, landmarks: [{ kind: "church", at: [-1.5, -2.0] }] },
  mountain: { houses: 0.25, spacing: 40, woods: 0.6, landmarks: [{ kind: "skiLift", at: [1.6, 1.2] }] },
  alpine: { houses: 0.1, spacing: 60, woods: 0.5, landmarks: [{ kind: "skiLift", at: [-0.8, 1.6] }, { kind: "cabin", at: [1.6, 1.4] }] },
  skislope: { houses: 0.4, spacing: 30, woods: 0.55, landmarks: [{ kind: "skiLift", at: [0.5, 1.6] }] },
};

const FACADES: WallMaterial[] = ["Plaster", "Wood", "FaluRed", "Brick", "Wood", "Plaster"];

const memo = new WeakMap<Plot, Scenery>();

/** The scenery around a plot (computed once per plot). */
export function sceneryFor(plot: Plot): Scenery {
  let s = memo.get(plot);
  if (!s) memo.set(plot, (s = makeScenery(plot)));
  return s;
}

// --- Roads ----------------------------------------------------------------------------

/** A long, gently curving road through `through` along `dir`, far beyond the plot each way. */
function longRoad(through: Vec2, dir: Vec2, rnd: () => number, reach = 280): Vec2[] {
  const side = new Vec2(-dir.y, dir.x);
  const [a1, a2, p1, p2] = [10 + rnd() * 18, 6 + rnd() * 10, rnd() * 6, rnd() * 6];
  const points: Vec2[] = [];
  for (let s = -reach; s <= reach; s += 8) {
    // Straight past the plot, bending gently further away.
    const far = smoothstep(50, 160, Math.abs(s));
    const bend = far * (a1 * Math.sin(s / 140 + p1) + a2 * Math.sin(s / 61 + p2));
    points.push(through.add(dir.scale(s)).add(side.scale(bend)));
  }
  return points;
}

/** A track winding out from `start` roughly along `dir`, `length` metres. */
function windingTrack(start: Vec2, dir: Vec2, length: number, rnd: () => number): Vec2[] {
  const points = [start];
  let [pos, heading] = [start, Math.atan2(dir.y, dir.x)];
  const base = heading;
  for (let s = 0; s < length; s += 5) {
    // Wander, but never too far from the general direction.
    heading += (rnd() - 0.5) * 0.35;
    heading = base + Math.max(-0.9, Math.min(0.9, heading - base));
    // Straight for the first few metres, so it meets the plot squarely.
    const h = s < 10 ? base : heading;
    pos = pos.add(new Vec2(Math.cos(h), Math.sin(h)).scale(5));
    points.push(pos);
  }
  return points;
}

function roadsFor(plot: Plot, rnd: () => number): Road[] {
  const { side, road: kind, layout } = plot.access;
  const e = sideEdge(plot, side);
  const along = e.b.sub(e.a).normalize();
  const width = ROAD_WIDTH[kind];
  const off = width / 2 + (kind === "main" || kind === "street" ? 2.5 : 1.5);
  const roads: Road[] = [];
  switch (layout) {
    case "along":
      roads.push({ kind, width, points: longRoad(e.mid.add(e.out.scale(off)), along, rnd) });
      break;
    case "corner": {
      // Two streets meeting at a junction by the plot's corner.
      roads.push({ kind, width, points: longRoad(e.mid.add(e.out.scale(off)), along, rnd) });
      const junction = e.a.add(along.scale(-off)).add(e.out.scale(off));
      const away = e.out.scale(-1);
      // Starting a little past the main road's far side, so the two join without a seam.
      const start = junction.sub(away.scale(width / 2 - 0.3));
      roads.push({ kind: kind === "main" ? "street" : kind, width: kind === "main" ? ROAD_WIDTH.street : width, points: Array.from({ length: 36 }, (_, i) => start.add(away.scale(i * 8))) });
      break;
    }
    case "culdesac": {
      // A street ending in a turning circle in front of the plot.
      const radius = 9;
      const at = e.mid.add(e.out.scale(radius + 1.5));
      const points = [at, ...windingTrack(at.add(e.out.scale(radius)), e.out, 260, rnd)];
      roads.push({ kind, width, points, turning: { at, radius } });
      break;
    }
    case "track": {
      // A gravel track winding in to the plot, from a lane further away.
      const track = windingTrack(e.mid.add(e.out.scale(0.5)), e.out, 130, rnd);
      roads.push({ kind: "gravel", width: ROAD_WIDTH.gravel, points: track });
      const end = track[track.length - 1];
      const dir = end.sub(track[track.length - 4]).normalize();
      roads.push({ kind: "lane", width: ROAD_WIDTH.lane, points: longRoad(end.add(dir.scale(ROAD_WIDTH.lane / 2)), new Vec2(-dir.y, dir.x), rnd, 300) });
      break;
    }
    case "drive": {
      // A private drive from a lane running further off.
      const lane = e.mid.add(e.out.scale(38));
      roads.push({ kind: "lane", width: ROAD_WIDTH.lane, points: longRoad(lane, along, rnd) });
      const swing = (rnd() - 0.5) * 12;
      const drive = spline([e.mid.add(e.out.scale(0.5)), e.mid.add(e.out.scale(10)), e.mid.add(e.out.scale(24)).add(along.scale(swing)), lane.add(along.scale(swing * 1.4))], 3);
      roads.push({ kind: "gravel", width: ROAD_WIDTH.gravel, points: drive });
      break;
    }
  }
  return roads;
}

/** The sides that get a hedge: all but where the road comes in (two sides at a corner). */
function hedgeSidesFor(plot: Plot): Side[] {
  const sides: Side[] = ["front", "left", "back", "right"];
  const { side, layout } = plot.access;
  const skip = new Set<Side>([side]);
  // At a corner, the side meeting the access side at its first corner faces the other street.
  if (layout === "corner") skip.add(sides[(sides.indexOf(side) + 3) % 4]);
  return sides.filter((s) => !skip.has(s));
}

// --- Water ----------------------------------------------------------------------------

function waterFor(plot: Plot, spec: Layout["water"], rnd: () => number): Water | null {
  if (!spec) return null;
  const { width: w, depth: d } = plot;
  const spot = ([fx, fy]: Spot) => new Vec2(fx * w, fy * d);
  // The surface stays below the plot's ground on the side towards it.
  const lowest = Math.min(...[0, 0.25, 0.5, 0.75, 1].flatMap((f) => [groundHeight(plot, f * w, 0), groundHeight(plot, f * w, d), groundHeight(plot, 0, f * d), groundHeight(plot, w, f * d)]));
  const level = Math.min(-0.35, lowest - 0.7);
  if (spec.kind === "lake") {
    const center = spot(spec.center);
    let outline = blob(center, spec.rx, spec.ry, spec.angle ?? 0, rnd, spec.roughness);
    // Keep a shore of at least 6 m between the lake and the plot.
    const near = (q: Vec2) => q.x > -6 && q.x < w + 6 && q.y > -6 && q.y < d + 6;
    for (let k = 0; k < 30 && outline.some(near); k++) outline = outline.map((q) => center.add(q.sub(center).scale(0.95)));
    const islands = Array.from({ length: spec.islands ?? 0 }, (_, i) => {
      const a = rnd() * Math.PI * 2;
      const at = center.add(new Vec2(Math.cos(a) * spec.rx * 0.45, Math.sin(a) * spec.ry * 0.4));
      return blob(at, 3 + rnd() * 3 + i, 2.5 + rnd() * 2, rnd() * 3, rnd, 0.3, 24);
    });
    return { kind: "lake", level, outline, islands, river: null, reeds: !!spec.reeds, beach: !!spec.beach, cliff: false };
  }
  if (spec.kind === "river") {
    const points = spline(spec.path.map(spot), 3);
    const wobble = noise(hash(`${plot.id}:river`), 40);
    const widths = points.map((p) => spec.width[0] + (spec.width[1] - spec.width[0]) * wobble(p.x, p.y));
    return { kind: "river", level: level - 0.15, outline: [], islands: [], river: { points, widths }, reeds: false, beach: false, cliff: false };
  }
  // The sea: the coastline, then far out to sea beyond it.
  const coast = spline(spec.coast.map(spot), 3);
  const out = sideEdge(plot, spec.towards).out.scale(900);
  const outline = [...coast, coast[coast.length - 1].add(out), coast[0].add(out)];
  return { kind: "sea", level: spec.cliff ? Math.min(level, -3) : level, outline, islands: [], river: null, reeds: false, beach: !!spec.beach, cliff: !!spec.cliff };
}

/** The signed distance to a water body's edge (negative in the water), capped at ±30. */
function waterDistanceFn(water: Water | null): (p: Vec2) => number {
  if (!water) return () => 30;
  if (water.river) {
    const r = water.river;
    const index = new SegmentIndex([{ points: r.points, halfWidths: r.widths.map((w) => w / 2) }]);
    return (p) => Math.max(-30, Math.min(30, index.nearest(p)?.edge ?? 30));
  }
  const shore = new SegmentIndex([{ points: water.outline, closed: true }]);
  const isles = water.islands.map((i) => ({ outline: i, index: new SegmentIndex([{ points: i, closed: true }]) }));
  const signed = (outline: readonly Vec2[], index: SegmentIndex, p: Vec2) => {
    const inside = pointInPolygon(p, outline);
    const d = index.nearest(p)?.distance ?? 30;
    return Math.min(30, inside ? -d : d);
  };
  return (p) => {
    let d = signed(water.outline, shore, p);
    for (const i of isles) d = Math.max(d, -signed(i.outline, i.index, p));
    return d;
  };
}

// --- The scenery ----------------------------------------------------------------------

function makeScenery(plot: Plot): Scenery {
  const { width: w, depth: d, setting } = plot;
  const layout = LAYOUTS[plot.id] ?? { houses: 0.5, woods: 0.3 };
  const rnd = random(hash(plot.id));
  const spot = ([fx, fy]: Spot) => new Vec2(fx * w, fy * d);

  const water = waterFor(plot, layout.water, rnd);
  const waterAt = waterDistanceFn(water);
  const roads = roadsFor(plot, rnd);
  const roadIndex = new SegmentIndex(
    roads.map((r) => ({ points: r.points, halfWidths: r.points.map(() => r.width / 2) })),
    30,
  );
  /** Distance to the nearest road's edge (30 when none is near), counting turning circles. */
  const roadEdge = (p: Vec2) => {
    let e = roadIndex.nearest(p)?.edge ?? 30;
    for (const r of roads) if (r.turning) e = Math.min(e, p.distance(r.turning.at) - r.turning.radius);
    return e;
  };

  // How hilly: some plots of a kind are flatter or steeper than others.
  const relief = 0.7 + random(hash(`${plot.id}:relief`))() * 0.6;

  /** How far a point is from the plot (plus a small margin). */
  const fromPlot = (x: number, y: number) => {
    const margin = 3;
    const dx = Math.max(-margin - x, 0, x - w - margin);
    const dy = Math.max(-margin - y, 0, y - d - margin);
    return Math.hypot(dx, dy);
  };

  // The landscape away from the plot, before blending.
  const landscape = (x: number, y: number): number => {
    switch (setting) {
      case "suburban":
        return 0.9 * relief * bumps(x, y);
      case "town":
        return 0.3 * bumps(x, y);
      case "lakeside":
        return 0.8 * relief * bumps(x, y) + Math.max(0, Math.abs(x - w / 2) - 50) * 0.1;
      case "riverside":
        return 0.7 * relief * bumps(x, y);
      case "forest":
        return 1.4 * relief * bumps(x, y);
      case "farmland":
        return 0.6 * relief * bumps(x, y);
      case "seaside":
        return (water?.cliff ? 2.5 : 0.9) * bumps(x, y) + (water?.cliff ? 2.5 : 0) + Math.max(0, -y - 10) * 0.06;
      case "hillside":
        if (y > d) return (y - d) * 0.42 * relief + 1.6 * bumps(x, y) + Math.max(0, y - d - 25) * 0.25 * relief; // hills behind
        if (y < -10) return (y + 10) * 0.45 * relief + 0.8 * bumps(x, y); // the view: the land falls away
        return 0.8 * bumps(x, y);
      case "mountain": {
        // Steep, but levelling off further away.
        const cap = (v: number, top: number) => top * Math.tanh(v / top);
        const sides = cap(Math.max(0, Math.abs(x - w / 2) - w / 2 - 12) * 0.45, 22);
        if (y > d) return cap((y - d) * 0.75 * relief + Math.max(0, y - d - 20) * 0.5, 40) + 3 * bumps(x, y) + sides;
        if (y < -10) return cap((y + 10) * 0.5, 14) + 1.5 * bumps(x, y) + sides;
        return 1.5 * bumps(x, y) + sides;
      }
    }
  };

  /** The land before the roads are cut into it. */
  const land = (x: number, y: number): number => {
    let h = groundHeight(plot, x, y) + landscape(x, y) * smoothstep(0, 14, fromPlot(x, y));
    if (water) {
      // Carve the bed, with a shore sloping into the water (a cliff drops steeply).
      const e = waterAt(new Vec2(x, y));
      const shore = water.cliff ? 2 : water.kind === "river" ? 3 : water.kind === "sea" ? 8 : 6;
      if (e < shore) {
        const bed = water.level - 0.3 - Math.min(2.5, Math.max(0, -e) * (water.kind === "river" ? 0.5 : 0.2));
        h = e <= 0 ? bed : bed + (h - bed) * smoothstep(0, shore, e);
      }
    }
    return h;
  };

  const height = (x: number, y: number): number => {
    const h = land(x, y);
    // Never flatten the plot itself.
    if (x >= 0 && x <= w && y >= 0 && y <= d) return h;
    // Roads are level across: near a road the ground meets the road's own height.
    const near = roadIndex.nearest(new Vec2(x, y));
    // (Level a little wider than the road and its pavements, then easing back to the land.)
    let blend = near ? smoothstep(1.8, 6, near.edge) : 1;
    let roadH = near ? land(near.at.x, near.at.y) : h;
    for (const r of roads) {
      if (!r.turning) continue;
      const t = smoothstep(1.8, 6, new Vec2(x, y).distance(r.turning.at) - r.turning.radius);
      if (t < blend) [blend, roadH] = [t, land(r.turning.at.x, r.turning.at.y)];
    }
    return roadH + (h - roadH) * blend;
  };

  // Field parcels: long strips at an angle, with green margins between.
  const fieldAngle = random(hash(`${plot.id}:fields`))() * Math.PI;
  const [fc, fs] = [Math.cos(fieldAngle), Math.sin(fieldAngle)];
  const parcel = (x: number, y: number) => {
    const [u, v] = [x * fc + y * fs, -x * fs + y * fc];
    const [i, j] = [Math.floor((u + 1000) / 36), Math.floor((v + 1000) / 20)];
    const [fu, fv] = [((u + 1000) % 36) / 36, ((v + 1000) % 20) / 20];
    const margin = fu < 0.05 || fv < 0.1;
    return { margin, crop: (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0 };
  };
  const beachNoise = noise(hash(`${plot.id}:beach`), 25);

  const surface = (x: number, y: number): Surface => {
    const p = new Vec2(x, y);
    const e = waterAt(p);
    if (water && e > 0) {
      const sandy = water.kind === "river" ? false : water.kind === "sea" ? water.beach && e < 9 : water.beach && e < 4 && beachNoise(x, y) > 0.45;
      if (sandy) return "sand";
    }
    if (setting === "mountain" && height(x, y) > 18 + 2 * bumps(x * 2, y * 2)) return "snow";
    if (layout.fields && fromPlot(x, y) > 5 && roadEdge(p) > 2 && e > 3) {
      const f = parcel(x, y);
      if (!f.margin && f.crop % 5 < 3) return (["field1", "field2", "field3"] as const)[f.crop % 3];
    }
    return "grass";
  };

  // --- What takes up room ---
  const neighbors: Neighbor[] = [];
  const landmarks: Landmark[] = [];
  const onPlot = (p: Vec2, clearance: number) => p.x > -clearance && p.x < w + clearance && p.y > -clearance && p.y < d + clearance;
  const free = (p: Vec2, clearance: number) => {
    if (onPlot(p, clearance + 1)) return false;
    if (roadEdge(p) < 1.5 + clearance) return false;
    if (waterAt(p) < 1 + clearance) return false;
    if (neighbors.some((n) => p.distance(n.at) < Math.max(n.width, n.depth) / 2 + 2 + clearance)) return false;
    return !landmarks.some((l) => p.distance(l.at) < l.size + clearance);
  };

  // Neighbours' houses, along the roads (and round a turning circle), facing them.
  const houseRnd = random(hash(`${plot.id}:houses`));
  const addHouse = (at: Vec2, facing: number, big = 1) => {
    const width = (8 + houseRnd() * 4) * big;
    const depth = (7 + houseRnd() * 3) * big;
    const n: Neighbor = {
      at,
      width,
      depth,
      facade: FACADES[Math.floor(houseRnd() * FACADES.length)],
      roof: Math.floor(houseRnd() * 4),
      roofStyle: houseRnd() < 0.55 ? "gable" : houseRnd() < 0.7 ? "hip" : "flat",
      storeys: houseRnd() < 0.4 ? 2 : 1,
      facing,
    };
    const r = Math.max(width, depth) / 2;
    if (onPlot(at, r + 2) || roadEdge(at) < r + 1 || waterAt(at) < r + 4) return;
    if (neighbors.some((o) => o.at.distance(at) < r + Math.max(o.width, o.depth) / 2 + 2)) return;
    neighbors.push(n);
  };
  if (layout.houses > 0) {
    const spacing = layout.spacing ?? 18;
    const reach = 150;
    const centre = new Vec2(w / 2, d / 2);
    for (const road of roads) {
      if (road.kind === "gravel") continue;
      let travelled = 0;
      for (let i = 1; i < road.points.length; i++) {
        const [a, b] = [road.points[i - 1], road.points[i]];
        travelled += a.distance(b);
        if (travelled < spacing) continue;
        travelled = 0;
        if (b.distance(centre) > reach) continue;
        const dir = b.sub(a).normalize();
        const normal = new Vec2(-dir.y, dir.x);
        for (const s of [1, -1]) {
          if (houseRnd() > layout.houses) continue;
          const setback = road.width / 2 + 5 + houseRnd() * 4;
          const at = b.add(normal.scale(s * (setback + 4.5)));
          addHouse(at, Math.atan2(-normal.y * s, -normal.x * s), setting === "town" ? 1.15 : 1);
        }
      }
      if (road.turning) {
        const t = road.turning;
        const toPlot = new Vec2(w / 2, d / 2).sub(t.at);
        const base = Math.atan2(toPlot.y, toPlot.x);
        for (const k of [-2, -1, 1, 2]) {
          const a = base + k * 0.95;
          const out = new Vec2(Math.cos(a), Math.sin(a));
          addHouse(t.at.add(out.scale(t.radius + 10)), a + Math.PI);
        }
      }
    }
  }

  // The jetty: from the shore straight out into the water, on the side towards the plot.
  let jetty: Jetty | null = null;
  if (layout.jetty && water) {
    const centre = new Vec2(w / 2, d / 2);
    const target = water.outline.length ? water.outline.reduce((a, b) => (b.distance(centre) < a.distance(centre) ? b : a)) : centre;
    const dir = target.sub(centre).normalize();
    let p = centre;
    for (let s = 0; s < 200 && waterAt(p) > 0; s += 0.5) p = centre.add(dir.scale(s));
    const sideways = new Vec2(-dir.y, dir.x).scale(plot.id === "harbour" ? 0 : 6);
    const from = p.add(sideways).sub(dir.scale(2));
    jetty = { from, to: from.add(dir.scale(plot.id === "harbour" ? 24 : 14)), width: plot.id === "harbour" ? 2.6 : 1.6 };
  }

  // Landmarks, each nudged to the nearest free spot.
  const placeAt = (want: Vec2, size: number): Vec2 | null => {
    for (let r = 0; r < 60; r += 2)
      for (let k = 0; k < Math.max(1, r * 2); k++) {
        const a = (k / Math.max(1, r * 2)) * Math.PI * 2;
        const p = want.add(new Vec2(Math.cos(a), Math.sin(a)).scale(r));
        if (free(p, size)) return p;
      }
    return null;
  };
  for (const spec of layout.landmarks ?? []) {
    const size = spec.size ?? LANDMARK_SIZE[spec.kind];
    const want = spot(spec.at);
    // Boathouses and saunas stand on the shore.
    if ((spec.kind === "boathouse" || spec.kind === "sauna") && water) {
      let p = want;
      const toWater = water.outline.length ? water.outline.reduce((a, b) => (b.distance(want) < a.distance(want) ? b : a)) : want;
      const dir = toWater.sub(want).normalize();
      for (let s = 0; s < 120 && waterAt(p) > size * 0.3; s += 0.5) p = want.add(dir.scale(s));
      if (!onPlot(p, size + 1) && !neighbors.some((n) => n.at.distance(p) < size + 6) && roadEdge(p) > size) {
        landmarks.push({ kind: spec.kind, at: p, facing: Math.atan2(dir.y, dir.x), size });
        continue;
      }
    }
    if (spec.kind === "skiLift") {
      // Up the slope behind, as far as it goes.
      const at = placeAt(want, 4);
      if (at) landmarks.push({ kind: "skiLift", at, facing: Math.PI / 2, size: 4, to: at.add(new Vec2(rnd() * 20 - 10, 150)) });
      continue;
    }
    const at = placeAt(want, size);
    if (!at) continue;
    // Face the nearest road, or the plot.
    const near = roadIndex.nearest(at);
    const look = near ? near.at.sub(at) : new Vec2(w / 2, d / 2).sub(at);
    landmarks.push({ kind: spec.kind, at, facing: Math.atan2(look.y, look.x), size });
  }
  // A footbridge across the river, where it passes nearest the plot.
  if (layout.bridge && water?.river) {
    const centre = new Vec2(w / 2, d / 2);
    const pts = water.river.points;
    let i = 1;
    for (let k = 1; k < pts.length - 1; k++) if (pts[k].distance(centre) < pts[i].distance(centre)) i = k;
    // A little way along, so it is not right behind the house.
    i = Math.min(pts.length - 2, i + 8);
    const dir = pts[i + 1].sub(pts[i - 1]).normalize();
    const across = new Vec2(-dir.y, dir.x).scale(water.river.widths[i] / 2 + 2.5);
    landmarks.push({ kind: "footbridge", at: pts[i].sub(across), to: pts[i].add(across), facing: Math.atan2(across.y, across.x), size: 2 });
  }

  // Dry-stone walls along some field edges, or round the old town's gardens.
  const walls: Vec2[][] = [];
  if (layout.stoneWalls) {
    const e = sideEdge(plot, plot.access.side);
    const along = e.b.sub(e.a).normalize();
    const back = e.out.scale(-1);
    for (const [s0, depth] of [
      [-1.6, 1.8],
      [2.4, 2.2],
    ] as const) {
      const start = e.a.add(along.scale(s0 * 12)).add(back.scale(4));
      const wall = Array.from({ length: 12 }, (_, k) => start.add(back.scale(k * 4 * depth * 0.5)).add(along.scale(Math.sin(k * 0.7) * 0.8)));
      if (wall.every((p) => free(p, 0))) walls.push(wall);
    }
  }

  // --- Trees ---
  const trees: Tree[] = [];
  const treeRnd = random(hash(`${plot.id}:trees`));
  const wood = noise(hash(`${plot.id}:woods`), 34);
  const kindNoise = noise(hash(`${plot.id}:kinds`), 55);
  const threshold = 1 - layout.woods * 0.75;
  const okForTree = (p: Vec2, spacing: number) => free(p, 1.2) && !trees.some((t) => t.at.distance(p) < spacing) && !walls.some((wl) => wl.some((q) => q.distance(p) < 1.5));
  // Orchard rows behind the garden.
  if (layout.orchard)
    for (let y = d + 7; y < d + 46; y += 6)
      for (let x = -12; x < w + 12; x += 6) {
        const p = new Vec2(x + ((y - d) % 12 > 6 ? 3 : 0), y);
        if (okForTree(p, 3)) trees.push({ at: p, kind: "round", size: 0.75, look: treeRnd() < 0.15 ? "blossom" : "apple" });
      }
  // Avenues: trees in a row along the lanes near the plot.
  if (layout.avenues)
    for (const road of roads.filter((r) => r.kind === "lane")) {
      const side = treeRnd() < 0.5 ? 1 : -1;
      let travelled = 0;
      for (let i = 1; i < road.points.length; i++) {
        const [a, b] = [road.points[i - 1], road.points[i]];
        travelled += a.distance(b);
        if (travelled < 9 || b.distance(new Vec2(w / 2, d / 2)) > 140) continue;
        travelled = 0;
        const dir = b.sub(a).normalize();
        const p = b.add(new Vec2(-dir.y, dir.x).scale(side * (road.width / 2 + 3)));
        if (free(p, 0.5) && !onPlot(p, 2)) trees.push({ at: p, kind: "round", size: 0.95 });
      }
    }
  // Woods and scattered trees: dense where the woods are, thinning at their edges.
  const caps: Record<Setting, number> = { suburban: 110, town: 40, lakeside: 170, riverside: 160, forest: 320, farmland: 90, seaside: 110, hillside: 180, mountain: 210 };
  const area = { x0: -85, x1: w + 85, y0: -70, y1: d + 90 };
  const forestSpacing = setting === "forest" ? 2.7 : 3.2;
  for (let tries = 0; trees.length < caps[setting] && tries < caps[setting] * 35; tries++) {
    const p = new Vec2(area.x0 + treeRnd() * (area.x1 - area.x0), area.y0 + treeRnd() * (area.y1 - area.y0));
    const wd = wood(p.x, p.y);
    const inWoods = wd > threshold;
    const edge = Math.abs(wd - threshold) < 0.04;
    const shoreBand = water ? waterAt(p) > 2 && waterAt(p) < 14 : false;
    const chance = inWoods ? 0.95 : edge ? 0.6 : shoreBand ? 0.35 : setting === "town" ? 0.06 : 0.1;
    if (treeRnd() > chance) continue;
    if (setting === "mountain" && height(p.x, p.y) > 15) continue;
    if (layout.fields && surface(p.x, p.y) !== "grass") continue;
    if (!okForTree(p, inWoods ? forestSpacing : 4)) continue;
    // What grows where: birches by water, pines on slopes and in the mountains, patches of
    // pine or birch in the woods, fruit and garden trees elsewhere; bushes at wood edges.
    let kind: TreeKind;
    if (edge && !inWoods) kind = "bush";
    else if (shoreBand) kind = treeRnd() < 0.55 ? "birch" : treeRnd() < 0.7 ? "round" : "bush";
    else if (setting === "mountain" || setting === "hillside") kind = treeRnd() < 0.8 ? "pine" : "birch";
    else if (inWoods) kind = kindNoise(p.x, p.y) > 0.55 ? "pine" : treeRnd() < 0.8 ? "birch" : "round";
    else if (setting === "seaside") kind = treeRnd() < 0.6 ? "pine" : "bush";
    else kind = treeRnd() < 0.7 ? "round" : treeRnd() < 0.6 ? "birch" : "bush";
    trees.push({ at: p, kind, size: 0.75 + treeRnd() * 0.6 });
  }

  // Rocks: on the shores, and many in the mountains.
  const rocks: Rock[] = [];
  const rockRnd = random(hash(`${plot.id}:rocks`));
  const rockCount: Record<Setting, number> = { suburban: 6, town: 2, lakeside: 18, riverside: 14, forest: 30, farmland: 6, seaside: 30, hillside: 30, mountain: 55 };
  for (let tries = 0; rocks.length < rockCount[setting] && tries < rockCount[setting] * 40; tries++) {
    const p = new Vec2(area.x0 + rockRnd() * (area.x1 - area.x0), area.y0 + rockRnd() * (area.y1 - area.y0));
    const e = waterAt(p);
    const onShore = water && e > 0.3 && e < 3;
    if (!onShore && !free(p, 0.3)) continue;
    if (onShore && (onPlot(p, 2) || roadEdge(p) < 2)) continue;
    if (!onShore && rockRnd() < 0.5 && water) continue;
    rocks.push({ at: p, size: 0.4 + rockRnd() * (water?.cliff ? 1.6 : 0.9) });
  }

  return {
    setting,
    water,
    jetty,
    roads,
    trees,
    rocks,
    neighbors,
    landmarks,
    walls,
    hedgeSides: hedgeSidesFor(plot),
    height,
    surface,
    waterDistance: (x, y) => waterAt(new Vec2(x, y)),
  };
}

/** How much room each landmark takes (radius, m). */
export const LANDMARK_SIZE: Record<LandmarkKind, number> = {
  church: 9,
  windmill: 5,
  barn: 9,
  silo: 3,
  boathouse: 4,
  lighthouse: 3,
  skiLift: 4,
  millRuin: 5,
  playground: 6,
  footbridge: 2,
  sauna: 3,
  cabin: 5,
  haybales: 4,
  fountain: 3,
};

/** How a tree looks beyond its kind: some round trees blossom pink, some bear apples. */
export function treeLook(t: Tree): "plain" | "blossom" | "apple" {
  if (t.kind !== "round") return "plain";
  if (t.look) return t.look;
  const v = Math.abs(Math.round(t.at.x * 13 + t.at.y * 7)) % 20;
  return v < 3 ? "blossom" : v < 7 ? "apple" : "plain";
}

/** Whether a plan point is under water. */
export function inWater(s: Scenery, p: Vec2): boolean {
  return s.waterDistance(p.x, p.y) < 0;
}
