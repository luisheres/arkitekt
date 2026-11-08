/**
 * The house data model: walls, openings (windows and doors) and the roof.
 *
 * Single-storey houses: exterior walls enclose the house, interior walls divide it into
 * rooms, and room labels say what each room is for.
 */

import { Vec2, signedArea } from "./geometry";
import { en } from "./i18n/en";
import type { Messages } from "./i18n/types";
import { analyzeLayout } from "./layout";
import type { Furniture, FurnitureKind } from "./furniture";
import type { Result } from "./result";
import { DEFAULT_WALL_HEIGHT, FLOOR_STRUCTURE, STAIR_LENGTH, STAIR_WIDTH } from "./rules";

/** Default wall thickness in meters. */
export const DEFAULT_WALL_THICKNESS = 0.25;

export type WallId = number;
export type OpeningId = number;

export const WALL_MATERIALS = ["Wood", "FaluRed", "Brick", "Plaster", "Stone", "Concrete"] as const;
export type WallMaterial = (typeof WALL_MATERIALS)[number];

/** What a facade is made of, for briefs that ask for "wood" without minding the paint. */
export const WALL_FAMILY: Record<WallMaterial, "wood" | "brick" | "plaster" | "stone" | "concrete"> = {
  Wood: "wood",
  FaluRed: "wood",
  Brick: "brick",
  Plaster: "plaster",
  Stone: "stone",
  Concrete: "concrete",
};

/** Colours the inside walls of a room can be painted. */
export const PAINT_COLORS = ["White", "Cream", "Sky", "Mint", "Blush", "Sunny", "Lavender", "Sage"] as const;
export type PaintColor = (typeof PAINT_COLORS)[number];

export const FLOOR_FINISHES = ["Wood", "Laminate", "Tiles", "Stone", "Carpet", "Concrete"] as const;
export type FloorFinish = (typeof FLOOR_FINISHES)[number];

export const ROOF_STYLES = ["Flat", "Gable", "Hip"] as const;
export type RoofStyle = (typeof ROOF_STYLES)[number];

export const ROOF_MATERIALS = ["Shingles", "Metal", "Tiles"] as const;
export type RoofMaterial = (typeof ROOF_MATERIALS)[number];

/** Windows; doors (a glass door also lets daylight in); garage doors; and passages: an opening in an inside wall with no door. */
export const OPENING_KINDS = ["Window", "Door", "GlassDoor", "GarageDoor", "Passage"] as const;
export type OpeningKind = (typeof OPENING_KINDS)[number];

