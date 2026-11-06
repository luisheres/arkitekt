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

const PLOTS: readonly Plot[] = SPECS.map(([id, en, sv, setting, width, depth, setback, price, tiers]) =>
  Object.freeze({ id, name: { en, sv }, setting, width, depth, setback, price, locationMultiplier: LOCATION[setting], tiers }),
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
