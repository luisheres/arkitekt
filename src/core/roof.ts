/**
 * Roof and floor geometry generated from the house footprint.
 *
 * - Flat roofs work on any footprint.
 * - Gable and hip roofs work on any footprint with square corners (at any rotation): a
 *   rectangle gets one roof; an L, T, U or other shape is split into a main block and
 *   wings, each wing's ridge running out from the block it joins, its roof carried on
 *   into that block's until the two meet in a valley.
 */

import { TriMesh, Vec2, Vec3, offsetPolygon, pointInPolygon, removeCollinear, triangulate } from "./geometry";
import type { FootprintError, House, Roof, RoofStyle } from "./model";
import { type Result, err, ok } from "./result";

/** Thickness of a flat roof slab, in meters. */
export const FLAT_ROOF_THICKNESS = 0.2;
/** How far a flat roof extends past the outer face of the walls, in meters. */
export const FLAT_ROOF_LIP = 0.1;
/** Height of the floor slab top above the ground, in meters. */
export const FLOOR_SLAB_HEIGHT = 0.05;
/** Gap between the top outer edge of a wall and the underside of a pitched roof. */
export const ROOF_CLEARANCE = 0.02;

export type RoofError =
  | { kind: "NoRoof" }
  | { kind: "Footprint"; error: FootprintError }
  | { kind: "NeedsRectangle"; style: RoofStyle };

export interface RoofGeometry {
  /** The roof covering (shingles, tiles, ...). */
  surface: TriMesh;
  /** Wall-coloured parts: triangular infill under a gable, or the fascia of a flat roof. */
  gables: TriMesh;
  /** Highest point of the roof above the ground. */
  peakHeight: number;
}

/** Area of roof covering to pay for. Excludes the slab's underside. */
export function coveringArea(g: RoofGeometry): number {
  return g.surface.area();
}

const UP = new Vec3(0, 1, 0);

/** A rectangle in plan view: `origin` corner plus two perpendicular unit axes. */
class PlanRect {
  constructor(
    readonly origin: Vec2,
    readonly u: Vec2,
    readonly v: Vec2,
    readonly lenU: number,
    readonly lenV: number,
  ) {}

  /** Recognise a (possibly rotated) rectangle; collinear vertices are ignored. */
  static fromPolygon(poly: readonly Vec2[]): PlanRect | null {
    const p = removeCollinear(poly);
    if (p.length !== 4) return null;
    for (let i = 0; i < 4; i++) {
      const a = p[(i + 1) % 4].sub(p[i]).normalize();
      const b = p[(i + 2) % 4].sub(p[(i + 1) % 4]).normalize();
      if (Math.abs(a.dot(b)) > 1e-3) return null;
    }
    const eU = p[1].sub(p[0]);
    const eV = p[3].sub(p[0]);
    return new PlanRect(p[0], eU.normalize(), eV.normalize(), eU.length(), eV.length());
  }

  /**
   * Map local `(along, across)` + height to world space. When `swap` is true the
   * local axes are exchanged so `along` always follows the longer side.
   */
  point(swap: boolean, along: number, across: number, h: number): Vec3 {
    const [s, t] = swap ? [across, along] : [along, across];
    return this.origin.add(this.u.scale(s)).add(this.v.scale(t)).atHeight(h);
  }

  /** Returns [long side, short side, swap flag]. */
  oriented(): [number, number, boolean] {
    return this.lenU >= this.lenV ? [this.lenU, this.lenV, false] : [this.lenV, this.lenU, true];
  }
}

