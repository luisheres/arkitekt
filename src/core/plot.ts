/** Plots of land the player can buy and build on. */

import { Vec2 } from "./geometry";
import type { Localized } from "./i18n/types";

/** What surrounds a plot: a street of houses, a lake behind the garden, or a hillside with a view. */
export type Setting = "suburban" | "lakeside" | "hillside";

export interface Plot {
  name: Localized;
  setting: Setting;
  /** Size along the plan x axis, in meters. The plot spans `0..width`. */
  width: number;
  /** Size along the plan y axis, in meters. The plot spans `0..depth`. */
  depth: number;
  price: number;
  /** Multiplies the sale price; better locations sell for more. */
  locationMultiplier: number;
  /** Minimum distance between walls and the plot boundary, in meters. */
  setback: number;
}

/** True when `p` lies in the buildable area (inside the plot, respecting the setback). */
export function isBuildable(plot: Plot, p: Vec2): boolean {
  const s = plot.setback;
  return p.x >= s && p.x <= plot.width - s && p.y >= s && p.y <= plot.depth - s;
}

/** The plot's center point. */
export function plotCenter(plot: Plot): Vec2 {
  return new Vec2(plot.width * 0.5, plot.depth * 0.5);
}

/** The plots available in the MVP, cheapest first. */
export function starterPlots(): Plot[] {
  return [
    { name: { en: "Suburban lot", sv: "Villatomt" },
      setting: "suburban", width: 20, depth: 25, price: 15_000, locationMultiplier: 1.0, setback: 3 },
    { name: { en: "Lakeside lot", sv: "Sjötomt" },
      setting: "lakeside", width: 28, depth: 32, price: 45_000, locationMultiplier: 1.35, setback: 4 },
    { name: { en: "Hillside view lot", sv: "Sluttningstomt med utsikt" },
      setting: "hillside", width: 36, depth: 40, price: 110_000, locationMultiplier: 1.8, setback: 5 },
  ];
}
