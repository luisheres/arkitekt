/**
 * The sun: where it is at a time of day and season, and how many hours of direct sun a spot
 * on the house gets. North is the back of every plot (plan +y, up in the plan), so the street
 * side faces south; east is -x (on the right in the plan, which shows +x to the left) and west
 * is +x. The game is set in Sweden, at 59° north.
 */

import { Vec2 } from "./geometry";
import type { House } from "./model";
import { buildRoof, roofHeightAt } from "./roof";

export const LATITUDE = 59;

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/** The day of the year of each season's middle (equinoxes and solstices). */
export const SEASON_DAY: Record<Season, number> = { spring: 80, summer: 172, autumn: 266, winter: 355 };

/** Compass directions in plan coordinates. */
export const NORTH = new Vec2(0, 1);
export const EAST = new Vec2(-1, 0);

export interface SunPosition {
  /** Degrees above the horizon (negative: below it). */
  elevation: number;
  /** Compass bearing in degrees: 0 north, 90 east, 180 south, 270 west. */
  azimuth: number;
  /** Unit vector towards the sun: plan x, plan y, and up. */
  dir: { x: number; y: number; up: number };
}

/** The sun's position at a local solar time (hours, 12 = noon) on a day of the year. */
export function sunPosition(hour: number, day: number, latitude = LATITUDE): SunPosition {
  const rad = Math.PI / 180;
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10)) * rad;
  const hourAngle = (hour - 12) * 15 * rad;
  const lat = latitude * rad;
  const sinEl = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  const elevation = Math.asin(sinEl);
  // Azimuth from north, clockwise (towards east).
  const cosAz = (Math.sin(declination) - Math.sin(elevation) * Math.sin(lat)) / (Math.cos(elevation) * Math.cos(lat));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;
  const flat = Math.cos(elevation);
  const towards = NORTH.scale(Math.cos(azimuth) * flat).add(EAST.scale(Math.sin(azimuth) * flat));
  return { elevation: elevation / rad, azimuth: azimuth / rad, dir: { x: towards.x, y: towards.y, up: Math.sin(elevation) } };
}

/** Sunrise and sunset (solar hours) on a day. */
export function daylight(day: number, latitude = LATITUDE): { rise: number; set: number } {
  let rise = 12;
  while (rise > 0 && sunPosition(rise - 0.05, day, latitude).elevation > 0) rise -= 0.05;
  return { rise, set: 24 - rise };
}

/**
 * Whether the house itself casts a shadow on a point (at `height` above the ground floor)
 * when the sun is in `sun`: follows the ray towards the sun and checks whether it passes
 * under any storey's top (or the roof) on the way.
 */
export function inHouseShadow(house: House, at: Vec2, height: number, sun: SunPosition, roof = buildRoof(house)): boolean {
  if (sun.elevation <= 0) return true;
  const flat = Math.hypot(sun.dir.x, sun.dir.y);
  const step = new Vec2(sun.dir.x / flat, sun.dir.y / flat);
  const rise = sun.dir.up / flat; // metres up per metre along
  const footprints = house.levelList().filter((k) => k >= 0).map((k) => ({ k, fp: house.footprint(k) }));
  for (let s = 0.25; s < 60; s += 0.25) {
    const p = at.add(step.scale(s));
    const h = height + s * rise;
    let top = -Infinity;
    for (const { k, fp } of footprints) {
      if (!fp.ok || !pointIn(p, fp.value)) continue;
      top = Math.max(top, house.levelBase(k) + house.storeyHeight(k));
    }
    if (roof.ok) {
      const r = roofHeightAt(roof.value, p);
      if (r !== null) top = Math.max(top, r);
    }
    if (top > h) return true;
    if (h > 40) return false;
  }
  return false;
}

function pointIn(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Hours of direct sun on a spot (at `height` above the ground floor) on a day: every quarter
 * of an hour from sunrise to sunset, whether the sun reaches it past the house.
 */
export function sunHours(house: House, at: Vec2, height: number, day: number): number {
  const { rise, set } = daylight(day);
  const roof = buildRoof(house);
  let hours = 0;
  for (let t = rise + 0.125; t < set; t += 0.25) if (!inHouseShadow(house, at, height, sunPosition(t, day), roof)) hours += 0.25;
  return hours;
}

/** Whether a spot gets the evening sun: direct sun in the last hour before sunset (in summer). */
export function sunsetSun(house: House, at: Vec2, height: number, day = SEASON_DAY.summer): boolean {
  const { set } = daylight(day);
  const roof = buildRoof(house);
  return [set - 0.9, set - 0.6, set - 0.3].some((t) => !inHouseShadow(house, at, height, sunPosition(t, day), roof));
}
