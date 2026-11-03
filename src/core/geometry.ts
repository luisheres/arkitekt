/**
 * Small, dependency-free geometry helpers.
 *
 * Conventions:
 * - Floor plans use {@link Vec2} in meters, where `x` and `y` are the plan axes.
 * - 3D output uses {@link Vec3} with `y` pointing up. A plan point `(x, y)` at height
 *   `h` maps to `Vec3(x, h, y)`.
 */

/** Distance below which two plan points are considered the same (meters). */
export const SNAP_EPS = 0.01;

const EPSILON = 1.1920929e-7; // f32::EPSILON, matching the original model

export class Vec2 {
  static readonly ZERO = new Vec2(0, 0);

  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  static from(p: { x: number; y: number }): Vec2 {
    return new Vec2(p.x, p.y);
  }

  add(o: Vec2): Vec2 {
    return new Vec2(this.x + o.x, this.y + o.y);
  }
  sub(o: Vec2): Vec2 {
    return new Vec2(this.x - o.x, this.y - o.y);
  }
  scale(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s);
  }
  neg(): Vec2 {
    return new Vec2(-this.x, -this.y);
  }
  dot(o: Vec2): number {
    return this.x * o.x + this.y * o.y;
  }
  /** Z component of the 3D cross product; positive when `o` is counter-clockwise from `this`. */
  cross(o: Vec2): number {
    return this.x * o.y - this.y * o.x;
  }
  length(): number {
    return Math.sqrt(this.dot(this));
  }
  normalize(): Vec2 {
    const len = this.length();
    return len > EPSILON ? this.scale(1 / len) : Vec2.ZERO;
  }
  distance(o: Vec2): number {
    return this.sub(o).length();
  }
  /** Lift a plan point to 3D at the given height. */
  atHeight(h: number): Vec3 {
    return new Vec3(this.x, h, this.y);
  }
  toJSON(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
}

export class Vec3 {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number,
  ) {}

  add(o: Vec3): Vec3 {
    return new Vec3(this.x + o.x, this.y + o.y, this.z + o.z);
  }
  sub(o: Vec3): Vec3 {
    return new Vec3(this.x - o.x, this.y - o.y, this.z - o.z);
  }
  scale(s: number): Vec3 {
    return new Vec3(this.x * s, this.y * s, this.z * s);
  }
  dot(o: Vec3): number {
    return this.x * o.x + this.y * o.y + this.z * o.z;
  }
  cross(o: Vec3): Vec3 {
    return new Vec3(this.y * o.z - this.z * o.y, this.z * o.x - this.x * o.z, this.x * o.y - this.y * o.x);
  }
  length(): number {
    return Math.sqrt(this.dot(this));
  }
  normalize(): Vec3 {
    const len = this.length();
    return len > EPSILON ? this.scale(1 / len) : new Vec3(0, 1, 0);
  }
}

/** A non-indexed triangle list with flat per-vertex normals, ready to hand to a renderer. */
export class TriMesh {
  /** Flat xyz triples, three vertices per triangle. */
  readonly positions: number[] = [];
  /** Flat xyz triples, one normal per vertex. */
  readonly normals: number[] = [];

  /** Push a triangle; the normal follows the winding (counter-clockwise when seen from the front). */
  pushTri(a: Vec3, b: Vec3, c: Vec3): void {
    const n = b.sub(a).cross(c.sub(a)).normalize();
    for (const p of [a, b, c]) {
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(n.x, n.y, n.z);
    }
  }

  /** Push a triangle, flipping its winding if needed so the normal faces along `towards`. */
  pushTriFacing(a: Vec3, b: Vec3, c: Vec3, towards: Vec3): void {
    if (b.sub(a).cross(c.sub(a)).dot(towards) >= 0) this.pushTri(a, b, c);
    else this.pushTri(a, c, b);
  }

  /** Push a planar quad given in perimeter order, facing along `towards`. */
  pushQuadFacing(a: Vec3, b: Vec3, c: Vec3, d: Vec3, towards: Vec3): void {
    this.pushTriFacing(a, b, c, towards);
    this.pushTriFacing(a, c, d, towards);
  }

  triangleCount(): number {
    return this.positions.length / 9;
  }

  isEmpty(): boolean {
    return this.positions.length === 0;
  }

  /** The vertex at index `i`. */
  vertex(i: number): Vec3 {
    const p = this.positions;
    return new Vec3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  }

  /** Total surface area of all triangles. */
  area(): number {
    let sum = 0;
    for (let t = 0; t < this.triangleCount(); t++) {
      const [a, b, c] = [this.vertex(t * 3), this.vertex(t * 3 + 1), this.vertex(t * 3 + 2)];
      sum += b.sub(a).cross(c.sub(a)).length() * 0.5;
    }
    return sum;
  }
}

/** Signed area of a polygon; positive when the vertices are counter-clockwise. */
export function signedArea(poly: readonly Vec2[]): number {
  const n = poly.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += poly[i].cross(poly[(i + 1) % n]);
  return sum * 0.5;
}