/** Generate the roof for a house. */
export function buildRoof(house: House): Result<RoofGeometry, RoofError> {
  const roof = house.roof;
  if (!roof) return err({ kind: "NoRoof" });
  // The roof sits on the top storey.
  const top = house.topLevel();
  const fp = house.footprint(top);
  if (!fp.ok) return err({ kind: "Footprint", error: fp.error });
  const eave = house.levelBase(top) + house.eaveHeight(top);
  const halfThickness = house.walls.reduce((m, w) => Math.max(m, w.thickness), 0) * 0.5;
  if (roof.style === "Flat") {
    return ok(flatRoof(offsetPolygon(fp.value, halfThickness + FLAT_ROOF_LIP), eave));
  }
  const rect = PlanRect.fromPolygon(fp.value);
  if (rect) return ok(pitchedRoof(rect, eave, halfThickness, roof));
  const blocks = roofBlocks(fp.value, roof.style === "Hip");
  if (!blocks) return err({ kind: "NeedsRectangle", style: roof.style });
  const surface = new TriMesh();
  const gables = new TriMesh();
  let peak = 0;
  for (const b of blocks) {
    const g = pitchedRoof(b.rect, eave, halfThickness, roof, b.ends, b.alongU);
    surface.positions.push(...g.surface.positions);
    surface.normals.push(...g.surface.normals);
    gables.positions.push(...g.gables.positions);
    gables.normals.push(...g.gables.normals);
    peak = Math.max(peak, g.peakHeight);
  }
  return ok({ surface, gables, peakHeight: peak });
}

/** A roof block: a rectangle, which way its ridge runs, and how its two ends finish. */
interface RoofBlock {
  rect: PlanRect;
  /** The ridge runs along the rectangle's u axis. */
  alongU: boolean;
  ends: [RoofEnd, RoofEnd];
}

type BlockSide = "x0" | "x1" | "y0" | "y1";

/**
 * Split a footprint with square corners into roof blocks: the biggest rectangle that fits
 * is the main block; the rest is split into wings, each with its ridge running out from the
 * blocks it joins and its roof carried on into theirs. Null when the footprint has walls at
 * other angles.
 */
