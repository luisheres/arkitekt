/**
 * The house data model: walls, openings (windows and doors) and the roof.
 *
 * The MVP supports single-storey houses whose exterior walls form one closed loop.
 */

import { SNAP_EPS, Vec2, isSimplePolygon, signedArea } from "./geometry";
import { type Result, err, ok } from "./result";

/** Default wall thickness in meters. */
export const DEFAULT_WALL_THICKNESS = 0.25;

export type WallId = number;
export type OpeningId = number;

export const WALL_MATERIALS = ["Wood", "Brick", "Plaster"] as const;
export type WallMaterial = (typeof WALL_MATERIALS)[number];

export const ROOF_STYLES = ["Flat", "Gable", "Hip"] as const;
export type RoofStyle = (typeof ROOF_STYLES)[number];

export const ROOF_MATERIALS = ["Shingles", "Metal", "Tiles"] as const;
export type RoofMaterial = (typeof ROOF_MATERIALS)[number];

export type OpeningKind = "Window" | "Door";

export class Wall {
  constructor(
    readonly id: WallId,
    public start: Vec2,
    public end: Vec2,
    public height: number,
    public thickness: number,
    public material: WallMaterial,
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
export class Opening {
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
  | { kind: "Branching"; x: number; y: number }
  | { kind: "MultipleLoops" }
  | { kind: "SelfIntersecting" }
  | { kind: "Degenerate" };

export function describeFootprintError(e: FootprintError): string {
  switch (e.kind) {
    case "NoWalls":
      return "there are no walls";
    case "Open":
      return `the walls are not closed: a wall end at (${e.x.toFixed(1)}, ${e.y.toFixed(1)}) is not connected`;
    case "Branching":
      return `more than two walls meet at (${e.x.toFixed(1)}, ${e.y.toFixed(1)}); interior walls are not supported yet`;
    case "MultipleLoops":
      return "the walls form more than one separate loop";
    case "SelfIntersecting":
      return "the outer walls cross each other";
    case "Degenerate":
      return "the enclosed area is zero";
  }
}

/** Plain-JSON form of a house, for saving and for sending to the appraiser. */
export interface HouseJson {
  walls: { id: number; start: { x: number; y: number }; end: { x: number; y: number }; height: number; thickness: number; material: WallMaterial }[];
  openings: { id: number; wall: number; kind: OpeningKind; offset: number; width: number; height: number; sill: number }[];
  roof: Roof | null;
  nextId: number;
}

export class House {
  walls: Wall[] = [];
  openings: Opening[] = [];
  roof: Roof | null = null;
  private nextId = 0;

  private freshId(): number {
    this.nextId += 1;
    return this.nextId;
  }

  addWall(start: Vec2, end: Vec2, height: number, material: WallMaterial): WallId {
    const id = this.freshId();
    this.walls.push(new Wall(id, start, end, height, DEFAULT_WALL_THICKNESS, material));
    return id;
  }

  /** Add walls along a closed loop of corner points (the last point connects back to the first). */
  addWallLoop(corners: readonly Vec2[], height: number, material: WallMaterial): WallId[] {
    return corners.map((c, i) => this.addWall(c, corners[(i + 1) % corners.length], height, material));
  }

  /** Remove a wall together with all openings in it. */
  removeWall(id: WallId): void {
    this.walls = this.walls.filter((w) => w.id !== id);
    this.openings = this.openings.filter((o) => o.wall !== id);
  }

  addWindow(wall: WallId, offset: number, width: number, height: number, sill: number): OpeningId {
    return this.addOpening(wall, "Window", offset, width, height, sill);
  }

  addDoor(wall: WallId, offset: number, width: number, height: number): OpeningId {
    return this.addOpening(wall, "Door", offset, width, height, 0);
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

  /** Height of the top of the walls, where the roof sits. */
  eaveHeight(): number {
    return this.walls.reduce((m, w) => Math.max(m, w.height), 0);
  }

  /** The closed outline traced by the wall centerlines, counter-clockwise. */
  footprint(): Result<Vec2[], FootprintError> {
    if (this.walls.length === 0) return err({ kind: "NoWalls" });

    // Merge wall endpoints that are within SNAP_EPS of each other into shared vertices.
    const vertices: Vec2[] = [];
    const vertexOf = (p: Vec2): number => {
      const i = vertices.findIndex((v) => v.distance(p) < SNAP_EPS);
      if (i >= 0) return i;
      vertices.push(p);
      return vertices.length - 1;
    };
    const edges = this.walls
      .map((w): [number, number] => [vertexOf(w.start), vertexOf(w.end)])
      .filter(([a, b]) => a !== b);

    const adjacency = new Map<number, number[]>();
    const link = (a: number, b: number) => {
      const list = adjacency.get(a);
      if (list) list.push(b);
      else adjacency.set(a, [b]);
    };
    for (const [a, b] of edges) {
      link(a, b);
      link(b, a);
    }
    for (const [i, v] of vertices.entries()) {
      const degree = adjacency.get(i)?.length ?? 0;
      if (degree < 2) return err({ kind: "Open", x: v.x, y: v.y });
      if (degree > 2) return err({ kind: "Branching", x: v.x, y: v.y });
    }

    // Every vertex has degree two, so walking from vertex 0 traces one loop.
    const outline = [0];
    let prev = -1;
    let cur = 0;
    for (;;) {
      const neighbours = adjacency.get(cur)!;
      const next = neighbours.find((n) => n !== prev) ?? prev;
      if (next === 0) break;
      outline.push(next);
      prev = cur;
      cur = next;
      if (outline.length > vertices.length) break;
    }
    if (outline.length !== vertices.length) return err({ kind: "MultipleLoops" });

    const poly = outline.map((i) => vertices[i]);
    if (!isSimplePolygon(poly)) return err({ kind: "SelfIntersecting" });
    const area = signedArea(poly);
    if (Math.abs(area) < 1e-3) return err({ kind: "Degenerate" });
    if (area < 0) poly.reverse();
    return ok(poly);
  }

  /** Floor area enclosed by the wall centerlines (0 if the walls are not closed). */
  floorArea(): number {
    const fp = this.footprint();
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
      })),
      openings: this.openings.map((o) => ({ ...o })),
      roof: this.roof ? { ...this.roof } : null,
      nextId: this.nextId,
    };
  }

  static fromJSON(j: HouseJson): House {
    const h = new House();
    h.walls = j.walls.map((w) => new Wall(w.id, Vec2.from(w.start), Vec2.from(w.end), w.height, w.thickness, w.material));
    h.openings = j.openings.map((o) => new Opening(o.id, o.wall, o.kind, o.offset, o.width, o.height, o.sill));
    h.roof = j.roof ? { ...j.roof } : null;
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
 * overlap at corners instead of leaving a notch.
 */
export function wallPieces(wall: Wall, openings: readonly Opening[]): WallPiece[] {
  const ext = wall.thickness * 0.5;
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
