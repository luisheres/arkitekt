/**
 * The surroundings of a plot: the lie of the land, a lake, trees, rocks and the
 * neighbours' houses. The plot itself and the street in front of it stay flat (height 0),
 * so building is unaffected; beyond them each setting has its own landscape:
 *
 * - suburban: gently rolling gardens, neighbours on either side and across the street;
 * - lakeside: a lake just behind the garden, with a shore and a jetty;
 * - hillside: hills rising behind the plot and the land falling away in front (the view).
 *
 * Everything is generated from fixed seeds, so a plot always looks the same, in the plan
 * and in 3D.
 */

import { Vec2 } from "./geometry";
import type { WallMaterial } from "./model";
import type { Plot, Setting } from "./plot";

/** The street runs along the front of the plot, between these plan y values. */
export const STREET = { from: -8, to: -1, center: -4.5 } as const;

export interface Lake {
  center: Vec2;
  /** Half-axes of the ellipse along x and y. */
  rx: number;
  ry: number;
  /** Height of the water surface. */
  level: number;
}

export type TreeKind = "round" | "birch" | "pine" | "bush";

export interface Tree {
  at: Vec2;
  kind: TreeKind;
  /** Scale: 1 is an average tree of its kind. */
  size: number;
}

export interface Neighbor {
  /** Center and size of the house's footprint. */
  at: Vec2;
  width: number;
  depth: number;
  facade: WallMaterial;
  /** Index into a list of cheerful roof colours. */
  roof: number;
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
  lake: Lake | null;
  jetty: Jetty | null;
  trees: Tree[];
  rocks: Rock[];
  neighbors: Neighbor[];
  /** Ground height at a plan point; 0 on the plot and the street. */
  height(x: number, y: number): number;
}

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Smooth, gentle bumps. */
const bumps = (x: number, y: number) => Math.sin(x * 0.11) * Math.cos(y * 0.09) + 0.6 * Math.sin(x * 0.047 + y * 0.061) + 0.3 * Math.cos(x * 0.21 - y * 0.17);

/** How far a point is outside the flat area (plot plus a margin, and the street). */
function flatDistance(plot: Plot, x: number, y: number): number {
  const margin = 3;
  const dx = Math.max(-margin - x, 0, x - plot.width - margin);
  const dy = Math.max(-margin - y, 0, y - plot.depth - margin);
  const toPlot = Math.hypot(dx, dy);
  const toStreet = Math.max(STREET.from - 1 - y, 0, y - 1);
  return Math.min(toPlot, toStreet);
}

/** Where a lake is, the inside of the ellipse is below 1. */
const lakeE = (l: Lake, x: number, y: number) => ((x - l.center.x) / l.rx) ** 2 + ((y - l.center.y) / l.ry) ** 2;

const memo = new WeakMap<Plot, Scenery>();

/** The scenery around a plot (computed once per plot). */
export function sceneryFor(plot: Plot): Scenery {
  let s = memo.get(plot);
  if (!s) memo.set(plot, (s = makeScenery(plot)));
  return s;
}

