/**
 * Rooms: the enclosed areas found by the layout analysis, with what they are used for
 * (from room labels), their doors and windows, and whether you can walk into them.
 */

import { en } from "./i18n/en";
import type { Messages } from "./i18n/types";
import { Vec2, interiorPoint, pointInPolygon, signedArea } from "./geometry";
import { type Layout, OUTSIDE, analyzeLayout } from "./layout";
import { FLOOR_FINISHES, type FloorFinish, type FootprintError, type PaintColor, type House, type Opening, type RoomLabel, type RoomType, type Stair } from "./model";
import { type Result, ok } from "./result";

export interface RoomInfo {
  /** Smallest acceptable floor area, m². */
  minArea: number;
  /** Habitable rooms need daylight. */
  needsWindow: boolean;
  /** Plan color. */
  color: string;
  /** Floor finish unless the player chooses another. */
  floor: FloorFinish;
  /** Finishes the room can have; wet rooms need waterproof floors, garages hard ones. */
  floors: readonly FloorFinish[];
}

const ANY_FLOOR = FLOOR_FINISHES;
const WET_FLOORS: readonly FloorFinish[] = ["Tiles", "Stone", "Concrete"];

/** The finish of rooms nobody has said anything about yet. */
export const DEFAULT_FLOOR: FloorFinish = "Laminate";

export const ROOM_INFO: Record<RoomType, RoomInfo> = {
  Living: { minArea: 12, needsWindow: true, color: "#f3e3b5", floor: "Wood", floors: ANY_FLOOR },
  Kitchen: { minArea: 5, needsWindow: true, color: "#f6cfa6", floor: "Tiles", floors: ANY_FLOOR },
  Bedroom: { minArea: 7, needsWindow: true, color: "#cfdcf5", floor: "Wood", floors: ANY_FLOOR },
  Bathroom: { minArea: 3, needsWindow: false, color: "#bfe6e4", floor: "Tiles", floors: WET_FLOORS },
  WC: { minArea: 1.2, needsWindow: false, color: "#d4eeec", floor: "Tiles", floors: WET_FLOORS },
  Hall: { minArea: 2, needsWindow: false, color: "#e8e2d6", floor: "Stone", floors: ANY_FLOOR },
  Office: { minArea: 5, needsWindow: true, color: "#dfd3ef", floor: "Laminate", floors: ANY_FLOOR },
  Utility: { minArea: 2, needsWindow: false, color: "#dde3cf", floor: "Tiles", floors: WET_FLOORS },
  Garage: { minArea: 15, needsWindow: false, color: "#d6d6d6", floor: "Concrete", floors: WET_FLOORS },
  Storage: { minArea: 1, needsWindow: false, color: "#e6dfd0", floor: "Concrete", floors: ANY_FLOOR },
};

export interface DoorLink {
  opening: Opening;
  /** The room on the other side, or {@link OUTSIDE}. */
  to: number;
}

export interface Room {
  /** Index among the rooms of its storey. */
  index: number;
  level: number;
  polygon: Vec2[];
  area: number;
  /** Where the room's name is drawn: its label, or a point inside it. */
  anchor: Vec2;
  /** Labels inside the room; normally zero or one. */
  labels: RoomLabel[];
  type: RoomType | null;
  /** The floor finish: the label's choice or the default for the room type. */
  floor: FloorFinish;
  /** The colour of its walls inside (white unless painted). */
  paint: PaintColor;
  /** Doors and garage doors in the room's walls. */
  doors: DoorLink[];
  /** Windows in the room's exterior walls. */
  windows: Opening[];
  /** Rooms joined to this one across a room boundary (open plan). */
  openTo: number[];
  /** Whether you can walk in from outside, through doors and open plan. */
  reachable: boolean;
  /** Whether daylight reaches the room: a window of its own or in its open-plan space. */
  daylit: boolean;
}

export type MisplacedReason = "InteriorWindow" | "AcrossJunction" | "InBoundary";

export interface RoomAnalysis {
  layout: Layout;
  rooms: Room[];
  /** Labels that are not inside any room. */
  strayLabels: RoomLabel[];
  /** Openings that do not sit properly in one wall segment. */
  misplaced: { opening: Opening; reason: MisplacedReason }[];
}

export function roomName(room: Pick<Room, "type">, m: Messages = en): string {
  return room.type ? m.rooms[room.type].name : m.ui.room;
}

/** The room containing `p`, if any. */
export function roomAt(rooms: readonly Room[], p: Vec2): Room | undefined {
  return rooms.find((r) => pointInPolygon(p, r.polygon));
}

/**
 * Analyze the rooms of one storey. Reachability here only follows doors from outside on
 * the ground floor; {@link analyzeHouse} adds the stairs between storeys.
 */
