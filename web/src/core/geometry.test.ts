import { describe, expect, it } from "vitest";
import { Vec2, isSimplePolygon, offsetPolygon, removeCollinear, signedArea, triangulate } from "./geometry";

const v = (x: number, y: number) => new Vec2(x, y);

const lShape = () => [v(0, 0), v(10, 0), v(10, 4), v(4, 4), v(4, 8), v(0, 8)];

const triArea = (poly: Vec2[]) =>
  triangulate(poly).reduce((s, [a, b, c]) => s + signedArea([poly[a], poly[b], poly[c]]), 0);

describe("geometry", () => {
  it("area sign follows winding", () => {
    expect(signedArea(lShape())).toBeCloseTo(56, 4);
    expect(signedArea(lShape().reverse())).toBeCloseTo(-56, 4);
  });

  it("triangulation covers area for both windings", () => {
    for (const poly of [lShape(), lShape().reverse()]) {
      expect(triangulate(poly)).toHaveLength(poly.length - 2);
      expect(triArea(poly)).toBeCloseTo(56, 3);
    }
  });

  it("triangulation handles collinear vertices", () => {
    expect(triArea([v(0, 0), v(5, 0), v(10, 0), v(10, 6), v(0, 6)])).toBeCloseTo(60, 3);
  });

  it("offset grows an L-shape uniformly", () => {
    const grown = offsetPolygon(lShape(), 0.5);
    expect(grown).toHaveLength(6);
    // Outer corner moves diagonally out, inner (reflex) corner moves diagonally in.
    expect(grown[0].distance(v(-0.5, -0.5))).toBeLessThan(1e-4);
    expect(grown[3].distance(v(4.5, 4.5))).toBeLessThan(1e-4);
    // An L with arms 10x4 and 4x8 grown by 0.5: 11x5 + 5x4 = 75.
    expect(signedArea(grown)).toBeCloseTo(75, 3);
  });

  it("detects self-intersection", () => {
    expect(isSimplePolygon([v(0, 0), v(4, 4), v(4, 0), v(0, 4)])).toBe(false);
    expect(isSimplePolygon(lShape())).toBe(true);
  });

  it("removes collinear vertices", () => {
    expect(removeCollinear([v(0, 0), v(5, 0), v(10, 0), v(10, 6), v(0, 6)])).toHaveLength(4);
  });
});
