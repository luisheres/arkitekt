/** Plots of land the player can buy and build on. */

import { Vec2 } from "./geometry";
import type { Localized } from "./i18n/types";

/** What surrounds a plot. */
export const SETTINGS = ["suburban", "town", "lakeside", "riverside", "forest", "farmland", "seaside", "hillside", "mountain"] as const;
export type Setting = (typeof SETTINGS)[number];

export interface Plot {
  /** Stable name for saves (the first three are the original plots' settings). */
  id: string;
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
  /** The client tiers (1-4) that buy land here. */
  tiers: readonly number[];
  /** How the land lies, when it is not flat. */
  terrain?: Terrain;
}

/**
 * The lie of the land on a plot, made of a few clear landforms so it reads like real ground:
 * a slope rising towards the back (negative: falling, as towards water), a tilt from one
 * side to the other, a valley running down the plot, and rounded hills or hollows. The
 * front edge, along the street, is always at street level.
 */
export interface Terrain {
  /** Metres of rise per metre towards the back. */
  back: number;
  /** Metres of rise per metre to the left (+x), reached at the back of the plot. */
  side: number;
  /** A valley running from the street towards the back, deepening as it goes. */
  valley?: { /** Where across the plot, as a share of its width. */ at: number; /** Half-width (m). */ width: number; /** Depth at the back (m). */ depth: number };
  /** Rounded hills (or hollows, with a negative height), placed as shares of the plot's size. */
  knolls?: readonly { x: number; y: number; radius: number; height: number }[];
}

/**
 * The natural ground height on a plot (outside it, the height at the nearest point of its
 * edge, so the surroundings carry on from it). Zero everywhere on a flat plot.
 */
