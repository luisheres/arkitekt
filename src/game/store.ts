/**
 * The game's state: the mode (campaign or free play), the career, the current client,
 * the house being designed, the active tool, the selection and the undo history. Views
 * subscribe to changes; every change to the house goes through `edit` or a gesture so it
 * can be undone. The campaign and free play are saved separately, so switching between
 * them loses nothing.
 */

import { newDesignId, putDesign } from "./designs";
import { playerKey } from "./profiles";
import {
  type Abilities,
  type Career,
  type Commission,
  type Client,
  History,
  House,
  type HouseJson,
  type PriceList,
  type SavedDesign,
  type TechniqueId,
  type Unlock,
  type Vec2,
  abilities,
  canBuild,
  techniqueFor,
  buyTechnique,
  careerAbilities,
  clientById,
  careerClient,
  type Difficulty,
  clientOffers,
  completeCommission,
  freePlayClient,
  isFreePlay,
  newCareer,
  pricesWith,
  MAX_LEVELS,
  addStoreyAbove,
  clearRoomFurnitureAt,
  furnishAll,
  setRoomType,
} from "../core";

export type Tool = "select" | "wall" | "boundary" | "room" | "window" | "door" | "stairs";

/** Tools that draw chains of walls (or room boundaries) corner by corner. */
export const drawsWalls = (t: Tool): t is "wall" | "boundary" => t === "wall" || t === "boundary";

export type Selection =
  | { kind: "wall"; id: number }
  | { kind: "opening"; id: number }
  | { kind: "stair"; id: number }
  | { kind: "furniture"; id: number }
  /** A room label that is no longer inside any room. */
  | { kind: "label"; id: number }
  /** The room containing `at`, on the current level. */
  | { kind: "room"; at: Vec2 }
  /** The whole roof, or every outer wall's facade. */
  | { kind: "roof" }
  | { kind: "facade" }
  /** The garden: what can be planted. */
  | { kind: "garden" }
  | { kind: "balcony"; id: number }
  | null;

/** What changed: the house, editor state such as the tool or selection, or the client. */
export type Change = "house" | "ui" | "client";

export type Mode = "campaign" | "free";

/** Where the current player's campaign and free play are kept. */
const saveKey = (mode: Mode): string => playerKey(mode === "campaign" ? "game.v2" : "free.v1");

interface Saved {
  career: Career;
  /** The commission in progress; null between clients. */
  current: { clientId: string; house: HouseJson; design?: { id: string; name: string } } | null;
}

interface SavedFree {
  /** The plot's id (from before there were more plots: its setting, which is the same). */
  setting: string;
  house: HouseJson;
  design?: { id: string; name: string };
}

const ALL = abilities("all");

export class Store {
  mode: Mode = "campaign";
  house = new House();
  client!: Client;
  career: Career = newCareer();
  /** False until the player has taken on the current client's brief. */
  working = false;
  /** The saved design being worked on, so saving again updates it. */
  design: { id: string; name: string } | null = null;
  tool: Tool = "select";
  /** The storey being edited in the plan. */
  level = 0;
  selection: Selection = null;
  showGuides = true;
  showRoof = true;
  /** Storeys left out of the 3D view. */
  hiddenLevels = new Set<number>();
  showFurniture = true;
  /** The live cost chart is open. */
  showCosts = false;

  private history = new History();
  private readonly listeners = new Set<(change: Change) => void>();
  private gestureBefore: HouseJson | null = null;
  private gestureRecorded = false;
  private saveTimer: number | undefined;

  constructor(
    readonly basePrices: PriceList,
    mode: Mode = "campaign",
  ) {
    this.loadMode(mode);
  }

  /** What can be built: everything in free play, what has been learned in the campaign. */
  get abilities(): Abilities {
    return this.mode === "free" ? ALL : careerAbilities(this.career);
  }

  /** Unit prices, with the business techniques' discounts. */
  get prices(): PriceList {
    return pricesWith(this.basePrices, this.abilities);
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

  // --- Modes -------------------------------------------------------------------------

  /** Switch between the campaign and free play, each picking up where it was left. */
  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.save();
    this.loadMode(mode);
    this.emit("client");
  }

