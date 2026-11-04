/**
 * Rooms: the enclosed areas found by the layout analysis, with what they are used for
 * (from room labels), their doors and windows, and whether you can walk into them.
 */

import { en } from "./i18n/en";
import type { Messages } from "./i18n/types";
import { Vec2, interiorPoint, pointInPolygon, signedArea } from "./geometry";
import { type Layout, OUTSIDE, analyzeLayout } from "./layout";
import type { FootprintError, House, Opening, RoomLabel, RoomType } from "./model";
import { type Result, ok } from "./result";

export interface RoomInfo {
  /** Smallest acceptable floor area, m². */
  minArea: number;
  /** Habitable rooms need daylight. */
  needsWindow: boolean;
  /** Plan color. */
  color: string;
}

export const ROOM_INFO: Record<RoomType, RoomInfo> = {
  Living: { minArea: 12, needsWindow: true, color: "#f3e3b5" },
  Kitchen: { minArea: 5, needsWindow: true, color: "#f6cfa6" },
  Bedroom: { minArea: 7, needsWindow: true, color: "#cfdcf5" },
  Bathroom: { minArea: 3, needsWindow: false, color: "#bfe6e4" },
  WC: { minArea: 1.2, needsWindow: false, color: "#d4eeec" },
  Hall: { minArea: 2, needsWindow: false, color: "#e8e2d6" },
  Office: { minArea: 5, needsWindow: true, color: "#dfd3ef" },
  Utility: { minArea: 2, needsWindow: false, color: "#dde3cf" },
  Garage: { minArea: 15, needsWindow: false, color: "#d6d6d6" },
  Storage: { minArea: 1, needsWindow: false, color: "#e6dfd0" },
};

export interface DoorLink {
  opening: Opening;
  /** The room on the other side, or {@link OUTSIDE}. */
  to: number;
}

export interface Room {
  index: number;
  polygon: Vec2[];
  area: number;
  /** Where the room's name is drawn: its label, or a point inside it. */
  anchor: Vec2;
  /** Labels inside the room; normally zero or one. */
  labels: RoomLabel[];
  type: RoomType | null;
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

export function analyzeRooms(house: House): Result<RoomAnalysis, FootprintError> {
  const result = analyzeLayout(house);
  if (!result.ok) return result;
  const layout = result.value;

  const rooms: Room[] = layout.rooms.map((polygon, index) => ({
    index,
    polygon,
    area: signedArea(polygon),
    anchor: interiorPoint(polygon),
    labels: [],
    type: null,
    doors: [],
    windows: [],
    openTo: [],
    reachable: false,
    daylit: false,
  }));

  const strayLabels: RoomLabel[] = [];
  for (const label of house.labels) {
    const room = roomAt(rooms, label.at);
    if (room) room.labels.push(label);
    else strayLabels.push(label);
  }
  for (const room of rooms) {
    const first = room.labels[0];
    if (first) {
      room.type = first.type;
      room.anchor = first.at;
    }
  }

  // Which rooms each opening connects.
  const misplaced: RoomAnalysis["misplaced"] = [];
  const eps = 1e-6;
  for (const o of house.openings) {
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
  const queue = rooms.filter((r) => r.doors.some((d) => d.to === OUTSIDE));
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
