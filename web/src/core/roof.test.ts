import { describe, expect, it } from "vitest";
import { Vec2 } from "./geometry";
import { House, type RoofStyle } from "./model";
import { FLAT_ROOF_LIP, ROOF_CLEARANCE, type RoofGeometry, buildRoof, coveringArea } from "./roof";

const v = (x: number, y: number) => new Vec2(x, y);
const rad = (deg: number) => (deg * Math.PI) / 180;

function house(corners: Vec2[], style: RoofStyle, pitch: number, overhang: number): House {
  const h = new House();
  h.addWallLoop(corners, 3, "Brick");
  h.roof = { style, pitchDeg: pitch, overhang, material: "Tiles" };
  return h;
}

const rect = (w: number, d: number) => [v(0, 0), v(w, 0), v(w, d), v(0, d)];

function roofOf(h: House): RoofGeometry {
  const r = buildRoof(h);
  if (!r.ok) throw new Error(`no roof: ${JSON.stringify(r.error)}`);
  return r.value;
}

describe("roofs", () => {
  it("gable area and ridge height", () => {
    // 10 x 6, 45 degrees, no overhang: each slope is 10 x (3 * sqrt 2).
    const g = roofOf(house(rect(10, 6), "Gable", 45, 0));
    expect(coveringArea(g)).toBeCloseTo(2 * 10 * 3 * Math.SQRT2, 3);
    // Raised so it clears the wall's outer face: half thickness * tan 45 + clearance.
    const lift = 0.125 + ROOF_CLEARANCE;
    expect(g.peakHeight).toBeCloseTo(3 + lift + 3, 4);
    // Each gable end: a 6 x lift band plus a triangle with base 6 and height 3.
    expect(g.gables.area()).toBeCloseTo(2 * (6 * lift + 9), 3);
  });

  it("ridge follows the long side regardless of orientation", () => {
    const a = roofOf(house(rect(10, 6), "Gable", 30, 0.3));
    const b = roofOf(house(rect(6, 10), "Gable", 30, 0.3));
    expect(a.peakHeight).toBeCloseTo(b.peakHeight, 4);
    expect(coveringArea(a)).toBeCloseTo(coveringArea(b), 3);
  });

  it("hip roof area matches plan area over cos(pitch)", () => {
    // For equal-pitch hip roofs, covering area = plan area / cos(pitch).
    const g = roofOf(house(rect(10, 6), "Hip", 30, 0));
    expect(coveringArea(g)).toBeCloseTo(60 / Math.cos(rad(30)), 2);
    expect(g.gables.isEmpty()).toBe(true);
  });

  it("roof clears the outer wall face", () => {
    const h = house(rect(10, 6), "Gable", 38, 0.5);
    const g = roofOf(h);
    const t = h.walls[0].thickness;
    const slope = Math.tan(rad(38));
    // The roof surface above the outer face of the long wall (y = -t/2) must be above
    // the wall top. Roof height falls linearly toward the eave at y = -overhang.
    const ys = g.surface.positions.filter((_, i) => i % 3 === 1);
    const eaveOut = Math.min(...ys);
    const atOuterFace = eaveOut + (0.5 - t * 0.5) * slope;
    expect(atOuterFace).toBeGreaterThan(h.eaveHeight());
  });

  it("surface normals point up", () => {
    for (const style of ["Gable", "Hip", "Flat"] as const) {
      const g = roofOf(house(rect(9, 7), style, 35, 0.5));
      const ny = g.surface.normals.filter((_, i) => i % 3 === 1);
      expect(ny.every((y) => y > 0), style).toBe(true);
    }
  });

  it("a rotated rectangle supports a gable", () => {
    const s = Math.SQRT1_2;
    const corners = [v(0, 0), v(8 * s, 8 * s), v(8 * s - 5 * s, 8 * s + 5 * s), v(-5 * s, 5 * s)];
    expect(buildRoof(house(corners, "Gable", 30, 0)).ok).toBe(true);
  });

  it("an L-shape needs a flat roof", () => {
    const l = [v(0, 0), v(10, 0), v(10, 4), v(4, 4), v(4, 8), v(0, 8)];
    const gable = buildRoof(house(l, "Gable", 30, 0));
    expect(!gable.ok && gable.error).toEqual({ kind: "NeedsRectangle", style: "Gable" });
    // The slab covers the walls plus a lip: the L grown by 0.125 + 0.1.
    const flat = roofOf(house(l, "Flat", 0, 0));
    const d = 0.125 + FLAT_ROOF_LIP;
    const expected = 56 + 36 * d + 4 * d * d; // perimeter 36, net 4 convex corners
    expect(coveringArea(flat)).toBeCloseTo(expected, 3);
  });
});
