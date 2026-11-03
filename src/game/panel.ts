/** The sidebar: tools, undo/redo, properties of the selection and the house, costs. */

import {
  type House,
  type Opening,
  type Roof,
  House as HouseClass,
  DOOR_MIN_HEIGHT,
  MAX_OVERHANG,
  MAX_WALL_HEIGHT,
  MIN_OPENING_SIZE,
  MIN_WALL_HEIGHT,
  PITCH_RANGE,
  ROOF_MATERIALS,
  ROOF_STYLES,
  WALL_MATERIALS,
  allSamples,
  clampOffset,
  placeOpening,
} from "../core";
import { renderStatus } from "./hud";
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

const opts = <T extends string>(values: readonly T[]) => values.map((v) => ({ value: v, label: v }));

export class Panel {
  private readonly fields: Field[] = [];
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly selectionBox: HTMLElement;
  private readonly status: HTMLElement;
  private selectionFields: Field[] = [];
  private selectionKey: string | null = null;

  constructor(
    root: HTMLElement,
    private readonly store: Store,
    capture: () => void,
  ) {
    const { plot } = store;
    const house = () => store.house;

    // Header.
    root.append(
      el("header", {}, el("h1", {}, "Architect"), el("div", { className: "sub" }, `${plot.name} · ${plot.width} × ${plot.depth} m · setback ${plot.setback} m`)),
    );

    // Tools.
    const tools = el("div", { className: "tools", role: "toolbar" });
    for (const t of TOOLS) {
      const b = el("button", { type: "button", title: `${t.label} (${t.key})` }, t.label, el("kbd", {}, t.key));
      b.addEventListener("click", () => store.setTool(t.tool));
      this.toolButtons.set(t.tool, b);
      tools.append(b);
    }
    root.append(el("section", {}, tools));

    // History and starting points.
    this.undoBtn = el("button", { type: "button", title: "Undo (Ctrl+Z)" }, "Undo");
    this.redoBtn = el("button", { type: "button", title: "Redo (Ctrl+Shift+Z)" }, "Redo");
    this.undoBtn.addEventListener("click", () => store.undo());
    this.redoBtn.addEventListener("click", () => store.redo());
    const start = el("select", { title: "Replace the house" }, el("option", { value: "" }, "Start over…"), el("option", { value: "empty" }, "Empty plot"));
    allSamples(plot).forEach((s, i) => start.append(el("option", { value: String(i) }, s.name)));
    start.addEventListener("change", () => {
      if (start.value === "empty") store.load(new HouseClass(), "My house");
      else if (start.value !== "") {
        const s = allSamples(plot)[Number(start.value)];
        store.load(s.house, s.name);
      }
      start.value = "";
      start.blur();
    });
    const captureBtn = el("button", { type: "button", title: "Render the four appraisal views (C)" }, "Capture");
    captureBtn.addEventListener("click", capture);
    root.append(el("section", { className: "row" }, this.undoBtn, this.redoBtn, start, captureBtn));

    // Selection.
    this.selectionBox = el("section", { className: "selection" });
    root.append(this.selectionBox);

    // Whole-house properties.
    const roof = () => house().roof;
    const editRoof = (fn: (r: Roof) => void, key: string) => store.edit((h) => h.roof && fn(h.roof), key);
    const pitched = () => roof() !== null && roof()!.style !== "Flat";
    this.fields.push(
      slider(
        "Wall height",
        { min: MIN_WALL_HEIGHT, max: MAX_WALL_HEIGHT, step: 0.1, unit: " m", digits: 1 },
        () => house().walls[0]?.height ?? null,
        (v) => store.edit((h) => h.walls.forEach((w) => (w.height = v)), "wall-height"),
      ),
      selectField(
        "Walls",
        opts(WALL_MATERIALS),
        () => house().walls[0]?.material ?? null,
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

    store.subscribe((change) => this.update(change === "house"));
    this.update(true);
  }

  private selectIssue(e: Event): void {
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-kind]");
    if (!li) return;
    const kind = li.dataset.kind as "wall" | "opening";
    this.store.select({ kind, id: Number(li.dataset.id) });
    this.store.setTool("select");
  }

  private update(houseChanged: boolean): void {
    const { store } = this;
    for (const [tool, b] of this.toolButtons) b.classList.toggle("active", tool === store.tool);
    this.undoBtn.disabled = !store.canUndo();
    this.redoBtn.disabled = !store.canRedo();
    this.syncSelection();
    for (const f of [...this.fields, ...this.selectionFields]) f.update();
    if (houseChanged) renderStatus(this.status, store);
  }

  /** Rebuild the selection box when a different thing is selected. */
  private syncSelection(): void {
    const { store } = this;
    const sel = store.selection;
    const opening = sel?.kind === "opening" ? store.house.opening(sel.id) : undefined;
    const key = sel ? `${sel.kind}:${sel.id}:${opening?.kind ?? ""}` : "";
    if (key === this.selectionKey) return;
    this.selectionKey = key;

    const box = this.selectionBox;
    box.replaceChildren();
    this.selectionFields = [];
    if (!sel) {
      box.append(el("p", { className: "sub" }, "Click a wall, window or door in the plan to edit it."));
      return;
    }

    const del = el("button", { type: "button", className: "danger", title: "Delete (Del)" }, "Delete");
    del.addEventListener("click", () => store.deleteSelection());

    if (sel.kind === "wall") {
      const wall = () => store.house.wall(sel.id);
      const length = el("output");
      this.selectionFields.push(
        { el: el("div", { className: "field" }, el("span", {}, "Length"), length), update: () => (length.textContent = `${(wall()?.length() ?? 0).toFixed(2)} m`) },
        selectField("Material", opts(WALL_MATERIALS), () => wall()?.material ?? null, (v) => store.edit((h) => void (h.wall(sel.id)!.material = v))),
      );
      const add = (kind: "Window" | "Door") => {
        const b = el("button", { type: "button" }, `Add ${kind.toLowerCase()}`);
        b.addEventListener("click", () => {
          let id: number | null = null;
          const w = wall();
          if (w) store.edit((h) => (id = placeOpening(h, w.id, kind, w.length() / 2)));
          if (id !== null) store.select({ kind: "opening", id });
        });
        return b;
      };
      box.append(el("h2", {}, "Wall"), ...this.selectionFields.map((f) => f.el), el("div", { className: "row" }, add("Window"), add("Door"), del));
      return;
    }

    const op = (h: House = store.house): Opening | undefined => h.opening(sel.id);
    const editOp = (fn: (o: Opening, h: House) => void, k: string) => store.edit((h) => { const o = op(h); if (o) fn(o, h); }, `${k}:${sel.id}`);
    const isDoor = opening?.kind === "Door";
    this.selectionFields.push(
      selectField("Type", [{ value: "Window", label: "Window" }, { value: "Door", label: "Door" }], () => op()?.kind ?? null, (v) =>
        editOp((o) => {
          o.kind = v;
          if (v === "Door") {
            o.sill = 0;
            o.height = Math.max(o.height, DOOR_MIN_HEIGHT + 0.2);
          } else {
            o.sill = 0.9;
            o.height = 1.3;
          }
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
      ...(isDoor ? [] : [numberField("Sill", { min: 0, max: 3, step: 0.1 }, () => op()?.sill ?? 0, (v) => editOp((o) => (o.sill = v), "sill"))]),
      numberField("Position", { min: 0, max: 100, step: 0.05 }, () => op()?.offset ?? 0, (v) => editOp((o) => (o.offset = v), "offset")),
    );
    box.append(el("h2", {}, opening?.kind ?? "Opening"), ...this.selectionFields.map((f) => f.el), el("div", { className: "row" }, del));
  }
}
