/** Rules a house must satisfy before it can be sold. */

import { type Abilities, type TechniqueId, missingTechniques } from "./progression";
import { type PriceList, estimate, totalCost } from "./cost";
import { type Vec2, pointInPolygon, projectOntoSegment, segmentsIntersect } from "./geometry";
import { en } from "./i18n/en";
import type { Messages } from "./i18n/types";
import { balconyOutline } from "./edit";
import { type BalconyId, type FloorFinish, type FootprintError, type House, type LabelId, type OpeningId, type RoofStyle, type RoomType, type StairId, type WallId, stairOutline } from "./model";
import { type Plot, isBuildable } from "./plot";
import { buildRoof } from "./roof";
import { type HouseAnalysis, ROOM_INFO, type Room, type RoomAnalysis, analyzeHouse } from "./rooms";
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
  level: number;
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
  | { kind: "OpeningInBoundary"; opening: OpeningId }
  | { kind: "BoundaryOnOutside"; wall: WallId }
  | { kind: "BadDoorSize"; opening: OpeningId }
  | { kind: "BadGarageDoorSize"; opening: OpeningId }
  | { kind: "GarageDoorNotToGarage"; opening: OpeningId }
  | { kind: "Footprint"; error: FootprintError; level: number }
  | { kind: "EmptyLevel"; level: number }
  | { kind: "FloorNotSupported"; level: number }
  | { kind: "NoStairs"; level: number }
  | { kind: "StairBlocked"; stair: StairId }
  | { kind: "StairsToNowhere"; stair: StairId }
  | { kind: "TooSmall" }
  | { kind: "NoDoor" }
  | { kind: "NoRoof" }
  | { kind: "RoomTooSmall"; room: RoomRef; min: number }
  | { kind: "RoomNeedsWindow"; room: RoomRef }
  | { kind: "RoomUnreachable"; room: RoomRef }
  | { kind: "RoomHasTwoLabels"; room: RoomRef }
  | { kind: "UnsuitableFloor"; room: RoomRef; floor: FloorFinish; allowed: readonly FloorFinish[] }
  | { kind: "BalconyOnGroundFloor"; balcony: BalconyId }
  | { kind: "BalconyNotOnOuterWall"; balcony: BalconyId }
  | { kind: "BalconyNeedsDoor"; balcony: BalconyId }
  | { kind: "BalconyOutsidePlot"; balcony: BalconyId }
  /** An "open to below" on the ground floor or in the basement: there is nothing below to open to. */
  | { kind: "VoidOnGroundFloor"; room: RoomRef }
  /** The basement reaches beyond the ground floor above it. */
  | { kind: "BasementOutsideHouse" }
  /** No stairs lead down to the basement. */
  | { kind: "NoStairsToBasement" }
  /** A door or window in a basement's outer wall would be under the ground. */
  | { kind: "OpeningBelowGround"; opening: OpeningId }
  /** The design uses a technique not learned yet (campaign only). */
  | { kind: "NotLearned"; technique: TechniqueId }
  | { kind: "GarageNeedsGarageDoor"; room: RoomRef }
  | { kind: "LabelOutsideRooms"; label: LabelId; at: Vec2; type: RoomType; level: number }
  | { kind: "RoofNeedsRectangle"; style: RoofStyle }
  | { kind: "RoofPitchOutOfRange" }
  | { kind: "RoofOverhangOutOfRange" }
  | { kind: "OverBudget"; cost: number; budget: number };

export function describeIssue(i: Issue, m: Messages = en): string {
  return m.issue(i);
}

const within = (x: number, [lo, hi]: readonly [number, number]) => x >= lo && x <= hi;

export function roomRef(room: Room): RoomRef {
  return { at: room.anchor, level: room.level, area: room.area, type: room.type };
}