function makeScenery(plot: Plot): Scenery {
  const { width: w, depth: d, setting } = plot;
  const rnd = random({ suburban: 11, lakeside: 22, hillside: 33 }[setting] + Math.round(w * 7 + d));

  const lake: Lake | null = setting === "lakeside" ? { center: new Vec2(w / 2, d + 6 + 18), rx: 36, ry: 18, level: -0.35 } : null;
  const jetty: Jetty | null = lake ? { from: new Vec2(w / 2 + 6, d + 3), to: new Vec2(w / 2 + 6, d + 16), width: 1.6 } : null;

  // The landscape away from the flat area, before blending.
  const landscape = (x: number, y: number): number => {
    switch (setting) {
      case "suburban":
        return 0.9 * bumps(x, y);
      case "lakeside":
        // Low ground towards the water, a rise on either side of the lake.
        return 0.7 * bumps(x, y) + Math.max(0, Math.abs(x - w / 2) - 40) * 0.12;
      case "hillside": {
        if (y > d) return (y - d) * 0.42 + 1.6 * bumps(x, y) + Math.max(0, y - d - 25) * 0.25; // hills behind
        if (y < STREET.from) return (y - STREET.from) * 0.55 + 0.8 * bumps(x, y); // the view: the land falls away
        return 0.8 * bumps(x, y);
      }
    }
  };

  const height = (x: number, y: number): number => {
    let h = landscape(x, y) * smoothstep(0, 14, flatDistance(plot, x, y));
    if (lake) {
      // Carve the lake bed, with a beach sloping into the water.
      const e = lakeE(lake, x, y);
      if (e < 1.35) {
        const bed = lake.level - 0.25 - 1.4 * Math.max(0, 1 - e);
        h = e < 1 ? bed : bed + (h - bed) * smoothstep(1, 1.35, e);
      }
    }
    return h;
  };

  // Neighbours' houses: on either side and across the street, in the suburbs.
  const neighbors: Neighbor[] = [];
  if (setting === "suburban" || setting === "lakeside") {
    const facades: WallMaterial[] = ["Plaster", "Wood", "FaluRed", "Brick"];
    const spots =
      setting === "suburban"
        ? [new Vec2(-w / 2 - 2, d / 2), new Vec2(w + w / 2 + 2, d / 2), new Vec2(w * 0.1, STREET.from - 10), new Vec2(w * 0.9 + 4, STREET.from - 10), new Vec2(-w - 6, STREET.from - 10)]
        : [new Vec2(-w / 2 - 4, d / 2 - 4)];
    for (const at of spots) {
      neighbors.push({ at, width: 8 + rnd() * 3, depth: 7 + rnd() * 2, facade: facades[Math.floor(rnd() * facades.length)], roof: Math.floor(rnd() * 4) });
    }
  }

  // Keep scenery off the plot, the street, the lake, the jetty and the neighbours' houses.
  const free = (p: Vec2, clearance: number) => {
    if (p.x > -clearance - 1 && p.x < w + clearance + 1 && p.y > -clearance - 1 && p.y < d + clearance + 1) return false;
    if (p.y > STREET.from - 2 - clearance && p.y < STREET.to + 1 + clearance) return false;
    if (lake && lakeE(lake, p.x, p.y) < 1.15) return false;
    if (jetty && Math.abs(p.x - jetty.from.x) < 3 && p.y > jetty.from.y - 2 && p.y < jetty.to.y + 2) return false;
    return !neighbors.some((n) => Math.abs(p.x - n.at.x) < n.width / 2 + 2 + clearance && Math.abs(p.y - n.at.y) < n.depth / 2 + 2 + clearance);
  };

  const trees: Tree[] = [];
  const count = { suburban: 55, lakeside: 80, hillside: 95 }[setting];
  const area = { x0: -70, x1: w + 70, y0: -45, y1: d + 70 };
  for (let tries = 0; trees.length < count && tries < count * 40; tries++) {
    const at = new Vec2(area.x0 + rnd() * (area.x1 - area.x0), area.y0 + rnd() * (area.y1 - area.y0));
    if (!free(at, 1.5) || trees.some((t) => t.at.distance(at) < 3.2)) continue;
    const r = rnd();
    const kind: TreeKind =
      setting === "hillside" ? (r < 0.7 ? "pine" : r < 0.85 ? "round" : "bush") : setting === "lakeside" ? (r < 0.4 ? "birch" : r < 0.75 ? "round" : r < 0.85 ? "pine" : "bush") : r < 0.55 ? "round" : r < 0.75 ? "birch" : "bush";
    trees.push({ at, kind, size: 0.75 + rnd() * 0.6 });
  }
  // A few bushes in the corners of the garden, outside the buildable area.
  for (const [cx, cy] of [
    [0.9, 0.9],
    [w - 0.9, 0.9],
    [0.9, d - 0.9],
    [w - 0.9, d - 0.9],
  ]) {
    trees.push({ at: new Vec2(cx, cy), kind: "bush", size: 0.8 });
  }

  const rocks: Rock[] = [];
  const rockCount = { suburban: 8, lakeside: 16, hillside: 30 }[setting];
  for (let tries = 0; rocks.length < rockCount && tries < rockCount * 40; tries++) {
    const at = lake && rnd() < 0.5 ? lakeShorePoint(lake, rnd) : new Vec2(area.x0 + rnd() * (area.x1 - area.x0), area.y0 + rnd() * (area.y1 - area.y0));
    if (!free(at, 0.5) && !(lake && Math.abs(lakeE(lake, at.x, at.y) - 1.1) < 0.12)) continue;
    rocks.push({ at, size: 0.4 + rnd() * 0.9 });
  }

  return { setting, lake, jetty, trees, rocks, neighbors, height };
}

/** A point just beyond the water's edge. */
function lakeShorePoint(l: Lake, rnd: () => number): Vec2 {
  const a = rnd() * Math.PI * 2;
  const s = Math.sqrt(1.1);
  return new Vec2(l.center.x + Math.cos(a) * l.rx * s, l.center.y + Math.sin(a) * l.ry * s);
}

/** How a tree looks beyond its kind: some round trees blossom pink, some bear apples. */
export function treeLook(t: Tree): "plain" | "blossom" | "apple" {
  if (t.kind !== "round") return "plain";
  const v = Math.abs(Math.round(t.at.x * 13 + t.at.y * 7)) % 20;
  return v < 3 ? "blossom" : v < 7 ? "apple" : "plain";
}

/** Whether a plan point is under water. */
export function inLake(l: Lake, p: Vec2): boolean {
  return lakeE(l, p.x, p.y) < 1;
}
