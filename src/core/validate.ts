/** Rules a house must satisfy before it can be sold. */

import { type PriceList, estimate, totalCost } from "./cost";
import type { Vec2 } from "./geometry";
import { en } from "./i18n/en";
import type { Messages } from "./i18n/types";
import type { FootprintError, House, LabelId, OpeningId, RoofStyle, RoomType, WallId } from "./model";
import { type Plot, isBuildable } from "./plot";
import { buildRoof } from "./roof";
import { ROOM_INFO, type Room, type RoomAnalysis, analyzeRooms } from "./rooms";
import {
  DOOR_MIN_HEIGHT,
  DOOR_WIDTH,
  GARAGE_DOOR_MIN_HEIGHT,
  GARAGE_DOOR_WIDTH,
  MAX_OVERHANG,
  MAX_WALL_HEIGHT,
  MIN_FLOOR_AREA,
  MIN_GAP_BETWEEN_OPENINGS,
  MIN_LINTEL,
  MIN_OPENING_SIZE,
  MIN_WALL_HEIGHT,
  MIN_WALL_LENGTH,
  OPENING_END_MARGIN,
  PITCH_RANGE,
} from "./rules";


/** Enough to identify a room in a message and to find it again in the plan. */
export interface RoomRef {
  at: Vec2;
  area: number;
  type: RoomType | null;
}

export type Issue =
  | { kind: "WallTooShort"; wall: WallId }
  | { kind: "WallHeightOutOfRange"; wall: WallId }
  | { kind: "WallOutsidePlot"; wall: WallId }
  | { kind: "LooseWallEnd"; wall: WallId; x: number; y: number }
  | { kind: "OpeningWithoutWall"; opening: OpeningId }
  | { kind: "OpeningTooSmall"; opening: OpeningId }
  | { kind: "OpeningTooCloseToEnd"; opening: OpeningId }
  | { kind: "OpeningTooTall"; opening: OpeningId }
  | { kind: "OpeningsOverlap"; a: OpeningId; b: OpeningId }
  | { kind: "OpeningAcrossJunction"; opening: OpeningId }
  | { kind: "WindowInInteriorWall"; opening: OpeningId }
  | { kind: "BadDoorSize"; opening: OpeningId }
  | { kind: "BadGarageDoorSize"; opening: OpeningId }
  | { kind: "GarageDoorNotToGarage"; opening: OpeningId }
  | { kind: "Footprint"; error: FootprintError }
  | { kind: "TooSmall" }
  | { kind: "NoDoor" }
  | { kind: "NoRoof" }
  | { kind: "RoomTooSmall"; room: RoomRef; min: number }
  | { kind: "RoomNeedsWindow"; room: RoomRef }
  | { kind: "RoomUnreachable"; room: RoomRef }
  | { kind: "RoomHasTwoLabels"; room: RoomRef }
  | { kind: "GarageNeedsGarageDoor"; room: RoomRef }
  | { kind: "LabelOutsideRooms"; label: LabelId; at: Vec2 }
  | { kind: "RoofNeedsRectangle"; style: RoofStyle }
  | { kind: "RoofPitchOutOfRange" }
  | { kind: "RoofOverhangOutOfRange" }
  | { kind: "OverBudget"; cost: number; budget: number };

export function describeIssue(i: Issue, m: Messages = en): string {
  return m.issue(i);
}

const within = (x: number, [lo, hi]: readonly [number, number]) => x >= lo && x <= hi;

export function roomRef(room: Room): RoomRef {
  return { at: room.anchor, area: room.area, type: room.type };
}

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

  const analysis = analyzeRooms(house);
  if (!analysis.ok) {
    issues.push({ kind: "Footprint", error: analysis.error });
  } else {
    if (house.floorArea() < MIN_FLOOR_AREA) issues.push({ kind: "TooSmall" });
    checkRooms(house, analysis.value, issues);
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
    if (o.kind === "GarageDoor" && (!within(o.width, GARAGE_DOOR_WIDTH) || o.height < GARAGE_DOOR_MIN_HEIGHT)) {
      issues.push({ kind: "BadGarageDoorSize", opening: o.id });
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

function checkRooms(house: House, analysis: RoomAnalysis, issues: Issue[]): void {
  const { layout, rooms, strayLabels, misplaced } = analysis;

  for (const end of layout.looseEnds) issues.push({ kind: "LooseWallEnd", wall: end.wall, x: end.at.x, y: end.at.y });
  for (const m of misplaced) {
    issues.push({ kind: m.reason === "InteriorWindow" ? "WindowInInteriorWall" : "OpeningAcrossJunction", opening: m.opening.id });
  }
  for (const label of strayLabels) issues.push({ kind: "LabelOutsideRooms", label: label.id, at: label.at });

  for (const room of rooms) {
    const ref = roomRef(room);
    if (room.labels.length > 1) issues.push({ kind: "RoomHasTwoLabels", room: ref });
    if (!room.reachable) issues.push({ kind: "RoomUnreachable", room: ref });
    if (!room.type) continue;
    const info = ROOM_INFO[room.type];
    if (room.area < info.minArea) issues.push({ kind: "RoomTooSmall", room: ref, min: info.minArea });
    if (info.needsWindow && room.windows.length === 0) issues.push({ kind: "RoomNeedsWindow", room: ref });
    if (room.type === "Garage" && !room.doors.some((d) => d.opening.kind === "GarageDoor" && d.to < 0)) {
      issues.push({ kind: "GarageNeedsGarageDoor", room: ref });
    }
  }

  // Garage doors lead from outside into a garage.
  for (const o of house.openings) {
    if (o.kind !== "GarageDoor") continue;
    const ok = rooms.some((r) => r.type === "Garage" && r.doors.some((d) => d.opening.id === o.id && d.to < 0));
    if (!ok && !misplaced.some((m) => m.opening.id === o.id)) issues.push({ kind: "GarageDoorNotToGarage", opening: o.id });
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
