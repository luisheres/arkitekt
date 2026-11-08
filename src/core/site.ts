/**
 * Building on sloping ground. The house stands on a level platform, at the average height
 * of the ground under it (raised or lowered by the player). How the ground meets it:
 *
 * - Uphill, where the ground is higher than the platform, it is dug away: level with the
 *   platform for a metre's working space around the house, then sloping back up to its
 *   natural lie. Where that cut is deep, a retaining wall holds it at the edge of the
 *   working space instead.
 * - Downhill, where the ground is lower, a shallow drop is filled as a gentle bank up to
 *   the house. A deeper one is left as it is, and the house's own base shows, flush with
 *   the facade: the basement walls, or an exposed foundation wall.
 *
 * The earth dug and filled, the retaining walls and exposed foundation walls cost money.
 */

import { Vec2, offsetPolygon, pointInPolygon } from "./geometry";
import type { House } from "./model";
import { type Plot, groundHeight } from "./plot";

/** The working space dug or filled around the house, and how far the ground then blends back. */
export const WORKING_MARGIN = 1;
export const BLEND = 2;
/** Cuts or fills deeper than this get a retaining wall. */
export const RETAIN = 0.8;
/** How far the platform can be raised or lowered from the average. */
export const PLATFORM_RANGE = 1.5;
const STEP = 0.5;

/** Distance from a point to a polygon's outline (0 inside it). */
export function distanceToPolygon(p: Vec2, polygon: readonly Vec2[]): number {
  if (pointInPolygon(p, polygon)) return 0;
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const ab = b.sub(a);
    const t = Math.min(Math.max(p.sub(a).dot(ab) / Math.max(ab.dot(ab), 1e-12), 0), 1);
    best = Math.min(best, p.distance(a.add(ab.scale(t))));
  }
  return best;
}

/** The outline the house stands on: its ground floor (or basement, when only that is drawn). */
export function standingOutline(house: House): Vec2[] | null {
  for (const level of [0, -1]) {
    const fp = house.footprint(level);
    if (fp.ok) return fp.value;
  }
  return null;
}

/** Points on a grid over a polygon grown by `margin`, with the area each stands for. */
function samples(polygon: readonly Vec2[], margin: number): Vec2[] {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const out: Vec2[] = [];
  for (let x = Math.min(...xs) - margin + STEP / 2; x < Math.max(...xs) + margin; x += STEP)
    for (let y = Math.min(...ys) - margin + STEP / 2; y < Math.max(...ys) + margin; y += STEP) {
      const p = new Vec2(x, y);
      if (distanceToPolygon(p, polygon) <= margin) out.push(p);
    }
  return out;
}

/** The average height of the ground under the house (0 on flat land, or with no house yet). */
export function averageGround(house: House, plot: Plot): number {
  if (!plot.terrain) return 0;
  const outline = standingOutline(house);
  if (!outline) return 0;
  const points = samples(outline, 0);
  if (!points.length) return 0;
  return points.reduce((s, p) => s + groundHeight(plot, p.x, p.y), 0) / points.length;
}

/** The height of the house's platform: the average ground under it, raised or lowered, to 5 cm. */
export function siteLevel(house: House, plot: Plot): number {
  if (!plot.terrain || !standingOutline(house)) return 0;
  const offset = Math.max(-PLATFORM_RANGE, Math.min(PLATFORM_RANGE, house.platformOffset));
  return Math.round((averageGround(house, plot) + offset) * 20) / 20;
}

/** The point of a polygon's outline nearest to p. */
function nearestOnPolygon(p: Vec2, polygon: readonly Vec2[]): Vec2 {
  let best = polygon[0];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const ab = polygon[(i + 1) % polygon.length].sub(a);
    const t = Math.min(Math.max(p.sub(a).dot(ab) / Math.max(ab.dot(ab), 1e-12), 0), 1);
    const q = a.add(ab.scale(t));
    if (q.distance(p) < best.distance(p)) best = q;
  }
  return best;
}

/** Smoothstep from 0 to 1 as x goes from a to b. */
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Where on the site a point is: under the house, on the dug-out working space, or beyond. */
export type SiteRegion = "house" | "terrace" | "ground";

