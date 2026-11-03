/**
 * Hand-made example houses, used for the viewer and tests (and later for calibrating
 * the AI appraiser).
 */

import { Vec2 } from "./geometry";
import { House } from "./model";
import { type Plot, plotCenter } from "./plot";

export interface Sample {
  name: string;
  house: House;
}

/** All sample houses, centered on the given plot. */
export function allSamples(plot: Plot): Sample[] {
  return [
    { name: "Cottage", house: cottage(plot) },
    { name: "L-shaped modern", house: lShapedModern(plot) },
    { name: "Brick hip-roof", house: brickHip(plot) },
  ];
}

/**
 * Corners of a `w` x `d` rectangle centered on the plot, counter-clockwise starting at
 * the front-left (the front faces the low-y edge of the plot, i.e. the street).
 */
function centeredRect(plot: Plot, w: number, d: number): Vec2[] {
  const c = plotCenter(plot);
  const [x0, y0] = [c.x - w * 0.5, c.y - d * 0.5];
  return [new Vec2(x0, y0), new Vec2(x0 + w, y0), new Vec2(x0 + w, y0 + d), new Vec2(x0, y0 + d)];
}

/** A symmetric 10 x 7 m plastered cottage with a gable roof. */
export function cottage(plot: Plot): House {
  const h = new House();
  const [front, right, back, left] = h.addWallLoop(centeredRect(plot, 10, 7), 2.7, "Plaster");
  h.addDoor(front, 5, 1, 2.1);
  for (const x of [2, 8]) {
    h.addWindow(front, x, 1.4, 1.3, 0.9);
    h.addWindow(back, x, 1.4, 1.3, 0.9);
  }
  h.addWindow(back, 5, 1, 1.3, 0.9);
  h.addWindow(right, 3.5, 1.2, 1.3, 0.9);
  h.addWindow(left, 3.5, 1.2, 1.3, 0.9);
  h.roof = { style: "Gable", pitchDeg: 38, overhang: 0.5, material: "Tiles" };
  return h;
}

/** An L-shaped wooden house with a flat roof and wide windows. */
export function lShapedModern(plot: Plot): House {
  const c = plotCenter(plot);
  const [x0, y0] = [c.x - 6, c.y - 4.5];
  const corners = [
    new Vec2(x0, y0),
    new Vec2(x0 + 12, y0),
    new Vec2(x0 + 12, y0 + 5),
    new Vec2(x0 + 5, y0 + 5),
    new Vec2(x0 + 5, y0 + 9),
    new Vec2(x0, y0 + 9),
  ];
  const h = new House();
  const walls = h.addWallLoop(corners, 3.2, "Wood");
  h.addDoor(walls[0], 2.5, 1, 2.2);
  h.addWindow(walls[0], 7.5, 5, 2, 0.6);
  h.addWindow(walls[1], 2.5, 2.5, 1.2, 1);
  h.addWindow(walls[2], 3.5, 4, 2.4, 0.3);
  h.addWindow(walls[3], 2, 2, 1.2, 1);
  h.addWindow(walls[4], 2.5, 2, 1.2, 1);
  h.addWindow(walls[5], 4.5, 2, 1.2, 1);
  h.roof = { style: "Flat", pitchDeg: 0, overhang: 0, material: "Metal" };
  return h;
}

/** A compact brick house with a hip roof and a double front door. */
export function brickHip(plot: Plot): House {
  const h = new House();
  const [front, right, back, left] = h.addWallLoop(centeredRect(plot, 9, 9), 3, "Brick");
  h.addDoor(front, 4.5, 1.6, 2.3);
  for (const x of [1.8, 7.2]) {
    for (const wall of [front, back, right, left]) h.addWindow(wall, x, 1.2, 1.6, 0.8);
  }
  h.roof = { style: "Hip", pitchDeg: 30, overhang: 0.6, material: "Shingles" };
  return h;
}
