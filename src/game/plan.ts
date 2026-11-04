/**
 * The 2D plan editor: a top-down SVG drawing of the plot and house, with the tools for
 * drawing walls and rooms, placing windows and doors, naming rooms, and dragging things.
 *
 * The plan is a true view from above, turned so the street is at the bottom: plan +x
 * points left and plan +y points up on screen. That matches the 3D front view, where
 * the camera stands in the street looking at the house.
 */

import {
  type House,
  type Issue,
  type Opening,
  type Room,
  type Furniture,
  type RoomAnalysis,
  type Stair,
  type Wall,
  DEFAULT_OPENING,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_MATERIAL,
  GRID_STEP,
  MAX_LEVELS,
  STAIR_LENGTH,
  STAIR_WIDTH,
  MIN_WALL_LENGTH,
  OPENING_STEP,
  ROOM_INFO,
  SNAP_EPS,
  Vec2,
  addRectangle,
  addWallChain,
  analyzeRooms,
  clampOffset,
  corners,
  furnitureAt,
  interiorNormal,
  leftNormal,
  moveCorner,
  moveWall,
  nearestWall,
  placeOpening,
  placeStair,
  pointInPolygon,
  snapToGrid,
  stairDirection,
  stairOutline,
  roomAt,
  fixed,
  num,
  roomName,
  roundTo,
  snapPoint,
  validate,
  wallThickness,
} from "../core";
import { m } from "./i18n";
import { type Selection, type Store, type Tool, drawsWalls } from "./store";

const PLAN_WALL_COLORS = { Wood: "#7a5134", FaluRed: "#8a2a1e", Brick: "#8c3d2e", Plaster: "#6f6b63", Stone: "#77736a" } as const;
const INTERIOR_WALL_COLOR = "#a19b90";
/** Pointer distances, in screen pixels. */
const SNAP_PX = 10;
const PICK_PX = 6;

type Drag =
  | { kind: "pan"; x: number; y: number }
  | { kind: "corner"; at: Vec2 }
  | { kind: "wall"; id: number; grab: Vec2; original: { start: Vec2; end: Vec2 }; distance: number }
  | { kind: "opening"; id: number; grab: number }
  | { kind: "label"; id: number; grab: Vec2 }
  | { kind: "stair"; id: number; grab: Vec2 }
  | { kind: "furniture"; id: number; grab: Vec2 }
  | { kind: "room"; start: Vec2 };

type Hit =
  | { kind: "corner"; at: Vec2 }
  | { kind: "wall"; id: number }
  | { kind: "opening"; id: number }
  | { kind: "label"; id: number; at: Vec2 }
  | { kind: "stair"; id: number }
  | { kind: "furniture"; id: number }
  | { kind: "room"; at: Vec2 }
  | null;