function roofBlocks(poly: readonly Vec2[], hip: boolean): RoofBlock[] | null {
  const pts = removeCollinear(poly);
  if (pts.length < 4) return null;
  // A frame along the first wall; every wall must run along one of its axes.
  const u = pts[1].sub(pts[0]).normalize();
  const v = new Vec2(-u.y, u.x);
  const o = pts[0];
  const local = pts.map((p) => new Vec2(p.sub(o).dot(u), p.sub(o).dot(v)));
  for (let i = 0; i < local.length; i++) {
    const d = local[(i + 1) % local.length].sub(local[i]);
    if (Math.abs(d.x) > 1e-4 && Math.abs(d.y) > 1e-4) return null;
  }
  const uniq = (vals: number[]) => [...new Set(vals.map((x) => Math.round(x * 1e4) / 1e4))].sort((a, b) => a - b);
  const xs = uniq(local.map((p) => p.x));
  const ys = uniq(local.map((p) => p.y));
  const [nx, ny] = [xs.length - 1, ys.length - 1];
  // Which grid cells are inside the house, and not yet under a block.
  const free: boolean[][] = [];
  for (let i = 0; i < nx; i++) {
    free.push([]);
    for (let j = 0; j < ny; j++) free[i].push(pointInPolygon(new Vec2((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2), local));
  }
  type Cells = { i0: number; i1: number; j0: number; j1: number };
  /** The largest rectangle (by area) made only of free cells. */
  const largest = (): Cells | null => {
    let best: Cells | null = null;
    let bestArea = 0;
    for (let i0 = 0; i0 < nx; i0++)
      for (let j0 = 0; j0 < ny; j0++) {
        if (!free[i0][j0]) continue;
        let jMax = ny;
        for (let i1 = i0; i1 < nx && free[i1][j0]; i1++) {
          let j = j0;
          while (j < jMax && free[i1][j]) j++;
          jMax = j;
          const area = (xs[i1 + 1] - xs[i0]) * (ys[jMax] - ys[j0]);
          if (area > bestArea + 1e-9) [best, bestArea] = [{ i0, i1, j0, j1: jMax - 1 }, area];
        }
      }
    return best;
  };
  const blocks: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (let guard = 0; guard < 40; guard++) {
    const c = largest();
    if (!c) break;
    for (let i = c.i0; i <= c.i1; i++) for (let j = c.j0; j <= c.j1; j++) free[i][j] = false;
    blocks.push({ x0: xs[c.i0], x1: xs[c.i1 + 1], y0: ys[c.j0], y1: ys[c.j1 + 1] });
  }
  if (!blocks.length || free.some((col) => col.some((f) => f))) return null;
  const toWorld = (x: number, y: number) => o.add(u.scale(x)).add(v.scale(y));
  const out: RoofBlock[] = [];
  blocks.forEach((b, k) => {
    const touching = (side: BlockSide) =>
      blocks.slice(0, k).filter((other) =>
        side === "x0" ? Math.abs(other.x1 - b.x0) < 1e-6 : side === "x1" ? Math.abs(other.x0 - b.x1) < 1e-6 : side === "y0" ? Math.abs(other.y1 - b.y0) < 1e-6 : Math.abs(other.y0 - b.y1) < 1e-6,
      );
    // How long a side is shared with the blocks before it (the ones it joins).
    const shared = (side: BlockSide) =>
      touching(side).reduce((sum, other) => {
        const overlap = side === "x0" || side === "x1" ? Math.min(other.y1, b.y1) - Math.max(other.y0, b.y0) : Math.min(other.x1, b.x1) - Math.max(other.x0, b.x0);
        return sum + Math.max(overlap, 0);
      }, 0);
    // How far its roof runs on into the blocks it joins: the widest one's half-span.
    const reach = (side: BlockSide) => touching(side).reduce((m, other) => Math.max(m, Math.min(other.x1 - other.x0, other.y1 - other.y0) / 2), 0);
    // The main block runs along its longer side; a wing runs out from where it joins.
    const alongU = k === 0 ? b.x1 - b.x0 >= b.y1 - b.y0 : shared("x0") + shared("x1") >= shared("y0") + shared("y1");
    const [s0, s1]: [BlockSide, BlockSide] = alongU ? ["x0", "x1"] : ["y0", "y1"];
    const end = (side: BlockSide): RoofEnd => (shared(side) > 1e-6 ? { kind: "open", extend: reach(side) } : { kind: hip ? "hip" : "gable" });
    out.push({ rect: new PlanRect(toWorld(b.x0, b.y0), u, v, b.x1 - b.x0, b.y1 - b.y0), alongU, ends: [end(s0), end(s1)] });
  });
  return out;
}

/**
 * The outline of the floor slab on top of a storey that has another storey above it:
 * the inside faces of the storey's outer walls. The walls themselves carry on past the
 * slab, so the floor structure never shows on the facade. Where the storey above is
 * smaller, the slab is a flat roof (a terrace).
 */
export function slabOutline(house: House, level: number): Vec2[] | null {
  const fp = house.footprint(level);
  if (!fp.ok) return null;
  const halfThickness = house.wallsOn(level).reduce((m, w) => (w.boundary ? m : Math.max(m, w.thickness)), 0) * 0.5;
  return offsetPolygon(fp.value, -halfThickness);
}

/** A slab on top of the walls covering `outline` (the footprint grown past the walls). */
function flatRoof(outline: readonly Vec2[], eave: number): RoofGeometry {
  const top = eave + FLAT_ROOF_THICKNESS;
  const surface = new TriMesh();
  for (const [a, b, c] of triangulate(outline)) {
    surface.pushTriFacing(outline[a].atHeight(top), outline[b].atHeight(top), outline[c].atHeight(top), UP);
  }
  // Edge band (fascia) around the slab. The outline is CCW, so the outward normal of
  // edge a->b is (dy, -dx). The fascia is wall-coloured trim, so it goes with the gables.
  const gables = new TriMesh();
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const d = b.sub(a).normalize();
    const out = new Vec3(d.y, 0, -d.x);
    gables.pushQuadFacing(a.atHeight(eave), b.atHeight(eave), b.atHeight(top), a.atHeight(top), out);
  }
  return { surface, gables, peakHeight: top };
}

/**
 * Pitched roofs are generated over the wall centerlines (`rect`), but raised so the roof
 * clears the walls' outer faces, `halfThickness` beyond the centerline.
 */
/**
 * How each end of a roof block is finished: a gable or hip at the outside of the house, or
 * open where the block runs on into another block's roof, carried on `extend` metres.
 */
export type RoofEnd = { kind: "gable" | "hip" } | { kind: "open"; extend: number };