  private loadMode(mode: Mode): void {
    this.mode = mode;
    this.history = new History();
    this.selection = null;
    this.level = 0;
    this.tool = "select";
    this.design = null;
    if (mode === "free") {
      const saved = Store.restore<SavedFree>("free");
      this.client = freePlayClient(saved?.setting ?? "suburban");
      this.house = saved ? House.fromJSON(saved.house) : new House();
      this.design = saved?.design ?? null;
      this.working = true;
      return;
    }
    const saved = Store.restore<Saved>("campaign");
    this.career = saved?.career ?? newCareer();
    const current = saved?.current && clientById(saved.current.clientId);
    if (saved?.current && current && !isFreePlay(current)) {
      this.client = careerClient(this.career, current);
      this.house = House.fromJSON(saved.current.house);
      // Saves from before furniture was stored: furnish the rooms once.
      if (!saved.current.house.furniture) furnishAll(this.house);
      this.design = saved.current.design ?? null;
      this.working = true;
    } else {
      this.client = clientOffers(this.career)[0];
      this.house = new House();
      this.working = false;
    }
  }

  /** The campaign's career, also while in free play (for the welcome screen). */
  campaignCareer(): Career {
    return this.mode === "campaign" ? this.career : (Store.restore<Saved>("campaign")?.career ?? newCareer());
  }

  /** Start the campaign over from nothing, at a difficulty; saved designs stay. */
  startOver(difficulty: Difficulty): void {
    this.career = newCareer(difficulty);
    this.mode = "campaign";
    this.client = clientOffers(this.career)[0];
    this.working = false;
    this.design = null;
    this.house = new House();
    this.history = new History();
    this.selection = null;
    this.level = 0;
    this.save();
    this.emit("client");
  }

  /** Free play: build on another plot (the house stays as it is). */
  setFreePlot(plotId: string): void {
    if (this.mode !== "free") return;
    this.client = freePlayClient(plotId);
    this.emit("client");
  }

  // --- Campaign ----------------------------------------------------------------------

  /** Tell the views that something outside the store changed (such as the player's name). */
  emitUi(): void {
    this.emit("ui");
  }

  /** Called when the player reaches for something not learned yet (to show the Workshop). */
  onLocked: (id: TechniqueId) => void = () => {};

  /** The technique something needs, or null when it can be built. */
  lockOf(u: Unlock): TechniqueId | null {
    return canBuild(this.abilities, u) ? null : techniqueFor(u);
  }

  /** The technique a tool needs, or null. */
  toolLock(tool: Tool): TechniqueId | null {
    if (tool === "boundary") return this.lockOf({ kind: "openPlan" });
    if (tool === "stairs") return this.lockOf({ kind: "storeys", count: 2 });
    return null;
  }

  /** The technique another storey needs, or null. */
  floorLock(): TechniqueId | null {
    return this.house.levels >= MAX_LEVELS ? null : this.lockOf({ kind: "storeys", count: this.house.levels + 1 });
  }

  /** The clients to choose from now. */
  offers(): Client[] {
    return clientOffers(this.career);
  }

  /** Ask for other clients. */
  refreshOffers(): void {
    this.career = { ...this.career, refreshes: (this.career.refreshes ?? 0) + 1 };
    this.scheduleSave();
    this.emit("ui");
  }

  /** Take on a client: their brief becomes the commission, on an empty plot. */
  takeClient(client: Client): void {
    this.client = client;
    this.startCommission();
  }

  /** Buy a technique in the Workshop; false when it cannot be bought. */
  buyTechnique(id: TechniqueId): boolean {
    const next = buyTechnique(this.career, id);
    if (next === this.career) return false;
    this.career = next;
    // Prices and what counts as a building problem may have changed.
    this.emit("house");
    return true;
  }

  // --- Commissions -------------------------------------------------------------------

  /** Take on the current client's brief, starting from an empty plot. */
  startCommission(house = new House()): void {
    this.design = null;
    this.house = house;
    this.history = new History();
    this.selection = null;
    this.level = 0;
    this.tool = "select";
    this.working = true;
    this.emit("client");
  }

  /** The client accepted the design: get paid and line up the next client. */
  completeCommission(fee: number, stars: number, details: Omit<Commission, "clientId" | "fee" | "stars"> = {}): void {
    this.career = completeCommission(this.career, this.client.id, fee, stars, details);
    this.design = null;
    this.client = clientOffers(this.career)[0];
    this.working = false;
    this.house = new House();
    this.history = new History();
    this.selection = null;
    this.level = 0;
    this.emit("client");
  }

