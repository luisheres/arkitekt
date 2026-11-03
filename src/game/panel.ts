/** The sidebar: the client's brief, tools, properties of the selection and the house, costs. */

import {
  type House,
  type Opening,
  type OpeningKind,
  type Roof,
  type RoomType,
  DEFAULT_OPENING,
  House as HouseClass,
  MAX_OVERHANG,
  MAX_WALL_HEIGHT,
  MIN_OPENING_SIZE,
  MIN_WALL_HEIGHT,
  OUTSIDE,
  PITCH_RANGE,
  ROOF_MATERIALS,
  ROOF_STYLES,
  ROOM_INFO,
  ROOM_TYPES,
  WALL_MATERIALS,
  Vec2,
  analyzeLayout,
  analyzeRooms,
  clampOffset,
  placeOpening,
  roomAt,
  roomName,
  setRoomType,
} from "../core";
import { money, renderBrief, renderStatus } from "./hud";
import type { Store, Tool } from "./store";

interface Field {
  el: HTMLElement;
  update(): void;
}

const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: "select", label: "Select", key: "V" },
  { tool: "room", label: "Room", key: "R" },
  { tool: "wall", label: "Wall", key: "W" },
  { tool: "window", label: "Window", key: "N" },
  { tool: "door", label: "Door", key: "D" },
];

const OPENING_LABELS: Record<OpeningKind, string> = { Window: "Window", Door: "Door", GarageDoor: "Garage door" };

