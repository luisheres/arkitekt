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
  /** Whether you can walk in from outside through doors. */
  reachable: boolean;
}

export type MisplacedReason = "InteriorWindow" | "AcrossJunction";

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
    reachable: false,
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

  // Walk in from outside.
  const queue = rooms.filter((r) => r.doors.some((d) => d.to === OUTSIDE));
  queue.forEach((r) => (r.reachable = true));
  while (queue.length) {
    for (const d of queue.pop()!.doors) {
      const next = d.to === OUTSIDE ? undefined : rooms[d.to];
      if (next && !next.reachable) {
        next.reachable = true;
        queue.push(next);
      }
    }
  }

  return ok({ layout, rooms, strayLabels, misplaced });
}
