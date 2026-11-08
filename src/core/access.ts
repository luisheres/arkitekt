/**
 * Getting from the road to the house: the paths and drives the player lays across the
 * plot. They cost money by the square metre, and a garage door needs a drive that leads to
 * it from the road (directly, or through other paths and drives joined to it).
 */

import { Vec2, offsetPolygon, pointInPolygon } from "./geometry";
import { analyzeLayout } from "./layout";
import type { GardenPath, House, OpeningId, PathSurface } from "./model";
import { type Plot, type Side, sideEdge } from "./plot";

export interface Route {
  kind: "drive" | "path";
  /** The path or drive in the house. */
  id: number;
  /** The outside door it leads to, if it reaches one. */
  opening: OpeningId | null;
  points: Vec2[];
  width: number;
  surface: "asphalt" | "gravel" | "paving";
}

export const PATH_WIDTH: Record<GardenPath["kind"], number> = { path: 1.2, drive: 3 };
const SURFACE: Record<PathSurface, Route["surface"]> = { Paving: "paving", Gravel: "gravel", Tarmac: "asphalt" };

/** Where the road meets the plot: stretches of its edge (one point, at the end of a track or drive). */
export function entrances(plot: Plot): { a: Vec2; b: Vec2 }[] {
  const { side, layout } = plot.access;
  const stretch = (s: Side) => {
    const e = sideEdge(plot, s);
    const dir = e.b.sub(e.a).normalize();
    return { a: e.a.add(dir.scale(1)), b: e.b.sub(dir.scale(1)) };
  };
  if (layout === "along") return [stretch(side)];
  if (layout === "corner") {
    const sides: Side[] = ["front", "left", "back", "right"];
    return [stretch(side), stretch(sides[(sides.indexOf(side) + 3) % 4])];
  }
  const mid = sideEdge(plot, side).mid;
  return [{ a: mid, b: mid }];
}

function nearestOn(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = b.sub(a);
  const len = ab.dot(ab);
  if (len < 1e-12) return a;
  const t = Math.min(Math.max(p.sub(a).dot(ab) / len, 0), 1);
  return a.add(ab.scale(t));
}

/** How far `p` is from a polyline. */
function distanceToLine(p: Vec2, points: readonly Vec2[]): number {
  if (points.length === 1) return p.distance(points[0]);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) best = Math.min(best, nearestOn(p, points[i - 1], points[i]).distance(p));
  return best;
}

/** An outside door on the ground floor, and the point just outside it where a path ends. */
export interface OutsideDoor {
  opening: OpeningId;
  kind: "Door" | "GlassDoor" | "GarageDoor";
  at: Vec2;
  /** Out of the house. */
  out: Vec2;
}

export function outsideDoors(house: House): OutsideDoor[] {
  const layout = analyzeLayout(house, 0);
  if (!layout.ok) return [];
  const half = house.wallsOn(0).reduce((m, w) => (w.boundary ? m : Math.max(m, w.thickness)), 0) / 2;
  const face = offsetPolygon(layout.value.outline, half);
  const out: OutsideDoor[] = [];
  for (const o of house.openings) {
    if ((o.kind !== "Door" && o.kind !== "GlassDoor" && o.kind !== "GarageDoor") || house.levelOf(o.wall) !== 0 || !layout.value.exterior.has(o.wall)) continue;
    const wall = house.wall(o.wall)!;
    const d = wall.direction();
    const left = new Vec2(-d.y, d.x);
    const centre = wall.start.add(d.scale(o.offset));
    const dir = pointInPolygon(centre.add(left.scale(half + 0.2)), face) ? left.scale(-1) : left;
    out.push({ opening: o.id, kind: o.kind, at: centre.add(dir.scale(half + 0.05)), out: dir });
  }
  return out;
}

/** How near a path's end must come to a door, or to the road, to reach it. */
const REACH = 1.0;

/** The paths and drives, which door each leads to, and the garage doors no drive reaches from the road. */
export function accessRoutes(house: House, plot: Plot): { routes: Route[]; unreachable: OpeningId[] } {
  const doors = outsideDoors(house);
  const routes: Route[] = house.paths
    .filter((p) => p.points.length >= 2)
    .map((p) => {
      const width = PATH_WIDTH[p.kind];
      const door = doors.find((d) => distanceToLine(d.at, p.points) < width / 2 + REACH);
      return { kind: p.kind, id: p.id, opening: door?.opening ?? null, points: p.points, width, surface: SURFACE[p.surface] };
    });
  // Which reach the road: touching where the road meets the plot, or joined to one that does.
  const gates = entrances(plot);
  const fromRoad = new Set(routes.filter((r) => gates.some((g) => r.points.some((p) => distanceToLine(p, [g.a, g.b]) < r.width / 2 + REACH))).map((r) => r.id));
  for (let grown = true; grown; ) {
    grown = false;
    for (const r of routes) {
      if (fromRoad.has(r.id)) continue;
      const joined = routes.some((o) => fromRoad.has(o.id) && (r.points.some((p) => distanceToLine(p, o.points) < o.width / 2 + 0.3) || o.points.some((p) => distanceToLine(p, r.points) < r.width / 2 + 0.3)));
      if (joined) {
        fromRoad.add(r.id);
        grown = true;
      }
    }
  }
  const unreachable = doors
    .filter((d) => d.kind === "GarageDoor")
    .filter((d) => !routes.some((r) => r.kind === "drive" && fromRoad.has(r.id) && distanceToLine(d.at, r.points) < r.width / 2 + REACH))
    .map((d) => d.opening);
  return { routes, unreachable };
}

/** The length of a route (m). */
export const routeLength = (r: { points: readonly Vec2[] }): number => r.points.reduce((s, p, i) => (i ? s + p.distance(r.points[i - 1]) : 0), 0);

/**
 * Where a point being laid for a path goes: onto the doorstep of a door near it, onto the
 * plot's edge where the road is, or onto the grid. `door` says which door it reached.
 */
export function snapPathPoint(house: House, plot: Plot, p: Vec2, grid: number): { point: Vec2; door: OutsideDoor | null; road: boolean } {
  for (const d of outsideDoors(house)) if (d.at.distance(p) < 1.2) return { point: d.at, door: d, road: false };
  const q = new Vec2(Math.round(p.x / grid) * grid, Math.round(p.y / grid) * grid);
  for (const g of entrances(plot)) {
    const on = nearestOn(p, g.a, g.b);
    if (on.distance(p) < 1.2) {
      // Along the edge, on the grid.
      const along = g.a.distance(g.b) > 1e-9 ? nearestOn(q, g.a, g.b) : on;
      return { point: along, door: null, road: true };
    }
  }
  return { point: q, door: null, road: false };
}
