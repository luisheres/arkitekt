/**
 * Fireplaces with their chimneys, dormers and terraces: where they stand, and whether
 * they can be built where they are.
 */

import { Vec2, offsetPolygon, pointInPolygon } from "./geometry";
import { type Balcony, type Dormer, type House, DORMER_WIDTH, type Wall } from "./model";
import { type RoofGeometry, buildRoof, roofHeightAt } from "./roof";
import { analyzeLayout } from "./layout";
import { balconyOutline, interiorNormal, outwardNormal } from "./edit";
import { SEASON_DAY, sunHours, sunsetSun } from "./sun";
import { accessRoutes } from "./access";
import type { Plot } from "./plot";

/** How far a chimney rises above the roof where it comes through. */
export const CHIMNEY_ABOVE_ROOF = 0.9;
export const CHIMNEY_SIZE = { width: 0.7, depth: 0.55 };

export interface Chimney {
  /** The fireplace it serves. */
  fireplace: number;
  /** Where it rises, in plan, and which way the fireplace faces. */
  at: Vec2;
  facing: Vec2;
  /** From the fireplace's floor to its top (heights above the ground floor). */
  base: number;
  top: number;
}

/** The chimney above each fireplace: up through the storeys above and out through the roof. */
export function chimneys(house: House, roof: RoofGeometry | null = null): Chimney[] {
  const fireplaces = house.furniture.filter((f) => f.kind === "Fireplace");
  if (!fireplaces.length) return [];
  const g = roof ?? (() => {
    const r = buildRoof(house);
    return r.ok ? r.value : null;
  })();
  const topStorey = house.levelBase(house.topLevel()) + house.eaveHeight(house.topLevel());
  return fireplaces.map((f) => {
    // Against the wall behind the fireplace.
    const at = f.at.sub(f.facing.scale(f.depth / 2 - CHIMNEY_SIZE.depth / 2));
    const roofAt = g && house.roof ? Math.max(...[-1, 1].flatMap((u) => [-1, 1].map((v) => roofHeightAt(g, at.add(new Vec2(u * 0.35, v * 0.35))) ?? topStorey))) : topStorey;
    return { fireplace: f.id!, at, facing: f.facing, base: house.levelBase(f.level), top: Math.max(roofAt, topStorey + 0.3) + CHIMNEY_ABOVE_ROOF };
  });
}

/** The total height of chimney to build (m). */
export function chimneyLength(house: House, roof: RoofGeometry | null = null): number {
  return chimneys(house, roof).reduce((s, c) => s + (c.top - c.base), 0);
}

/** A dormer's shape: its front face on the roof slope, and how deep it runs into the roof. */
export interface DormerShape {
  /** The middle of its front, in plan, and the directions along the wall and into the house. */
  front: Vec2;
  along: Vec2;
  inward: Vec2;
  width: number;
  /** Bottom and top of its front wall, and the height of its own little ridge. */
  sill: number;
  eave: number;
  ridge: number;
  /** How far back into the roof it reaches. */
  depth: number;
}

/**
 * Where a dormer stands: set back a little from the wall, its front rising from the roof
 * slope, reaching back until the main roof is as high as its eaves. Null when it cannot
 * stand there: the wall is not an outer wall of the top storey, the roof is flat, or the
 * roof does not slope up from that wall (a gable end).
 */