/** Remove vertices that lie on the straight line between their neighbours. */
export function removeCollinear(poly: readonly Vec2[]): Vec2[] {
  const out = [...poly];
  let i = 0;
  while (out.length > 3 && i < out.length) {
    const n = out.length;
    const prev = out[(i + n - 1) % n];
    const cur = out[i];
    const next = out[(i + 1) % n];
    const d1 = cur.sub(prev).normalize();
    const d2 = next.sub(cur).normalize();
    if (Math.abs(d1.cross(d2)) < 1e-4 && d1.dot(d2) > 0) {
      out.splice(i, 1);
      i = Math.max(0, i - 1);
    } else {
      i += 1;
    }
  }
  return out;
}

/** True when segments `p1-p2` and `q1-q2` properly cross or touch. */
export function segmentsIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): boolean {
  const orient = (a: Vec2, b: Vec2, c: Vec2) => b.sub(a).cross(c.sub(a));
  const onSegment = (a: Vec2, b: Vec2, p: Vec2) =>
    p.x >= Math.min(a.x, b.x) - 1e-6 &&
    p.x <= Math.max(a.x, b.x) + 1e-6 &&
    p.y >= Math.min(a.y, b.y) - 1e-6 &&
    p.y <= Math.max(a.y, b.y) + 1e-6;
  const d1 = orient(q1, q2, p1);
  const d2 = orient(q1, q2, p2);
  const d3 = orient(p1, p2, q1);
  const d4 = orient(p1, p2, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  const eps = 1e-6;
  return (
    (Math.abs(d1) < eps && onSegment(q1, q2, p1)) ||
    (Math.abs(d2) < eps && onSegment(q1, q2, p2)) ||
    (Math.abs(d3) < eps && onSegment(p1, p2, q1)) ||
    (Math.abs(d4) < eps && onSegment(p1, p2, q2))
  );
}

/** True when no two non-adjacent edges of the closed polygon intersect. */
export function isSimplePolygon(poly: readonly Vec2[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

/**
 * Grow a counter-clockwise simple polygon outward by `distance` (mitered corners).
 * Collinear vertices are removed first. Intended for small offsets such as wall thickness.
 */
export function offsetPolygon(poly: readonly Vec2[], distance: number): Vec2[] {
  const p = removeCollinear(poly);
  const n = p.length;
  // Outward normal of an edge (CCW: rotate direction by -90°).
  const outward = (from: Vec2, to: Vec2) => {
    const d = to.sub(from).normalize();
    return new Vec2(d.y, -d.x);
  };
  return p.map((cur, i) => {
    const prev = p[(i + n - 1) % n];
    const next = p[(i + 1) % n];
    const n1 = outward(prev, cur);
    const n2 = outward(cur, next);
    const bisector = n1.add(n2).normalize();
    // Move along the bisector far enough that both edges shift by `distance`.
    const cosHalf = Math.max(bisector.dot(n1), 0.2);
    return cur.add(bisector.scale(distance / cosHalf));
  });
}

export type Tri = [number, number, number];

/**
 * Triangulate a simple polygon by ear clipping. Returns index triples into `poly`,
 * each wound counter-clockwise in plan coordinates. Works for either input winding.
 */
export function triangulate(poly: readonly Vec2[]): Tri[] {
  const n = poly.length;
  if (n < 3) return [];
  const idx = poly.map((_, i) => i);
  if (signedArea(poly) < 0) idx.reverse();
  const tris: Tri[] = [];
  let guard = 0;
  while (idx.length > 3 && guard < n * n) {
    guard += 1;
    const m = idx.length;
    let clipped = false;
    for (let i = 0; i < m; i++) {
      const ia = idx[(i + m - 1) % m];
      const ib = idx[i];
      const ic = idx[(i + 1) % m];
      const [a, b, c] = [poly[ia], poly[ib], poly[ic]];
      const convex = b.sub(a).cross(c.sub(b));
      if (convex <= 1e-7) {
        // Reflex or degenerate (collinear) corner. Drop collinear vertices outright.
        if (Math.abs(convex) <= 1e-7) {
          idx.splice(i, 1);
          clipped = true;
          break;
        }
        continue;
      }
      const containsOther = idx.some(
        (j) => j !== ia && j !== ib && j !== ic && pointInTriangle(poly[j], a, b, c),
      );
      if (!containsOther) {
        tris.push([ia, ib, ic]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) break; // Not a simple polygon; return what we have.
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

/** True when `p` is strictly inside the polygon (either winding), by ray casting. */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Closest point to `p` on segment `a-b`, as the distance along the segment from `a`. */
export function projectOntoSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = b.sub(a);
  const len = ab.length();
  if (len < 1e-9) return 0;
  return Math.min(Math.max(p.sub(a).dot(ab) / len, 0), len);
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = b.sub(a).cross(p.sub(a));
  const d2 = c.sub(b).cross(p.sub(b));
  const d3 = a.sub(c).cross(p.sub(c));
  return d1 >= 0 && d2 >= 0 && d3 >= 0;
}
