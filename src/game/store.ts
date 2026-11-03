/**
 * The editor's state: the house being built, the active tool, the selection and the undo
 * history. Views subscribe to changes; every change to the house goes through `edit` or
 * a gesture so it can be undone.
 */

import { History, House, type HouseJson, type Plot, type PriceList } from "../core";

export type Tool = "select" | "wall" | "room" | "window" | "door";

export type Selection = { kind: "wall"; id: number } | { kind: "opening"; id: number } | null;

/** What changed: the house itself, or only editor state such as the tool or selection. */
export type Change = "house" | "ui";

const SAVE_KEY = "architect.house.v1";

interface Saved {
  name: string;
  house: HouseJson;
}

export class Store {
  house: House;
  name: string;
  tool: Tool = "select";
  selection: Selection = null;
  showGuides = true;

  private readonly history = new History();
  private readonly listeners = new Set<(change: Change) => void>();
  private gestureBefore: HouseJson | null = null;
  private gestureRecorded = false;
  private saveTimer: number | undefined;

  constructor(
    readonly plot: Plot,
    readonly prices: PriceList,
    readonly budget: number,
    house: House,
    name: string,
  ) {
    this.house = house;
    this.name = name;
  }

  subscribe(fn: (change: Change) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(change: Change): void {
    if (change === "house") {
      this.dropStaleSelection();
      this.scheduleSave();
    }
    for (const fn of this.listeners) fn(change);
  }

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
  load(house: House, name: string): void {
    this.history.record(this.house.toJSON());
    this.house = house;
    this.name = name;
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

  setTool(tool: Tool): void {
    this.tool = tool;
    this.emit("ui");
  }

  toggleGuides(): void {
    this.showGuides = !this.showGuides;
    this.emit("ui");
  }

  /** Remove the selected wall or opening. */
  deleteSelection(): void {
    const sel = this.selection;
    if (!sel) return;
    this.edit((h) => (sel.kind === "wall" ? h.removeWall(sel.id) : h.removeOpening(sel.id)));
    this.selection = null;
    this.emit("ui");
  }

  private dropStaleSelection(): void {
    const sel = this.selection;
    if (sel && !(sel.kind === "wall" ? this.house.wall(sel.id) : this.house.opening(sel.id))) this.selection = null;
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        const saved: Saved = { name: this.name, house: this.house.toJSON() };
        localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
      } catch {
        // Storage can be unavailable (private windows); saving is a convenience only.
      }
    }, 300);
  }

  /** The house saved by a previous session, if any. */
  static restore(): { house: House; name: string } | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw) as Saved;
      return { house: House.fromJSON(saved.house), name: saved.name };
    } catch {
      return null;
    }
  }
}