  // --- Saved designs ------------------------------------------------------------------

  /** Whether a client's commission has already been sold. */
  isSold(clientId: string): boolean {
    return this.career.completed.some((c) => c.clientId === clientId);
  }

  /**
   * Save the design under `name`: over the design it came from, or as a new one.
   * Throws when the browser cannot store it.
   */
  saveDesign(name: string, asNew: boolean, thumbnail?: string): SavedDesign {
    const id = !asNew && this.design ? this.design.id : newDesignId();
    const design: SavedDesign = { id, name, clientId: this.client.id, savedAt: Date.now(), house: this.house.toJSON(), thumbnail };
    putDesign(design);
    this.design = { id, name };
    this.emit("ui");
    this.scheduleSave();
    return design;
  }

  /**
   * Pick a saved design up again: its client becomes the current commission (a free
   * play design opens in free play, any other in the campaign).
   */
  openDesign(d: SavedDesign): boolean {
    const client = clientById(d.clientId);
    if (!client) return false;
    const mode: Mode = isFreePlay(client) ? "free" : "campaign";
    if (mode !== this.mode) {
      this.save();
      this.loadMode(mode);
    }
    if (mode === "campaign" && this.isSold(d.clientId)) {
      this.emit("client");
      return false;
    }
    this.client = mode === "campaign" ? careerClient(this.career, client) : client;
    this.house = House.fromJSON(d.house);
    if (!d.house.furniture) furnishAll(this.house);
    this.design = { id: d.id, name: d.name };
    this.working = true;
    this.history = new History();
    this.selection = null;
    this.level = 0;
    this.emit("client");
    return true;
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
    const lock = this.floorLock();
    if (lock) return this.onLocked(lock);
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
    const lock = this.toolLock(tool);
    if (lock) return this.onLocked(lock);
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

  /** Show or hide one storey in the 3D view. */
  toggleLevelShown(level: number): void {
    if (this.hiddenLevels.has(level)) this.hiddenLevels.delete(level);
    else this.hiddenLevels.add(level);
    this.emit("ui");
  }

  toggleCosts(): void {
    this.showCosts = !this.showCosts;
    this.emit("ui");
  }

  toggleFurniture(): void {
    this.showFurniture = !this.showFurniture;
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
      else if (sel.kind === "furniture") h.removeFurniture(sel.id);
      else if (sel.kind === "label") h.removeLabel(sel.id);
      else if (sel.kind === "balcony") h.removeBalcony(sel.id);
      else if (sel.kind === "room") {
        setRoomType(h, sel.at, null, this.level);
        clearRoomFurnitureAt(h, sel.at, this.level);
      }
    });
    this.selection = null;
    this.emit("ui");
  }

  private dropStaleSelection(): void {
    // Undo can take away the storey being edited.
    if (this.level >= this.house.levels) this.level = this.house.levels - 1;
    const sel = this.selection;
    if (sel?.kind === "stair" && !this.house.stair(sel.id)) this.selection = null;
    if (sel?.kind === "furniture" && !this.house.furniturePiece(sel.id)) this.selection = null;
    if (sel?.kind === "label" && !this.house.label(sel.id)) this.selection = null;
    if (sel?.kind === "wall" && !this.house.wall(sel.id)) this.selection = null;
    if (sel?.kind === "opening" && !this.house.opening(sel.id)) this.selection = null;
    if (sel?.kind === "balcony" && !this.house.balcony(sel.id)) this.selection = null;
  }

  // --- Saving ------------------------------------------------------------------------

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.save(), 300);
  }

  save(): void {
    try {
      const design = this.design ? { design: this.design } : {};
      const saved: Saved | SavedFree =
        this.mode === "free"
          ? { setting: this.client.plot.id, house: this.house.toJSON(), ...design }
          : { career: this.career, current: this.working ? { clientId: this.client.id, house: this.house.toJSON(), ...design } : null };
      localStorage.setItem(saveKey(this.mode), JSON.stringify(saved));
    } catch {
      // Storage can be unavailable (private windows); saving is a convenience only.
    }
  }

  private static restore<T>(mode: Mode): T | null {
    try {
      const raw = localStorage.getItem(saveKey(mode));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
}