export function dormerShape(house: House, d: Dormer, roof: RoofGeometry | null = null): DormerShape | null {
  const wall = house.wall(d.wall);
  if (!wall || !house.roof || house.roof.style === "Flat" || wall.level !== house.topLevel()) return null;
  const layout = analyzeLayout(house, wall.level);
  if (!layout.ok || !layout.value.exterior.has(wall.id)) return null;
  const g = roof ?? (() => {
    const r = buildRoof(house);
    return r.ok ? r.value : null;
  })();
  if (!g) return null;
  const along = wall.direction();
  const inward = interiorNormal(house, wall);
  const front = wall.start.add(along.scale(d.offset)).add(inward.scale(0.6));
  const h = (p: Vec2) => roofHeightAt(g, p);
  // The roof must slope up away from the wall, all along the dormer's width.
  for (const s of [-0.5, 0, 0.5]) {
    const p = front.add(along.scale(s * d.width));
    const [h0, h1] = [h(p), h(p.add(inward.scale(1)))];
    if (h0 === null || h1 === null || h1 - h0 < 0.15) return null;
  }
  const sill = h(front)!;
  const pitch = Math.tan((house.roof.pitchDeg * Math.PI) / 180);
  const eave = sill + 1.45;
  // Back until the main roof reaches the dormer's eaves (and never past the ridge).
  let depth = 0.6;
  while (depth < 8 && (h(front.add(inward.scale(depth))) ?? 0) < eave + 0.05) depth += 0.1;
  const ridge = eave + (d.width / 2) * Math.min(pitch, 0.9);
  if (!Number.isFinite(sill) || depth >= 8) return null;
  return { front, along, inward, width: d.width, sill, eave, ridge, depth };
}

/** Whether a dormer is too narrow or wide. */
export const dormerSizeOk = (d: Dormer): boolean => d.width >= DORMER_WIDTH[0] - 1e-9 && d.width <= DORMER_WIDTH[1] + 1e-9;

/** Put a dormer in the middle of a wall of the top storey. */
export function placeDormer(house: House, wallId: number, skylight = false): number | null {
  const wall = house.wall(wallId);
  if (!wall || wall.boundary) return null;
  const id = house.addDormer(wallId, wall.length() / 2, Math.min(skylight ? 1.2 : 1.8, Math.max(DORMER_WIDTH[0], wall.length() - 1)));
  if (skylight) house.dormer(id)!.skylight = true;
  return id;
}

/** A dormer's outline in plan: across its width, from the wall's face 2 m into the roof. */
export function dormerOutline(house: House, d: Dormer): Vec2[] {
  const wall = house.wall(d.wall);
  if (!wall) return [];
  const along = wall.direction();
  const inward = interiorNormal(house, wall);
  const mid = wall.start.add(along.scale(d.offset));
  const half = along.scale(d.width / 2);
  const [a, b] = [mid.sub(half).add(inward.scale(0.4)), mid.add(half).add(inward.scale(0.4))];
  return [a, b, b.add(inward.scale(1.8)), a.add(inward.scale(1.8))];
}

/**
 * Put a dormer where one fits: in the middle of a top-floor outer wall under a roof slope,
 * preferring the side facing `side` (where the road is), then the longest wall.
 */
export function placeDormerAnywhere(house: House, side: "front" | "back" | "left" | "right", skylight = false): number | null {
  const layout = analyzeLayout(house, house.topLevel());
  if (!layout.ok || !house.roof || house.roof.style === "Flat") return null;
  const facing = { front: new Vec2(0, -1), back: new Vec2(0, 1), left: new Vec2(1, 0), right: new Vec2(-1, 0) }[side];
  const walls = house
    .wallsOn(house.topLevel())
    .filter((w) => !w.boundary && layout.value.exterior.has(w.id))
    .sort((a, b) => interiorNormal(house, a).dot(facing) - interiorNormal(house, b).dot(facing) || b.length() - a.length());
  for (const w of walls) {
    const id = placeDormer(house, w.id, skylight);
    if (id === null) continue;
    if (dormerShape(house, house.dormer(id)!)) return id;
    house.removeDormer(id);
  }
  return null;
}

/** The sun on a balcony or terrace: hours of direct sun at the spring equinox, and whether it gets the summer's evening sun. */
export function balconySun(house: House, b: Balcony): { hours: number; sunset: boolean } {
  const outline = balconyOutline(house, b);
  const wall = house.wall(b.wall);
  if (!outline || !wall) return { hours: 0, sunset: false };
  // Its middle, a little out from the wall, at sitting height.
  const at = outline.reduce((s, p) => s.add(p), new Vec2(0, 0)).scale(1 / outline.length);
  const height = house.levelBase(wall.level) + 1;
  return { hours: sunHours(house, at, height, SEASON_DAY.spring), sunset: sunsetSun(house, at, height) };
}

