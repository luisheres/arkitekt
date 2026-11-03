/**
 * Roof and floor geometry generated from the house footprint.
 *
 * - Flat roofs work on any footprint.
 * - Gable and hip roofs need a rectangular footprint (at any rotation) in the MVP.
 */

import { TriMesh, Vec2, Vec3, offsetPolygon, removeCollinear, triangulate } from "./geometry";
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
  private constructor(
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
  const fp = house.footprint();
  if (!fp.ok) return err({ kind: "Footprint", error: fp.error });
  const eave = house.eaveHeight();
  const halfThickness = house.walls.reduce((m, w) => Math.max(m, w.thickness), 0) * 0.5;
  if (roof.style === "Flat") {
    return ok(flatRoof(offsetPolygon(fp.value, halfThickness + FLAT_ROOF_LIP), eave));
  }
  const rect = PlanRect.fromPolygon(fp.value);
  if (!rect) return err({ kind: "NeedsRectangle", style: roof.style });
  return ok(pitchedRoof(rect, eave, halfThickness, roof));
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
function pitchedRoof(rect: PlanRect, wallTop: number, halfThickness: number, roof: Roof): RoofGeometry {
  const [long, span, swap] = rect.oriented();
  const o = Math.max(roof.overhang, 0);
  const slope = Math.tan((roof.pitchDeg * Math.PI) / 180);
  const half = span * 0.5;
  // Roof height directly above the wall centerlines.
  const eave = wallTop + halfThickness * slope + ROOF_CLEARANCE;
  const ridgeH = eave + half * slope;
  const eaveOut = eave - o * slope; // eaves drop as they extend past the walls
  const p = (along: number, across: number, h: number) => rect.point(swap, along, across, h);

  const surface = new TriMesh();
  const gables = new TriMesh();

  if (roof.style === "Gable") {
    // Two slopes meeting at a ridge along the long side; overhang on all edges.
    for (const edge of [-o, span + o]) {
      surface.pushQuadFacing(p(-o, edge, eaveOut), p(long + o, edge, eaveOut), p(long + o, half, ridgeH), p(-o, half, ridgeH), UP);
    }
    // Wall infill at both short ends, from the wall top up to the roof: a thin band
    // (where the roof was raised to clear the walls) plus the triangle.
    for (const end of [0, long]) {
      const outSign = end === 0 ? -1 : 1;
      const out = p(end + outSign, half, eave).sub(p(end, half, eave));
      gables.pushQuadFacing(p(end, 0, wallTop), p(end, span, wallTop), p(end, span, eave), p(end, 0, eave), out);
      gables.pushTriFacing(p(end, 0, eave), p(end, span, eave), p(end, half, ridgeH), out);
    }
  } else {
    // Hip: four slopes; the ridge is shortened by half the span at each end.
    const r0 = Math.min(half, long * 0.5);
    const r1 = Math.max(long - half, long * 0.5);
    for (const edge of [-o, span + o]) {
      surface.pushQuadFacing(p(-o, edge, eaveOut), p(long + o, edge, eaveOut), p(r1, half, ridgeH), p(r0, half, ridgeH), UP);
    }
    surface.pushTriFacing(p(-o, -o, eaveOut), p(-o, span + o, eaveOut), p(r0, half, ridgeH), UP);
    surface.pushTriFacing(p(long + o, -o, eaveOut), p(long + o, span + o, eaveOut), p(r1, half, ridgeH), UP);
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
