/** Rules a house must satisfy before it can be sold. */

import { type PriceList, estimate, totalCost } from "./cost";
import type { Vec2 } from "./geometry";
import { type FootprintError, type House, type LabelId, type OpeningId, type RoomType, type RoofStyle, type WallId, describeFootprintError } from "./model";
import { type Plot, isBuildable } from "./plot";
import { buildRoof } from "./roof";
import { ROOM_INFO, type Room, type RoomAnalysis, analyzeRooms, roomName } from "./rooms";

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
export const GARAGE_DOOR_WIDTH = [2.2, 3.5] as const;
export const GARAGE_DOOR_MIN_HEIGHT = 2.0;
export const PITCH_RANGE = [10, 60] as const;
export const MAX_OVERHANG = 1.2;
export const MIN_FLOOR_AREA = 20;

/** Enough to identify a room in a message and to find it again in the plan. */
export interface RoomRef {
  at: Vec2;
  name: string;
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

const a = (name: string) => (/^[AEIOU]/.test(name) ? `An ${name.toLowerCase()}` : `A ${name.toLowerCase()}`);
const roomText = (r: RoomRef) => `${r.type ? ROOM_INFO[r.type].name : "A room"} (${r.area.toFixed(1)} m²)`;

export function describeIssue(i: Issue): string {
  switch (i.kind) {
    case "WallTooShort":
      return `A wall is shorter than ${MIN_WALL_LENGTH} m`;
    case "WallHeightOutOfRange":
      return `Walls must be between ${MIN_WALL_HEIGHT} and ${MAX_WALL_HEIGHT} m tall`;
    case "WallOutsidePlot":
      return "A wall is outside the buildable area of the plot";
    case "LooseWallEnd":
      return "A wall has a loose end; connect it to another wall";
    case "OpeningWithoutWall":
      return "An opening refers to a wall that does not exist";
    case "OpeningTooSmall":
      return `A window or door is smaller than ${MIN_OPENING_SIZE} m`;
    case "OpeningTooCloseToEnd":
      return "A window or door is too close to the end of its wall";
    case "OpeningTooTall":
      return `A window or door needs at least ${MIN_LINTEL} m of wall above it`;
    case "OpeningsOverlap":
      return "Two windows or doors overlap or are too close together";
    case "OpeningAcrossJunction":
      return "A window or door is blocked by a wall joining it";
    case "WindowInInteriorWall":
      return "A window is in an interior wall; windows go in exterior walls";
    case "BadDoorSize":
      return `Doors must be ${DOOR_WIDTH[0]}–${DOOR_WIDTH[1]} m wide and at least ${DOOR_MIN_HEIGHT} m tall`;
    case "BadGarageDoorSize":
      return `Garage doors must be ${GARAGE_DOOR_WIDTH[0]}–${GARAGE_DOOR_WIDTH[1]} m wide and at least ${GARAGE_DOOR_MIN_HEIGHT} m tall`;
    case "GarageDoorNotToGarage":
      return "A garage door must lead from outside into a garage";
    case "Footprint":
      return `The walls do not form a house: ${describeFootprintError(i.error)}`;
    case "TooSmall":
      return `The floor area is below the minimum of ${MIN_FLOOR_AREA} m²`;
    case "NoDoor":
      return "The house needs a front door";
    case "NoRoof":
      return "The house needs a roof";
    case "RoomTooSmall":
      return `${roomText(i.room)} is smaller than ${i.min} m²`;
    case "RoomNeedsWindow":
      return `${roomText(i.room)} needs a window`;
    case "RoomUnreachable":
      return `${roomText(i.room)} cannot be reached; add a door`;
    case "RoomHasTwoLabels":
      return `${roomText(i.room)} has more than one label`;
    case "GarageNeedsGarageDoor":
      return `${roomText(i.room)} needs a garage door`;
    case "LabelOutsideRooms":
      return "A room label is outside the house";
    case "RoofNeedsRectangle":
      return `${a(i.style)} roof needs a rectangular house; use a flat roof for other shapes`;
    case "RoofPitchOutOfRange":
      return `Roof pitch must be between ${PITCH_RANGE[0]}° and ${PITCH_RANGE[1]}°`;
    case "RoofOverhangOutOfRange":
      return `Roof overhang must be between 0 and ${MAX_OVERHANG} m`;
    case "OverBudget":
      return `Construction costs ${Math.round(i.cost).toLocaleString("en-US")}, over the budget of ${Math.round(i.budget).toLocaleString("en-US")}`;
  }
}

const within = (x: number, [lo, hi]: readonly [number, number]) => x >= lo && x <= hi;

export function roomRef(room: Room): RoomRef {
  return { at: room.anchor, name: roomName(room), area: room.area, type: room.type };
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
