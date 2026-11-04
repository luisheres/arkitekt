/**
 * The game's state: the career, the current client, the house being designed, the
 * active tool, the selection and the undo history. Views subscribe to changes; every
 * change to the house goes through `edit` or a gesture so it can be undone.
 */

import {
  type Career,
  type Client,
  History,
  House,
  type HouseJson,
  type PriceList,
  type Vec2,
  clientById,
  completeCommission,
  newCareer,
  nextClient,
  MAX_LEVELS,
  addStoreyAbove,
  setRoomType,
} from "../core";

export type Tool = "select" | "wall" | "boundary" | "room" | "window" | "door" | "stairs";

/** Tools that draw chains of walls (or room boundaries) corner by corner. */
export const drawsWalls = (t: Tool): t is "wall" | "boundary" => t === "wall" || t === "boundary";

export type Selection =
  | { kind: "wall"; id: number }
  | { kind: "opening"; id: number }
  | { kind: "stair"; id: number }
  /** The room containing `at`, on the current level. */
  | { kind: "room"; at: Vec2 }
  | null;

/** What changed: the house, editor state such as the tool or selection, or the client. */
export type Change = "house" | "ui" | "client";

const SAVE_KEY = "architect.game.v2";

interface Saved {
  career: Career;
  /** The commission in progress; null between clients. */
  current: { clientId: string; house: HouseJson } | null;
}

export class Store {
  house = new House();
  client: Client;
  career: Career;
  /** False until the player has taken on the current client's brief. */
  working = false;
  tool: Tool = "select";
  /** The storey being edited in the plan. */
  level = 0;
  selection: Selection = null;
  showGuides = true;
  showRoof = true;

  private history = new History();
  private readonly listeners = new Set<(change: Change) => void>();
  private gestureBefore: HouseJson | null = null;
  private gestureRecorded = false;
  private saveTimer: number | undefined;

  constructor(readonly prices: PriceList) {
    const saved = Store.restore();
    this.career = saved?.career ?? newCareer();
    const current = saved?.current && clientById(saved.current.clientId);
    if (saved?.current && current) {
      this.client = current;
      this.house = House.fromJSON(saved.current.house);
      this.working = true;
    } else {
      this.client = nextClient(this.career);
    }
  }

  get plot() {
    return this.client.plot;
  }

  get budget() {
    return this.client.budget;
  }

  subscribe(fn: (change: Change) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(change: Change): void {
    if (change !== "ui") {
      this.dropStaleSelection();
      this.scheduleSave();
    }
    for (const fn of this.listeners) fn(change);
  }

  // --- Commissions -------------------------------------------------------------------

  /** Take on the current client's brief, starting from an empty plot. */
  startCommission(house = new House()): void {
    this.house = house;
    this.history = new History();
    this.selection = null;
    this.level = 0;
    this.tool = "select";
    this.working = true;
    this.emit("client");
  }

  /** The client accepted the design: get paid and line up the next client. */
  completeCommission(fee: number, stars: number): void {
    this.career = completeCommission(this.career, this.client.id, fee, stars);
    this.client = nextClient(this.career);
    this.working = false;
    this.house = new House();
    this.history = new History();
    this.selection = null;
    this.level = 0;
    this.emit("client");
  }

  // --- Editing -----------------------------------------------------------------------

  /**
   * Change the house as one undoable step. Edits passing the same `mergeKey` in quick
   * succession (e.g. while dragging a slider) collapse into one step. No-ops are ignored.
   */
  edit(fn: (house: House) => void, mergeKey?: string): void {
    const before = this.house.toJSON();
    fn(this.house);
    if (JSON.stringify(before) === JSON.stringify(this.house.toJSON())) return;
    this.history.record(before, mergeKey);
    this.emit("house");
  }

  /** Start a pointer drag; all `gestureEdit` calls until `endGesture` form one undo step. */
  beginGesture(): void {
    this.gestureBefore = this.house.toJSON();
    this.gestureRecorded = false;
  }

  gestureEdit(fn: (house: House) => void): void {
    if (!this.gestureBefore) return this.edit(fn);
    if (!this.gestureRecorded) {
      this.history.record(this.gestureBefore);
      this.gestureRecorded = true;
    }
    fn(this.house);
    this.emit("house");
  }

  endGesture(): void {
    this.gestureBefore = null;
  }

  /** Replace the whole house (undoable). */
  load(house: House): void {
    this.history.record(this.house.toJSON());
    this.house = house;
    this.selection = null;
    this.emit("house");
  }

  undo(): void {
    const prev = this.history.undo(this.house.toJSON());
    if (prev) {
      this.house = House.fromJSON(prev);
      this.emit("house");
    }
  }

  redo(): void {
    const next = this.history.redo(this.house.toJSON());
    if (next) {
      this.house = House.fromJSON(next);
      this.emit("house");
    }
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  select(selection: Selection): void {
    this.selection = selection;
    this.emit("ui");
  }

  /** Edit another storey. */
  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(level, this.house.levels - 1));
    this.selection = null;
    this.emit("ui");
  }

  /** Add a storey on top (starting from the outline below) and switch to it. */
  addFloor(): void {
    if (this.house.levels >= MAX_LEVELS) return;
    let level = 0;
    this.edit((h) => (level = addStoreyAbove(h)));
    this.setLevel(level);
  }

  /** Remove the top storey with everything on it. */
  removeTopFloor(): void {
    if (this.house.levels <= 1) return;
    this.edit((h) => h.removeTopLevel());
    this.setLevel(Math.min(this.level, this.house.levels - 1));
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.emit("ui");
  }

  toggleGuides(): void {
    this.showGuides = !this.showGuides;
    this.emit("ui");
  }

  toggleRoof(): void {
    this.showRoof = !this.showRoof;
    this.emit("ui");
  }

  /** Remove the selected wall or opening, or clear the selected room's type. */
  deleteSelection(): void {
    const sel = this.selection;
    if (!sel) return;
    this.edit((h) => {
      if (sel.kind === "wall") h.removeWall(sel.id);
      else if (sel.kind === "opening") h.removeOpening(sel.id);
      else if (sel.kind === "stair") h.removeStair(sel.id);
      else setRoomType(h, sel.at, null, this.level);
    });
    this.selection = null;
    this.emit("ui");
  }

  private dropStaleSelection(): void {
    // Undo can take away the storey being edited.
    if (this.level >= this.house.levels) this.level = this.house.levels - 1;
    const sel = this.selection;
    if (sel?.kind === "stair" && !this.house.stair(sel.id)) this.selection = null;
    if (sel?.kind === "wall" && !this.house.wall(sel.id)) this.selection = null;
    if (sel?.kind === "opening" && !this.house.opening(sel.id)) this.selection = null;
  }

  // --- Saving ------------------------------------------------------------------------

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.save(), 300);
  }

  save(): void {
    try {
      const saved: Saved = {
        career: this.career,
        current: this.working ? { clientId: this.client.id, house: this.house.toJSON() } : null,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
    } catch {
      // Storage can be unavailable (private windows); saving is a convenience only.
    }
  }

  private static restore(): Saved | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? (JSON.parse(raw) as Saved) : null;
    } catch {
      return null;
    }
  }
}
