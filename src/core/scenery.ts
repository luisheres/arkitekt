/**
 * The surroundings of a plot: the lie of the land, a lake, trees, rocks and the
 * neighbours' houses. The plot itself and the street in front of it stay flat (height 0),
 * so building is unaffected; beyond them each setting has its own landscape:
 *
 * - suburban: gently rolling gardens, neighbours on either side and across the street;
 * - town: flat, with houses close all around;
 * - lakeside: a lake just behind the garden, with a shore and a jetty;
 * - riverside: a river running past the back of the garden;
 * - forest: a clearing in dense pine and birch woods;
 * - farmland: striped fields, a farmhouse and a red barn;
 * - seaside: the sea behind the garden, with a beach (or cliffs) and sometimes a harbour;
 * - hillside: hills rising behind the plot and the land falling away in front (the view);
 * - mountain: steep slopes all round, pines up to the tree line, then rock and snow.
 *
 * Each plot has its own seed, so two plots of the same kind still look different.
 *
 * Everything is generated from fixed seeds, so a plot always looks the same, in the plan
 * and in 3D.
 */

import { Vec2 } from "./geometry";
import type { WallMaterial } from "./model";
import { type Plot, type Setting, groundHeight } from "./plot";

/** The street runs along the front of the plot, between these plan y values. */
export const STREET = { from: -8, to: -1, center: -4.5 } as const;

export interface Lake {
  /** A lake has reeds; a river is a long, narrow band; the sea fills the horizon. */
  kind: "lake" | "river" | "sea";
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
  /** A round tree's look, when it is not left to chance (an orchard's apples). */
  look?: "plain" | "blossom" | "apple";
}

/** What the ground is, where it is not plain grass. */
export type Surface = "grass" | "sand" | "field1" | "field2" | "field3" | "snow";

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
  /** What covers the ground at a plan point. */
  surface(x: number, y: number): Surface;
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

/** A number from a plot's id, to seed its scenery. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The original three plots keep the seeds they always had, so they look the same. */
const ORIGINAL_SEED: Record<string, number> = { suburban: 11, lakeside: 22, hillside: 33 };

const FACADES: WallMaterial[] = ["Plaster", "Wood", "FaluRed", "Brick"];