export function analyzeRooms(house: House, level = 0): Result<RoomAnalysis, FootprintError> {
  const result = analyzeLayout(house, level);
  if (!result.ok) return result;
  const layout = result.value;

  const rooms: Room[] = layout.rooms.map((polygon, index) => ({
    index,
    level,
    paint: "White" as const,
    polygon,
    area: signedArea(polygon),
    anchor: interiorPoint(polygon),
    labels: [],
    type: null,
    floor: DEFAULT_FLOOR,
    doors: [],
    windows: [],
    openTo: [],
    reachable: false,
    daylit: false,
  }));

  const strayLabels: RoomLabel[] = [];
  for (const label of house.labels) {
    if (label.level !== level) continue;
    const room = roomAt(rooms, label.at);
    if (room) room.labels.push(label);
    else strayLabels.push(label);
  }
  for (const room of rooms) {
    const first = room.labels[0];
    if (first) {
      room.type = first.type;
      room.anchor = first.at;
      room.floor = first.floor ?? ROOM_INFO[first.type].floor;
      room.paint = first.paint ?? "White";
    }
  }

  // Which rooms each opening connects.
  const misplaced: RoomAnalysis["misplaced"] = [];
  const eps = 1e-6;
  for (const o of house.openings) {
    if (house.levelOf(o.wall) !== level) continue;
    if (house.wall(o.wall)?.boundary) {
      misplaced.push({ opening: o, reason: "InBoundary" });
      continue;
    }
    const seg = layout.segments.find((s) => s.wall === o.wall && s.left !== null && s.from - eps <= o.left() && o.right() <= s.to + eps);
    if (!seg || seg.left === null || seg.right === null) {
      if (house.wall(o.wall)) misplaced.push({ opening: o, reason: "AcrossJunction" });
      continue;
    }
    const [l, r] = [seg.left, seg.right];
    if (o.kind === "Window") {
      if (l !== OUTSIDE && r !== OUTSIDE) misplaced.push({ opening: o, reason: "InteriorWindow" });
      else rooms[l === OUTSIDE ? r : l]?.windows.push(o);
    } else {
      if (l !== OUTSIDE) rooms[l].doors.push({ opening: o, to: r });
      if (r !== OUTSIDE) rooms[r].doors.push({ opening: o, to: l });
    }
  }

  // Open plan: rooms on either side of a boundary flow into each other.
  for (const seg of layout.segments) {
    if (seg.left === null || seg.right === null || seg.left === OUTSIDE || seg.right === OUTSIDE) continue;
    if (!house.wall(seg.wall)?.boundary) continue;
    const [a, b] = [rooms[seg.left], rooms[seg.right]];
    if (a !== b && !a.openTo.includes(b.index)) {
      a.openTo.push(b.index);
      b.openTo.push(a.index);
    }
  }

  // Daylight spreads through an open-plan space.
  for (const start of rooms) {
    if (start.daylit || start.windows.length === 0) continue;
    const queue = [start];
    start.daylit = true;
    while (queue.length) {
      for (const i of queue.pop()!.openTo) {
        if (!rooms[i].daylit) {
          rooms[i].daylit = true;
          queue.push(rooms[i]);
        }
      }
    }
  }

  // Walk in from outside, through doors and open plan.
  // Upper-floor doors to outside lead onto balconies or terraces, not into the house.
  const queue = level === 0 ? rooms.filter((r) => r.doors.some((d) => d.to === OUTSIDE)) : [];
  queue.forEach((r) => (r.reachable = true));
  while (queue.length) {
    const room = queue.pop()!;
    const next = [...room.doors.map((d) => d.to), ...room.openTo].filter((i) => i !== OUTSIDE).map((i) => rooms[i]);
    for (const r of next) {
      if (!r.reachable) {
        r.reachable = true;
        queue.push(r);
      }
    }
  }

  return ok({ layout, rooms, strayLabels, misplaced });
}

/** Where a flight of stairs starts and ends: the rooms around its footprint on each storey. */
export interface StairLink {
  stair: Stair;
  /** The room it starts in, on `stair.level`. */
  from?: Room;
  /** The room it arrives in, on the storey above. */
  to?: Room;
}

export interface HouseAnalysis {
  /** Each storey's analysis above ground (index = level), or why its walls do not form rooms. */
  levels: Result<RoomAnalysis, FootprintError>[];
  /** The basement's, when there is one. */
  basement: Result<RoomAnalysis, FootprintError> | null;
  /** Rooms of every storey that could be analyzed. */
  rooms: Room[];
  stairs: StairLink[];
}

/**
 * Analyze every storey and connect them through the stairs: a room is reachable when you
 * can walk to it from the front door through doors, open plan and stairs.
 */
export function analyzeHouse(house: House): HouseAnalysis {
  const levels = Array.from({ length: house.levels }, (_, k) => analyzeRooms(house, k));
  const basement = house.basement ? analyzeRooms(house, -1) : null;
  const roomsOn = (k: number) => {
    const a = k < 0 ? basement : levels[k];
    return a?.ok ? a.value.rooms : [];
  };
  const rooms = [...roomsOn(-1), ...levels.flatMap((_, k) => roomsOn(k))];
  const stairs: StairLink[] = house.stairs.map((stair) => ({
    stair,
    from: roomAt(roomsOn(stair.level), stair.at),
    to: roomAt(roomsOn(stair.level + 1), stair.at),
  }));

  // Walk from the front door through doors, open plan and stairs.
  for (const r of rooms) r.reachable = false;
  const queue = roomsOn(0).filter((r) => r.doors.some((d) => d.to === OUTSIDE));
  queue.forEach((r) => (r.reachable = true));
  while (queue.length) {
    const room = queue.pop()!;
    const same = roomsOn(room.level);
    const next = [
      ...[...room.doors.map((d) => d.to), ...room.openTo].filter((i) => i !== OUTSIDE).map((i) => same[i]),
      ...stairs.filter((s) => s.from === room).map((s) => s.to),
      ...stairs.filter((s) => s.to === room).map((s) => s.from),
    ];
    for (const r of next) {
      if (r && !r.reachable) {
        r.reachable = true;
        queue.push(r);
      }
    }
  }
  return { levels, basement, rooms, stairs };
}

/** A storey's analysis from the whole house's (the basement too). */
export function levelAnalysis(a: HouseAnalysis, level: number): Result<RoomAnalysis, FootprintError> | undefined {
  return level < 0 ? (a.basement ?? undefined) : a.levels[level];
}