/**
 * The way up to a ground-floor outside door, when the floor is above the ground in front of
 * it: how high, and how many steps (or how long a ramp, at 1 in 12).
 */
export interface DoorApproach {
  opening: number;
  /** The door's middle on the outer face, and the direction out. */
  at: Vec2;
  out: Vec2;
  along: Vec2;
  width: number;
  /** From the ground up to the floor. */
  rise: number;
  ground: number;
  steps: number;
  ramp: boolean;
  /** How far the steps reach out from the wall; or how long the ramp is, running along the wall from a landing at the door. */
  length: number;
  /** Which way along the wall a ramp runs: towards the wall's longer side. */
  side: 1 | -1;
}

const STEP_RISE = 0.17;
const STEP_GOING = 0.3;

/** The steps and ramps the player has added to raised doors. */
export function doorApproaches(house: House, floor: number, ground: (x: number, y: number) => number): DoorApproach[] {
  return raisedDoors(house, floor, ground).filter((a) => house.opening(a.opening)?.approach);
}

/** Every ground-floor outside door above the ground in front of it, as it would be with steps (or the ramp chosen). */
export function raisedDoors(house: House, floor: number, ground: (x: number, y: number) => number): DoorApproach[] {
  const layout = analyzeLayout(house, 0);
  if (!layout.ok) return [];
  const out: DoorApproach[] = [];
  for (const o of house.openings) {
    if (o.kind !== "Door" && o.kind !== "GlassDoor") continue;
    const wall = house.wall(o.wall);
    if (!wall || wall.level !== 0 || !layout.value.exterior.has(wall.id)) continue;
    // Not where a terrace already meets the door.
    if (house.balconies.some((b) => b.wall === wall.id && Math.abs(b.offset - o.offset) < b.width / 2)) continue;
    // Nor onto the altan.
    if (altanWalls(house).some((w) => w.id === wall.id)) continue;
    const along = wall.direction();
    const outward = interiorNormal(house, wall).scale(-1);
    const at = wall.start.add(along.scale(o.offset)).add(outward.scale(wall.thickness / 2));
    const g = ground(at.x + outward.x * 0.6, at.y + outward.y * 0.6);
    const rise = floor - g;
    if (rise < 0.12) continue;
    const steps = Math.max(1, Math.round(rise / STEP_RISE));
    const ramp = o.approach === "ramp";
    const side = o.offset < wall.length() / 2 ? 1 : -1;
    out.push({ opening: o.id, at, out: outward, along, width: o.width + 0.4, rise, ground: g, steps, ramp, length: ramp ? Math.max(1.2, rise * 12) : steps * STEP_GOING + 0.4, side });
  }
  return out;
}

/** A fence round the plot: its runs, and the gaps where the drive and paths come in. */
export interface FenceLayout {
  runs: [Vec2, Vec2][];
  /** A gate across a path, or an open gap for a drive (with a post each side). */
  gaps: { a: Vec2; b: Vec2; gate: boolean }[];
  /** Metres of fence, not counting the gaps. */
  length: number;
}

/** How far inside the plot's edge the fence stands. */
export const FENCE_INSET = 0.25;

