/**
 * Getting from the road to the house: a driveway to each garage door and a path to the
 * front door, starting where the road reaches the plot (anywhere along a street, or the end
 * of a track or drive) and going round the house where they must. They are paved (or
 * gravelled, off a gravel road) and cost money, so where the doors are matters: a garage
 * at the back of the plot, away from the road, needs a long drive round the house.
 */

import { Vec2, pointInPolygon, segmentsIntersect } from "./geometry";
import { analyzeLayout } from "./layout";
import type { House, OpeningId } from "./model";
import { type Plot, type Side, sideEdge } from "./plot";
import { offsetPolygon } from "./geometry";

export interface Route {
  kind: "drive" | "path";
  /** The door it leads to. */
  opening: OpeningId;
  points: Vec2[];
  width: number;
  surface: "asphalt" | "gravel" | "paving";
}

const DRIVE_WIDTH = 3;
const PATH_WIDTH = 1.2;

/** Where the road meets the plot: a stretch of its edge (one point, at the end of a track or drive). */
function entrances(plot: Plot): { a: Vec2; b: Vec2 }[] {
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

/** Whether the segment p-q passes through the inside of a polygon. */
function crosses(p: Vec2, q: Vec2, polygon: readonly Vec2[]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const [a, b] = [polygon[i], polygon[(i + 1) % polygon.length]];
    if (segmentsIntersect(p, q, a, b)) return true;
  }
  for (let k = 1; k < 8; k++) if (pointInPolygon(p.add(q.sub(p).scale(k / 8)), polygon)) return true;
  return false;
}

/** The shortest way from any of `starts` to `goal`, round `obstacle` and within the plot. */
function shortestRoute(starts: Vec2[], goal: Vec2, obstacle: readonly Vec2[], plot: Plot): Vec2[] | null {
  const inPlot = (p: Vec2) => p.x >= -0.01 && p.y >= -0.01 && p.x <= plot.width + 0.01 && p.y <= plot.depth + 0.01;
  const corners = offsetPolygon(obstacle, 0.3).filter(inPlot);
  const nodes = [...starts, goal, ...corners];
  const goalIndex = starts.length;
  const dist = nodes.map((_, i) => (i < starts.length ? 0 : Infinity));
  const prev = nodes.map(() => -1);
  const done = nodes.map(() => false);
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) return null;
    if (u === goalIndex) break;
    done[u] = true;
    for (let v = starts.length; v < nodes.length; v++) {
      if (done[v] || crosses(nodes[u], nodes[v], obstacle)) continue;
      const alt = dist[u] + nodes[u].distance(nodes[v]);
      if (alt < dist[v]) [dist[v], prev[v]] = [alt, u];
    }
  }
  const path: Vec2[] = [];
  for (let i = goalIndex; i >= 0; i = prev[i]) path.unshift(nodes[i]);
  return path;
}

/** The driveways and the path to the front door, and the doors that cannot be reached. */
export function accessRoutes(house: House, plot: Plot): { routes: Route[]; unreachable: OpeningId[] } {
  const layout = analyzeLayout(house, 0);
  if (!layout.ok) return { routes: [], unreachable: [] };
  const half = house.wallsOn(0).reduce((m, w) => (w.boundary ? m : Math.max(m, w.thickness)), 0) / 2;
  const face = offsetPolygon(layout.value.outline, half);
  const gravel = plot.access.road === "gravel";
  const routes: Route[] = [];
  const unreachable: OpeningId[] = [];

  const routeTo = (openingId: OpeningId, kind: "drive" | "path"): Route | null => {
    const o = house.opening(openingId)!;
    const wall = house.wall(o.wall)!;
    const d = wall.direction();
    const left = new Vec2(-d.y, d.x);
    const centre = wall.start.add(d.scale(o.offset));
    const out = pointInPolygon(centre.add(left.scale(half + 0.2)), face) ? left.scale(-1) : left;
    const width = kind === "drive" ? DRIVE_WIDTH : PATH_WIDTH;
    const door = centre.add(out.scale(half + 0.05));
    const approach = door.add(out.scale(kind === "drive" ? 5 : 1.2));
    // Clear of the house by half the drive's width (the last stretch runs straight in).
    const obstacle = offsetPolygon(face, width / 2 + 0.2);
    if (pointInPolygon(approach, obstacle) || approach.x < 0 || approach.y < 0 || approach.x > plot.width || approach.y > plot.depth) return null;
    const starts = entrances(plot).map((e) => nearestOn(approach, e.a, e.b));
    const way = shortestRoute(starts, approach, obstacle, plot);
    if (!way) return null;
    return { kind, opening: openingId, points: [...way, door], width, surface: kind === "path" ? "paving" : gravel ? "gravel" : "asphalt" };
  };

  const outside = house.openings.filter((o) => house.levelOf(o.wall) === 0 && layout.value.exterior.has(o.wall));
  for (const g of outside.filter((o) => o.kind === "GarageDoor")) {
    const r = routeTo(g.id, "drive");
    if (r) routes.push(r);
    else unreachable.push(g.id);
  }
  // A path to the front door: the door that is quickest to reach from the road.
  const length = (r: Route) => r.points.reduce((s, p, i) => (i ? s + p.distance(r.points[i - 1]) : 0), 0);
  const paths = outside
    .filter((o) => o.kind === "Door")
    .map((o) => routeTo(o.id, "path"))
    .filter((r): r is Route => r !== null)
    .sort((a, b) => length(a) - length(b));
  if (paths.length) routes.push(paths[0]);
  return { routes, unreachable };
}

/** The length of a route (m). */
export const routeLength = (r: Route): number => r.points.reduce((s, p, i) => (i ? s + p.distance(r.points[i - 1]) : 0), 0);
