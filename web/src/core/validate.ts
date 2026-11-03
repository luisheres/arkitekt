/** Rules a house must satisfy before it can be sold. */

import { type PriceList, estimate, totalCost } from "./cost";
import { type FootprintError, type House, type OpeningId, type RoofStyle, type WallId, describeFootprintError } from "./model";
import { type Plot, isBuildable } from "./plot";
import { buildRoof } from "./roof";

export const MIN_WALL_LENGTH = 1.0;
export const MIN_WALL_HEIGHT = 2.2;
export const MAX_WALL_HEIGHT = 4.5;
/** Minimum distance from an opening's edge to the end of its wall's centerline. */
export const OPENING_END_MARGIN = 0.3;
/** Minimum solid wall above an opening. */
export const MIN_LINTEL = 0.2;
/** Minimum solid wall between two openings in the same wall. */
export const MIN_GAP_BETWEEN_OPENINGS = 0.2;
export const MIN_OPENING_SIZE = 0.4;
export const DOOR_WIDTH = [0.7, 2.5] as const;
export const DOOR_MIN_HEIGHT = 1.9;
export const PITCH_RANGE = [10, 60] as const;
export const MAX_OVERHANG = 1.2;
export const MIN_FLOOR_AREA = 20;

export type Issue =
  | { kind: "WallTooShort"; wall: WallId }
  | { kind: "WallHeightOutOfRange"; wall: WallId }
  | { kind: "WallOutsidePlot"; wall: WallId }
  | { kind: "OpeningWithoutWall"; opening: OpeningId }
  | { kind: "OpeningTooSmall"; opening: OpeningId }
  | { kind: "OpeningTooCloseToEnd"; opening: OpeningId }
  | { kind: "OpeningTooTall"; opening: OpeningId }
  | { kind: "OpeningsOverlap"; a: OpeningId; b: OpeningId }
  | { kind: "BadDoorSize"; opening: OpeningId }
  | { kind: "Footprint"; error: FootprintError }
  | { kind: "TooSmall" }
  | { kind: "NoDoor" }
  | { kind: "NoRoof" }
  | { kind: "RoofNeedsRectangle"; style: RoofStyle }
  | { kind: "RoofPitchOutOfRange" }
  | { kind: "RoofOverhangOutOfRange" }
  | { kind: "OverBudget"; cost: number; budget: number };

export function describeIssue(i: Issue): string {
  switch (i.kind) {
    case "WallTooShort":
      return `wall ${i.wall} is shorter than ${MIN_WALL_LENGTH} m`;
    case "WallHeightOutOfRange":
      return `wall ${i.wall} must be between ${MIN_WALL_HEIGHT} and ${MAX_WALL_HEIGHT} m tall`;
    case "WallOutsidePlot":
      return `wall ${i.wall} is outside the buildable area of the plot`;
    case "OpeningWithoutWall":
      return `opening ${i.opening} refers to a wall that does not exist`;
    case "OpeningTooSmall":
      return `opening ${i.opening} is smaller than ${MIN_OPENING_SIZE} m`;
    case "OpeningTooCloseToEnd":
      return `opening ${i.opening} is too close to the end of its wall`;
    case "OpeningTooTall":
      return `opening ${i.opening} needs at least ${MIN_LINTEL} m of wall above it`;
    case "OpeningsOverlap":
      return `openings ${i.a} and ${i.b} overlap or are too close together`;
    case "BadDoorSize":
      return `door ${i.opening} must be ${DOOR_WIDTH[0]}-${DOOR_WIDTH[1]} m wide and at least ${DOOR_MIN_HEIGHT} m tall`;
    case "Footprint":
      return describeFootprintError(i.error);
    case "TooSmall":
      return `the floor area is below the minimum of ${MIN_FLOOR_AREA} m²`;
    case "NoDoor":
      return "the house needs at least one door";
    case "NoRoof":
      return "the house needs a roof";
    case "RoofNeedsRectangle":
      return `${i.style} roofs need a rectangular footprint; use a flat roof for other shapes`;
    case "RoofPitchOutOfRange":
      return `roof pitch must be between ${PITCH_RANGE[0]}° and ${PITCH_RANGE[1]}°`;
    case "RoofOverhangOutOfRange":
      return `roof overhang must be between 0 and ${MAX_OVERHANG} m`;
    case "OverBudget":
      return `construction costs ${i.cost.toFixed(0)}, but the budget is ${i.budget.toFixed(0)}`;
  }
}

