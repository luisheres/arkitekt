import { describe, expect, it } from "vitest";
import { squarify } from "./treemap";

describe("squarify", () => {
  const rect = { x: 10, y: 20, w: 600, h: 400 };
  const values = [6, 6, 4, 3, 2, 2, 1];

  it("gives each value an area in proportion, inside the rectangle", () => {
    const rects = squarify(values, rect);
    const total = values.reduce((a, b) => a + b, 0);
    rects.forEach((r, i) => {
      expect(r.w * r.h).toBeCloseTo((values[i] / total) * rect.w * rect.h, 6);
      expect(r.x).toBeGreaterThanOrEqual(rect.x - 1e-9);
      expect(r.y).toBeGreaterThanOrEqual(rect.y - 1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(rect.x + rect.w + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(rect.y + rect.h + 1e-9);
    });
  });

  it("does not overlap rectangles", () => {
    const rects = squarify(values, rect);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const [a, b] = [rects[i], rects[j]];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(ox <= 1e-9 || oy <= 1e-9).toBe(true);
      }
  });

  it("keeps rectangles reasonably square", () => {
    for (const r of squarify(values, rect)) expect(Math.max(r.w / r.h, r.h / r.w)).toBeLessThan(3);
  });

  it("gives nothing to zero values, and copes with no values", () => {
    expect(squarify([3, 0, 1], rect)[1]).toMatchObject({ w: 0, h: 0 });
    expect(squarify([], rect)).toEqual([]);
    expect(squarify([0, 0], rect).every((r) => r.w === 0)).toBe(true);
  });
});
