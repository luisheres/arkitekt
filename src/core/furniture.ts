/** Furniture: the kinds there are, their usual sizes, and what suits each room. */

import type { Vec2 } from "./geometry";
import type { RoomType } from "./model";

export type FurnitureKind =
  | "Bed"
  | "SingleBed"
  | "Nightstand"
  | "Wardrobe"
  | "Sofa"
  | "CoffeeTable"
  | "TvUnit"
  | "Armchair"
  | "Counter"
  | "Fridge"
  | "DiningTable"
  | "Chair"
  | "Bathtub"
  | "Shower"
  | "Toilet"
  | "Sink"
  | "Desk"
  | "OfficeChair"
  | "Bookshelf"
  | "Bench"
  | "Washer"
  | "Car"
  | "Workbench"
  | "Shelf";

/** A piece of furniture in the house. `id` is set once it is part of a house. */
export interface Furniture {
  id?: number;
  kind: FurnitureKind;
  level: number;
  /** Center of the footprint. */
  at: Vec2;
  /** Unit vector the front faces (away from the wall it stands against). */
  facing: Vec2;
  /** Size across the front, front to back, and height. */
  width: number;
  depth: number;
  height: number;
}

export const FURNITURE_KINDS: readonly FurnitureKind[] = [
  "Bed",
  "SingleBed",
  "Nightstand",
  "Wardrobe",
  "Sofa",
  "Armchair",
  "CoffeeTable",
  "TvUnit",
  "Counter",
  "Fridge",
  "DiningTable",
  "Chair",
  "Bathtub",
  "Shower",
  "Toilet",
  "Sink",
  "Desk",
  "OfficeChair",
  "Bookshelf",
  "Bench",
  "Washer",
  "Car",
  "Workbench",
  "Shelf",
];

/** Size of a new piece: across the front, front to back, and height (m). */
export const FURNITURE_SIZE: Record<FurnitureKind, { width: number; depth: number; height: number }> = {
  Bed: { width: 1.6, depth: 2.1, height: 0.55 },
  SingleBed: { width: 0.9, depth: 2.0, height: 0.5 },
  Nightstand: { width: 0.45, depth: 0.4, height: 0.5 },
  Wardrobe: { width: 1.2, depth: 0.6, height: 2.0 },
  Sofa: { width: 2.2, depth: 0.9, height: 0.8 },
  Armchair: { width: 0.85, depth: 0.85, height: 0.8 },
  CoffeeTable: { width: 1.1, depth: 0.6, height: 0.42 },
  TvUnit: { width: 1.6, depth: 0.45, height: 0.5 },
  Counter: { width: 2.4, depth: 0.62, height: 0.9 },
  Fridge: { width: 0.6, depth: 0.65, height: 1.85 },
  DiningTable: { width: 1.6, depth: 0.9, height: 0.75 },
  Chair: { width: 0.45, depth: 0.45, height: 0.9 },
  Bathtub: { width: 1.7, depth: 0.75, height: 0.55 },
  Shower: { width: 0.9, depth: 0.9, height: 2.0 },
  Toilet: { width: 0.4, depth: 0.65, height: 0.75 },
  Sink: { width: 0.6, depth: 0.45, height: 0.85 },
  Desk: { width: 1.4, depth: 0.7, height: 0.75 },
  OfficeChair: { width: 0.55, depth: 0.55, height: 0.95 },
  Bookshelf: { width: 0.9, depth: 0.35, height: 1.9 },
  Bench: { width: 1.0, depth: 0.4, height: 0.45 },
  Washer: { width: 0.6, depth: 0.6, height: 0.85 },
  Car: { width: 1.8, depth: 4.4, height: 1.45 },
  Workbench: { width: 1.6, depth: 0.6, height: 0.9 },
  Shelf: { width: 1.2, depth: 0.4, height: 1.9 },
};

/** Pieces offered first when adding furniture to a room of each type. */
export const SUGGESTED_FURNITURE: Record<RoomType, readonly FurnitureKind[]> = {
  Living: ["Sofa", "Armchair", "CoffeeTable", "TvUnit", "Bookshelf", "DiningTable", "Chair"],
  Kitchen: ["Counter", "Fridge", "DiningTable", "Chair"],
  Bedroom: ["Bed", "SingleBed", "Nightstand", "Wardrobe", "Desk", "OfficeChair"],
  Bathroom: ["Bathtub", "Shower", "Toilet", "Sink", "Washer"],
  WC: ["Toilet", "Sink"],
  Hall: ["Bench", "Wardrobe", "Shelf"],
  Office: ["Desk", "OfficeChair", "Bookshelf", "Armchair"],
  Utility: ["Washer", "Sink", "Shelf"],
  Garage: ["Car", "Workbench", "Shelf"],
  Storage: ["Shelf"],
};