const within = (x: number, [lo, hi]: readonly [number, number]) => x >= lo && x <= hi;

/** Check everything that must hold for the house to be sellable. An empty result means OK. */
export function validate(house: House, plot: Plot, budget: number, prices: PriceList): Issue[] {
  const issues: Issue[] = [];

  for (const w of house.walls) {
    if (w.length() < MIN_WALL_LENGTH) issues.push({ kind: "WallTooShort", wall: w.id });
    if (!within(w.height, [MIN_WALL_HEIGHT, MAX_WALL_HEIGHT])) issues.push({ kind: "WallHeightOutOfRange", wall: w.id });
    if (!isBuildable(plot, w.start) || !isBuildable(plot, w.end)) issues.push({ kind: "WallOutsidePlot", wall: w.id });
  }

  checkOpenings(house, issues);

  if (!house.openings.some((o) => o.kind === "Door")) issues.push({ kind: "NoDoor" });

  const fp = house.footprint();
  if (!fp.ok) {
    issues.push({ kind: "Footprint", error: fp.error });
  } else {
    if (house.floorArea() < MIN_FLOOR_AREA) issues.push({ kind: "TooSmall" });
    checkRoof(house, issues);
  }

  const cost = totalCost(estimate(house, prices));
  if (cost > budget) issues.push({ kind: "OverBudget", cost, budget });
  return issues;
}

function checkOpenings(house: House, issues: Issue[]): void {
  for (const o of house.openings) {
    const wall = house.wall(o.wall);
    if (!wall) {
      issues.push({ kind: "OpeningWithoutWall", opening: o.id });
      continue;
    }
    if (o.width < MIN_OPENING_SIZE || o.height < MIN_OPENING_SIZE) issues.push({ kind: "OpeningTooSmall", opening: o.id });
    if (o.left() < OPENING_END_MARGIN || o.right() > wall.length() - OPENING_END_MARGIN) {
      issues.push({ kind: "OpeningTooCloseToEnd", opening: o.id });
    }
    if (o.top() > wall.height - MIN_LINTEL || o.sill < 0) issues.push({ kind: "OpeningTooTall", opening: o.id });
    if (o.kind === "Door" && (!within(o.width, DOOR_WIDTH) || o.height < DOOR_MIN_HEIGHT)) {
      issues.push({ kind: "BadDoorSize", opening: o.id });
    }
  }
  for (const wall of house.walls) {
    const ops = house.openingsIn(wall.id);
    for (let i = 0; i + 1 < ops.length; i++) {
      if (ops[i + 1].left() - ops[i].right() < MIN_GAP_BETWEEN_OPENINGS) {
        issues.push({ kind: "OpeningsOverlap", a: ops[i].id, b: ops[i + 1].id });
      }
    }
  }
}

function checkRoof(house: House, issues: Issue[]): void {
  const roof = house.roof;
  if (!roof) {
    issues.push({ kind: "NoRoof" });
    return;
  }
  if (roof.style !== "Flat") {
    if (!within(roof.pitchDeg, PITCH_RANGE)) issues.push({ kind: "RoofPitchOutOfRange" });
    if (!within(roof.overhang, [0, MAX_OVERHANG])) issues.push({ kind: "RoofOverhangOutOfRange" });
  }
  const geom = buildRoof(house);
  if (!geom.ok && geom.error.kind === "NeedsRectangle") {
    issues.push({ kind: "RoofNeedsRectangle", style: geom.error.style });
  }
}
