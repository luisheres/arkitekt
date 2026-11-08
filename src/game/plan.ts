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
  sceneryFor,
  treeLook,
  money,
  technique,
  accessRoutes,
  type Landmark,
  INDOOR_PLANTS,
  balconyOutline,
  dormerOutline,
  clampBalcony,
  shapedGround,
  moveHouse,
  snapPoint,
  validate,
  wallThickness,
} from "../core";
import { m } from "./i18n";
import { backdropFor } from "./backdrop";
import { type Selection, type Store, type Tool, drawsWalls } from "./store";

const PLAN_WALL_COLORS = { Wood: "#7a5134", FaluRed: "#8a2a1e", Brick: "#8c3d2e", Plaster: "#6f6b63", Stone: "#77736a", Concrete: "#6c7079" } as const;
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
  | { kind: "balcony"; id: number; grab: number }
  | { kind: "dormer"; id: number; grab: number }
  | { kind: "house"; grab: Vec2; moved: Vec2 }
  | { kind: "room"; start: Vec2 };

type Hit =
  | { kind: "corner"; at: Vec2 }
  | { kind: "wall"; id: number }
  | { kind: "opening"; id: number }
  | { kind: "label"; id: number; at: Vec2 }
  | { kind: "stair"; id: number }
  | { kind: "furniture"; id: number }
  | { kind: "balcony"; id: number }
  | { kind: "dormer"; id: number }
  | { kind: "room"; at: Vec2 }
  | null;