/** What rooms are for. "Void" is not a room: it is an opening in the floor, making the room below double height. */
export const ROOM_TYPES = ["Living", "Kitchen", "Bedroom", "Bathroom", "WC", "Hall", "Office", "Utility", "Garage", "Storage", "Void"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export type LabelId = number;

/** Says what the room containing `at` (on `level`) is used for. */
export interface RoomLabel {
  id: LabelId;
  type: RoomType;
  at: Vec2;
  level: number;
  /** The room's floor finish; unset means the default for its type. */
  floor?: FloorFinish;
  /** The colour its walls are painted inside; unset means white. */
  paint?: PaintColor;
}

export type StairId = number;

export type BalconyId = number;

/** A balcony on the outside of an upper storey's outer wall. */
export interface Balcony {
  id: BalconyId;
  wall: WallId;
  /** Distance along the wall from its start to the balcony's middle. */
  offset: number;
  /** Along the wall, and how far it sticks out. */
  width: number;
  depth: number;
}

export const BALCONY_LIMITS = { width: [1.2, 8] as const, depth: [0.8, 2.5] as const };

export type DormerId = number;

/** A dormer: a window with its own little roof, standing in the roof slope over an outer wall of the top storey. */
export interface Dormer {
  id: DormerId;
  wall: WallId;
  /** A roof window lying flat in the slope, instead of a dormer standing out of it. */
  skylight?: boolean;
  /** Distance along the wall from its start to the dormer's middle. */
  offset: number;
  width: number;
}

export const DORMER_WIDTH = [1, 3.5] as const;

/**
 * A straight flight of stairs from `level` up to the level above. `at` is the center of
 * its footprint; `facing` counts quarter turns from climbing towards +y (away from the
 * street): 0 = +y, 1 = -x, 2 = -y, 3 = +x.
 */
export interface Stair {
  id: StairId;
  level: number;
  at: Vec2;
  facing: number;
}

/** Unit vector in the direction you walk when climbing the stairs. */
export function stairDirection(s: Pick<Stair, "facing">): Vec2 {
  const q = ((s.facing % 4) + 4) % 4;
  // Exact for whole quarter turns; stairs in a house turned by another angle face between.
  if (Number.isInteger(q)) return [new Vec2(0, 1), new Vec2(-1, 0), new Vec2(0, -1), new Vec2(1, 0)][q];
  const a = (q * Math.PI) / 2;
  return new Vec2(-Math.sin(a), Math.cos(a));
}

/** The stairs' footprint, counter-clockwise, starting at the bottom step. */
export function stairOutline(s: Pick<Stair, "at" | "facing">): Vec2[] {
  const d = stairDirection(s);
  const n = new Vec2(-d.y, d.x);
  const [hl, hw] = [STAIR_LENGTH / 2, STAIR_WIDTH / 2];
  const c = s.at;
  return [c.sub(d.scale(hl)).sub(n.scale(hw)), c.sub(d.scale(hl)).add(n.scale(hw)), c.add(d.scale(hl)).add(n.scale(hw)), c.add(d.scale(hl)).sub(n.scale(hw))].reverse();
}

export class Wall {
  constructor(
    readonly id: WallId,
    public start: Vec2,
    public end: Vec2,
    public height: number,
    public thickness: number,
    public material: WallMaterial,
    /**
     * A room boundary: an invisible line that divides open-plan space into rooms. It is
     * not built, costs nothing and leaves the rooms on either side open to each other.
     */
    public boundary = false,
    /** Storey: 0 is the ground floor. */
    public level = 0,
  ) {}

  length(): number {
    return this.start.distance(this.end);
  }

  /** Unit vector from `start` to `end`. */
  direction(): Vec2 {
    return this.end.sub(this.start).normalize();
  }

  /** Gross face area (one side), ignoring openings. */
  grossArea(): number {
    return this.length() * this.height;
  }
}

/** A window or door cut into a wall. */
/** How a window looks: plain, small panes with shutters, or a slim dark modern frame. */
export const WINDOW_STYLES = ["Standard", "Cottage", "Modern"] as const;
export type WindowStyle = (typeof WINDOW_STYLES)[number];

/** Fences round the plot: white pickets, or upright boards painted Falu red. */
export const FENCE_STYLES = ["Picket", "Board"] as const;
export type FenceStyle = (typeof FENCE_STYLES)[number];

/** Colours for window and door frames. */
export const FRAME_COLORS = ["White", "Black", "Green", "Blue", "Red"] as const;
export type FrameColor = (typeof FRAME_COLORS)[number];

export class Opening {
  /** A window's style (windows only). */
  style?: WindowStyle;
  /** The frame's colour; white when unset. */
  color?: FrameColor;
  /** A raised outside door reached by a ramp instead of steps. */
  ramp?: boolean;

  constructor(
    readonly id: OpeningId,
    public wall: WallId,
    public kind: OpeningKind,
    /** Distance from the wall's `start` to the opening's center, along the wall. */
    public offset: number,
    public width: number,
    public height: number,
    /** Height of the opening's bottom edge above the floor (0 for doors). */
    public sill: number,
  ) {}

  area(): number {
    return this.width * this.height;
  }
  left(): number {
    return this.offset - this.width * 0.5;
  }
  right(): number {
    return this.offset + this.width * 0.5;
  }
  top(): number {
    return this.sill + this.height;
  }
}

export interface Roof {
  style: RoofStyle;
  /** Slope in degrees (ignored for flat roofs). */
  pitchDeg: number;
  /** How far the roof extends past the walls, in meters (ignored for flat roofs). */
  overhang: number;
  material: RoofMaterial;
}

/** Why the walls do not form a usable footprint. */
export type FootprintError =
  | { kind: "NoWalls" }
  | { kind: "Open"; x: number; y: number }
  | { kind: "Crossing"; x: number; y: number }
  | { kind: "Overlap"; x: number; y: number }
  | { kind: "MultipleLoops" }
  | { kind: "SelfIntersecting" }
  | { kind: "Degenerate" };

export function describeFootprintError(e: FootprintError, m: Messages = en): string {
  return m.footprint(e);
}

/** Plain-JSON form of a house, for saving and for sending to the appraiser. */
export interface HouseJson {
  walls: {
    id: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
    height: number;
    thickness: number;
    material: WallMaterial;
    boundary?: boolean;
    level?: number;
  }[];
  openings: { id: number; wall: number; kind: OpeningKind; offset: number; width: number; height: number; sill: number; style?: WindowStyle; color?: FrameColor; ramp?: boolean }[];
  roof: Roof | null;
  labels?: { id: number; type: RoomType; at: { x: number; y: number }; level?: number; floor?: FloorFinish; paint?: PaintColor }[];
  levels?: number;
  basement?: boolean;
  platformOffset?: number;
  stairs?: { id: number; level: number; at: { x: number; y: number }; facing: number }[];
  balconies?: { id: number; wall: number; offset: number; width: number; depth: number }[];
  dormers?: { id: number; wall: number; offset: number; width: number; skylight?: boolean }[];
  fence?: FenceStyle;
  /** Missing in saves from before furniture could be edited. */
  furniture?: { id: number; kind: FurnitureKind; level: number; at: { x: number; y: number }; facing: { x: number; y: number }; width: number; depth: number; height: number }[];
  nextId: number;
}

export class House {
  walls: Wall[] = [];
  openings: Opening[] = [];
  roof: Roof | null = null;
  labels: RoomLabel[] = [];
  stairs: Stair[] = [];
  balconies: Balcony[] = [];
  dormers: Dormer[] = [];
  /** Furniture placed in the house (every piece has an id). */
  furniture: Furniture[] = [];
  /** Number of storeys above ground (0 is the ground floor), including empty ones being started. */
  levels = 1;
  /** A basement below the ground floor: storey -1. */
  basement = false;
  /** A fence round the plot, with a gate where the path comes in. */
  fence: FenceStyle | null = null;
  private nextId = 0;

  private freshId(): number {
    this.nextId += 1;
    return this.nextId;
  }

  addWall(start: Vec2, end: Vec2, height: number, material: WallMaterial, boundary = false, level = 0): WallId {
    const id = this.freshId();
    this.walls.push(new Wall(id, start, end, height, DEFAULT_WALL_THICKNESS, material, boundary, level));
    return id;
  }

  /** Add a room boundary: divides space into rooms without building a wall. */
  addBoundary(start: Vec2, end: Vec2, level = 0): WallId {
    return this.addWall(start, end, this.storeyHeight(level), "Plaster", true, level);
  }

  /** Add walls along a closed loop of corner points (the last point connects back to the first). */
  addWallLoop(corners: readonly Vec2[], height: number, material: WallMaterial, level = 0): WallId[] {
    return corners.map((c, i) => this.addWall(c, corners[(i + 1) % corners.length], height, material, false, level));
  }

  /** The walls (and room boundaries) of one storey. */
  wallsOn(level: number): Wall[] {
    return this.walls.filter((w) => w.level === level);
  }

  /** The level a wall, opening or label is on. */
  levelOf(wallId: WallId): number {
    return this.wall(wallId)?.level ?? 0;
  }

  addStair(level: number, at: Vec2, facing = 0): StairId {
    const id = this.freshId();
    this.stairs.push({ id, level, at, facing });
    return id;
  }

  stair(id: StairId): Stair | undefined {
    return this.stairs.find((s) => s.id === id);
  }

  removeStair(id: StairId): void {
    this.stairs = this.stairs.filter((s) => s.id !== id);
  }

  addBalcony(wall: WallId, offset: number, width: number, depth: number): BalconyId {
    const id = this.freshId();
    this.balconies.push({ id, wall, offset, width, depth });
    return id;
  }

  balcony(id: BalconyId): Balcony | undefined {
    return this.balconies.find((b) => b.id === id);
  }

  removeBalcony(id: BalconyId): void {
    this.balconies = this.balconies.filter((b) => b.id !== id);
  }

  addDormer(wall: WallId, offset: number, width: number): DormerId {
    const id = this.freshId();
    this.dormers.push({ id, wall, offset, width });
    return id;
  }

  dormer(id: DormerId): Dormer | undefined {
    return this.dormers.find((d) => d.id === id);
  }

  removeDormer(id: DormerId): void {
    this.dormers = this.dormers.filter((d) => d.id !== id);
  }

  addFurniture(f: Furniture): number {
    const id = this.freshId();
    // "+ 0" turns -0 into 0, so a piece compares equal after a save (JSON drops the sign).
    this.furniture.push({ ...f, id, facing: new Vec2(f.facing.x + 0, f.facing.y + 0) });
    return id;
  }

  furniturePiece(id: number): Furniture | undefined {
    return this.furniture.find((f) => f.id === id);
  }

  removeFurniture(id: number): void {
    this.furniture = this.furniture.filter((f) => f.id !== id);
  }

  /** Add an empty storey on top. Returns its level. */
  addLevel(): number {
    this.levels += 1;
    return this.levels - 1;
  }

  /** The lowest storey: -1 with a basement, else the ground floor. */
  lowestLevel(): number {
    return this.basement ? -1 : 0;
  }

  /** Every storey from the lowest up. */
  levelList(): number[] {
    return Array.from({ length: this.levels - this.lowestLevel() }, (_, i) => this.lowestLevel() + i);
  }

  /**
   * How far the platform the house stands on is raised (+) or lowered (-) from the average
   * height of the ground under it, on sloping plots.
   */
  platformOffset = 0;

  /** Remove the basement with everything in it, and the stairs up from it. */
  removeBasement(): void {
    if (!this.basement) return;
    for (const w of this.wallsOn(-1)) this.removeWall(w.id);
    this.labels = this.labels.filter((l) => l.level !== -1);
    this.stairs = this.stairs.filter((s) => s.level !== -1);
    this.furniture = this.furniture.filter((f) => f.level !== -1);
    this.basement = false;
  }

  /** How deep the basement's hole is: its height and the floor above. */
  basementDepth(): number {
    return this.storeyHeight(-1) + FLOOR_STRUCTURE;
  }

  /** Remove the top storey with everything on it, and the stairs leading up to it. */
  removeTopLevel(): void {
    if (this.levels <= 1) return;
    const top = this.levels - 1;
    for (const w of this.wallsOn(top)) this.removeWall(w.id);
    this.labels = this.labels.filter((l) => l.level !== top);
    this.stairs = this.stairs.filter((s) => s.level < top - 1);
    this.furniture = this.furniture.filter((f) => f.level !== top);
    this.levels -= 1;
  }

  /** Remove a wall together with all openings and balconies on it. */
  removeWall(id: WallId): void {
    this.walls = this.walls.filter((w) => w.id !== id);
    this.openings = this.openings.filter((o) => o.wall !== id);
    this.balconies = this.balconies.filter((b) => b.wall !== id);
    this.dormers = this.dormers.filter((d) => d.wall !== id);
  }

  addWindow(wall: WallId, offset: number, width: number, height: number, sill: number): OpeningId {
    return this.addOpening(wall, "Window", offset, width, height, sill);
  }

  addDoor(wall: WallId, offset: number, width: number, height: number): OpeningId {
    return this.addOpening(wall, "Door", offset, width, height, 0);
  }

  addGlassDoor(wall: WallId, offset: number, width: number, height: number): OpeningId {
    return this.addOpening(wall, "GlassDoor", offset, width, height, 0);
  }

  addPassage(wall: WallId, offset: number, width: number, height: number): OpeningId {
    return this.addOpening(wall, "Passage", offset, width, height, 0);
  }

  addGarageDoor(wall: WallId, offset: number, width: number, height: number): OpeningId {
    return this.addOpening(wall, "GarageDoor", offset, width, height, 0);
  }

  private addOpening(
    wall: WallId,
    kind: OpeningKind,
    offset: number,
    width: number,
    height: number,
    sill: number,
  ): OpeningId {
    const id = this.freshId();
    this.openings.push(new Opening(id, wall, kind, offset, width, height, sill));
    return id;
  }

  addLabel(type: RoomType, at: Vec2, level = 0): LabelId {
    const id = this.freshId();
    this.labels.push({ id, type, at, level });
    return id;
  }

  removeLabel(id: LabelId): void {
    this.labels = this.labels.filter((l) => l.id !== id);
  }

  label(id: LabelId): RoomLabel | undefined {
    return this.labels.find((l) => l.id === id);
  }

  removeOpening(id: OpeningId): void {
    this.openings = this.openings.filter((o) => o.id !== id);
  }

  wall(id: WallId): Wall | undefined {
    return this.walls.find((w) => w.id === id);
  }

  opening(id: OpeningId): Opening | undefined {
    return this.openings.find((o) => o.id === id);
  }

  /** Openings in the given wall, sorted along the wall. */
  openingsIn(wall: WallId): Opening[] {
    return this.openings.filter((o) => o.wall === wall).sort((a, b) => a.offset - b.offset);
  }

  /** Height of the walls of a storey above its floor (0 when it has no walls). */
  eaveHeight(level = 0): number {
    return this.walls.reduce((m, w) => (w.boundary || w.level !== level ? m : Math.max(m, w.height)), 0);
  }

  /** Floor-to-ceiling height of a storey, assuming the default before walls exist. */
  storeyHeight(level: number): number {
    return this.eaveHeight(level) || DEFAULT_WALL_HEIGHT;
  }

  /** Height of a storey's floor above the ground floor's (below it for the basement). */
  levelBase(level: number): number {
    if (level < 0) return -this.basementDepth();
    let base = 0;
    for (let k = 0; k < level; k++) base += this.storeyHeight(k) + FLOOR_STRUCTURE;
    return base;
  }

  /** The highest storey, where the roof sits. */
  topLevel(): number {
    return this.levels - 1;
  }

  /** The outline of a storey along its outer wall centerlines, counter-clockwise. */
  footprint(level = 0): Result<Vec2[], FootprintError> {
    const layout = analyzeLayout(this, level);
    return layout.ok ? { ok: true, value: layout.value.outline } : layout;
  }

  /**
   * Floor area of one storey, or of all storeys above ground when `level` is omitted (0
   * where the walls are not closed). The basement is not counted in the total.
   */
  floorArea(level?: number): number {
    if (level === undefined) {
      let total = 0;
      for (let k = 0; k < this.levels; k++) total += this.floorArea(k);
      return total;
    }
    const fp = this.footprint(level);
    return fp.ok ? signedArea(fp.value) : 0;
  }

  toJSON(): HouseJson {
    return {
      walls: this.walls.map((w) => ({
        id: w.id,
        start: w.start.toJSON(),
        end: w.end.toJSON(),
        height: w.height,
        thickness: w.thickness,
        material: w.material,
        ...(w.boundary ? { boundary: true } : {}),
        level: w.level,
      })),
      openings: this.openings.map((o) => ({ id: o.id, wall: o.wall, kind: o.kind, offset: o.offset, width: o.width, height: o.height, sill: o.sill, ...(o.style ? { style: o.style } : {}), ...(o.color ? { color: o.color } : {}), ...(o.ramp ? { ramp: true } : {}) })),
      roof: this.roof ? { ...this.roof } : null,
      labels: this.labels.map((l) => ({ id: l.id, type: l.type, at: l.at.toJSON(), level: l.level, ...(l.floor ? { floor: l.floor } : {}), ...(l.paint ? { paint: l.paint } : {}) })),
      levels: this.levels,
      ...(this.basement ? { basement: true } : {}),
      ...(this.platformOffset ? { platformOffset: this.platformOffset } : {}),
      stairs: this.stairs.map((s) => ({ id: s.id, level: s.level, at: s.at.toJSON(), facing: s.facing })),
      ...(this.balconies.length ? { balconies: this.balconies.map((b) => ({ ...b })) } : {}),
      ...(this.dormers.length ? { dormers: this.dormers.map((d) => ({ ...d })) } : {}),
      ...(this.fence ? { fence: this.fence } : {}),
      furniture: this.furniture.map((f) => ({ id: f.id!, kind: f.kind, level: f.level, at: f.at.toJSON(), facing: f.facing.toJSON(), width: f.width, depth: f.depth, height: f.height })),
      nextId: this.nextId,
    };
  }

  static fromJSON(j: HouseJson): House {
    const h = new House();
    h.walls = j.walls.map((w) => new Wall(w.id, Vec2.from(w.start), Vec2.from(w.end), w.height, w.thickness, w.material, w.boundary ?? false, w.level ?? 0));
    h.openings = j.openings.map((o) => {
      const op = new Opening(o.id, o.wall, o.kind, o.offset, o.width, o.height, o.sill);
      if (o.style) op.style = o.style;
      if (o.color) op.color = o.color;
      if (o.ramp) op.ramp = true;
      return op;
    });
    h.roof = j.roof ? { ...j.roof } : null;
    h.labels = (j.labels ?? []).map((l) => ({ id: l.id, type: l.type, at: Vec2.from(l.at), level: l.level ?? 0, ...(l.floor ? { floor: l.floor } : {}), ...(l.paint ? { paint: l.paint } : {}) }));
    h.levels = j.levels ?? 1;
    h.basement = j.basement ?? false;
    h.platformOffset = j.platformOffset ?? 0;
    h.stairs = (j.stairs ?? []).map((s) => ({ id: s.id, level: s.level, at: Vec2.from(s.at), facing: s.facing }));
    h.balconies = (j.balconies ?? []).map((b) => ({ ...b }));
    h.dormers = (j.dormers ?? []).map((d) => ({ ...d }));
    h.fence = j.fence ?? null;
    h.furniture = (j.furniture ?? []).map((f) => ({ ...f, at: Vec2.from(f.at), facing: Vec2.from(f.facing) }));
    h.nextId = j.nextId;
    return h;
  }

  clone(): House {
    return House.fromJSON(this.toJSON());
  }
}

/**
 * A solid rectangular piece of a wall, in the wall's local coordinates:
 * `u` runs along the wall from `start` (may extend slightly past either end to close
 * corners), `v` is height above the floor.
 */
export interface WallPiece {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/**
 * Split a wall into solid rectangles around its openings.
 *
 * Each wall is extended by half its thickness at both ends so neighbouring walls
 * overlap at corners instead of leaving a notch. Interior walls pass their own
 * (thinner) `thickness`.
 */
export function wallPieces(wall: Wall, openings: readonly Opening[], thickness = wall.thickness): WallPiece[] {
  const ext = thickness * 0.5;
  const len = wall.length();
  const h = wall.height;
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);

  const pieces: WallPiece[] = [];
  let cursor = -ext;
  for (const o of sorted) {
    const left = Math.max(o.left(), cursor);
    const right = Math.min(o.right(), len + ext);
    if (right <= left) continue;
    if (left > cursor) pieces.push({ u0: cursor, u1: left, v0: 0, v1: h });
    if (o.sill > 0) pieces.push({ u0: left, u1: right, v0: 0, v1: Math.min(o.sill, h) });
    if (o.top() < h) pieces.push({ u0: left, u1: right, v0: o.top(), v1: h });
    cursor = right;
  }
  if (cursor < len + ext) pieces.push({ u0: cursor, u1: len + ext, v0: 0, v1: h });
  return pieces;
}
