/**
 * The landscape around the plot, drawn from above for the plan: grass shaded by the lie
 * of the land (hills catch the light from the top left), sand and water at the lake.
 * Rendered once per plot into an image the plan draws underneath everything else.
 */

import { type Plot, type Surface, sceneryFor } from "../core";

export interface Backdrop {
  url: string;
  /** Plan area covered: x0..x1, y0..y1. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const cache = new Map<string, Backdrop>();

/** Plan colours of what covers the ground (as in 3D). */
const COVER: Record<Exclude<Surface, "grass">, [number, number, number]> = {
  sand: [240, 217, 160],
  field1: [232, 207, 95],
  field2: [134, 196, 60],
  field3: [165, 122, 82],
  snow: [247, 251, 255],
};

export function backdropFor(plot: Plot): Backdrop {
  const key = plot.id;
  let b = cache.get(key);
  if (!b) cache.set(key, (b = draw(plot)));
  return b;
}

function draw(plot: Plot): Backdrop {
  const s = sceneryFor(plot);
  const [x0, x1, y0, y1] = [-90, plot.width + 90, -70, plot.depth + 90];
  const res = 0.5; // meters per pixel
  const w = Math.round((x1 - x0) / res);
  const h = Math.round((y1 - y0) / res);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  // Heights once, one pixel wider, for the hill shading.
  const heights = new Float32Array((w + 1) * (h + 1));
  for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) heights[j * (w + 1) + i] = s.height(x1 - i * res, y1 - j * res);
  for (let j = 0; j < h; j++) {
    // The plan shows +x to the left and +y up: column 0 is x1, row 0 is y1.
    const y = y1 - j * res;
    for (let i = 0; i < w; i++) {
      const x = x1 - i * res;
      const z = heights[j * (w + 1) + i];
      // Hill shading from the slope (light from the top left).
      const dx = heights[j * (w + 1) + i + 1] - z;
      const dy = heights[(j + 1) * (w + 1) + i] - z;
      const shade = Math.max(-0.35, Math.min(0.35, (dx * 0.7 - dy * 0.7) * 1.2));
      let [r, g, bl] = [118, 196, 82];
      if (z > 4) [r, g, bl] = [86, 160, 80];
      const wet = s.waterDistance(x, y);
      if (wet < 0) {
        // Deeper water is darker.
        const deep = Math.min(1, -wet / 12);
        [r, g, bl] = s.water?.kind === "sea" ? [84 - deep * 30, 176 - deep * 40, 232 - deep * 20] : [108 - deep * 30, 200 - deep * 40, 240 - deep * 20];
      } else {
        const cover = s.surface(x, y);
        if (cover !== "grass") [r, g, bl] = COVER[cover];
      }
      const k = wet < 0 ? 1 : 1 + shade;
      const o = (j * w + i) * 4;
      img.data[o] = Math.min(255, r * k);
      img.data[o + 1] = Math.min(255, g * k);
      img.data[o + 2] = Math.min(255, bl * k);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: canvas.toDataURL(), x0, x1, y0, y1 };
}