const fmt = (x: number) => num(m, x, 2);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export class PlanView {
  private readonly svg: SVGSVGElement;
  private readonly hint: HTMLElement;
  private readonly levels: HTMLElement;
  private readonly backdrop: SVGImageElement;
  private readonly content: SVGGElement;
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
    // The landscape image stays put; only the drawing on top of it is redrawn.
    this.backdrop = document.createElementNS("http://www.w3.org/2000/svg", "image");
    this.backdrop.setAttribute("preserveAspectRatio", "none");
    this.content = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.svg.append(this.backdrop, this.content);
    this.hint = document.createElement("div");
    this.hint.className = "plan-hint";
    this.levels = document.createElement("div");
    this.levels.className = "level-switch";
    this.levels.addEventListener("click", (e) => this.levelClick(e));
    // A compass: north is up in the plan (the back of every plot).
    const compass = document.createElement("div");
    compass.className = "plan-compass";
    compass.innerHTML = `<svg viewBox="-23 -23 46 46" aria-label="${m.ui.north}"><circle r="21" fill="rgba(255,255,255,0.88)" stroke="#8a8478"/><text y="-10" text-anchor="middle" dominant-baseline="middle" font-weight="800" font-size="10" fill="#3a3530">${m.ui.north}</text><polygon points="0,-3 5,15 0,11 -5,15" fill="#d9534a"/></svg>`;
    container.append(this.svg, this.hint, this.levels, compass);

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

  /**
   * How far the view may reach: the plot with a generous ring of its surroundings (and
   * never past the drawn landscape), so zooming out or panning never shows empty space.
   */
  private bounds(): { x0: number; x1: number; y0: number; y1: number } {
    const { plot } = this.store;
    const bd = backdropFor(plot);
    const margin = 40;
    return {
      x0: Math.max(bd.x0, -margin),
      x1: Math.min(bd.x1, plot.width + margin),
      y0: Math.max(bd.y0, -margin),
      y1: Math.min(bd.y1, plot.depth + margin),
    };
  }

  /** Keep the zoom and the view inside the bounds. */
  private clampView(): void {
    if (this.width === 0 || this.height === 0) return;
    const b = this.bounds();
    const minScale = Math.max(this.width / (b.x1 - b.x0), this.height / (b.y1 - b.y0));
    this.scale = Math.min(Math.max(this.scale, minScale), 300);
    const halfW = this.width / 2 / this.scale;
    const halfH = this.height / 2 / this.scale;
    const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
    this.center = new Vec2(clamp(this.center.x, b.x0 + halfW, b.x1 - halfW), clamp(this.center.y, b.y0 + halfH, b.y1 - halfH));
  }

  /** Fit the whole plot and the street into view. */
  fit(): void {
    const { plot } = this.store;
    // The plot and the road that reaches it, with a little of the surroundings.
    const [x0, x1, y0, y1] = [-9, plot.width + 9, -10, plot.depth + 10];
    this.scale = Math.min(this.width / (x1 - x0), this.height / (y1 - y0)) * 0.92;
    this.center = new Vec2((x0 + x1) / 2, (y0 + y1) / 2);
    this.clampView();
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
    this.clampView();
    this.requestRender();
  }

  // --- Ground -----------------------------------------------------------------------

  private contourCache: { key: string; minor: Vec2[][]; major: Vec2[][]; labels: { at: Vec2; height: number }[] } | null = null;

  /** Contour lines of the ground as built (marching squares), worked out once per change. */
  private contours(): { minor: Vec2[][]; major: Vec2[][]; labels: { at: Vec2; height: number }[] } {
    const { plot, house, revision } = this.store;
    const key = `${plot.id}:${revision}`;
    if (this.contourCache?.key === key) return this.contourCache;
    const ground = shapedGround(house, plot);
    const step = 0.5;
    const nx = Math.round(plot.width / step);
    const ny = Math.round(plot.depth / step);
    const h: number[][] = [];
    for (let i = 0; i <= nx; i++) {
      h.push([]);
      for (let j = 0; j <= ny; j++) h[i].push(ground((i / nx) * plot.width, (j / ny) * plot.depth));
    }
    const all = h.flat();
    const [lo, hi] = [Math.min(...all), Math.max(...all)];
    const minor: Vec2[][] = [];
    const major: Vec2[][] = [];
    const labels: { at: Vec2; height: number }[] = [];
    const point = (i: number, j: number) => new Vec2((i / nx) * plot.width, (j / ny) * plot.depth);
    for (let level = Math.ceil(lo / 0.5) * 0.5; level <= hi; level += 0.5) {
      const whole = Math.abs(level - Math.round(level)) < 1e-6;
      const into = whole ? major : minor;
      const before = into.length;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) {
          // Where the level crosses each edge of the cell.
          const corners: [number, number][] = [
            [i, j],
            [i + 1, j],
            [i + 1, j + 1],
            [i, j + 1],
          ];
          const crossings: Vec2[] = [];
          for (let k = 0; k < 4; k++) {
            const [a, b] = [corners[k], corners[(k + 1) % 4]];
            const [ha, hb] = [h[a[0]][a[1]], h[b[0]][b[1]]];
            if (ha === hb || (ha < level) === (hb < level)) continue;
            const t = (level - ha) / (hb - ha);
            const [pa, pb] = [point(...a), point(...b)];
            crossings.push(pa.add(pb.sub(pa).scale(t)));
          }
          if (crossings.length >= 2) into.push([crossings[0], crossings[1]]);
          if (crossings.length === 4) into.push([crossings[2], crossings[3]]);
        }
      // Whole metres get their height written on the line, near one side of the plot.
      if (whole && into.length > before && Math.round(level) !== 0) {
        const mids = into.slice(before).map(([a, b]) => a.add(b).scale(0.5));
        const at = mids.reduce((best, p) => (Math.abs(p.x - (plot.width - 2.5)) < Math.abs(best.x - (plot.width - 2.5)) ? p : best));
        labels.push({ at, height: Math.round(level) });
      }
    }
    this.contourCache = { key, minor, major, labels };
    return this.contourCache;
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
      // Capped in meters too, so zoomed out a corner does not swallow clicks meant for its walls.
      if (c.distance(p) < Math.min((SNAP_PX - 1) * px, 0.4) && (!corner || c.distance(p) < corner.distance(p))) corner = c;
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
    for (const d of this.house.dormers) {
      if (this.house.wall(d.wall)?.level !== this.level) continue;
      if (pointInPolygon(p, dormerOutline(this.house, d))) return { kind: "dormer", id: d.id };
    }
    for (const b of this.house.balconies) {
      if (this.house.wall(b.wall)?.level !== this.level) continue;
      const outline = balconyOutline(this.house, b);
      if (outline && pointInPolygon(p, outline)) return { kind: "balcony", id: b.id };
    }
    // Furniture before room names: a new piece lands in the middle of the room, on its name.
    if (this.store.showFurniture) {
      const piece = furnitureAt(this.house, p, this.level);
      if (piece) return { kind: "furniture", id: piece.id! };
    }
    for (const label of this.house.labels) {
      if (label.level !== this.level) continue;
      const [sx, sy] = this.toScreen(label.at);
      const [qx, qy] = this.toScreen(p);
      // Only the text itself, and never reaching into a neighbouring room.
      const halfWidth = Math.max(16, m.rooms[label.type].name.length * 3.8);
      if (Math.abs(qx - sx) > halfWidth || Math.abs(qy - sy) > 14) continue;
      if (roomAt(this.rooms, p) !== roomAt(this.rooms, label.at)) continue;
      return { kind: "label", id: label.id, at: label.at };
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
        this.clampView();
        // Keep the point under the cursor fixed (as far as the bounds allow).
        const after = this.toPlan(sx, sy);
        this.center = this.center.add(before.sub(after));
        this.clampView();
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
        } else if (hit.kind === "dormer") {
          store.select(hit);
          const dm = this.house.dormer(hit.id)!;
          const wall = this.house.wall(dm.wall)!;
          this.drag = { kind: "dormer", id: dm.id, grab: p.sub(wall.start).dot(wall.direction()) - dm.offset };
        } else if (hit.kind === "balcony") {
          store.select(hit);
          const b = this.house.balcony(hit.id)!;
          const wall = this.house.wall(b.wall)!;
          this.drag = { kind: "balcony", id: b.id, grab: p.sub(wall.start).dot(wall.direction()) - b.offset };
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
      case "move":
        if (!this.house.walls.length) return;
        store.beginGesture();
        this.drag = { kind: "house", grab: p, moved: new Vec2(0, 0) };
        break;
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
      this.clampView();
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
    } else if (drag.kind === "house") {
      // The whole house follows the pointer, on the 10 cm grid.
      const want = snapToGrid(p.sub(drag.grab), this.freeSnap ? 0.05 : 0.1);
      const delta = want.sub(drag.moved);
      if (Math.abs(delta.x) > 1e-9 || Math.abs(delta.y) > 1e-9) {
        store.gestureEdit((h) => moveHouse(h, delta));
        drag.moved = want;
      }
    } else if (drag.kind === "dormer") {
      const dm = this.house.dormer(drag.id);
      const wall = dm && this.house.wall(dm.wall);
      if (dm && wall) {
        const offset = roundTo(clampBalcony(wall, { offset: p.sub(wall.start).dot(wall.direction()) - drag.grab, width: dm.width }), 0.1);
        if (Math.abs(offset - dm.offset) > 1e-9) store.gestureEdit((h) => (h.dormer(drag.id)!.offset = offset));
      }
    } else if (drag.kind === "balcony") {
      // Slide the balcony along its wall.
      const b = this.house.balcony(drag.id);
      const wall = b && this.house.wall(b.wall);
      if (b && wall) {
        const offset = roundTo(clampBalcony(wall, { offset: p.sub(wall.start).dot(wall.direction()) - drag.grab, width: b.width }), 0.1);
        if (Math.abs(offset - b.offset) > 1e-9) store.gestureEdit((h) => (h.balcony(drag.id)!.offset = offset));
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

    // The landscape underneath, then the street and the plot.
    const bd = backdropFor(plot);
    const [bx, by] = this.toScreen(new Vec2(bd.x1, bd.y1));
    if (this.backdrop.getAttribute("href") !== bd.url) this.backdrop.setAttribute("href", bd.url);
    this.backdrop.setAttribute("x", bx.toFixed(1));
    this.backdrop.setAttribute("y", by.toFixed(1));
    this.backdrop.setAttribute("width", ((bd.x1 - bd.x0) * this.scale).toFixed(1));
    this.backdrop.setAttribute("height", ((bd.y1 - bd.y0) * this.scale).toFixed(1));
    const rect = (x0: number, y0: number, x1: number, y1: number, cls: string) =>
      `<polygon class="${cls}" points="${this.pts([new Vec2(x0, y0), new Vec2(x1, y0), new Vec2(x1, y1), new Vec2(x0, y1)])}"/>`;
    const tl = this.toPlan(0, 0);
    const br = this.toPlan(this.width, this.height);
    const [vx0, vx1] = [Math.min(tl.x, br.x), Math.max(tl.x, br.x)];
    const [vy0, vy1] = [Math.min(tl.y, br.y), Math.max(tl.y, br.y)];
    // The roads: streets, lanes and gravel tracks, a turning circle at a cul-de-sac.
    out.push(this.roadsLayer());
    out.push(rect(0, 0, plot.width, plot.depth, "lawn"));
    // On sloping ground: contour lines every half metre (stronger every metre), as built.
    if (plot.terrain) {
      const { minor, major, labels } = this.contours();
      const path = (segs: Vec2[][]) => segs.map(([a, b]) => `M${this.toScreen(a).map((v) => v.toFixed(1)).join(",")}L${this.toScreen(b).map((v) => v.toFixed(1)).join(",")}`).join("");
      out.push(`<path class="contour" d="${path(minor)}"/><path class="contour major" d="${path(major)}"/>`);
      if (this.scale >= 6)
        for (const l of labels) {
          const [x, y] = this.toScreen(l.at);
          out.push(`<text class="contour-label" x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="middle">${l.height > 0 ? "+" : ""}${l.height} m</text>`);
        }
    }

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
    out.push(this.sceneryLayer(vx0, vx1, vy0, vy1));

    // The floor below, faintly, to build on (in the basement: the ground floor above).
    if (this.level !== 0) {
      const below = this.house.wallsOn(this.level > 0 ? this.level - 1 : 0).filter((w) => !w.boundary);
      out.push(`<g class="below">${below.map((w) => `<polyline points="${this.pts([w.start, w.end])}"/>`).join("")}</g>`);
    }

    // Which things have problems.
    const badWalls = new Set<number>();
    const badOpenings = new Set<number>();
    const badRooms = new Set<Room>();
    const badBalconies = new Set<number>();
    const badDormers = new Set<number>();
    for (const i of this.issues) {
      if ("wall" in i) badWalls.add(i.wall);
      if ("balcony" in i) badBalconies.add(i.balcony);
      if ("dormer" in i) badDormers.add(i.dormer);
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
      const cls = ["room", room.type === "Void" && "void", badRooms.has(room) && "bad", hoverRoom === room && "hover"].filter(Boolean).join(" ");
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

    // Balconies, outside the walls of their storey.
    for (const b of house.balconies) {
      if (house.wall(b.wall)?.level !== this.level) continue;
      const outline = balconyOutline(house, b);
      if (!outline) continue;
      const cls = ["balcony", house.wall(b.wall)?.level === 0 && "terrace", badBalconies.has(b.id) && "bad", hoverId("balcony") === b.id && "hover", selId("balcony") === b.id && "selected"].filter(Boolean).join(" ");
      out.push(`<polygon class="${cls}" points="${this.pts(outline)}"/>`);
    }

    // Dormers, in the roof over their wall (top storey only).
    for (const d of house.dormers) {
      const wall = house.wall(d.wall);
      if (wall?.level !== this.level) continue;
      const cls = ["dormer", badDormers.has(d.id) && "bad", hoverId("dormer") === d.id && "hover", selId("dormer") === d.id && "selected"].filter(Boolean).join(" ");
      out.push(`<polygon class="${cls}" points="${this.pts(dormerOutline(house, d))}"/>`);
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
    this.content.innerHTML = out.join("");
    this.svg.dataset.tool = tool;
    this.svg.classList.toggle("dragging", this.drag?.kind === "pan" || this.drag?.kind === "label");
    this.hint.textContent = tool === "stairs" && this.level + 1 >= house.levels ? m.ui.needFloorAbove : m.ui.hints[tool];
    this.renderLevels();
  }

  /** Trees, rocks, the neighbours' houses and the jetty around the plot. */
  /** The roads, drawn as broad strokes along their centrelines, and the name on the nearest. */
  private roadsLayer(): string {
    const { plot } = this.store;
    const s = sceneryFor(plot);
    const out: string[] = [];
    const line = (pts: Vec2[]) => pts.map((p, i) => `${i ? "L" : "M"}${this.toScreen(p).map((v) => v.toFixed(1)).join(",")}`).join("");
    for (const r of s.roads) {
      const w = (r.width * this.scale).toFixed(1);
      if (r.kind === "main" || r.kind === "street") out.push(`<path class="road-kerb" d="${line(r.points)}" style="stroke-width:${((r.width + 2.4) * this.scale).toFixed(1)}"/>`);
      out.push(`<path class="road ${r.kind}" d="${line(r.points)}" style="stroke-width:${w}"/>`);
      if (r.turning) {
        const [cx, cy] = this.toScreen(r.turning.at);
        out.push(`<circle class="road ${r.kind} turning" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r.turning.radius * this.scale).toFixed(1)}"/>`);
        out.push(`<circle class="turning-island" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r.turning.radius * 0.35 * this.scale).toFixed(1)}"/>`);
      }
      if (r.kind === "main") out.push(`<path class="road-line" d="${line(r.points)}"/>`);
      if (r.kind === "gravel") out.push(`<path class="road-grass" d="${line(r.points)}" style="stroke-width:${(0.5 * this.scale).toFixed(1)}"/>`);
    }
    // Name each paved road, where it passes closest to the plot.
    const centre = new Vec2(plot.width / 2, plot.depth / 2);
    for (const r of s.roads) {
      if (r.kind === "gravel") continue;
      const at = r.points.reduce((a, b) => (b.distance(centre) < a.distance(centre) ? b : a));
      out.push(this.label(at, m.ui.roadName[r.kind], "street-label"));
    }
    return `<g class="roads">${out.join("")}</g>`;
  }

  private sceneryLayer(vx0: number, vx1: number, vy0: number, vy1: number): string {
    const s = sceneryFor(this.store.plot);
    const out: string[] = [];
    // Driveways and the path to the front door.
    for (const r of accessRoutes(this.house, this.store.plot).routes)
      out.push(`<polyline class="route ${r.surface}" style="stroke-width:${(r.width * this.scale).toFixed(1)}" points="${this.pts(r.points)}"/>`);
    for (const wall of s.walls) out.push(`<polyline class="stone-wall" style="stroke-width:${Math.max(2, 0.6 * this.scale).toFixed(1)}" points="${this.pts(wall)}"/>`);
    const visible = (p: Vec2, r: number) => p.x > vx0 - r && p.x < vx1 + r && p.y > vy0 - r && p.y < vy1 + r;
    const circle = (p: Vec2, r: number, cls: string) => {
      const [x, y] = this.toScreen(p);
      return `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(1.5, r * this.scale).toFixed(1)}"/>`;
    };
    if (s.jetty) {
      const j = s.jetty;
      const n = new Vec2(j.width / 2, 0);
      out.push(`<polygon class="jetty" points="${this.pts([j.from.sub(n), j.from.add(n), j.to.add(n), j.to.sub(n)])}"/>`);
    }
    for (const n of s.neighbors) {
      if (!visible(n.at, 12)) continue;
      // Turned to face its road: the front along `facing`, its width across it.
      const f = new Vec2(Math.cos(n.facing), Math.sin(n.facing));
      const side = new Vec2(-f.y, f.x);
      const at = (u: number, v: number) => n.at.add(side.scale(u * n.width)).add(f.scale(v * n.depth));
      out.push(`<polygon class="neighbor roof${n.roof % 4}" points="${this.pts([at(-0.5, -0.5), at(0.5, -0.5), at(0.5, 0.5), at(-0.5, 0.5)])}"/>`);
      if (n.roofStyle === "gable") out.push(`<polyline class="ridge" points="${this.pts([at(-0.5, 0), at(0.5, 0)])}"/>`);
      if (n.roofStyle === "hip")
        out.push(`<polyline class="ridge" points="${this.pts([at(-0.5, -0.5), at(-0.25, 0), at(0.25, 0), at(0.5, -0.5)])}"/><polyline class="ridge" points="${this.pts([at(-0.5, 0.5), at(-0.25, 0), at(0.25, 0), at(0.5, 0.5)])}"/>`);
    }
    for (const l of s.landmarks) if (visible(l.at, 30)) out.push(this.landmarkSymbol(l));
    for (const r of s.rocks) if (visible(r.at, 2)) out.push(circle(r.at, r.size * 0.8, "rock"));
    for (const t of s.trees) {
      const r = { round: 2.2, birch: 1.4, pine: 1.7, bush: 0.9 }[t.kind] * t.size;
      if (!visible(t.at, r)) continue;
      const look = treeLook(t);
      out.push(circle(t.at, r, `tree ${t.kind} ${look}`), circle(t.at.add(new Vec2(r * 0.3, r * 0.3)), r * 0.45, "tree-light"));
      if (look === "apple") for (const [ax, ay] of [[-0.4, 0.2], [0.35, -0.35], [0.1, 0.5], [-0.2, -0.5]]) out.push(circle(t.at.add(new Vec2(ax * r, ay * r)), r * 0.12, "apple"));
    }
    return `<g class="scenery">${out.join("")}</g>`;
  }

  /** A landmark from above: a simple shape and a picture, so it reads at a glance. */
  private landmarkSymbol(l: Landmark): string {
    const [x, y] = this.toScreen(l.at);
    const r = l.size * this.scale;
    const f = new Vec2(Math.cos(l.facing), Math.sin(l.facing));
    const side = new Vec2(-f.y, f.x);
    const box = (w: number, d: number, cls: string) => {
      const at = (u: number, v: number) => l.at.add(side.scale(u * w)).add(f.scale(v * d));
      return `<polygon class="${cls}" points="${this.pts([at(-0.5, -0.5), at(0.5, -0.5), at(0.5, 0.5), at(-0.5, 0.5)])}"/>`;
    };
    const icon = (emoji: string) => (r > 10 ? `<text class="landmark-icon" x="${x.toFixed(1)}" y="${(y + Math.min(r, 30) * 0.35).toFixed(1)}" text-anchor="middle" style="font-size:${Math.min(r, 30).toFixed(0)}px">${emoji}</text>` : "");
    const disc = (radius: number, cls: string) => `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(radius * this.scale).toFixed(1)}"/>`;
    switch (l.kind) {
      case "church":
        return `<g class="landmark">${box(9, 16, "lm-stone")}${icon("⛪")}</g>`;
      case "windmill":
        return `<g class="landmark">${disc(3, "lm-white")}${icon("🌬️")}</g>`;
      case "barn":
        return `<g class="landmark">${box(16, 10, "lm-red")}</g>`;
      case "silo":
        return `<g class="landmark">${disc(2.2, "lm-steel")}</g>`;
      case "boathouse":
      case "sauna":
      case "cabin":
        return `<g class="landmark">${box(l.size * 1.4, l.size, "lm-wood")}${l.kind === "sauna" ? icon("♨️") : ""}</g>`;
      case "lighthouse":
        return `<g class="landmark">${disc(2.5, "lm-white")}${disc(1.2, "lm-red")}</g>`;
      case "millRuin":
        return `<g class="landmark">${box(8, 7, "lm-ruin")}</g>`;
      case "playground":
        return `<g class="landmark">${disc(5, "lm-sand")}${icon("🛝")}</g>`;
      case "fountain":
        return `<g class="landmark">${disc(2.6, "lm-stone")}${disc(1.6, "lm-water")}</g>`;
      case "haybales":
        return `<g class="landmark">${[-1.5, 0, 1.5].map((u) => `<circle class="lm-hay" cx="${(x + u * this.scale).toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.75 * this.scale).toFixed(1)}"/>`).join("")}</g>`;
      case "footbridge":
      case "skiLift": {
        const to = l.to ?? l.at;
        const cls = l.kind === "footbridge" ? "lm-bridge" : "lm-lift";
        return `<polyline class="${cls}" style="stroke-width:${Math.max(2, (l.kind === "footbridge" ? 1.8 : 0.3) * this.scale).toFixed(1)}" points="${this.pts([l.at, to])}"/>`;
      }
    }
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
      case "Fireplace":
        // The hearth in front, the firebox in the wall.
        parts.push(rect(0.25, 0.75, 0.15, 0.7), line(0.25, 1, 0.75, 1));
        break;
      case "Plant":
      case "TallPlant":
      case "GardenTree":
      case "Shrub": {
        // Seen from above: a round clump of leaves (and a pot indoors).
        const [cx, cy] = this.toScreen(f.at);
        const r = (Math.min(f.width, f.depth) / 2) * this.scale;
        const pot = INDOOR_PLANTS.includes(f.kind) ? `<circle class="pot" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r * 0.7).toFixed(1)}"/>` : "";
        return `${pot}<circle class="leaves" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r * (pot ? 0.9 : 0.95)).toFixed(1)}"/><circle class="leaves-light" cx="${(cx - r * 0.25).toFixed(1)}" cy="${(cy - r * 0.25).toFixed(1)}" r="${(r * 0.4).toFixed(1)}"/>`;
      }
      case "FlowerBed": {
        const dots = [];
        for (let x = 0.15; x < 0.95; x += 0.17) for (const z of [0.3, 0.7]) dots.push(at(x, z));
        return `<g class="flower-bed">${rect(0, 1, 0, 1)}${dots.map((p, i) => {
          const [cx, cy] = this.toScreen(p);
          return `<circle class="flower f${i % 4}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(1.5, 0.07 * this.scale).toFixed(1)}"/>`;
        }).join("")}</g>`;
      }
      case "Hedge":
        return `<g class="hedge-piece">${rect(0, 1, 0, 1)}</g>`;
    }
    return parts.join("");
  }

  /** The floor switcher: one button per storey, plus adding and removing storeys. */
  private renderLevels(): void {
    const { house, level } = this.store;
    const buttons = [...house.levelList()].reverse().map(
      (k) => `<button type="button" data-level="${k}" class="${k === level ? "active" : ""}">${esc(m.levelName(k))}</button>`,
    );
    const lock = this.store.floorLock();
    const addTitle = lock ? m.progress.locked(m.technique[lock].name, money(m, technique(lock).price)) : m.ui.addFloorTitle;
    const add =
      house.levels < MAX_LEVELS
        ? `<button type="button" data-action="add" class="${lock ? "locked" : ""}" title="${esc(addTitle)}">+ ${esc(m.ui.addFloor)}</button>`
        : "";
    const remove = house.levels > 1 ? `<button type="button" data-action="remove" title="${esc(m.ui.removeFloorTitle)}">− ${esc(m.ui.removeFloor)}</button>` : "";
    // A basement goes under the ground floor; on the basement, a way to fill it in again.
    const basementLock = this.store.lockOf({ kind: "basement" });
    const basement = !house.basement
      ? `<button type="button" data-action="basement" class="${basementLock ? "locked" : ""}" title="${esc(basementLock ? m.progress.locked(m.technique[basementLock].name, money(m, technique(basementLock).price)) : m.ui.addBasementTitle)}">+ ${esc(m.ui.addBasement)}</button>`
      : level < 0
        ? `<button type="button" data-action="no-basement" title="${esc(m.ui.removeBasementTitle)}">− ${esc(m.ui.removeBasement)}</button>`
        : "";
    const html = `<div class="label">${esc(m.ui.floors)}</div>${add}${buttons.join("")}${basement}${remove}`;
    if (this.levels.innerHTML !== html) this.levels.innerHTML = html;
  }

  private levelClick(e: Event): void {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.level) this.store.setLevel(Number(b.dataset.level));
    else if (b.dataset.action === "add") this.store.addFloor();
    else if (b.dataset.action === "remove") this.store.removeTopFloor();
    else if (b.dataset.action === "basement") this.store.addBasement();
    else if (b.dataset.action === "no-basement") this.store.removeBasement();
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
    } else if (kind === "GlassDoor") {
      // Two sliding glass panels, overlapping in the middle.
      const mid = (left + right) / 2;
      parts.push(`<polyline class="glass" points="${this.pts([at(left, -0.04), at(mid + 0.1, -0.04)])}"/>`);
      parts.push(`<polyline class="glass" points="${this.pts([at(mid - 0.1, 0.04), at(right, 0.04)])}"/>`);
    } else if (kind === "Passage") {
      // Just the opening: dashed lines where the wall's faces carry on overhead.
      parts.push(`<polyline class="passage" points="${this.pts([at(left, half), at(right, half)])}"/><polyline class="passage" points="${this.pts([at(left, -half), at(right, -half)])}"/>`);
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