/** Check everything that must hold for the house to be sellable. An empty result means OK. */
export function validate(house: House, plot: Plot, budget: number, prices: PriceList, can?: Abilities): Issue[] {
  const issues: Issue[] = [];

  for (const w of house.walls) {
    if (w.boundary) continue; // not built: no size or placement rules
    if (w.length() < MIN_WALL_LENGTH) issues.push({ kind: "WallTooShort", wall: w.id });
    if (!within(w.height, [MIN_WALL_HEIGHT, MAX_WALL_HEIGHT])) issues.push({ kind: "WallHeightOutOfRange", wall: w.id });
    if (!isBuildable(plot, w.start) || !isBuildable(plot, w.end)) issues.push({ kind: "WallOutsidePlot", wall: w.id });
  }

  checkOpenings(house, issues);

  if (!house.openings.some((o) => o.kind === "Door" && house.levelOf(o.wall) === 0)) issues.push({ kind: "NoDoor" });

  const analysis = analyzeHouse(house);
  analysis.levels.forEach((result, level) => {
    if (!result.ok) {
      if (level > 0 && result.error.kind === "NoWalls") issues.push({ kind: "EmptyLevel", level });
      else issues.push({ kind: "Footprint", error: result.error, level });
      return;
    }
    checkRooms(house, result.value, level, issues);
    if (level > 0) {
      const below = analysis.levels[level - 1];
      if (below?.ok && !restsOn(result.value.layout.outline, below.value.layout.outline)) issues.push({ kind: "FloorNotSupported", level });
      if (!house.stairs.some((s) => s.level === level - 1)) issues.push({ kind: "NoStairs", level });
    }
  });
  checkBasement(house, analysis, issues);
  checkStairs(house, analysis, issues);
  checkBalconies(house, plot, analysis, issues);
  if (analysis.levels.every((l) => l.ok) && (!analysis.basement || analysis.basement.ok)) {
    if (house.floorArea() < MIN_FLOOR_AREA) issues.push({ kind: "TooSmall" });
    checkRoof(house, issues);
  }

  if (can) for (const technique of missingTechniques(house, can)) issues.push({ kind: "NotLearned", technique });
  const cost = totalCost(estimate(house, prices, plot));
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

function checkRooms(house: House, analysis: RoomAnalysis, level: number, issues: Issue[]): void {
  const { layout, rooms, strayLabels, misplaced } = analysis;

  for (const end of layout.looseEnds) issues.push({ kind: "LooseWallEnd", wall: end.wall, x: end.at.x, y: end.at.y });
  for (const m of misplaced) {
    const kind = m.reason === "InteriorWindow" ? "WindowInInteriorWall" : m.reason === "InBoundary" ? "OpeningInBoundary" : "OpeningAcrossJunction";
    issues.push({ kind, opening: m.opening.id });
  }
  for (const wall of layout.outerBoundaries) issues.push({ kind: "BoundaryOnOutside", wall });
  for (const label of strayLabels) issues.push({ kind: "LabelOutsideRooms", label: label.id, at: label.at, type: label.type, level: label.level });

  for (const room of rooms) {
    const ref = roomRef(room);
    if (room.labels.length > 1) issues.push({ kind: "RoomHasTwoLabels", room: ref });
    // An opening to the floor below is not a room: no rules but that it is above one.
    if (room.type === "Void") {
      if (level <= 0) issues.push({ kind: "VoidOnGroundFloor", room: ref });
      continue;
    }
    if (!room.reachable) issues.push({ kind: "RoomUnreachable", room: ref });
    if (!room.type) continue;
    const info = ROOM_INFO[room.type];
    if (room.area < info.minArea) issues.push({ kind: "RoomTooSmall", room: ref, min: info.minArea });
    if (info.needsWindow && !room.daylit) issues.push({ kind: "RoomNeedsWindow", room: ref });
    if (!info.floors.includes(room.floor)) issues.push({ kind: "UnsuitableFloor", room: ref, floor: room.floor, allowed: info.floors });
    if (room.type === "Garage" && !room.doors.some((d) => d.opening.kind === "GarageDoor" && d.to < 0)) {
      issues.push({ kind: "GarageNeedsGarageDoor", room: ref });
    }
  }

  // Garage doors lead from outside into a garage.
  for (const o of house.openings) {
    if (o.kind !== "GarageDoor" || house.levelOf(o.wall) !== level) continue;
    const ok = rooms.some((r) => r.type === "Garage" && r.doors.some((d) => d.opening.id === o.id && d.to < 0));
    if (!ok && !misplaced.some((m) => m.opening.id === o.id)) issues.push({ kind: "GarageDoorNotToGarage", opening: o.id });
  }
}

/** Whether an upper storey's outline lies within the outline of the storey below. */
function restsOn(upper: readonly Vec2[], lower: readonly Vec2[]): boolean {
  const onEdge = (p: Vec2) => lower.some((a, i) => {
    const b = lower[(i + 1) % lower.length];
    return a.add(b.sub(a).normalize().scale(projectOntoSegment(p, a, b))).distance(p) < 0.05;
  });
  for (let i = 0; i < upper.length; i++) {
    const [a, b] = [upper[i], upper[(i + 1) % upper.length]];
    const steps = Math.max(1, Math.ceil(a.distance(b) / 0.25));
    for (let k = 0; k < steps; k++) {
      const p = a.add(b.sub(a).scale(k / steps));
      if (!pointInPolygon(p, lower) && !onEdge(p)) return false;
    }
  }
  return true;
}

/** Stairs must lead to a storey, start and end inside rooms, and not cut through walls. */
function checkStairs(house: House, analysis: HouseAnalysis, issues: Issue[]): void {
  for (const link of analysis.stairs) {
    const { stair } = link;
    if (stair.level + 1 >= house.levels) {
      issues.push({ kind: "StairsToNowhere", stair: stair.id });
      continue;
    }
    // Shrunk a little so stairs may stand against a wall.
    const outline = stairOutline(stair).map((p) => p.add(stair.at.sub(p).normalize().scale(0.15)));
    const cuts = house.walls.some((w) => {
      if (w.boundary || (w.level !== stair.level && w.level !== stair.level + 1)) return false;
      return outline.some((a, i) => segmentsIntersect(a, outline[(i + 1) % 4], w.start, w.end)) || pointInPolygon(w.start, outline);
    });
    if (!link.from || !link.to || cuts) issues.push({ kind: "StairBlocked", stair: stair.id });
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

/** Balconies hang off the outer walls of upper storeys, with a door out to them. */
function checkBalconies(house: House, plot: Plot, analysis: HouseAnalysis, issues: Issue[]): void {
  for (const b of house.balconies) {
    const wall = house.wall(b.wall);
    if (!wall) continue;
    const level = analysis.levels[wall.level];
    if (wall.level <= 0) issues.push({ kind: "BalconyOnGroundFloor", balcony: b.id });
    else if (level?.ok && !level.value.layout.exterior.has(wall.id)) issues.push({ kind: "BalconyNotOnOuterWall", balcony: b.id });
    const [from, to] = [b.offset - b.width / 2, b.offset + b.width / 2];
    const door = house.openings.some((o) => o.wall === wall.id && o.kind === "Door" && o.offset + o.width / 2 > from && o.offset - o.width / 2 < to);
    if (!door) issues.push({ kind: "BalconyNeedsDoor", balcony: b.id });
    const outline = balconyOutline(house, b) ?? [];
    if (outline.some((p) => p.x < -1e-6 || p.y < -1e-6 || p.x > plot.width + 1e-6 || p.y > plot.depth + 1e-6)) issues.push({ kind: "BalconyOutsidePlot", balcony: b.id });
  }
}

/** A basement lies under the house, with stairs down to it and no doors or windows out. */
function checkBasement(house: House, analysis: HouseAnalysis, issues: Issue[]): void {
  const basement = analysis.basement;
  if (!basement) return;
  if (!basement.ok) {
    issues.push(basement.error.kind === "NoWalls" ? { kind: "EmptyLevel", level: -1 } : { kind: "Footprint", error: basement.error, level: -1 });
    return;
  }
  checkRooms(house, basement.value, -1, issues);
  const ground = analysis.levels[0];
  if (ground?.ok && !restsOn(basement.value.layout.outline, ground.value.layout.outline)) issues.push({ kind: "BasementOutsideHouse" });
  if (!house.stairs.some((s) => s.level === -1)) issues.push({ kind: "NoStairsToBasement" });
  for (const o of house.openings) {
    const wall = house.wall(o.wall);
    if (wall?.level === -1 && basement.value.layout.exterior.has(wall.id)) issues.push({ kind: "OpeningBelowGround", opening: o.id });
  }
}