export function fenceLayout(house: House, plot: Plot): FenceLayout {
  const [w, d, k] = [plot.width, plot.depth, FENCE_INSET];
  const corners = [new Vec2(k, k), new Vec2(w - k, k), new Vec2(w - k, d - k), new Vec2(k, d - k)];
  // Where each route crosses the fence line: a gap as wide as the route, a little more.
  const cuts: { side: number; t: number; half: number; gate: boolean }[] = [];
  for (const r of accessRoutes(house, plot).routes) {
    for (let i = 0; i + 1 < r.points.length; i++) {
      const [p, q] = [r.points[i], r.points[i + 1]];
      for (let s = 0; s < 4; s++) {
        const [a, b] = [corners[s], corners[(s + 1) % 4]];
        const hit = segmentCross(p, q, a, b);
        if (hit !== null && !cuts.some((c) => c.side === s && Math.abs(c.t - hit * a.distance(b)) < 0.5)) cuts.push({ side: s, t: hit * a.distance(b), half: r.width / 2 + 0.2, gate: r.kind === "path" });
      }
    }
  }
  const runs: [Vec2, Vec2][] = [];
  const gaps: FenceLayout["gaps"] = [];
  let length = 0;
  for (let s = 0; s < 4; s++) {
    const [a, b] = [corners[s], corners[(s + 1) % 4]];
    const dir = b.sub(a).normalize();
    const len = a.distance(b);
    let t = 0;
    for (const c of cuts.filter((c) => c.side === s).sort((x, y) => x.t - y.t)) {
      const [g0, g1] = [Math.max(0, c.t - c.half), Math.min(len, c.t + c.half)];
      if (g0 > t + 0.05) runs.push([a.add(dir.scale(t)), a.add(dir.scale(g0))]);
      gaps.push({ a: a.add(dir.scale(g0)), b: a.add(dir.scale(g1)), gate: c.gate });
      length += g0 - t;
      t = g1;
    }
    if (len > t + 0.05) runs.push([a.add(dir.scale(t)), b]);
    length += len - t;
  }
  return { runs, gaps, length };
}

/** Where segment p–q crosses segment a–b, as a fraction along a–b; null if it does not. */
function segmentCross(p: Vec2, q: Vec2, a: Vec2, b: Vec2): number | null {
  const r = q.sub(p);
  const s = b.sub(a);
  const den = r.cross(s);
  if (Math.abs(den) < 1e-12) return null;
  const t = a.sub(p).cross(s) / den;
  const u = a.sub(p).cross(r) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? u : null;
}

// --- Altan: a wooden deck round the house -----------------------------------------------

export const ALTAN_DEPTH: [number, number] = [1.2, 4];

/** An altan's shape: a rectangle along each of its walls and a square at each convex corner between two of them; its open edges (in short bits, with the way out); and its area. */
export interface AltanLayout {
  pieces: Vec2[][];
  edge: { a: Vec2; b: Vec2; out: Vec2 }[];
  area: number;
}

/** The ground floor's outer walls the altan runs along (walls since removed are left out). */
export function altanWalls(house: House): Wall[] {
  if (!house.altan) return [];
  const layout = analyzeLayout(house, 0);
  if (!layout.ok) return [];
  return house.altan.walls.map((id) => house.wall(id)).filter((w): w is Wall => !!w && w.level === 0 && !w.boundary && layout.value.exterior.has(w.id));
}