export function groundHeight(plot: Plot, x: number, y: number): number {
  const t = plot.terrain;
  if (!t) return 0;
  const cx = Math.min(Math.max(x, 0), plot.width);
  const cy = Math.min(Math.max(y, 0), plot.depth);
  // Nothing at the street edge; the landforms grow in over the first few metres.
  const ramp = smooth(Math.min(cy / 4, 1));
  let h = t.back * cy + t.side * (cx - plot.width / 2) * (cy / plot.depth);
  if (t.valley) {
    const u = (cx - t.valley.at * plot.width) / t.valley.width;
    h -= t.valley.depth * (cy / plot.depth) * Math.exp(-u * u);
  }
  for (const k of t.knolls ?? []) {
    const dx = cx - k.x * plot.width;
    const dy = cy - k.y * plot.depth;
    h += k.height * Math.exp(-(dx * dx + dy * dy) / (k.radius * k.radius)) * ramp;
  }
  return h;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** True when `p` lies in the buildable area (inside the plot, respecting the setback). */
export function isBuildable(plot: Plot, p: Vec2): boolean {
  const s = plot.setback;
  return p.x >= s && p.x <= plot.width - s && p.y >= s && p.y <= plot.depth - s;
}

/** The plot's center point. */
export function plotCenter(plot: Plot): Vec2 {
  return new Vec2(plot.width * 0.5, plot.depth * 0.5);
}


type PlotSpec = [id: string, en: string, sv: string, setting: Setting, width: number, depth: number, setback: number, price: number, tiers: number[]];

/** Every plot there is: nine kinds of surroundings, a few plots of each. */
const SPECS: PlotSpec[] = [
  // The original three plots: their ids are their settings, as saves from before expect.
  ["suburban", "Suburban lot", "Villatomt", "suburban", 20, 25, 3, 15_000, [1, 2]],
  ["lakeside", "Lakeside lot", "Sjötomt", "lakeside", 28, 32, 4, 45_000, [2, 3]],
  ["hillside", "Hillside view lot", "Sluttningstomt med utsikt", "hillside", 36, 40, 5, 110_000, [3, 4]],
  ["corner", "Corner lot", "Hörntomt", "suburban", 24, 22, 3, 18_000, [1, 2]],
  ["narrow", "Narrow lot", "Smal tomt", "suburban", 16, 30, 2.5, 12_000, [1]],
  ["culdesac", "Cul-de-sac lot", "Tomt i vändplan", "suburban", 22, 28, 3, 20_000, [1, 2]],
  ["townplot", "Town plot", "Stadstomt", "town", 18, 24, 2.5, 22_000, [1, 2]],
  ["oldtown", "Old town garden", "Trädgård i gamla stan", "town", 20, 20, 2, 28_000, [1, 2]],
  ["square", "Square-side plot", "Tomt vid torget", "town", 26, 22, 3, 35_000, [2]],
  ["bay", "Lake bay plot", "Tomt vid viken", "lakeside", 32, 30, 4, 55_000, [2, 3]],
  ["reeds", "Reed-shore plot", "Tomt vid vassen", "lakeside", 26, 36, 4, 42_000, [2, 3]],
  ["lakeview", "Lake view estate", "Sjöutsiktsgods", "lakeside", 40, 40, 5, 140_000, [4]],
  ["riverside", "Riverside lot", "Tomt vid ån", "riverside", 26, 30, 4, 38_000, [2, 3]],
  ["mill", "Old mill plot", "Vid gamla kvarnen", "riverside", 30, 28, 4, 48_000, [2, 3]],
  ["rivermeadow", "River meadow", "Ängen vid älven", "riverside", 34, 32, 4, 60_000, [3]],
  ["clearing", "Forest clearing", "Skogsglänta", "forest", 24, 26, 3, 14_000, [1, 2]],
  ["pinewood", "Pine-wood plot", "Tallskogstomt", "forest", 28, 30, 4, 25_000, [2, 3]],
  ["birchgrove", "Birch grove", "Björkdungen", "forest", 22, 28, 3, 17_000, [1, 2]],
  ["farm", "Farm plot", "Gårdstomt", "farmland", 30, 30, 4, 16_000, [1, 2]],
  ["meadow", "Meadow plot", "Ängstomt", "farmland", 26, 24, 3, 13_000, [1]],
  ["orchard", "Old orchard", "Gamla fruktträdgården", "farmland", 28, 26, 3, 24_000, [2]],
  ["seaside", "Seaside plot", "Havstomt", "seaside", 30, 34, 4, 80_000, [3, 4]],
  ["dunes", "Dune plot", "Dyntomt", "seaside", 28, 30, 4, 65_000, [3]],
  ["clifftop", "Cliff-top plot", "Tomt på klippan", "seaside", 34, 36, 5, 120_000, [4]],
  ["harbour", "Harbour plot", "Hamntomt", "seaside", 26, 30, 3, 70_000, [3]],
  ["slope", "Sunny slope", "Solsluttningen", "hillside", 32, 36, 4, 85_000, [3, 4]],
  ["valley", "Valley view", "Dalutsikten", "hillside", 38, 38, 5, 100_000, [3, 4]],
  ["mountain", "Mountain plot", "Fjälltomt", "mountain", 36, 40, 5, 130_000, [4]],
  ["alpine", "Alpine meadow", "Fjällängen", "mountain", 40, 38, 5, 150_000, [4]],
  ["skislope", "Ski-slope plot", "Tomt vid backen", "mountain", 34, 42, 5, 125_000, [4]],
];

const LOCATION: Record<Setting, number> = { suburban: 1, town: 1.1, lakeside: 1.35, riverside: 1.25, forest: 1.05, farmland: 0.95, seaside: 1.6, hillside: 1.8, mountain: 1.9 };

/** Plots that are not flat (the original three stay flat, as saved designs expect). */
const TERRAIN: Record<string, Terrain> = {
  corner: { back: 0.02, side: 0.025 },
  culdesac: { back: 0.025, side: -0.015, knolls: [{ x: 0.8, y: 0.8, radius: 6, height: 0.6 }] },
  bay: { back: -0.025, side: 0.01 },
  reeds: { back: -0.02, side: -0.01 },
  lakeview: { back: 0.04, side: 0.02, knolls: [{ x: 0.3, y: 0.75, radius: 10, height: 1.5 }] },
  riverside: { back: -0.02, side: 0 },
  mill: { back: -0.025, side: 0.02 },
  rivermeadow: { back: -0.012, side: -0.01, knolls: [{ x: 0.5, y: 0.5, radius: 9, height: -0.5 }] },
  clearing: { back: 0, side: 0, knolls: [{ x: 0.5, y: 0.5, radius: 8, height: -0.6 }] },
  pinewood: { back: 0.05, side: 0.02, knolls: [{ x: 0.78, y: 0.72, radius: 7, height: 1 }] },
  birchgrove: { back: 0.03, side: -0.03 },
  meadow: { back: 0.02, side: 0.01 },
  orchard: { back: 0.03, side: 0 },
  dunes: { back: 0.01, side: 0, knolls: [{ x: 0.25, y: 0.6, radius: 6, height: 1.2 }, { x: 0.75, y: 0.85, radius: 7, height: 1.4 }] },
  clifftop: { back: 0.04, side: 0.02, knolls: [{ x: 0.5, y: 0.9, radius: 10, height: 1 }] },
  slope: { back: 0.1, side: 0.03 },
  valley: { back: 0.06, side: 0, valley: { at: 0.5, width: 7, depth: 1.8 } },
  mountain: { back: 0.14, side: 0.02, knolls: [{ x: 0.2, y: 0.85, radius: 8, height: 1.5 }] },
  alpine: { back: 0.09, side: 0.05, valley: { at: 0.65, width: 6, depth: 1.2 } },
  skislope: { back: 0.18, side: 0 },
};

const PLOTS: readonly Plot[] = SPECS.map(([id, en, sv, setting, width, depth, setback, price, tiers]) =>
  Object.freeze({ id, name: { en, sv }, setting, width, depth, setback, price, locationMultiplier: LOCATION[setting], tiers, ...(TERRAIN[id] ? { terrain: TERRAIN[id] } : {}) }),
);

/** Every plot, the same objects each time (scenery is worked out once per plot). */
export function allPlots(): readonly Plot[] {
  return PLOTS;
}

export function plotById(id: string): Plot | undefined {
  return PLOTS.find((p) => p.id === id);
}

/** The three original plots: suburban, lakeside and hillside. */
export function starterPlots(): Plot[] {
  return PLOTS.slice(0, 3);
}
