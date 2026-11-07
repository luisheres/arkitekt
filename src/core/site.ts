/**
 * Building on sloping ground: the house stands on a level platform, at the average height
 * of the ground under it. Where the ground is higher it is dug away, where it is lower
 * it is filled, a metre's working space around the house too, and the earth moved costs
 * money. Beyond that the ground slopes back to its natural lie over a couple of metres.
 * A basement is dug out below the platform.
 */

import { Vec2, pointInPolygon } from "./geometry";
import type { House } from "./model";
import { type Plot, groundHeight } from "./plot";

/** The working space dug or filled around the house, and how far the ground then blends back. */
export const WORKING_MARGIN = 1;
export const BLEND = 2;
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

/** The height of the house's platform: the average ground under it, to 5 cm. */
export function siteLevel(house: House, plot: Plot): number {
  if (!plot.terrain) return 0;
  const outline = standingOutline(house);
  if (!outline) return 0;
  const points = samples(outline, 0);
  if (!points.length) return 0;
  const mean = points.reduce((s, p) => s + groundHeight(plot, p.x, p.y), 0) / points.length;
  return Math.round(mean * 20) / 20;
}

/** Earth dug away and filled in to make the platform (m³), and the basement's hole. */
export function earthworks(house: House, plot: Plot): { cut: number; fill: number; basement: number } {
  const outline = standingOutline(house);
  const basementArea = house.basement ? house.floorArea(-1) : 0;
  const basement = basementArea * house.basementDepth();
  if (!outline || !plot.terrain) return { cut: 0, fill: 0, basement };
  const level = siteLevel(house, plot);
  let cut = 0;
  let fill = 0;
  for (const p of samples(outline, WORKING_MARGIN)) {
    const dh = groundHeight(plot, p.x, p.y) - level;
    if (dh > 0) cut += dh * STEP * STEP;
    else fill -= dh * STEP * STEP;
  }
  return { cut, fill, basement };
}

/**
 * The ground as built: level with the platform under and around the house, sloping back
 * to the natural ground beyond.
 */
export function shapedGround(house: House, plot: Plot): (x: number, y: number) => number {
  const outline = standingOutline(house);
  if (!outline || !plot.terrain) return (x, y) => groundHeight(plot, x, y);
  const level = siteLevel(house, plot);
  return (x, y) => {
    const natural = groundHeight(plot, x, y);
    const d = distanceToPolygon(new Vec2(x, y), outline);
    if (d <= WORKING_MARGIN) return level;
    if (d >= WORKING_MARGIN + BLEND) return natural;
    const t = (d - WORKING_MARGIN) / BLEND;
    const s = t * t * (3 - 2 * t);
    return level + (natural - level) * s;
  };
}