function makeScenery(plot: Plot): Scenery {
  const { width: w, depth: d, setting } = plot;
  const original = plot.id in ORIGINAL_SEED;
  const rnd = random(original ? ORIGINAL_SEED[plot.id] + Math.round(w * 7 + d) : hash(plot.id));
  // A plot's own variations (drawn only for new plots, so the original ones stay the same).
  const vary = original ? () => 0.5 : random(hash(`${plot.id}:shape`));

  // Water.
  let lake: Lake | null = null;
  if (setting === "lakeside")
    lake = original
      ? { kind: "lake", center: new Vec2(w / 2, d + 6 + 18), rx: 36, ry: 18, level: -0.35 }
      : { kind: "lake", center: new Vec2(w / 2 + (vary() - 0.5) * w * 0.6, d + 6 + 14 + vary() * 8), rx: 28 + vary() * 14, ry: 14 + vary() * 6, level: -0.35 };
  if (setting === "riverside") lake = { kind: "river", center: new Vec2(w / 2, d + 13 + vary() * 4), rx: 260, ry: 6 + vary() * 3, level: -0.5 };
  if (setting === "seaside") lake = { kind: "sea", center: new Vec2(w / 2, d + 8 + vary() * 4 + 120), rx: 520, ry: 120, level: plot.id === "clifftop" ? -2.5 : -0.6 };
  // Water stays below a plot that slopes down towards it.
  if (lake && plot.terrain) {
    const back = Math.min(groundHeight(plot, 0, plot.depth), groundHeight(plot, plot.width, plot.depth), groundHeight(plot, plot.width / 2, plot.depth));
    lake.level = Math.min(lake.level, back - 0.7);
  }
  const beach = setting === "seaside" && plot.id !== "clifftop";
  const jetty: Jetty | null =
    setting === "lakeside" || plot.id === "harbour"
      ? { from: new Vec2(w / 2 + 6, d + 3), to: new Vec2(w / 2 + 6, d + (setting === "lakeside" ? 16 : 22)), width: plot.id === "harbour" ? 2.4 : 1.6 }
      : null;

  // How hilly: some plots of a kind are flatter or steeper than others.
  const relief = original ? 1 : 0.7 + vary() * 0.6;
  // Farm fields run in long stripes at an angle.
  const fieldAngle = vary() * Math.PI;

  // The landscape away from the flat area, before blending.
  const landscape = (x: number, y: number): number => {
    switch (setting) {
      case "suburban":
        return 0.9 * relief * bumps(x, y);
      case "town":
        return 0.3 * bumps(x, y);
      case "lakeside":
        // Low ground towards the water, a rise on either side of the lake.
        return 0.7 * relief * bumps(x, y) + Math.max(0, Math.abs(x - w / 2) - 40) * 0.12;
      case "riverside":
        return 0.6 * relief * bumps(x, y) + Math.max(0, y - d - 25) * 0.06;
      case "forest":
        return 1.3 * relief * bumps(x, y);
      case "farmland":
        return 0.5 * relief * bumps(x, y);
      case "seaside":
        // Dunes or a headland by the sea, rising inland.
        return (plot.id === "clifftop" ? 3 : 0.8) * bumps(x, y) + (plot.id === "clifftop" ? 2.5 : 0) + Math.max(0, -y + STREET.from) * 0.08;
      case "hillside": {
        const k = relief;
        if (y > d) return (y - d) * 0.42 * k + 1.6 * bumps(x, y) + Math.max(0, y - d - 25) * 0.25 * k; // hills behind
        if (y < STREET.from) return (y - STREET.from) * 0.55 * k + 0.8 * bumps(x, y); // the view: the land falls away
        return 0.8 * bumps(x, y);
      }
      case "mountain": {
        // Steep, but levelling off before the edge of the world, so no cliffs show.
        const cap = (v: number, top: number) => top * Math.tanh(v / top);
        const sides = cap(Math.max(0, Math.abs(x - w / 2) - w / 2 - 12) * 0.45, 22);
        if (y > d) return cap((y - d) * 0.75 * relief + Math.max(0, y - d - 20) * 0.5, 40) + 3 * bumps(x, y) + sides;
        if (y < STREET.from) return cap((y - STREET.from) * 0.5, 14) + 1.5 * bumps(x, y) + sides;
        return 1.5 * bumps(x, y) + sides;
      }
    }
  };

  const height = (x: number, y: number): number => {
    // The plot's own ground (zero on a flat plot), carried on into the surroundings.
    let h = groundHeight(plot, x, y) + landscape(x, y) * smoothstep(0, 14, flatDistance(plot, x, y));
    if (lake) {
      // Carve the bed, with a beach (or a bank) sloping into the water: for a lake over a
      // share of its size, for a river or the sea over a few metres from the water's edge.
      const e = lakeE(lake, x, y);
      const bed = lake.level - 0.25 - 1.4 * Math.max(0, 1 - e);
      if (lake.kind === "lake") {
        if (e < 1.35) h = e < 1 ? bed : bed + (h - bed) * smoothstep(1, 1.35, e);
      } else {
        const fromEdge = (Math.sqrt(e) - 1) * Math.min(lake.rx, lake.ry);
        const shore = lake.kind === "sea" ? 6 : 2.5;
        if (fromEdge < shore) h = e < 1 ? Math.max(bed, lake.level - 3) : bed + (h - bed) * smoothstep(0, shore, fromEdge);
      }
    }
    return h;
  };

  const surface = (x: number, y: number): Surface => {
    const h = height(x, y);
    if (lake) {
      const e = lakeE(lake, x, y);
      const fromEdge = (Math.sqrt(e) - 1) * Math.min(lake.rx, lake.ry);
      const sandy = lake.kind === "lake" ? h < lake.level + 0.45 && e < 1.6 : lake.kind === "river" ? fromEdge < 1.5 : beach && fromEdge < 10;
      if (e >= 1 && sandy) return "sand";
    }
    if (setting === "mountain" && h > 18 + 2 * bumps(x * 2, y * 2)) return "snow";
    if (setting === "farmland" && flatDistance(plot, x, y) > 5) {
      const along = x * Math.cos(fieldAngle) + y * Math.sin(fieldAngle);
      const band = Math.floor((along + 1000) / 14) % 4;
      if (band < 3) return (["field1", "field2", "field3"] as const)[band];
    }
    return "grass";
  };

  // Neighbours' houses.
  const neighbors: Neighbor[] = [];
  const house = (at: Vec2, width = 8 + rnd() * 3, depth = 7 + rnd() * 2, facade = FACADES[Math.floor(rnd() * FACADES.length)]) =>
    neighbors.push({ at, width, depth, facade, roof: Math.floor(rnd() * 4) });
  if (setting === "suburban" || setting === "lakeside") {
    const spots =
      setting === "suburban"
        ? [new Vec2(-w / 2 - 2, d / 2), new Vec2(w + w / 2 + 2, d / 2), new Vec2(w * 0.1, STREET.from - 10), new Vec2(w * 0.9 + 4, STREET.from - 10), new Vec2(-w - 6, STREET.from - 10)]
        : [new Vec2(-w / 2 - 4, d / 2 - 4)];
    // (Drawn in this order so the original plots keep their neighbours.)
    for (const at of spots) {
      const [width, depth, facade, roof] = [8 + rnd() * 3, 7 + rnd() * 2, FACADES[Math.floor(rnd() * FACADES.length)], Math.floor(rnd() * 4)];
      neighbors.push({ at, width, depth, facade, roof });
    }
  } else if (setting === "town") {
    for (const y of [d * 0.25, d * 0.75]) {
      house(new Vec2(-6, y), 9, 8);
      house(new Vec2(w + 6, y), 9, 8);
    }
    for (let x = -36; x <= w + 36; x += 12) house(new Vec2(x, STREET.from - 9), 10, 9);
    for (const x of [w / 2 - 12, w / 2, w / 2 + 12]) house(new Vec2(x, d + 9), 10, 8);
  } else if (setting === "farmland") {
    house(new Vec2(w + 18, d * 0.6), 15, 9, "FaluRed"); // the barn
    house(new Vec2(-13, d * 0.4), 9, 8, "Wood"); // the farmhouse
  } else if (setting === "riverside" || plot.id === "harbour") {
    house(new Vec2(-w / 2 - 4, d / 2 - 2));
    if (plot.id === "harbour") house(new Vec2(w + 10, d - 3), 7, 6, "FaluRed");
  } else if (setting === "forest") {
    house(new Vec2(-24, d + 12), 7, 6, "Wood");
  }

  // Keep scenery off the plot, the street, the lake, the jetty and the neighbours' houses.
  const free = (p: Vec2, clearance: number) => {
    if (p.x > -clearance - 1 && p.x < w + clearance + 1 && p.y > -clearance - 1 && p.y < d + clearance + 1) return false;
    if (p.y > STREET.from - 2 - clearance && p.y < STREET.to + 1 + clearance) return false;
    if (lake && lakeE(lake, p.x, p.y) < 1.15) return false;
    if (jetty && Math.abs(p.x - jetty.from.x) < 3 && p.y > jetty.from.y - 2 && p.y < jetty.to.y + 2) return false;
    return !neighbors.some((n) => Math.abs(p.x - n.at.x) < n.width / 2 + 2 + clearance && Math.abs(p.y - n.at.y) < n.depth / 2 + 2 + clearance);
  };

  // Trees: how many, which kinds, and where they will not grow.
  const count: Record<Setting, number> = { suburban: 55, town: 22, lakeside: 80, riverside: 75, forest: 170, farmland: 30, seaside: 35, hillside: 95, mountain: 110 };
  const kindFor = (r: number): TreeKind => {
    switch (setting) {
      case "hillside":
        return r < 0.7 ? "pine" : r < 0.85 ? "round" : "bush";
      case "lakeside":
        return r < 0.4 ? "birch" : r < 0.75 ? "round" : r < 0.85 ? "pine" : "bush";
      case "riverside":
        return r < 0.45 ? "birch" : r < 0.8 ? "round" : "bush";
      case "forest":
        return r < 0.5 ? "pine" : r < 0.78 ? "birch" : r < 0.9 ? "round" : "bush";
      case "seaside":
        return r < 0.6 ? "pine" : r < 0.8 ? "bush" : "round";
      case "mountain":
        return r < 0.85 ? "pine" : "birch";
      case "farmland":
        return r < 0.7 ? "round" : r < 0.85 ? "birch" : "bush";
      default:
        return r < 0.55 ? "round" : r < 0.75 ? "birch" : "bush";
    }
  };
  const grows = (at: Vec2) => (setting === "mountain" ? height(at.x, at.y) < 15 : setting === "farmland" ? surface(at.x, at.y) === "grass" : true);
  const spacing = setting === "forest" ? 2.6 : 3.2;
  const trees: Tree[] = [];
  const area = { x0: -70, x1: w + 70, y0: -45, y1: d + 70 };
  // An orchard: rows of apple trees behind the garden.
  if (plot.id === "orchard")
    for (let y = d + 6; y < d + 40; y += 6)
      for (let x = -10; x < w + 10; x += 6) trees.push({ at: new Vec2(x + (y % 12 ? 3 : 0), y), kind: "round", size: 0.75, look: "apple" });
  for (let tries = 0; trees.length < count[setting] && tries < count[setting] * 40; tries++) {
    const at = new Vec2(area.x0 + rnd() * (area.x1 - area.x0), area.y0 + rnd() * (area.y1 - area.y0));
    if (!free(at, 1.5) || trees.some((t) => t.at.distance(at) < spacing)) continue;
    const r = rnd();
    const kind = kindFor(r);
    const size = 0.75 + rnd() * 0.6;
    if (!original && !grows(at)) continue;
    trees.push({ at, kind, size });
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
  const rockCount: Record<Setting, number> = { suburban: 8, town: 2, lakeside: 16, riverside: 14, forest: 25, farmland: 6, seaside: 30, hillside: 30, mountain: 50 };
  for (let tries = 0; rocks.length < rockCount[setting] && tries < rockCount[setting] * 40; tries++) {
    const at = lake && rnd() < 0.5 ? lakeShorePoint(lake, rnd) : new Vec2(area.x0 + rnd() * (area.x1 - area.x0), area.y0 + rnd() * (area.y1 - area.y0));
    if (!free(at, 0.5) && !(lake && Math.abs(lakeE(lake, at.x, at.y) - 1.1) < 0.12)) continue;
    rocks.push({ at, size: 0.4 + rnd() * 0.9 });
  }

  return { setting, lake, jetty, trees, rocks, neighbors, height, surface };
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
  if (t.look) return t.look;
  const v = Math.abs(Math.round(t.at.x * 13 + t.at.y * 7)) % 20;
  return v < 3 ? "blossom" : v < 7 ? "apple" : "plain";
}

/** Whether a plan point is under water. */
export function inLake(l: Lake, p: Vec2): boolean {
  return lakeE(l, p.x, p.y) < 1;
}
