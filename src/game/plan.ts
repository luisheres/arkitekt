/**
 * The 2D plan editor: a top-down SVG drawing of the plot and house, with the tools for
 * drawing walls and rooms, placing windows and doors, and dragging things around.
 *
 * The plan is a true view from above, turned so the street is at the bottom: plan +x
 * points left and plan +y points up on screen. That matches the 3D front view, where
 * the camera stands in the street looking at the house.
 */

import {
  type House,
  type Issue,
  type Opening,
  type Wall,
  DEFAULT_OPENING,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_MATERIAL,
  GRID_STEP,
  MIN_WALL_LENGTH,
  OPENING_STEP,
  Vec2,
  addRectangle,
  addWallChain,
  clampOffset,
  corners,
  interiorNormal,
  leftNormal,
  moveCorner,
  moveWall,
  nearestWall,
  placeOpening,
  roundTo,
  snapPoint,
  validate,
} from "../core";
import type { Store, Tool } from "./store";

const PLAN_WALL_COLORS = { Wood: "#7a5134", Brick: "#8c3d2e", Plaster: "#6f6b63" } as const;
/** Pointer distances, in screen pixels. */
const SNAP_PX = 10;
const PICK_PX = 6;

type Drag =
  | { kind: "pan"; x: number; y: number }
  | { kind: "corner"; at: Vec2 }
  | { kind: "wall"; id: number; grab: Vec2; original: { start: Vec2; end: Vec2 }; distance: number }
  | { kind: "opening"; id: number; grab: number }
  | { kind: "room"; start: Vec2 };

type Hit = { kind: "corner"; at: Vec2 } | { kind: "wall"; id: number } | { kind: "opening"; id: number } | null;

const HINTS: Record<Tool, string> = {
  select: "Drag corners to reshape, drag walls to push them in or out, drag windows and doors along walls. Drag empty space to pan.",
  wall: "Click to place corners. Click the first corner to close the room. Enter or double-click finishes, Esc cancels.",
  room: "Drag to draw a rectangular room.",
  window: "Click a wall to add a window.",
  door: "Click a wall to add a door.",
};

const fmt = (x: number) => `${Number(x.toFixed(2))}`;

export class PlanView {
  private readonly svg: SVGSVGElement;
  private readonly hint: HTMLElement;
  private scale = 20; // pixels per meter
  private center = new Vec2(0, 0);
  private width = 0;
  private height = 0;
  private fitted = false;