export function altanLayout(house: House): AltanLayout | null {
  const walls = altanWalls(house);
  const fp = house.footprint(0);
  if (!walls.length || !fp.ok || !house.altan) return null;
  const depth = house.altan.depth;
  const outline = fp.value;
  const face = offsetPolygon(outline, house.wallsOn(0).reduce((m, w) => (w.boundary ? m : Math.max(m, w.thickness)), 0) / 2);
  const pieces: Vec2[][] = [];
  const outOf = new Map(walls.map((w) => [w.id, outwardNormal(house, w)]));
  /** Whether the house ends at `e`, the end of `w` going along `d`: a corner sticking out. */
  const convex = (e: Vec2, d: Vec2, out: Vec2) => !pointInPolygon(e.add(d.scale(0.5)).sub(out.scale(0.5)), outline);
  const done = new Set<string>();
  for (const w of walls) {
    const d = w.direction();
    const out = outOf.get(w.id)!;
    const h = w.thickness / 2;
    const a = w.start.sub(d.scale(convex(w.start, d.neg(), out) ? h : 0)).add(out.scale(h));
    const b = w.end.add(d.scale(convex(w.end, d, out) ? h : 0)).add(out.scale(h));
    pieces.push([a, b, b.add(out.scale(depth)), a.add(out.scale(depth))]);
    // A square filling the corner where the next altan wall turns.
    for (const [e, along] of [[w.start, d.neg()], [w.end, d]] as const) {
      if (!convex(e, along, out)) continue;
      const other = walls.find((o) => o !== w && (o.start.distance(e) < 1e-6 || o.end.distance(e) < 1e-6) && Math.abs(o.direction().dot(d)) < 0.99);
      if (!other) continue;
      const key = [w.id, other.id].sort().join(":");
      if (done.has(key)) continue;
      done.add(key);
      const o2 = outOf.get(other.id)!;
      const c = e.add(out.scale(h)).add(o2.scale(other.thickness / 2));
      pieces.push([c, c.add(out.scale(depth)), c.add(out.scale(depth)).add(o2.scale(depth)), c.add(o2.scale(depth))]);
    }
  }
  const inAny = (p: Vec2) => pointInPolygon(p, face) || pieces.some((q) => pointInPolygon(p, q));
  // The open edges: bits of each piece's sides with nothing just beyond them.
  const edge: AltanLayout["edge"] = [];
  for (const piece of pieces)
    for (let i = 0; i < 4; i++) {
      const [a, b] = [piece[i], piece[(i + 1) % 4]];
      const dir = b.sub(a).normalize();
      // (Pieces are not all wound the same way: out is the side away from the piece's middle.)
      const mid = piece.reduce((s, p) => s.add(p), new Vec2(0, 0)).scale(1 / 4);
      let out = new Vec2(-dir.y, dir.x);
      if (out.dot(a.add(b).scale(0.5).sub(mid)) < 0) out = out.neg();
      const n = Math.max(1, Math.round(a.distance(b) / 0.25));
      for (let k = 0; k < n; k++) {
        const [p, q] = [a.add(b.sub(a).scale(k / n)), a.add(b.sub(a).scale((k + 1) / n))];
        if (!inAny(p.add(q).scale(0.5).add(out.scale(0.05)))) edge.push({ a: p, b: q, out });
      }
    }
  // The area of the union, on a 10 cm grid.
  const pts = pieces.flat();
  const [x0, x1, y0, y1] = [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))];
  let cells = 0;
  for (let x = x0 + 0.05; x < x1; x += 0.1) for (let y = y0 + 0.05; y < y1; y += 0.1) if (pieces.some((q) => pointInPolygon(new Vec2(x, y), q))) cells++;
  return { pieces, edge, area: cells * 0.01 };
}

/** Steps down from the altan, where its floor is nearest the ground (none when it is at the ground). */
export function altanSteps(house: House, floor: number, ground: (x: number, y: number) => number): DoorApproach | null {
  const layout = altanLayout(house);
  if (!layout) return null;
  let best: { bit: AltanLayout["edge"][number]; g: number } | null = null;
  for (const bit of layout.edge) {
    const m = bit.a.add(bit.b).scale(0.5);
    const g = ground(m.x + bit.out.x * 0.6, m.y + bit.out.y * 0.6);
    if (!best || g > best.g) best = { bit, g };
  }
  if (!best) return null;
  const rise = floor - best.g;
  if (rise < 0.12) return null;
  const steps = Math.max(1, Math.round(rise / STEP_RISE));
  const along = best.bit.b.sub(best.bit.a).normalize();
  return { opening: -1, at: best.bit.a.add(best.bit.b).scale(0.5), out: best.bit.out, along, width: 1.2, rise, ground: best.g, steps, ramp: false, length: steps * STEP_GOING + 0.4, side: 1 };
}

/** An altan along every outer wall of the ground floor. */
export function placeAltan(house: House, depth = 2.4): void {
  const layout = analyzeLayout(house, 0);
  if (!layout.ok) return;
  house.altan = { depth, walls: house.wallsOn(0).filter((w) => !w.boundary && layout.value.exterior.has(w.id)).map((w) => w.id) };
}

/** The altan as terraces along each of its walls, for what is worked out per terrace (sun, the brief). */
export function altanTerraces(house: House): Balcony[] {
  const depth = house.altan?.depth ?? 0;
  return altanWalls(house).map((w) => ({ id: -w.id, wall: w.id, offset: w.length() / 2, width: w.length(), depth }));
}
