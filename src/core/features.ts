/**
 * Fireplaces with their chimneys, dormers and terraces: where they stand, and whether
 * they can be built where they are.
 */

import { Vec2 } from "./geometry";
import { type Balcony, type Dormer, type House, DORMER_WIDTH } from "./model";
import { type RoofGeometry, buildRoof, roofHeightAt } from "./roof";
import { analyzeLayout } from "./layout";
import { balconyOutline, interiorNormal } from "./edit";
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

export function doorApproaches(house: House, floor: number, ground: (x: number, y: number) => number): DoorApproach[] {
  const layout = analyzeLayout(house, 0);
  if (!layout.ok) return [];
  const out: DoorApproach[] = [];
  for (const o of house.openings) {
    if (o.kind !== "Door" && o.kind !== "GlassDoor") continue;
    const wall = house.wall(o.wall);
    if (!wall || wall.level !== 0 || !layout.value.exterior.has(wall.id)) continue;
    // Not where a terrace already meets the door.
    if (house.balconies.some((b) => b.wall === wall.id && Math.abs(b.offset - o.offset) < b.width / 2)) continue;
    const along = wall.direction();
    const outward = interiorNormal(house, wall).scale(-1);
    const at = wall.start.add(along.scale(o.offset)).add(outward.scale(wall.thickness / 2));
    const g = ground(at.x + outward.x * 0.6, at.y + outward.y * 0.6);
    const rise = floor - g;
    if (rise < 0.12) continue;
    const steps = Math.max(1, Math.round(rise / STEP_RISE));
    const ramp = !!o.ramp;
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