  /** Plan point under the pointer, unsnapped. */
  private cursor: Vec2 | null = null;
  private freeSnap = false; // Alt held: no grid snapping
  private draft: Vec2[] = [];
  private drag: Drag | null = null;
  private hover: Hit = null;
  private issues: Issue[] = [];
  private frameRequested = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly store: Store,
  ) {
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.classList.add("plan");
    this.hint = document.createElement("div");
    this.hint.className = "plan-hint";
    container.append(this.svg, this.hint);

    this.refreshIssues();
    store.subscribe((change) => {
      if (change === "house") this.refreshIssues();
      if (store.tool !== "wall") this.draft = [];
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

  // --- Snapping and picking ----------------------------------------------------------

  private get house(): House {
    return this.store.house;
  }

  private snap(p: Vec2, exclude?: Vec2) {
    const anchors = [...corners(this.house), ...this.draft].filter((a) => !exclude || a.distance(exclude) > 1e-6);
    return snapPoint(p, anchors, SNAP_PX / this.scale, this.freeSnap ? 0.05 : GRID_STEP);
  }

  private hitTest(p: Vec2): Hit {
    const px = 1 / this.scale;
    let corner: Vec2 | null = null;
    for (const c of corners(this.house)) {
      if (c.distance(p) < (SNAP_PX - 1) * px && (!corner || c.distance(p) < corner.distance(p))) corner = c;
    }
    if (corner) return { kind: "corner", at: corner };
    for (const o of this.house.openings) {
      const wall = this.house.wall(o.wall);
      if (!wall) continue;
      const rel = p.sub(wall.start);
      const u = rel.dot(wall.direction());
      const w = rel.dot(leftNormal(wall));
      if (u >= o.left() - 2 * px && u <= o.right() + 2 * px && Math.abs(w) <= wall.thickness / 2 + PICK_PX * px) {
        return { kind: "opening", id: o.id };
      }
    }
    const hit = nearestWall(this.house, p, 1);
    if (hit && hit.distance <= hit.wall.thickness / 2 + PICK_PX * px) return { kind: "wall", id: hit.wall.id };
    return null;
  }

  /** Height and material for new walls: match the existing walls. */
  private newWallStyle() {
    const first = this.house.walls[0];
    return { height: first?.height ?? DEFAULT_WALL_HEIGHT, material: first?.material ?? DEFAULT_WALL_MATERIAL };
  }

  private openingTarget(p: Vec2) {
    const hit = nearestWall(this.house, p, Math.max(0.6, 14 / this.scale));
    return hit && { wall: hit.wall, offset: hit.offset };
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
      if (this.store.tool === "wall") this.finish();
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
        store.beginGesture();
        if (hit.kind === "corner") {
          this.drag = { kind: "corner", at: hit.at };
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
        this.addDraftPoint(this.snap(p));
        break;
      case "room":
        this.drag = { kind: "room", start: this.snap(p).point };
        break;
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
        store.gestureEdit((h) => moveCorner(h, from, to));
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
    }
    this.requestRender();
  }

  private pointerUp(e: PointerEvent): void {
    const drag = this.drag;
    if (drag?.kind === "room" && e.button === 0) {
      const end = this.snap(this.eventPoint(e)).point;
      const { height, material } = this.newWallStyle();
      this.store.edit((h) => void addRectangle(h, drag.start, end, height, material));
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
    // Reaching an existing corner of the house connects to it and ends the chain.
    if (snap.anchored && !draft.slice(0, -1).some((q) => q.distance(p) < 1e-6)) this.commitDraft(false);
  }

  private commitDraft(closed: boolean): void {
    const points = this.draft;
    this.draft = [];
    const { height, material } = this.newWallStyle();
    this.store.edit((h) => void addWallChain(h, points, closed, height, material));
  }

  // --- Drawing -----------------------------------------------------------------------

  private refreshIssues(): void {
    const { house, plot, budget, prices } = this.store;
    this.issues = validate(house, plot, budget, prices);
  }

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
    out.push(`<line class="street-line" x1="0" x2="${this.width}" y1="${this.toScreen(new Vec2(0, -4.5))[1]}" y2="${this.toScreen(new Vec2(0, -4.5))[1]}"/>`);
    out.push(this.label(new Vec2(plot.width / 2, -4.5), "STREET", "street-label"));
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

    // Floor.
    const fp = house.footprint();
    if (fp.ok) out.push(`<polygon class="floor" points="${this.pts(fp.value)}"/>`);

    // Walls, then openings cut into them.
    const badWalls = new Set<number>();
    const badOpenings = new Set<number>();
    for (const i of this.issues) {
      if ("wall" in i) badWalls.add(i.wall);
      if ("opening" in i) badOpenings.add(i.opening);
      if (i.kind === "OpeningsOverlap") [i.a, i.b].forEach((id) => badOpenings.add(id));
    }
    const hoverId = (kind: string) => (this.hover?.kind === kind ? (this.hover as { id: number }).id : null);
    const selId = (kind: string) => (selection?.kind === kind ? selection.id : null);

    for (const wall of house.walls) {
      const cls = ["wall", badWalls.has(wall.id) && "bad", hoverId("wall") === wall.id && "hover", selId("wall") === wall.id && "selected"];
      out.push(`<polygon class="${cls.filter(Boolean).join(" ")}" style="fill:${PLAN_WALL_COLORS[wall.material]}" points="${this.pts(this.wallOutline(wall))}"/>`);
    }
    for (const o of house.openings) {
      const wall = house.wall(o.wall);
      if (!wall) continue;
      const state = [badOpenings.has(o.id) && "bad", hoverId("opening") === o.id && "hover", selId("opening") === o.id && "selected"];
      out.push(this.openingSymbol(house, wall, o.kind, o.left(), o.right(), state.filter(Boolean).join(" ")));
    }

    // Wall lengths, outside the house.
    if (this.scale >= 10) {
      for (const wall of house.walls) {
        if (wall.length() * this.scale < 36) continue;
        const out_ = interiorNormal(house, wall).neg();
        const mid = wall.start.add(wall.end).scale(0.5).add(out_.scale(wall.thickness / 2 + 12 / this.scale));
        out.push(this.label(mid, `${fmt(wall.length())} m`));
      }
    }

    // Corner handles.
    if (tool === "select" || tool === "wall") {
      const active = this.drag?.kind === "corner" ? this.drag.at : this.hover?.kind === "corner" ? this.hover.at : null;
      for (const c of corners(house)) {
        const [x, y] = this.toScreen(c);
        const on = active && active.distance(c) < 1e-6;
        out.push(`<circle class="handle${on ? " active" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 6 : 4}"/>`);
      }
    }

    out.push(this.toolOverlay(tool));
    this.svg.innerHTML = out.join("");
    this.svg.dataset.tool = tool;
    this.svg.classList.toggle("dragging", this.drag?.kind === "pan");
    this.hint.textContent = HINTS[tool];
  }

  /** The wall's footprint rectangle, extended by half its thickness at both ends. */
  private wallOutline(wall: Wall): Vec2[] {
    const d = wall.direction();
    const n = leftNormal(wall).scale(wall.thickness / 2);
    const a = wall.start.sub(d.scale(wall.thickness / 2));
    const b = wall.end.add(d.scale(wall.thickness / 2));
    return [a.add(n), b.add(n), b.sub(n), a.sub(n)];
  }

  /** Architectural symbol for a window or door between `left` and `right` along the wall. */
  private openingSymbol(house: House, wall: Wall, kind: Opening["kind"], left: number, right: number, state: string): string {
    const d = wall.direction();
    const n = leftNormal(wall);
    const half = wall.thickness / 2 + 0.01;
    const at = (u: number, w: number) => wall.start.add(d.scale(u)).add(n.scale(w));
    const cut = [at(left, half), at(right, half), at(right, -half), at(left, -half)];
    const parts = [`<polygon class="cut ${state}" points="${this.pts(cut)}"/>`];
    if (kind === "Window") {
      parts.push(`<polyline class="glass" points="${this.pts([at(left, 0), at(right, 0)])}"/>`);
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

    if (tool === "wall") {
      const s = this.snap(cursor);
      if (this.draft.length > 0) {
        const last = this.draft[this.draft.length - 1];
        out.push(`<polyline class="draft" points="${this.pts(this.draft)}"/>`);
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
        out.push(this.label(a.add(b).scale(0.5), `${fmt(w)} × ${fmt(dpt)} m`, cls));
      }
      out.push(marker(s));
    } else if (tool === "window" || tool === "door") {
      const target = this.openingTarget(cursor);
      if (target) {
        const width = DEFAULT_OPENING[tool === "door" ? "Door" : "Window"].width;
        const c = clampOffset(target.wall, width, target.offset);
        out.push(this.openingSymbol(this.house, target.wall, tool === "door" ? "Door" : "Window", c - width / 2, c + width / 2, "ghost"));
      }
    }
    return out.join("");
  }
}