const fmt = (x: number) => num(m, x, 2);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export class PlanView {
  private readonly svg: SVGSVGElement;
  private readonly hint: HTMLElement;
  private readonly levels: HTMLElement;
  private shownLevel = 0;
  private scale = 20; // pixels per meter
  private center = new Vec2(0, 0);
  private width = 0;
  private height = 0;
  private fitted = false;

  /** Plan point under the pointer, unsnapped. */
  private cursor: Vec2 | null = null;
  private freeSnap = false; // Alt held: no grid snapping
  private draft: Vec2[] = [];
  private draftTool: Tool = "select";
  private drag: Drag | null = null;
  private hover: Hit = null;
  private issues: Issue[] = [];
  private analysis: RoomAnalysis | null = null;
  /** Where the pointer went down, to tell a click (which opens the menu) from a drag. */
  private down: { x: number; y: number; button: number } | null = null;
  private frameRequested = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly store: Store,
    /** Open the pop-up menu for the selection at (x, y), in page coordinates. */
    private readonly onMenu: (x: number, y: number) => void = () => {},
  ) {
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.classList.add("plan");
    this.hint = document.createElement("div");
    this.hint.className = "plan-hint";
    this.levels = document.createElement("div");
    this.levels.className = "level-switch";
    this.levels.addEventListener("click", (e) => this.levelClick(e));
    container.append(this.svg, this.hint, this.levels);

    this.refresh();
    store.subscribe((change) => {
      if (change !== "ui" || store.level !== this.shownLevel) this.refresh();
      if (change === "client") this.fit();
      // The chain being drawn belongs to the tool it was started with.
      if (store.tool !== this.draftTool) this.draft = [];
      this.draftTool = store.tool;
      this.requestRender();
    });
    new ResizeObserver(() => this.resize()).observe(container);
    this.attachInput();
  }

  // --- Public commands ---------------------------------------------------------------

  /** Fit the whole plot and the street into view. */
  fit(): void {
    const { plot } = this.store;
    const [x0, x1, y0, y1] = [-1, plot.width + 1, -8.5, plot.depth + 1];
    this.scale = Math.min(this.width / (x1 - x0), this.height / (y1 - y0)) * 0.92;
    this.center = new Vec2((x0 + x1) / 2, (y0 + y1) / 2);
    this.requestRender();
  }

  /** Cancel the drawing in progress. Returns false when there was nothing to cancel. */
  cancel(): boolean {
    if (this.draft.length > 0 || this.drag?.kind === "room") {
      this.draft = [];
      this.drag = null;
      this.requestRender();
      return true;
    }
    return false;
  }

  /** Finish an open chain of walls. */
  finish(): void {
    if (this.draft.length >= 2) this.commitDraft(false);
    else this.cancel();
  }

  /** Page coordinates of a plan point (for automated tests). */
  clientPoint(x: number, y: number): { x: number; y: number } {
    const r = this.svg.getBoundingClientRect();
    const [sx, sy] = this.toScreen(new Vec2(x, y));
    return { x: r.left + sx, y: r.top + sy };
  }

  // --- Coordinates -------------------------------------------------------------------

  private toScreen(p: Vec2): [number, number] {
    return [this.width / 2 - (p.x - this.center.x) * this.scale, this.height / 2 - (p.y - this.center.y) * this.scale];
  }

  private toPlan(sx: number, sy: number): Vec2 {
    return new Vec2(this.center.x - (sx - this.width / 2) / this.scale, this.center.y - (sy - this.height / 2) / this.scale);
  }

  private eventPoint(e: MouseEvent): Vec2 {
    const r = this.svg.getBoundingClientRect();
    return this.toPlan(e.clientX - r.left, e.clientY - r.top);
  }

  private resize(): void {
    const r = this.container.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    this.width = r.width;
    this.height = r.height;
    this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
    if (!this.fitted) {
      this.fitted = true;
      this.fit();
    }
    this.requestRender();
  }

  // --- Model helpers -----------------------------------------------------------------

  private get house(): House {
    return this.store.house;
  }

  /** The storey being edited. */
  private get level(): number {
    return this.store.level;
  }

  /** Walls (and room boundaries) of the storey being edited. */
  private get walls(): Wall[] {
    return this.house.wallsOn(this.level);
  }

  /** Stairs that start or arrive on the storey being edited. */
  private get stairs(): Stair[] {
    return this.house.stairs.filter((s) => s.level === this.level || s.level + 1 === this.level);
  }

  private refresh(): void {
    const { house, plot, budget, prices } = this.store;
    this.shownLevel = this.store.level;
    const result = analyzeRooms(house, this.level);
    this.analysis = result.ok ? result.value : null;
    this.issues = validate(house, plot, budget, prices);
  }

  private get rooms(): Room[] {
    return this.analysis?.rooms ?? [];
  }

  private thickness(wall: Wall): number {
    return wallThickness(this.analysis?.layout ?? null, wall);
  }

  /**
   * Snap a point to corners, then onto walls, then to the grid. `exclude` is a corner
   * being dragged: it and the walls meeting there are left out.
   */
  private snap(p: Vec2, exclude?: Vec2) {
    const near = (q: Vec2) => !!exclude && q.distance(exclude) < SNAP_EPS;
    // The floor below's corners help to stack walls on walls.
    const below = this.level > 0 ? corners(this.house, this.level - 1) : [];
    const anchors = [...corners(this.house, this.level), ...below, ...this.draft].filter((a) => !near(a));
    const lines = this.walls.filter((w) => !near(w.start) && !near(w.end)).map((w) => [w.start, w.end] as const);
    const step = this.freeSnap ? 0.05 : GRID_STEP;
    // When zoomed out, a fixed pixel radius would reach past neighbouring grid points.
    const radius = Math.min(SNAP_PX / this.scale, step * 0.45);
    return snapPoint(p, anchors, radius, step, lines);
  }

  private hitTest(p: Vec2): Hit {
    const px = 1 / this.scale;
    let corner: Vec2 | null = null;
    for (const c of corners(this.house, this.level)) {
      if (c.distance(p) < (SNAP_PX - 1) * px && (!corner || c.distance(p) < corner.distance(p))) corner = c;
    }
    if (corner) return { kind: "corner", at: corner };
    for (const o of this.house.openings) {
      const wall = this.house.wall(o.wall);
      if (!wall || wall.level !== this.level) continue;
      const rel = p.sub(wall.start);
      const u = rel.dot(wall.direction());
      const w = rel.dot(leftNormal(wall));
      if (u >= o.left() - 2 * px && u <= o.right() + 2 * px && Math.abs(w) <= this.thickness(wall) / 2 + PICK_PX * px) {
        return { kind: "opening", id: o.id };
      }
    }
    const hit = nearestWall(this.house, p, 1, this.level);
    if (hit && hit.distance <= this.thickness(hit.wall) / 2 + PICK_PX * px) return { kind: "wall", id: hit.wall.id };
    // Furniture before room names: a new piece lands in the middle of the room, on its name.
    if (this.store.showFurniture) {
      const piece = furnitureAt(this.house, p, this.level);
      if (piece) return { kind: "furniture", id: piece.id! };
    }
    for (const label of this.house.labels) {
      if (label.level !== this.level) continue;
      const [sx, sy] = this.toScreen(label.at);
      const [qx, qy] = this.toScreen(p);
      if (Math.abs(qx - sx) < 44 && Math.abs(qy - sy) < 16) return { kind: "label", id: label.id, at: label.at };
    }
    const stair = this.stairs.find((s) => pointInPolygon(p, stairOutline(s)));
    if (stair) return { kind: "stair", id: stair.id };
    if (roomAt(this.rooms, p)) return { kind: "room", at: p };
    return null;
  }

  /** A label inside a room selects the room; a label left outside every room selects itself. */
  private labelSelection(id: number, at: Vec2): NonNullable<Selection> {
    return roomAt(this.rooms, at) ? { kind: "room", at } : { kind: "label", id };
  }

  /** Height and material for new walls: match the existing walls. */
  private newWallStyle() {
    const first = this.walls.find((w) => !w.boundary) ?? this.house.walls.find((w) => !w.boundary);
    return { height: first?.height ?? DEFAULT_WALL_HEIGHT, material: first?.material ?? DEFAULT_WALL_MATERIAL };
  }

  private openingTarget(p: Vec2) {
    const hit = nearestWall(this.house, p, Math.max(0.6, 14 / this.scale), this.level);
    // Windows and doors need a real wall.
    return hit && !hit.wall.boundary ? { wall: hit.wall, offset: hit.offset } : null;
  }

  // --- Input -------------------------------------------------------------------------

  private attachInput(): void {
    const svg = this.svg;
    svg.addEventListener("contextmenu", (e) => e.preventDefault());
    svg.addEventListener("pointerdown", (e) => this.pointerDown(e));
    svg.addEventListener("pointermove", (e) => this.pointerMove(e));
    svg.addEventListener("pointerup", (e) => this.pointerUp(e));
    svg.addEventListener("pointercancel", () => this.endDrag());
    svg.addEventListener("pointerleave", () => {
      this.cursor = null;
      this.hover = null;
      this.requestRender();
    });
    svg.addEventListener("dblclick", () => {
      if (drawsWalls(this.store.tool)) this.finish();
    });
    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        const [sx, sy] = [e.clientX - r.left, e.clientY - r.top];
        const before = this.toPlan(sx, sy);
        const notches = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? -e.deltaY / 3 : -e.deltaY / 100;
        this.scale = Math.min(Math.max(this.scale * Math.pow(1.15, notches), 3), 300);
        // Keep the point under the cursor fixed.
        const after = this.toPlan(sx, sy);
        this.center = this.center.add(before.sub(after));
        this.requestRender();
      },
      { passive: false },
    );
  }

  private pointerDown(e: PointerEvent): void {
    this.svg.setPointerCapture(e.pointerId);
    this.down = { x: e.clientX, y: e.clientY, button: e.button };
    this.freeSnap = e.altKey;
    const p = this.eventPoint(e);
    this.cursor = p;
    if (e.button === 1 || e.button === 2) {
      this.drag = { kind: "pan", x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    const { store } = this;

    switch (store.tool) {
      case "select": {
        const hit = this.hitTest(p);
        if (!hit) {
          store.select(null);
          this.drag = { kind: "pan", x: e.clientX, y: e.clientY };
          return;
        }
        if (hit.kind === "room") {
          store.select({ kind: "room", at: p });
          this.drag = { kind: "pan", x: e.clientX, y: e.clientY };
          return;
        }
        store.beginGesture();
        if (hit.kind === "corner") {
          this.drag = { kind: "corner", at: hit.at };
        } else if (hit.kind === "label") {
          store.select(this.labelSelection(hit.id, hit.at));
          this.drag = { kind: "label", id: hit.id, grab: p.sub(hit.at) };
        } else if (hit.kind === "stair") {
          store.select(hit);
          this.drag = { kind: "stair", id: hit.id, grab: p.sub(this.house.stair(hit.id)!.at) };
        } else if (hit.kind === "furniture") {
          store.select(hit);
          this.drag = { kind: "furniture", id: hit.id, grab: p.sub(this.house.furniturePiece(hit.id)!.at) };
        } else if (hit.kind === "wall") {
          store.select(hit);
          const wall = this.house.wall(hit.id)!;
          this.drag = { kind: "wall", id: hit.id, grab: p, original: { start: wall.start, end: wall.end }, distance: 0 };
        } else {
          store.select(hit);
          const o = this.house.opening(hit.id)!;
          const wall = this.house.wall(o.wall)!;
          this.drag = { kind: "opening", id: o.id, grab: p.sub(wall.start).dot(wall.direction()) - o.offset };
        }
        break;
      }
      case "wall":
      case "boundary":
        this.addDraftPoint(this.snap(p));
        break;
      case "room":
        this.drag = { kind: "room", start: this.snap(p).point };
        break;
      case "stairs": {
        let id: number | null = null;
        const at = snapToGrid(p, this.freeSnap ? 0.05 : GRID_STEP / 2);
        store.edit((h) => (id = placeStair(h, this.level, at, 0)));
        if (id !== null) store.select({ kind: "stair", id });
        break;
      }
      case "window":
      case "door": {
        const target = this.openingTarget(p);
        if (!target) return;
        let id: number | null = null;
        store.edit((h) => {
          id = placeOpening(h, target.wall.id, store.tool === "door" ? "Door" : "Window", target.offset);
        });
        if (id !== null) store.select({ kind: "opening", id });
        break;
      }
    }
    this.requestRender();
  }

  private pointerMove(e: PointerEvent): void {
    this.freeSnap = e.altKey;
    const p = this.eventPoint(e);
    this.cursor = p;
    const drag = this.drag;
    const { store } = this;

    if (!drag) {
      this.hover = store.tool === "select" ? this.hitTest(p) : null;
    } else if (drag.kind === "pan") {
      this.center = this.center.add(new Vec2((e.clientX - drag.x) / this.scale, (e.clientY - drag.y) / this.scale));
      drag.x = e.clientX;
      drag.y = e.clientY;
    } else if (drag.kind === "corner") {
      const to = this.snap(p, drag.at).point;
      if (to.distance(drag.at) > 1e-6) {
        const from = drag.at;
        const level = this.level;
        store.gestureEdit((h) => moveCorner(h, from, to, level));
        drag.at = to;
      }
    } else if (drag.kind === "wall") {
      const { original } = drag;
      const d = original.end.sub(original.start).normalize();
      const along = p.sub(drag.grab).dot(new Vec2(-d.y, d.x));
      const distance = roundTo(along, this.freeSnap ? 0.05 : GRID_STEP);
      if (distance !== drag.distance) {
        store.gestureEdit((h) => moveWall(h, drag.id, original, distance));
        drag.distance = distance;
      }
    } else if (drag.kind === "opening") {
      const o = this.house.opening(drag.id);
      const target = this.openingTarget(p);
      if (o && target) {
        const grab = target.wall.id === o.wall ? drag.grab : 0;
        const offset = roundTo(clampOffset(target.wall, o.width, target.offset - grab), OPENING_STEP);
        if (target.wall.id !== o.wall || Math.abs(offset - o.offset) > 1e-9) {
          store.gestureEdit((h) => {
            const op = h.opening(drag.id)!;
            op.wall = target.wall.id;
            op.offset = offset;
          });
          drag.grab = grab;
        }
      }
    } else if (drag.kind === "furniture") {
      const at = snapToGrid(p.sub(drag.grab), 0.05);
      store.gestureEdit((h) => {
        const f = h.furniturePiece(drag.id);
        if (f) f.at = at;
      });
    } else if (drag.kind === "stair") {
      const at = snapToGrid(p.sub(drag.grab), this.freeSnap ? 0.05 : GRID_STEP / 2);
      store.gestureEdit((h) => {
        const s = h.stair(drag.id);
        if (s) s.at = at;
      });
    } else if (drag.kind === "label") {
      const at = p.sub(drag.grab);
      store.gestureEdit((h) => {
        const label = h.label(drag.id);
        if (label) label.at = at;
      });
    }
    this.requestRender();
  }

  private pointerUp(e: PointerEvent): void {
    const drag = this.drag;
    // A click (not a drag) opens the menu: left-click with the select tool, right-click with any tool.
    const down = this.down;
    this.down = null;
    const clicked = down && down.button === e.button && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5;
    if (clicked && e.button === 2) {
      this.endDrag();
      const hit = this.hitTest(this.eventPoint(e));
      if (hit && hit.kind !== "corner") {
        this.store.select(hit.kind === "label" ? this.labelSelection(hit.id, hit.at) : hit);
        this.onMenu(e.clientX, e.clientY);
      } else this.store.select(null);
      return;
    }
    if (clicked && e.button === 0 && this.store.tool === "select" && this.store.selection) {
      this.endDrag();
      this.onMenu(e.clientX, e.clientY);
      return;
    }
    if (drag?.kind === "room" && e.button === 0) {
      const end = this.snap(this.eventPoint(e)).point;
      const { height, material } = this.newWallStyle();
      const level = this.level;
      this.store.edit((h) => void addRectangle(h, drag.start, end, height, material, level));
    }
    if (drag?.kind === "label") {
      const label = this.house.label(drag.id);
      if (label) this.store.select(this.labelSelection(label.id, label.at));
    }
    this.endDrag();
  }

  private endDrag(): void {
    if (this.drag && this.drag.kind !== "pan" && this.drag.kind !== "room") this.store.endGesture();
    this.drag = null;
    this.requestRender();
  }

  private addDraftPoint(snap: { point: Vec2; anchored: boolean }): void {
    const p = snap.point;
    const draft = this.draft;
    if (draft.length === 0) {
      draft.push(p);
      return;
    }
    if (p.distance(draft[draft.length - 1]) < 1e-6) return; // double-click
    if (draft.length >= 3 && p.distance(draft[0]) < 1e-6) {
      this.commitDraft(true);
      return;
    }
    draft.push(p);
    // Reaching an existing wall or corner connects to it and ends the chain.
    if (snap.anchored && !draft.slice(0, -1).some((q) => q.distance(p) < 1e-6)) this.commitDraft(false);
  }

  private commitDraft(closed: boolean): void {
    const points = this.draft;
    this.draft = [];
    const { height, material } = this.newWallStyle();
    const options = { boundary: this.store.tool === "boundary", level: this.level };
    this.store.edit((h) => void addWallChain(h, points, closed, height, material, options));
  }

  // --- Drawing -----------------------------------------------------------------------

  private requestRender(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.render();
    });
  }

  private pts(points: Vec2[]): string {
    return points.map((p) => this.toScreen(p).map((v) => v.toFixed(1)).join(",")).join(" ");
  }

  private label(p: Vec2, text: string, cls = "dim"): string {
    const [x, y] = this.toScreen(p);
    return `<text class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${text}</text>`;
  }

  private render(): void {
    if (this.width === 0) return;
    const { plot, tool, selection } = this.store;
    const house = this.house;
    const out: string[] = [];

    // Ground, street and plot.
    out.push(`<rect class="land" width="${this.width}" height="${this.height}"/>`);
    const rect = (x0: number, y0: number, x1: number, y1: number, cls: string) =>
      `<polygon class="${cls}" points="${this.pts([new Vec2(x0, y0), new Vec2(x1, y0), new Vec2(x1, y1), new Vec2(x0, y1)])}"/>`;
    const tl = this.toPlan(0, 0);
    const br = this.toPlan(this.width, this.height);
    const [vx0, vx1] = [Math.min(tl.x, br.x), Math.max(tl.x, br.x)];
    const [vy0, vy1] = [Math.min(tl.y, br.y), Math.max(tl.y, br.y)];
    out.push(rect(vx0, -8, vx1, -1, "street"));
    const streetY = this.toScreen(new Vec2(0, -4.5))[1];
    out.push(`<line class="street-line" x1="0" x2="${this.width}" y1="${streetY}" y2="${streetY}"/>`);
    out.push(this.label(new Vec2(plot.width / 2, -4.5), m.ui.street, "street-label"));
    out.push(rect(0, 0, plot.width, plot.depth, "lawn"));

    // Grid: 1 m lines, stronger every 5 m.
    if (this.scale >= 8) {
      const lines: string[] = [];
      for (let x = Math.ceil(vx0); x <= vx1; x++) {
        const sx = this.toScreen(new Vec2(x, 0))[0].toFixed(1);
        lines.push(`<line class="${x % 5 === 0 ? "grid5" : "grid"}" x1="${sx}" x2="${sx}" y1="0" y2="${this.height}"/>`);
      }
      for (let y = Math.ceil(vy0); y <= vy1; y++) {
        const sy = this.toScreen(new Vec2(0, y))[1].toFixed(1);
        lines.push(`<line class="${y % 5 === 0 ? "grid5" : "grid"}" y1="${sy}" y2="${sy}" x1="0" x2="${this.width}"/>`);
      }
      out.push(`<g>${lines.join("")}</g>`);
    }
    out.push(rect(0, 0, plot.width, plot.depth, "plot-edge"));
    out.push(rect(plot.setback, plot.setback, plot.width - plot.setback, plot.depth - plot.setback, "setback"));

    // The floor below, faintly, to build on.
    if (this.level > 0) {
      const below = this.house.wallsOn(this.level - 1).filter((w) => !w.boundary);
      out.push(`<g class="below">${below.map((w) => `<polyline points="${this.pts([w.start, w.end])}"/>`).join("")}</g>`);
    }

    // Which things have problems.
    const badWalls = new Set<number>();
    const badOpenings = new Set<number>();
    const badRooms = new Set<Room>();
    for (const i of this.issues) {
      if ("wall" in i) badWalls.add(i.wall);
      if ("opening" in i) badOpenings.add(i.opening);
      if (i.kind === "OpeningsOverlap") [i.a, i.b].forEach((id) => badOpenings.add(id));
      if ("room" in i && i.room.level === this.level) {
        const r = roomAt(this.rooms, i.room.at);
        if (r) badRooms.add(r);
      }
    }
    const selectedRoom = selection?.kind === "room" ? roomAt(this.rooms, selection.at) : undefined;
    const hoverRoom = this.hover?.kind === "room" || this.hover?.kind === "label" ? roomAt(this.rooms, this.hover.at) : undefined;

    // Room floors.
    const fp = house.footprint(this.level);
    if (fp.ok) out.push(`<polygon class="floor" points="${this.pts(fp.value)}"/>`);
    for (const room of this.rooms) {
      const fill = room.type ? ROOM_INFO[room.type].color : "#f7f3ea";
      const cls = ["room", badRooms.has(room) && "bad", hoverRoom === room && "hover"].filter(Boolean).join(" ");
      out.push(`<polygon class="${cls}" style="fill:${fill}" points="${this.pts(room.polygon)}"/>`);
    }

    const hoverId = (kind: string) => (this.hover?.kind === kind ? (this.hover as { id: number }).id : null);
    const selId = (kind: string) => (selection?.kind === kind ? (selection as { id: number }).id : null);
    // Furniture, faintly, under the walls.
    if (this.store.showFurniture) {
      const pieces = house.furniture.filter((f) => f.level === this.level).map((f) => {
        const state = [hoverId("furniture") === f.id && "hover", selId("furniture") === f.id && "selected"].filter(Boolean).join(" ");
        return `<g class="piece ${state}">${this.furnitureSymbol(f)}</g>`;
      });
      out.push(`<g class="furniture">${pieces.join("")}</g>`);
    }

    // Walls, then openings cut into them.
    for (const wall of this.walls) {
      const exterior = !this.analysis || this.analysis.layout.exterior.has(wall.id);
      const cls = ["wall", badWalls.has(wall.id) && "bad", hoverId("wall") === wall.id && "hover", selId("wall") === wall.id && "selected"];
      if (wall.boundary) {
        cls[0] = "boundary";
        out.push(`<polyline class="${cls.filter(Boolean).join(" ")}" points="${this.pts([wall.start, wall.end])}"/>`);
        continue;
      }
      const fill = exterior ? PLAN_WALL_COLORS[wall.material] : INTERIOR_WALL_COLOR;
      out.push(`<polygon class="${cls.filter(Boolean).join(" ")}" style="fill:${fill}" points="${this.pts(this.wallOutline(wall))}"/>`);
    }
    for (const o of house.openings) {
      const wall = house.wall(o.wall);
      if (!wall || wall.level !== this.level) continue;
      const state = [badOpenings.has(o.id) && "bad", hoverId("opening") === o.id && "hover", selId("opening") === o.id && "selected"];
      out.push(this.openingSymbol(house, wall, o.kind, o.left(), o.right(), state.filter(Boolean).join(" ")));
    }
    if (selectedRoom) out.push(`<polygon class="room-selected" points="${this.pts(selectedRoom.polygon)}"/>`);

    // Stairs: going up from this storey, or arriving from the one below.
    const badStairs = new Set(this.issues.flatMap((i) => ("stair" in i ? [i.stair] : [])));
    for (const s of this.stairs) {
      const state = [badStairs.has(s.id) && "bad", hoverId("stair") === s.id && "hover", selId("stair") === s.id && "selected"];
      out.push(this.stairSymbol(s, s.level === this.level, state.filter(Boolean).join(" ")));
    }

    // Labels whose room is gone: shown in red so they can be dragged into a room or deleted.
    for (const label of this.analysis?.strayLabels ?? []) {
      const [x, y] = this.toScreen(label.at);
      const selected = selection?.kind === "label" && selection.id === label.id ? " selected" : "";
      out.push(`<text class="room-name stray${selected}" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${esc(m.rooms[label.type].name)}</text>`);
    }

    // Room names and areas, shortened to fit small rooms.
    for (const room of this.rooms) {
      const [x, y] = this.toScreen(room.anchor);
      const xs = room.polygon.map((p) => this.toScreen(p)[0]);
      const room_px = Math.max(...xs) - Math.min(...xs) - 6;
      const fits = (text: string, px: number) => text.length * px <= room_px;
      const full = roomName(room, m);
      const short = room.type ? m.rooms[room.type].short : m.ui.room;
      const name = fits(full, 7.2) ? full : fits(short, 7.2) ? short : "";
      const long = `${fixed(m, room.area, 1)} m²`;
      const area = fits(long, 6.2) ? long : fits(fixed(m, room.area, 0), 6.2) ? fixed(m, room.area, 0) : "";
      const cls = room.type ? "room-name" : "room-name untyped";
      if (name) out.push(`<text class="${cls}" x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}">${esc(name)}</text>`);
      if (area) out.push(`<text class="room-area" x="${x.toFixed(1)}" y="${(y + (name ? 8 : 0)).toFixed(1)}">${area}</text>`);
    }

    // Wall lengths, outside exterior walls.
    if (this.scale >= 10 && this.analysis) {
      for (const wall of this.walls) {
        if (!this.analysis.layout.exterior.has(wall.id) || wall.length() * this.scale < 36) continue;
        const out_ = interiorNormal(house, wall).neg();
        const mid = wall.start.add(wall.end).scale(0.5).add(out_.scale(wall.thickness / 2 + 12 / this.scale));
        out.push(this.label(mid, `${fmt(wall.length())} m`));
      }
    }

    // Corner handles.
    if (tool === "select" || drawsWalls(tool)) {
      const active = this.drag?.kind === "corner" ? this.drag.at : this.hover?.kind === "corner" ? this.hover.at : null;
      for (const c of corners(house, this.level)) {
        const [x, y] = this.toScreen(c);
        const on = active && active.distance(c) < 1e-6;
        out.push(`<circle class="handle${on ? " active" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 6 : 4}"/>`);
      }
    }

    out.push(this.toolOverlay(tool));
    this.svg.innerHTML = out.join("");
    this.svg.dataset.tool = tool;
    this.svg.classList.toggle("dragging", this.drag?.kind === "pan" || this.drag?.kind === "label");
    this.hint.textContent = tool === "stairs" && this.level + 1 >= house.levels ? m.ui.needFloorAbove : m.ui.hints[tool];
    this.renderLevels();
  }

  /** A piece of furniture: its outline and a detail or two so it reads at a glance. */
  private furnitureSymbol(f: Furniture): string {
    const n = f.facing;
    const side = new Vec2(-n.y, n.x);
    // Fractions of the footprint: x across the front (0..1), z from back (0) to front (1).
    const at = (x: number, z: number) => f.at.add(side.scale((x - 0.5) * f.width)).add(n.scale((z - 0.5) * f.depth));
    const rect = (x0: number, x1: number, z0: number, z1: number) => `<polygon points="${this.pts([at(x0, z0), at(x1, z0), at(x1, z1), at(x0, z1)])}"/>`;
    const line = (x0: number, z0: number, x1: number, z1: number) => `<polyline points="${this.pts([at(x0, z0), at(x1, z1)])}"/>`;
    const parts = [rect(0, 1, 0, 1)];
    switch (f.kind) {
      case "Bed":
        parts.push(rect(0.06, 0.47, 0.05, 0.22), rect(0.53, 0.94, 0.05, 0.22), line(0, 0.33, 1, 0.33));
        break;
      case "SingleBed":
        parts.push(rect(0.1, 0.9, 0.05, 0.22), line(0, 0.33, 1, 0.33));
        break;
      case "Sofa":
      case "Armchair":
        parts.push(rect(0, 1, 0, 0.25), rect(0, 0.12, 0.25, 1), rect(0.88, 1, 0.25, 1));
        break;
      case "Bathtub":
        parts.push(rect(0.08, 0.92, 0.1, 0.9));
        break;
      case "Toilet": {
        const ring = Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return at(0.5 + 0.42 * Math.cos(a), 0.62 + 0.3 * Math.sin(a));
        });
        parts.push(`<polygon points="${this.pts(ring)}"/>`, rect(0, 1, 0, 0.25));
        break;
      }
      case "Counter":
        parts.push(rect(0.08, 0.3, 0.2, 0.8), rect(0.7, 0.92, 0.15, 0.85));
        break;
      case "Car":
        parts.push(rect(0.1, 0.9, 0.3, 0.7));
        break;
      case "Wardrobe":
      case "Bookshelf":
      case "Shelf":
        parts.push(line(0, 0.5, 1, 0.5));
        break;
    }
    return parts.join("");
  }

  /** The floor switcher: one button per storey, plus adding and removing storeys. */
  private renderLevels(): void {
    const { house, level } = this.store;
    const buttons = Array.from({ length: house.levels }, (_, k) => house.levels - 1 - k).map(
      (k) => `<button type="button" data-level="${k}" class="${k === level ? "active" : ""}">${esc(m.levelName(k))}</button>`,
    );
    const add = house.levels < MAX_LEVELS ? `<button type="button" data-action="add" title="${esc(m.ui.addFloorTitle)}">+ ${esc(m.ui.addFloor)}</button>` : "";
    const remove = house.levels > 1 ? `<button type="button" data-action="remove" title="${esc(m.ui.removeFloorTitle)}">− ${esc(m.ui.removeFloor)}</button>` : "";
    const html = `<div class="label">${esc(m.ui.floors)}</div>${add}${buttons.join("")}${remove}`;
    if (this.levels.innerHTML !== html) this.levels.innerHTML = html;
  }

  private levelClick(e: Event): void {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.level) this.store.setLevel(Number(b.dataset.level));
    else if (b.dataset.action === "add") this.store.addFloor();
    else if (b.dataset.action === "remove") this.store.removeTopFloor();
  }

  /** A flight of stairs: treads, and an arrow pointing up (from below) or down (from above). */
  private stairSymbol(s: Stair, goingUp: boolean, state: string): string {
    const outline = stairOutline(s);
    const d = stairDirection(s);
    const start = s.at.sub(d.scale(STAIR_LENGTH / 2));
    const n = new Vec2(-d.y, d.x).scale(STAIR_WIDTH / 2);
    const steps = 14;
    const treads: string[] = [];
    for (let i = 1; i < steps; i++) {
      const c = start.add(d.scale((STAIR_LENGTH * i) / steps));
      treads.push(`<polyline points="${this.pts([c.sub(n), c.add(n)])}"/>`);
    }
    const tail = s.at.sub(d.scale(STAIR_LENGTH * 0.35));
    const head = s.at.add(d.scale(STAIR_LENGTH * 0.35));
    const [from, to] = goingUp ? [tail, head] : [head, tail];
    const back = to.sub(from).normalize().scale(0.3);
    const side = new Vec2(-back.y, back.x);
    const arrow = `<polyline class="arrow" points="${this.pts([from, to])}"/><polyline class="arrow" points="${this.pts([to.sub(back).add(side), to, to.sub(back).sub(side)])}"/>`;
    const [lx, ly] = this.toScreen(from.sub(d.scale(goingUp ? 0.35 : -0.35)));
    const word = `<text class="stair-word" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${esc(goingUp ? m.ui.up : m.ui.down)}</text>`;
    return `<g class="stair ${goingUp ? "up" : "down"} ${state}"><polygon points="${this.pts(outline)}"/>${treads.join("")}${arrow}${word}</g>`;
  }

  /** The wall's footprint rectangle, extended by half its thickness at both ends. */
  private wallOutline(wall: Wall): Vec2[] {
    const t = this.thickness(wall);
    const d = wall.direction();
    const n = leftNormal(wall).scale(t / 2);
    const a = wall.start.sub(d.scale(t / 2));
    const b = wall.end.add(d.scale(t / 2));
    return [a.add(n), b.add(n), b.sub(n), a.sub(n)];
  }

  /** Architectural symbol for a window or door between `left` and `right` along the wall. */
  private openingSymbol(house: House, wall: Wall, kind: Opening["kind"], left: number, right: number, state: string): string {
    const d = wall.direction();
    const n = leftNormal(wall);
    const half = this.thickness(wall) / 2 + 0.01;
    const at = (u: number, w: number) => wall.start.add(d.scale(u)).add(n.scale(w));
    const cut = [at(left, half), at(right, half), at(right, -half), at(left, -half)];
    const parts = [`<polygon class="cut ${state}" points="${this.pts(cut)}"/>`];
    if (kind === "Window") {
      parts.push(`<polyline class="glass" points="${this.pts([at(left, 0), at(right, 0)])}"/>`);
    } else if (kind === "GarageDoor") {
      parts.push(`<polyline class="garage-door" points="${this.pts([at(left, 0), at(right, 0)])}"/>`);
    } else {
      // Door leaf hinged at the left jamb, swinging into the house.
      const inward = interiorNormal(house, wall);
      const s = inward.dot(n) >= 0 ? 1 : -1;
      const width = right - left;
      const hinge = at(left, s * half);
      const arc: Vec2[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = (i / 12) * (Math.PI / 2);
        arc.push(hinge.add(inward.scale(Math.cos(t) * width)).add(d.scale(Math.sin(t) * width)));
      }
      parts.push(`<polyline class="door-leaf" points="${this.pts([hinge, arc[0]])}"/>`);
      parts.push(`<polyline class="door-swing" points="${this.pts(arc)}"/>`);
    }
    return parts.join("");
  }

  private toolOverlay(tool: Tool): string {
    const cursor = this.cursor;
    if (!cursor) return "";
    const out: string[] = [];
    const marker = (s: { point: Vec2; anchored: boolean }) => {
      const [x, y] = this.toScreen(s.point);
      return `<circle class="cursor${s.anchored ? " anchored" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.anchored ? 7 : 4}"/>`;
    };

    if (drawsWalls(tool)) {
      const s = this.snap(cursor);
      if (this.draft.length > 0) {
        const last = this.draft[this.draft.length - 1];
        out.push(`<polyline class="draft${tool === "boundary" ? " open" : ""}" points="${this.pts(this.draft)}"/>`);
        out.push(`<polyline class="draft preview" points="${this.pts([last, s.point])}"/>`);
        const len = last.distance(s.point);
        if (len > 0) {
          const cls = len < MIN_WALL_LENGTH ? "dim bad" : "dim";
          out.push(this.label(last.add(s.point).scale(0.5).add(new Vec2(0, 14 / this.scale)), `${fmt(len)} m`, cls));
        }
      }
      out.push(marker(s));
    } else if (tool === "room") {
      const s = this.snap(cursor);
      if (this.drag?.kind === "room") {
        const a = this.drag.start;
        const b = s.point;
        out.push(`<polygon class="draft preview" points="${this.pts([a, new Vec2(b.x, a.y), b, new Vec2(a.x, b.y)])}"/>`);
        const [w, dpt] = [Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
        const cls = w < MIN_WALL_LENGTH || dpt < MIN_WALL_LENGTH ? "dim bad" : "dim";
        out.push(this.label(a.add(b).scale(0.5), `${fmt(w)} × ${fmt(dpt)} m = ${fmt(w * dpt)} m²`, cls));
      }
      out.push(marker(s));
    } else if (tool === "window" || tool === "door") {
      const target = this.openingTarget(cursor);
      if (target) {
        const kind = tool === "door" ? "Door" : "Window";
        const width = DEFAULT_OPENING[kind].width;
        const c = clampOffset(target.wall, width, target.offset);
        out.push(this.openingSymbol(this.house, target.wall, kind, c - width / 2, c + width / 2, "ghost"));
      }
    }
    return out.join("");
  }
}