const DEFAULT_ROOF: Roof = { style: "Gable", pitchDeg: 30, overhang: 0.4, material: "Shingles" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

const isFocused = (e: Element) => document.activeElement === e;

/** A labelled slider with its value shown beside it. `get` returning null disables it. */
function slider(label: string, o: { min: number; max: number; step: number; unit: string; digits: number }, get: () => number | null, set: (v: number) => void): Field {
  const input = el("input", { type: "range", min: String(o.min), max: String(o.max), step: String(o.step) });
  const output = el("output");
  input.addEventListener("input", () => set(Number(input.value)));
  return {
    el: el("label", { className: "field" }, el("span", {}, label), input, output),
    update() {
      const v = get();
      input.disabled = v === null;
      if (v !== null) input.value = String(v);
      output.textContent = v === null ? "–" : `${v.toFixed(o.digits)}${o.unit}`;
    },
  };
}

/** A labelled number input for exact sizes. */
function numberField(label: string, o: { min: number; max: number; step: number }, get: () => number, set: (v: number) => void): Field {
  const input = el("input", { type: "number", min: String(o.min), max: String(o.max), step: String(o.step) });
  input.addEventListener("input", () => {
    const v = Number(input.value);
    if (input.value !== "" && Number.isFinite(v)) set(v);
  });
  return {
    el: el("label", { className: "field" }, el("span", {}, label), input, el("output", {}, "m")),
    update() {
      if (!isFocused(input)) input.value = String(Number(get().toFixed(2)));
    },
  };
}

function selectField<T extends string>(label: string, options: readonly { value: T; label: string }[], get: () => T | null, set: (v: T) => void): Field {
  const select = el("select", {}, ...options.map((o) => el("option", { value: o.value }, o.label)));
  select.addEventListener("change", () => {
    set(select.value as T);
    select.blur(); // so tool shortcuts don't keep changing the dropdown
  });
  return {
    el: el("label", { className: "field" }, el("span", {}, label), select),
    update() {
      const v = get();
      select.disabled = v === null;
      if (v !== null) select.value = v;
    },
  };
}

/** A read-only value row. */
function readout(label: string, get: () => string): Field {
  const output = el("output");
  return { el: el("div", { className: "field" }, el("span", {}, label), output), update: () => (output.textContent = get()) };
}

const opts = <T extends string>(values: readonly T[]) => values.map((v) => ({ value: v, label: v }));

export interface PanelActions {
  capture(): void;
  present(): void;
  showBrief(): void;
}

export class Panel {
  private readonly fields: Field[] = [];
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly career: HTMLElement;
  private readonly clientBox: HTMLElement;
  private readonly brief: HTMLElement;
  private readonly selectionBox: HTMLElement;
  private readonly status: HTMLElement;
  private selectionFields: Field[] = [];
  private selectionKey: string | null = null;

  constructor(
    root: HTMLElement,
    private readonly store: Store,
    actions: PanelActions,
  ) {
    const house = () => store.house;

    // Header and career.
    this.career = el("div", { className: "sub" });
    root.append(el("header", {}, el("h1", {}, "Architect"), this.career));

    // The client and their brief.
    this.clientBox = el("div", { className: "client" });
    this.brief = el("div");
    const briefBtn = el("button", { type: "button", title: "Read the client's brief again" }, "Brief");
    briefBtn.addEventListener("click", actions.showBrief);
    const presentBtn = el("button", { type: "button", className: "primary", title: "Show the design to the client" }, "Present to client");
    presentBtn.addEventListener("click", actions.present);
    root.append(el("section", { className: "client-section" }, this.clientBox, this.brief, el("div", { className: "row" }, presentBtn, briefBtn)));

    // Tools.
    const tools = el("div", { className: "tools", role: "toolbar" });
    for (const t of TOOLS) {
      const b = el("button", { type: "button", title: `${t.label} (${t.key})` }, t.label, el("kbd", {}, t.key));
      b.addEventListener("click", () => store.setTool(t.tool));
      this.toolButtons.set(t.tool, b);
      tools.append(b);
    }
    root.append(el("section", {}, tools));

    // History.
    this.undoBtn = el("button", { type: "button", title: "Undo (Ctrl+Z)" }, "Undo");
    this.redoBtn = el("button", { type: "button", title: "Redo (Ctrl+Shift+Z)" }, "Redo");
    this.undoBtn.addEventListener("click", () => store.undo());
    this.redoBtn.addEventListener("click", () => store.redo());
    const clear = el("button", { type: "button", title: "Remove everything from the plot" }, "Clear plot");
    clear.addEventListener("click", () => store.load(new HouseClass()));
    const captureBtn = el("button", { type: "button", title: "Render the four appraisal views (C)" }, "Capture");
    captureBtn.addEventListener("click", actions.capture);
    root.append(el("section", { className: "row" }, this.undoBtn, this.redoBtn, clear, captureBtn));

    // Selection.
    this.selectionBox = el("section", { className: "selection" });
    root.append(this.selectionBox);

    // Whole-house properties.
    const roof = () => house().roof;
    const editRoof = (fn: (r: Roof) => void, key: string) => store.edit((h) => h.roof && fn(h.roof), key);
    const pitched = () => roof() !== null && roof()!.style !== "Flat";
    const exteriorWalls = (h: House) => {
      const layout = analyzeLayout(h);
      return layout.ok ? h.walls.filter((w) => layout.value.exterior.has(w.id)) : h.walls;
    };
    this.fields.push(
      slider(
        "Wall height",
        { min: MIN_WALL_HEIGHT, max: MAX_WALL_HEIGHT, step: 0.1, unit: " m", digits: 1 },
        () => house().walls[0]?.height ?? null,
        (v) => store.edit((h) => h.walls.forEach((w) => (w.height = v)), "wall-height"),
      ),
      selectField(
        "Facade",
        opts(WALL_MATERIALS),
        () => exteriorWalls(house())[0]?.material ?? null,
        (v) => store.edit((h) => h.walls.forEach((w) => (w.material = v))),
      ),
      selectField(
        "Roof",
        [{ value: "none", label: "None" }, ...opts(ROOF_STYLES)],
        () => roof()?.style ?? "none",
        (v) =>
          store.edit((h) => {
            if (v === "none") h.roof = null;
            else {
              h.roof = { ...(h.roof ?? DEFAULT_ROOF), style: v };
              if (v !== "Flat" && h.roof.pitchDeg < PITCH_RANGE[0]) h.roof.pitchDeg = DEFAULT_ROOF.pitchDeg;
            }
          }),
      ),
      slider("Pitch", { min: PITCH_RANGE[0], max: PITCH_RANGE[1], step: 1, unit: "°", digits: 0 }, () => (pitched() ? roof()!.pitchDeg : null), (v) => editRoof((r) => (r.pitchDeg = v), "pitch")),
      slider("Overhang", { min: 0, max: MAX_OVERHANG, step: 0.1, unit: " m", digits: 1 }, () => (pitched() ? roof()!.overhang : null), (v) => editRoof((r) => (r.overhang = v), "overhang")),
      selectField("Covering", opts(ROOF_MATERIALS), () => roof()?.material ?? null, (v) => editRoof((r) => (r.material = v), "roof-material")),
    );
    root.append(el("section", { className: "house" }, el("h2", {}, "House"), ...this.fields.map((f) => f.el)));

    // Costs and issues.
    this.status = el("section", { className: "status" });
    this.status.addEventListener("click", (e) => this.selectIssue(e));
    this.status.addEventListener("keydown", (e) => e.key === "Enter" && this.selectIssue(e));
    root.append(el("h2", { className: "status-title" }, "Cost"), this.status);

    store.subscribe((change) => this.update(change !== "ui"));
    this.update(true);
  }

  private selectIssue(e: Event): void {
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-kind]");
    if (!li) return;
    const d = li.dataset;
    if (d.kind === "room") this.store.select({ kind: "room", at: new Vec2(Number(d.x), Number(d.y)) });
    else this.store.select({ kind: d.kind as "wall" | "opening", id: Number(d.id) });
    this.store.setTool("select");
  }

  private update(houseChanged: boolean): void {
    const { store } = this;
    const { career, client } = store;
    this.career.textContent = `Earned ${money(career.earnings)} · ${career.completed.length} ${career.completed.length === 1 ? "house" : "houses"} sold`;
    this.clientBox.innerHTML = "";
    this.clientBox.append(
      el("h2", {}, "Client"),
      el("div", { className: "client-name" }, client.name),
      el("div", { className: "sub" }, `${client.plot.name} (${client.plot.width} × ${client.plot.depth} m) · budget ${money(client.budget)}`),
    );
    for (const [tool, b] of this.toolButtons) b.classList.toggle("active", tool === store.tool);
    this.undoBtn.disabled = !store.canUndo();
    this.redoBtn.disabled = !store.canRedo();
    this.syncSelection();
    for (const f of [...this.fields, ...this.selectionFields]) f.update();
    if (houseChanged) {
      renderBrief(this.brief, store);
      renderStatus(this.status, store);
    }
  }

  /** Rebuild the selection box when a different thing is selected. */
  private syncSelection(): void {
    const { store } = this;
    const sel = store.selection;
    const analysis = analyzeRooms(store.house);
    const rooms = analysis.ok ? analysis.value.rooms : [];
    const opening = sel?.kind === "opening" ? store.house.opening(sel.id) : undefined;
    const room = sel?.kind === "room" ? roomAt(rooms, sel.at) : undefined;
    const exterior = sel?.kind === "wall" && analysis.ok && analysis.value.layout.exterior.has(sel.id);
    const key = !sel
      ? ""
      : sel.kind === "room"
        ? `room:${room ? `${room.type}:${room.polygon.map((p) => `${p.x},${p.y}`).join(";")}` : "none"}`
        : `${sel.kind}:${sel.id}:${opening?.kind ?? ""}:${exterior}`;
    if (key === this.selectionKey) return;
    this.selectionKey = key;

    const box = this.selectionBox;
    box.replaceChildren();
    this.selectionFields = [];
    if (!sel || (sel.kind === "room" && !room)) {
      box.append(el("p", { className: "sub" }, "Click a room, wall, window or door in the plan to edit it."));
      return;
    }

    const del = el("button", { type: "button", className: "danger", title: "Delete (Del)" }, "Delete");
    del.addEventListener("click", () => store.deleteSelection());

    if (sel.kind === "room" && room) {
      const at = sel.at;
      const current = () => {
        const a = analyzeRooms(store.house);
        return a.ok ? roomAt(a.value.rooms, at) : undefined;
      };
      const types: { value: RoomType | ""; label: string }[] = [{ value: "", label: "Not set" }, ...ROOM_TYPES.map((t) => ({ value: t, label: ROOM_INFO[t].name }))];
      this.selectionFields.push(
        selectField<RoomType | "">("Used as", types, () => current()?.type ?? "", (v) => store.edit((h) => void setRoomType(h, at, v === "" ? null : v))),
        readout("Area", () => `${(current()?.area ?? 0).toFixed(1)} m²`),
        readout("Openings", () => {
          const r = current();
          if (!r) return "";
          const doors = r.doors.length;
          const outside = r.doors.some((d) => d.to === OUTSIDE);
          return `${doors} ${doors === 1 ? "door" : "doors"}${outside ? " (one outside)" : ""}, ${r.windows.length} ${r.windows.length === 1 ? "window" : "windows"}`;
        }),
      );
      const min = room.type ? ROOM_INFO[room.type].minArea : null;
      const notes = el("p", { className: "sub" }, min ? `A ${ROOM_INFO[room.type!].name.toLowerCase()} needs at least ${min} m²${ROOM_INFO[room.type!].needsWindow ? " and a window" : ""}.` : "Choose what this room is for.");
      box.append(el("h2", {}, roomName(room)), ...this.selectionFields.map((f) => f.el), notes);
      return;
    }

    if (sel.kind === "wall") {
      const wall = () => store.house.wall(sel.id);
      this.selectionFields.push(readout("Length", () => `${(wall()?.length() ?? 0).toFixed(2)} m`));
      if (exterior) {
        this.selectionFields.push(selectField("Material", opts(WALL_MATERIALS), () => wall()?.material ?? null, (v) => store.edit((h) => void (h.wall(sel.id)!.material = v))));
      }
      const add = (kind: OpeningKind) => {
        const b = el("button", { type: "button" }, `Add ${OPENING_LABELS[kind].toLowerCase()}`);
        b.addEventListener("click", () => {
          let id: number | null = null;
          const w = wall();
          if (w) store.edit((h) => (id = placeOpening(h, w.id, kind, w.length() / 2)));
          if (id !== null) store.select({ kind: "opening", id });
        });
        return b;
      };
      const buttons = exterior ? [add("Window"), add("Door"), add("GarageDoor"), del] : [add("Door"), del];
      box.append(el("h2", {}, exterior ? "Exterior wall" : "Interior wall"), ...this.selectionFields.map((f) => f.el), el("div", { className: "row" }, ...buttons));
      return;
    }

    if (sel.kind !== "opening") return;
    const op = (h: House = store.house): Opening | undefined => h.opening(sel.id);
    const editOp = (fn: (o: Opening, h: House) => void, k: string) =>
      store.edit((h) => {
        const o = op(h);
        if (o) fn(o, h);
      }, `${k}:${sel.id}`);
    const kinds = (Object.keys(OPENING_LABELS) as OpeningKind[]).map((k) => ({ value: k, label: OPENING_LABELS[k] }));
    this.selectionFields.push(
      selectField("Type", kinds, () => op()?.kind ?? null, (v) =>
        editOp((o, h) => {
          const d = DEFAULT_OPENING[v];
          o.kind = v;
          o.sill = d.sill;
          o.height = d.height;
          o.width = d.width;
          const w = h.wall(o.wall);
          if (w) o.offset = clampOffset(w, o.width, o.offset);
        }, "kind"),
      ),
      numberField("Width", { min: MIN_OPENING_SIZE, max: 6, step: 0.1 }, () => op()?.width ?? 0, (v) =>
        editOp((o, h) => {
          o.width = v;
          const w = h.wall(o.wall);
          if (w) o.offset = clampOffset(w, v, o.offset);
        }, "width"),
      ),
      numberField("Height", { min: MIN_OPENING_SIZE, max: 4, step: 0.1 }, () => op()?.height ?? 0, (v) => editOp((o) => (o.height = v), "height")),
      ...(opening?.kind === "Window" ? [numberField("Sill", { min: 0, max: 3, step: 0.1 }, () => op()?.sill ?? 0, (v) => editOp((o) => (o.sill = v), "sill"))] : []),
      numberField("Position", { min: 0, max: 100, step: 0.05 }, () => op()?.offset ?? 0, (v) => editOp((o) => (o.offset = v), "offset")),
    );
    box.append(el("h2", {}, OPENING_LABELS[opening?.kind ?? "Window"]), ...this.selectionFields.map((f) => f.el), el("div", { className: "row" }, del));
  }
}