/** How the house sits on its plot: the levelled site, worked out once per design. */
export interface Site {
  level: number;
  /** The house's outer face (its outline grown by half the outer walls' thickness). */
  face: Vec2[];
  /** The edge of the working space dug out around it, where retaining walls stand. */
  edge: Vec2[];
  region(p: Vec2): SiteRegion;
  /** The ground as built at a point, as seen from a region (the two differ across a retaining wall). */
  heightIn(p: Vec2, region: SiteRegion): number;
  /** The ground as built. */
  ground(x: number, y: number): number;
}

/** A stretch of retaining wall: along the edge of the working space, from the platform up to its top. */
export interface RetainingWall {
  a: Vec2;
  b: Vec2;
  topA: number;
  topB: number;
}

/** A stretch of the house's base showing above the ground downhill. */
export interface ExposedBase {
  a: Vec2;
  b: Vec2;
  /** The ground at each end, below the platform. */
  groundA: number;
  groundB: number;
}

/** The level site of a house on a plot, or null on flat land or with no house yet. */
export function siteOf(house: House, plot: Plot): Site | null {
  const outline = standingOutline(house);
  if (!outline || !plot.terrain) return null;
  const level = siteLevel(house, plot);
  const standing = house.footprint(0).ok ? 0 : -1;
  const half = house.wallsOn(standing).reduce((m, w) => (w.boundary ? m : Math.max(m, w.thickness)), 0) / 2;
  const face = offsetPolygon(outline, half);
  const edge = offsetPolygon(face, WORKING_MARGIN);
  const natural = (p: Vec2) => groundHeight(plot, p.x, p.y);
  /** How deep the cut (+) or fill (-) is where the house meets the ground nearest p. */
  const depthAt = (p: Vec2) => natural(nearestOnPolygon(p, face)) - level;
  const region = (p: Vec2): SiteRegion => {
    if (pointInPolygon(p, face)) return "house";
    return depthAt(p) >= 0 && pointInPolygon(p, edge) ? "terrace" : "ground";
  };
  // On columns, the ground is left as it is downhill, under the house and round it.
  const columns = onColumns(house);
  const heightIn = (p: Vec2, r: SiteRegion): number => {
    if (r === "house" && columns) return Math.min(level, natural(p));
    if (r !== "ground") return level;
    const n = natural(p);
    const depth = depthAt(p);
    if (columns && depth < 0) return n;
    if (depth >= 0) {
      // Uphill: beyond the working space, back up to the natural ground (or held by a wall).
      const m = nearestOnPolygon(p, edge);
      const held = smooth(RETAIN * 0.5, RETAIN, natural(m) - level);
      const away = pointInPolygon(p, edge) ? 0 : m.distance(p);
      return level + (n - level) * (held + (1 - held) * smooth(0, BLEND, away));
    }
    // Downhill: a bank up to the house where the drop is shallow; the natural ground where it is deep.
    const left = smooth(RETAIN * 0.5, RETAIN, -depth);
    return level + (n - level) * (left + (1 - left) * smooth(0, BLEND, distanceToPolygon(p, face)));
  };
  return { level, face, edge, region, heightIn, ground: (x, y) => heightIn(new Vec2(x, y), region(new Vec2(x, y))) };
}

/** Points along a polygon's outline, about `step` apart. */
function along(polygon: readonly Vec2[], step: number): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const n = Math.max(1, Math.ceil(a.distance(b) / step));
    for (let k = 0; k < n; k++) out.push([a.add(b.sub(a).scale(k / n)), a.add(b.sub(a).scale((k + 1) / n))]);
  });
  return out;
}

/** The retaining walls along the edge of the working space, where the cut is deep. */
export function retainingWalls(house: House, plot: Plot): RetainingWall[] {
  const site = siteOf(house, plot);
  if (!site) return [];
  const top = (p: Vec2) => {
    // Just beyond the wall, where the ground keeps (most of) its natural height.
    const q = p.add(p.sub(nearestOnPolygon(p, site.face)).normalize().scale(0.02));
    return site.region(p) === "house" ? site.level : site.heightIn(q, "ground");
  };
  return along(site.edge, 0.25)
    .map(([a, b]) => ({ a, b, topA: top(a), topB: top(b) }))
    .filter((w) => w.topA > site.level + 0.02 || w.topB > site.level + 0.02);
}

/** Whether the house stands on columns (not with a basement, which needs walls). */
export const onColumns = (house: House): boolean => house.foundation === "Columns" && !house.basement;

