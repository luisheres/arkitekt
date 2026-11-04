/**
 * The landscape around the plot, drawn from above for the plan: grass shaded by the lie
 * of the land (hills catch the light from the top left), sand and water at the lake.
 * Rendered once per plot into an image the plan draws underneath everything else.
 */

import { type Plot, STREET, inLake, sceneryFor } from "../core";
import { Vec2 } from "../core";

export interface Backdrop {
  url: string;
  /** Plan area covered: x0..x1, y0..y1. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const cache = new Map<string, Backdrop>();

export function backdropFor(plot: Plot): Backdrop {
  const key = `${plot.setting}:${plot.width}x${plot.depth}`;
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
  for (let j = 0; j < h; j++) {
    // The plan shows +x to the left and +y up: column 0 is x1, row 0 is y1.
    const y = y1 - j * res;
    for (let i = 0; i < w; i++) {
      const x = x1 - i * res;
      const z = s.height(x, y);
      // Hill shading from the slope.
      const dx = s.height(x + 1, y) - z;
      const dy = s.height(x, y + 1) - z;
      const shade = Math.max(-0.35, Math.min(0.35, (-dx * 0.7 + dy * 0.7) * 0.6));
      let [r, g, bl] = [118, 196, 82];
      if (z > 4) [r, g, bl] = [86, 160, 80];
      if (s.lake && inLake(s.lake, new Vec2(x, y))) [r, g, bl] = [108, 200, 240];
      else if (s.lake && z < s.lake.level + 0.45 && ((x - s.lake.center.x) / s.lake.rx) ** 2 + ((y - s.lake.center.y) / s.lake.ry) ** 2 < 1.6) [r, g, bl] = [240, 217, 160];
      const k = 1 + shade;
      const o = (j * w + i) * 4;
      img.data[o] = Math.min(255, r * k);
      img.data[o + 1] = Math.min(255, g * k);
      img.data[o + 2] = Math.min(255, bl * k);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  void STREET;
  return { url: canvas.toDataURL(), x0, x1, y0, y1 };
}
