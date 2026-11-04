/** The sidebar: the client's brief, tools, properties of the selection and the house, costs. */

import {
  FLOOR_FINISHES,
  type FloorFinish,
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
  OPENING_KINDS,
  OUTSIDE,
  PITCH_RANGE,
  ROOF_MATERIALS,
  ROOF_STYLES,
  ROOM_INFO,
  ROOM_TYPES,
  LANGS,
  WALL_MATERIALS,
  Vec2,
  area,
  fixed,
  messages,
  meters,
  num,
  analyzeLayout,
  analyzeRooms,
  clampOffset,
  placeOpening,
  roomAt,
  roomName,
  setRoomFloor,
  setRoomType,
} from "../core";
import { plotSize } from "./dialogs";
import { money, renderBrief, renderStatus } from "./hud";
import { lang, m, setLang } from "./i18n";
import type { Store, Tool } from "./store";

interface Field {
  el: HTMLElement;
  update(): void;
}

const TOOLS: { tool: Tool; key: string }[] = [
  { tool: "select", key: "V" },
  { tool: "room", key: "R" },
  { tool: "wall", key: "W" },
  { tool: "boundary", key: "B" },
  { tool: "window", key: "N" },
  { tool: "door", key: "D" },
  { tool: "stairs", key: "S" },
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
      output.textContent = v === null ? "–" : `${fixed(m, v, o.digits)}${o.unit}`;
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

/** Options for an enum, labelled from a catalog table. */
const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((v) => ({ value: v, label: labels[v] }));

export interface PanelActions {
  capture(): void;
  /** Turn the current client down and meet another. */
  newClient(): void;
  /** Save state before the page reloads in another language. */
  beforeReload(): void;
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
    const langSelect = el("select", { title: m.ui.language, ariaLabel: m.ui.language }, ...LANGS.map((l) => el("option", { value: l, selected: l === lang }, messages(l).languageName)));
    langSelect.addEventListener("change", () => setLang(langSelect.value as (typeof LANGS)[number], actions.beforeReload));
    root.append(el("header", {}, el("div", { className: "title-row" }, el("h1", {}, m.ui.title), langSelect), this.career));

    // The client and their brief.
    this.clientBox = el("div", { className: "client" });
    this.brief = el("div");
    const briefBtn = el("button", { type: "button", title: m.ui.briefTitle }, m.ui.brief);
    briefBtn.addEventListener("click", actions.showBrief);
    const presentBtn = el("button", { type: "button", className: "primary", title: m.ui.presentTitle }, m.ui.present);
    presentBtn.addEventListener("click", actions.present);
    const newClientBtn = el("button", { type: "button", className: "new-client", title: m.ui.newClientTitle }, `↻ ${m.ui.newClientButton}`);
    newClientBtn.addEventListener("click", actions.newClient);
    root.append(el("section", { className: "client-section" }, this.clientBox, this.brief, el("div", { className: "row" }, presentBtn, briefBtn, newClientBtn)));

    // Tools.
    const tools = el("div", { className: "tools", role: "toolbar" });
    for (const t of TOOLS) {
      const label = m.ui.tools[t.tool];
      const b = el("button", { type: "button", title: `${label} (${t.key})` }, label, el("kbd", {}, t.key));
      b.addEventListener("click", () => store.setTool(t.tool));
      this.toolButtons.set(t.tool, b);
      tools.append(b);
    }
    root.append(el("section", {}, tools));

    // History.
    this.undoBtn = el("button", { type: "button", title: m.ui.undoTitle }, m.ui.undo);
    this.redoBtn = el("button", { type: "button", title: m.ui.redoTitle }, m.ui.redo);
    this.undoBtn.addEventListener("click", () => store.undo());
    this.redoBtn.addEventListener("click", () => store.redo());
    const clear = el("button", { type: "button", title: m.ui.clearPlotTitle }, m.ui.clearPlot);
    clear.addEventListener("click", () => store.load(new HouseClass()));
    const captureBtn = el("button", { type: "button", title: m.ui.captureTitle }, m.ui.capture);
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
      const layout = analyzeLayout(h, store.level);
      return layout.ok ? h.walls.filter((w) => layout.value.exterior.has(w.id)) : h.walls;
    };
    this.fields.push(
      slider(
        m.ui.wallHeight,
        { min: MIN_WALL_HEIGHT, max: MAX_WALL_HEIGHT, step: 0.1, unit: " m", digits: 1 },
        // Each storey has its own wall height.
        () => house().wallsOn(store.level).find((w) => !w.boundary)?.height ?? null,
        (v) => store.edit((h) => h.wallsOn(store.level).forEach((w) => (w.height = v)), `wall-height:${store.level}`),
      ),
      selectField(
        m.ui.facade,
        opts(WALL_MATERIALS, m.wallMaterial),
        () => exteriorWalls(house())[0]?.material ?? null,
        (v) => store.edit((h) => h.walls.forEach((w) => (w.material = v))),
      ),
      selectField(
        m.ui.roof,
        [{ value: "none", label: m.ui.noRoof }, ...opts(ROOF_STYLES, m.roofStyle)],
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
      slider(m.ui.pitch, { min: PITCH_RANGE[0], max: PITCH_RANGE[1], step: 1, unit: "°", digits: 0 }, () => (pitched() ? roof()!.pitchDeg : null), (v) => editRoof((r) => (r.pitchDeg = v), "pitch")),
      slider(m.ui.overhang, { min: 0, max: MAX_OVERHANG, step: 0.1, unit: " m", digits: 1 }, () => (pitched() ? roof()!.overhang : null), (v) => editRoof((r) => (r.overhang = v), "overhang")),
      selectField(m.ui.covering, opts(ROOF_MATERIALS, m.roofMaterial), () => roof()?.material ?? null, (v) => editRoof((r) => (r.material = v), "roof-material")),
    );
    root.append(el("section", { className: "house" }, el("h2", {}, m.ui.house), ...this.fields.map((f) => f.el)));

    // Costs and issues.
    this.status = el("section", { className: "status" });
    this.status.addEventListener("click", (e) => this.selectIssue(e));
    this.status.addEventListener("keydown", (e) => e.key === "Enter" && this.selectIssue(e));
    root.append(el("h2", { className: "status-title" }, m.ui.cost), this.status);

    store.subscribe((change) => this.update(change !== "ui"));
    this.update(true);
  }

  private selectIssue(e: Event): void {
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-kind], li[data-level]");
    if (!li) return;
    const d = li.dataset;
    if (d.level !== undefined) this.store.setLevel(Number(d.level));
    if (d.kind === "room") this.store.select({ kind: "room", at: new Vec2(Number(d.x), Number(d.y)) });
    else if (d.kind) this.store.select({ kind: d.kind as "wall" | "opening" | "stair", id: Number(d.id) });
    this.store.setTool("select");
  }


  private update(houseChanged: boolean): void {
    const { store } = this;
    const { career, client } = store;
    this.career.textContent = m.ui.career(money(career.earnings), career.completed.length);
    this.clientBox.innerHTML = "";
    this.clientBox.append(
      el("h2", {}, m.ui.client),
      el("div", { className: "client-name" }, client.text[lang].name),
      el("div", { className: "sub" }, m.ui.clientPlot(client.plot.name[lang], plotSize(client), money(client.budget))),
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
    const analysis = analyzeRooms(store.house, store.level);
    const rooms = analysis.ok ? analysis.value.rooms : [];
    const opening = sel?.kind === "opening" ? store.house.opening(sel.id) : undefined;
    const room = sel?.kind === "room" ? roomAt(rooms, sel.at) : undefined;
    const exterior = sel?.kind === "wall" && analysis.ok && analysis.value.layout.exterior.has(sel.id);
    const key = !sel
      ? ""
      : sel.kind === "room"
        ? `room:${room ? `${room.type}:${room.polygon.map((p) => `${p.x},${p.y}`).join(";")}` : "none"}`
        : `${sel.kind}:${sel.id}:${opening?.kind ?? ""}:${exterior}:${sel.kind === "wall" && store.house.wall(sel.id)?.boundary}`;
    if (key === this.selectionKey) return;
    this.selectionKey = key;

    const box = this.selectionBox;
    box.replaceChildren();
    this.selectionFields = [];
    if (!sel || (sel.kind === "room" && !room)) {
      box.append(el("p", { className: "sub" }, m.ui.selectHint));
      return;
    }

    const del = el("button", { type: "button", className: "danger", title: m.ui.deleteTitle }, m.ui.delete);
    del.addEventListener("click", () => store.deleteSelection());

    if (sel.kind === "room" && room) {
      const at = sel.at;
      const current = () => {
        const a = analyzeRooms(store.house, store.level);
        return a.ok ? roomAt(a.value.rooms, at) : undefined;
      };
      const types: { value: RoomType | ""; label: string }[] = [{ value: "", label: m.ui.notSet }, ...ROOM_TYPES.map((t) => ({ value: t, label: m.rooms[t].name }))];
      this.selectionFields.push(
        selectField<RoomType | "">(m.ui.usedAs, types, () => current()?.type ?? "", (v) => store.edit((h) => void setRoomType(h, at, v === "" ? null : v, store.level))),
        selectField<FloorFinish>(
          m.ui.floor,
          opts(FLOOR_FINISHES, m.floorFinish),
          // Only labelled rooms keep a floor choice.
          () => (current()?.labels.length ? current()!.floor : null),
          (v) => store.edit((h) => void setRoomFloor(h, at, v, store.level)),
        ),
        readout(m.ui.area, () => area(m, current()?.area ?? 0)),
        readout(m.ui.openings, () => {
          const r = current();
          if (!r) return "";
          return m.ui.openingsSummary(r.doors.length, r.doors.some((d) => d.to === OUTSIDE), r.windows.length);
        }),
      );
      const info = room.type && ROOM_INFO[room.type];
      const notes = el("p", { className: "sub" }, room.type && info ? m.ui.roomNeeds(room.type, `${num(m, info.minArea)} m²`, info.needsWindow) : `${m.ui.chooseRoomUse} ${m.ui.floorNeedsUse}`);
      box.append(el("h2", {}, roomName(room, m)), ...this.selectionFields.map((f) => f.el), notes);
      return;
    }

    if (sel.kind === "wall") {
      const wall = () => store.house.wall(sel.id);
      this.selectionFields.push(readout(m.ui.length, () => meters(m, wall()?.length() ?? 0)));
      if (exterior) {
        this.selectionFields.push(selectField(m.ui.material, opts(WALL_MATERIALS, m.wallMaterial), () => wall()?.material ?? null, (v) => store.edit((h) => void (h.wall(sel.id)!.material = v))));
      }
      const add = (kind: OpeningKind) => {
        const b = el("button", { type: "button" }, m.ui.add(kind));
        b.addEventListener("click", () => {
          let id: number | null = null;
          const w = wall();
          if (w) store.edit((h) => (id = placeOpening(h, w.id, kind, w.length() / 2)));
          if (id !== null) store.select({ kind: "opening", id });
        });
        return b;
      };
      /** Switch between a built wall and an open room boundary (which cannot hold openings). */
      const toggle = (boundary: boolean) => {
        const b = el("button", { type: "button" }, boundary ? m.ui.makeBoundary : m.ui.makeWall);
        b.addEventListener("click", () =>
          store.edit((h) => {
            const w = h.wall(sel.id);
            if (!w) return;
            w.boundary = boundary;
            if (boundary) h.openingsIn(w.id).forEach((o) => h.removeOpening(o.id));
          }),
        );
        return b;
      };
      if (store.house.wall(sel.id)?.boundary) {
        box.append(el("h2", {}, m.ui.boundary), ...this.selectionFields.map((f) => f.el), el("p", { className: "sub" }, m.ui.boundaryNote), el("div", { className: "row" }, toggle(false), del));
        return;
      }
      const buttons = exterior ? [add("Window"), add("Door"), add("GarageDoor"), del] : [add("Door"), toggle(true), del];
      box.append(el("h2", {}, exterior ? m.ui.exteriorWall : m.ui.interiorWall), ...this.selectionFields.map((f) => f.el), el("div", { className: "row" }, ...buttons));
      return;
    }

    if (sel.kind === "stair") {
      const stair = store.house.stair(sel.id);
      const rotate = el("button", { type: "button" }, m.ui.rotate);
      rotate.addEventListener("click", () =>
        store.edit((h) => {
          const s = h.stair(sel.id);
          if (s) s.facing = (s.facing + 1) % 4;
        }),
      );
      const route = stair ? m.ui.stairsRoute(m.levelName(stair.level), m.levelName(stair.level + 1)) : "";
      box.append(el("h2", {}, m.ui.stairs), el("p", { className: "sub" }, route), el("div", { className: "row" }, rotate, del));
      return;
    }
    if (sel.kind !== "opening") return;
    const op = (h: House = store.house): Opening | undefined => h.opening(sel.id);
    const editOp = (fn: (o: Opening, h: House) => void, k: string) =>
      store.edit((h) => {
        const o = op(h);
        if (o) fn(o, h);
      }, `${k}:${sel.id}`);
    const kinds = opts(OPENING_KINDS, m.opening);
    this.selectionFields.push(
      selectField(m.ui.type, kinds, () => op()?.kind ?? null, (v) =>
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
      numberField(m.ui.width, { min: MIN_OPENING_SIZE, max: 6, step: 0.1 }, () => op()?.width ?? 0, (v) =>
        editOp((o, h) => {
          o.width = v;
          const w = h.wall(o.wall);
          if (w) o.offset = clampOffset(w, v, o.offset);
        }, "width"),
      ),
      numberField(m.ui.height, { min: MIN_OPENING_SIZE, max: 4, step: 0.1 }, () => op()?.height ?? 0, (v) => editOp((o) => (o.height = v), "height")),
      ...(opening?.kind === "Window" ? [numberField(m.ui.sill, { min: 0, max: 3, step: 0.1 }, () => op()?.sill ?? 0, (v) => editOp((o) => (o.sill = v), "sill"))] : []),
      numberField(m.ui.position, { min: 0, max: 100, step: 0.05 }, () => op()?.offset ?? 0, (v) => editOp((o) => (o.offset = v), "offset")),
    );
    box.append(el("h2", {}, m.opening[opening?.kind ?? "Window"]), ...this.selectionFields.map((f) => f.el), el("div", { className: "row" }, del));
  }
}