function pitchedRoof(rect: PlanRect, wallTop: number, halfThickness: number, roof: Roof, ends?: [RoofEnd, RoofEnd], alongU?: boolean): RoofGeometry {
  const [long, span, swap]: [number, number, boolean] = alongU === undefined ? rect.oriented() : alongU ? [rect.lenU, rect.lenV, false] : [rect.lenV, rect.lenU, true];
  const o = Math.max(roof.overhang, 0);
  const style: "gable" | "hip" = roof.style === "Hip" ? "hip" : "gable";
  const [e0, e1]: [RoofEnd, RoofEnd] = ends ?? [{ kind: style }, { kind: style }];
  // Where the roof starts and stops along the ridge direction.
  const a0 = e0.kind === "open" ? -e0.extend : -o;
  const a1 = e1.kind === "open" ? long + e1.extend : long + o;
  const slope = Math.tan((roof.pitchDeg * Math.PI) / 180);
  const half = span * 0.5;
  // Roof height directly above the wall centerlines.
  const eave = wallTop + halfThickness * slope + ROOF_CLEARANCE;
  const ridgeH = eave + half * slope;
  const eaveOut = eave - o * slope; // eaves drop as they extend past the walls
  const p = (along: number, across: number, h: number) => rect.point(swap, along, across, h);

  const surface = new TriMesh();
  const gables = new TriMesh();

  // The ridge runs between r0 and r1: to the end at a gable or open end, short of it at a hip.
  const r0 = e0.kind === "hip" ? Math.min(half, long * 0.5) : a0;
  const r1 = e1.kind === "hip" ? Math.max(long - half, long * 0.5) : a1;
  for (const edge of [-o, span + o]) {
    surface.pushQuadFacing(p(a0, edge, eaveOut), p(a1, edge, eaveOut), p(r1, half, ridgeH), p(r0, half, ridgeH), UP);
  }
  if (e0.kind === "hip") surface.pushTriFacing(p(-o, -o, eaveOut), p(-o, span + o, eaveOut), p(r0, half, ridgeH), UP);
  if (e1.kind === "hip") surface.pushTriFacing(p(long + o, -o, eaveOut), p(long + o, span + o, eaveOut), p(r1, half, ridgeH), UP);
  // Wall infill at gable ends, from the wall top up to the roof: a thin band (where the
  // roof was raised to clear the walls) plus the triangle.
  const gableEnds: [number, RoofEnd][] = [
    [0, e0],
    [long, e1],
  ];
  for (const [at, e] of gableEnds) {
    if (e.kind !== "gable") continue;
    const outSign = at === 0 ? -1 : 1;
    const out = p(at + outSign, half, eave).sub(p(at, half, eave));
    gables.pushQuadFacing(p(at, 0, wallTop), p(at, span, wallTop), p(at, span, eave), p(at, 0, eave), out);
    gables.pushTriFacing(p(at, 0, eave), p(at, span, eave), p(at, half, ridgeH), out);
  }

  return { surface, gables, peakHeight: ridgeH };
}

/** The floor slab: the footprint triangulated just above the ground. */
export function buildFloor(house: House): Result<TriMesh, FootprintError> {
  const fp = house.footprint();
  if (!fp.ok) return fp;
  const poly = fp.value;
  const mesh = new TriMesh();
  for (const [a, b, c] of triangulate(poly)) {
    mesh.pushTriFacing(
      poly[a].atHeight(FLOOR_SLAB_HEIGHT),
      poly[b].atHeight(FLOOR_SLAB_HEIGHT),
      poly[c].atHeight(FLOOR_SLAB_HEIGHT),
      UP,
    );
  }
  return ok(mesh);
}

/** The roof's height above a plan point (the highest roof surface over it), or null where there is none. */
export function roofHeightAt(g: RoofGeometry, p: Vec2): number | null {
  const pos = g.surface.positions;
  let best: number | null = null;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(i, i + 9);
    // Barycentric coordinates in plan (x, z).
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-12) continue;
    const l1 = ((bz - cz) * (p.x - cx) + (cx - bx) * (p.y - cz)) / det;
    const l2 = ((cz - az) * (p.x - cx) + (ax - cx) * (p.y - cz)) / det;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const h = l1 * ay + l2 * by + l3 * cy;
    if (best === null || h > best) best = h;
  }
  return best;
}