/** The house's base showing above the ground downhill (walls standing on it are flush with the facade). */
export function exposedBase(house: House, plot: Plot): ExposedBase[] {
  const site = siteOf(house, plot);
  if (!site || onColumns(house)) return [];
  const at = (p: Vec2) => site.heightIn(p.add(p.sub(nearestOnPolygon(p, standingOutline(house)!)).normalize().scale(0.02)), "ground");
  return along(site.face, 0.25)
    .map(([a, b]) => ({ a, b, groundA: at(a), groundB: at(b) }))
    .filter((e) => e.groundA < site.level - 0.02 || e.groundB < site.level - 0.02);
}

const faceArea = (a: Vec2, b: Vec2, ha: number, hb: number) => (a.distance(b) * (Math.max(ha, 0) + Math.max(hb, 0))) / 2;

/** The area of the retaining walls' faces (m²). */
export function retainingArea(house: House, plot: Plot): number {
  const level = siteLevel(house, plot);
  return retainingWalls(house, plot).reduce((s, w) => s + faceArea(w.a, w.b, w.topA - level, w.topB - level), 0);
}

/** The area of foundation wall showing below the house downhill, not counting basement walls (m²). */
export function exposedFoundationArea(house: House, plot: Plot): number {
  const level = siteLevel(house, plot);
  const covered = house.basement ? house.basementDepth() : 0;
  return exposedBase(house, plot).reduce((s, e) => s + faceArea(e.a, e.b, level - e.groundA - covered, level - e.groundB - covered), 0);
}

/** Earth dug away and filled in to shape the site (m³), and the basement's hole. */
export function earthworks(house: House, plot: Plot): { cut: number; fill: number; basement: number } {
  const basement = house.basement ? house.floorArea(-1) * house.basementDepth() : 0;
  const site = siteOf(house, plot);
  if (!site) return { cut: 0, fill: 0, basement };
  let cut = 0;
  let fill = 0;
  for (const p of samples(site.face, WORKING_MARGIN + BLEND)) {
    const n = groundHeight(plot, p.x, p.y);
    const r = site.region(p);
    // Under the house, the ground is dug down to the platform; nothing is filled under it.
    const dh = r === "house" ? Math.min(site.level - n, 0) : site.heightIn(p, r) - n;
    if (dh < 0) cut -= dh * STEP * STEP;
    else fill += dh * STEP * STEP;
  }
  return { cut, fill, basement };
}

/** The ground as built: dug and filled around the house, natural further away. */
export function shapedGround(house: House, plot: Plot): (x: number, y: number) => number {
  const site = siteOf(house, plot);
  return site ? site.ground : (x, y) => groundHeight(plot, x, y);
}

/** A column under a house on columns: where it stands, and from the ground up to the floor. */
export interface Column {
  at: Vec2;
  ground: number;
  top: number;
}

/** Columns under the house wherever the ground falls away below the floor, about 2.4 m apart. */
export function foundationColumns(house: House, plot: Plot): Column[] {
  const site = siteOf(house, plot);
  if (!site || !onColumns(house)) return [];
  return columnSpots(standingOutline(house)!)
    .map((at) => ({ at, ground: groundHeight(plot, at.x, at.y), top: site.level }))
    .filter((c) => c.top - c.ground > 0.15);
}

/** Where columns stand under an outline: along its edges (corners too) and on a grid inside, about 2.4 m apart. */
export function columnSpots(outline: readonly Vec2[]): Vec2[] {
  const inset = offsetPolygon(outline, -0.15);
  const spots: Vec2[] = [];
  // Along the walls (corners included)...
  inset.forEach((a, i) => {
    const b = inset[(i + 1) % inset.length];
    const n = Math.max(1, Math.round(a.distance(b) / 2.4));
    for (let k = 0; k < n; k++) spots.push(a.add(b.sub(a).scale(k / n)));
  });
  // ...and a grid under the middle.
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  for (let y = Math.min(...ys) + 2.4; y < Math.max(...ys) - 1; y += 2.4)
    for (let x = Math.min(...xs) + 2.4; x < Math.max(...xs) - 1; x += 2.4) {
      const p = new Vec2(x, y);
      if (pointInPolygon(p, inset) && distanceToPolygon(p, inset) > 1) spots.push(p);
    }
  return spots;
}
