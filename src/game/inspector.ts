/**
 * The contents of the pop-up menu for whatever is selected: a room's use, floor and
 * furniture; a wall's facade, height and openings; a window or door's size; a piece of
 * furniture; stairs; the roof.
 */

import {
  DEFAULT_OPENING,
  FLOOR_FINISHES,
  FURNITURE_KINDS,
  type FurnitureKind,
  type House,
  MAX_OVERHANG,
  MAX_WALL_HEIGHT,
  MIN_OPENING_SIZE,
  MIN_WALL_HEIGHT,
  OPENING_KINDS,
  OUTSIDE,
  type Opening,
  type OpeningKind,
  PITCH_RANGE,
  ROOF_MATERIALS,
  ROOF_STYLES,
  ROOM_INFO,
  ROOM_TYPES,
  type Roof,
  type RoomType,
  SUGGESTED_FURNITURE,
  WALL_MATERIALS,
  type WallMaterial,
  addFurnitureAt,
  analyzeLayout,
  analyzeRooms,
  area,
  clampOffset,
  clearRoomFurnitureAt,
  furnitureIn,
  meters,
  num,
  placeOpening,
  refurnishRoomAt,
  rotateFurniture,
  roomAt,
  roomName,
  setRoomFloor,
  setRoomPaint,
  GARDEN_PLANTS,
  addGardenPlant,
  BALCONY_LIMITS,
  type Balcony,
  type Dormer,
  type Wall,
  clampBalcony,
  placeBalcony,
  placeTerrace,
  placeDormer,
  placeDormerAnywhere,
  DORMER_WIDTH,
  dormerShape,
  rotateHouse,
  PLATFORM_RANGE,
  clearDoubleHeight,
  makeDoubleHeight,
  openingAbove,
  setRoomType,
  PAINT_COLORS,
  INDOOR_PLANTS,
  type Unlock,
  buildableFloor,
} from "../core";
import { m } from "./i18n";
import type { Selection, Store } from "./store";
import { PAINT_HEX, floorTexture, roofTexture, swatchUrl, wallTexture } from "./textures";
import { type Field, button, choices, el, numberField, readout, setLocked, slider } from "./ui";

const DEFAULT_ROOF: Roof = { style: "Gable", pitchDeg: 30, overhang: 0.4, material: "Shingles" };

export interface Inspector {
  el: HTMLElement;
  fields: Field[];
}

/**
 * A button for something that may need a technique first: clicking it while locked opens
 * the Workshop instead. The returned field keeps the padlock up to date.
 */
function lockable(store: Store, label: string, u: Unlock, onClick: () => void, props: Record<string, unknown> = {}): { button: HTMLButtonElement; field: Field } {
  const b = button(label, () => {
    const lock = store.lockOf(u);
    if (lock) store.onLocked(lock);
    else onClick();
  }, props);
  const title = (props.title as string | undefined) ?? "";
  const field = { el: b, update: () => setLocked(b, store.lockOf(u), title) };
  field.update();
  return { button: b, field };
}

/** Identifies what the menu is showing, so it is rebuilt only when that changes. */
export function inspectorKey(store: Store): string {
  const sel = store.selection;
  if (!sel) return "";
  const { house, level } = store;
  if (sel.kind === "room") {
    const a = analyzeRooms(house, level);
    const room = a.ok ? roomAt(a.value.rooms, sel.at) : undefined;
    if (!room) return "room:none";
    const furniture = furnitureIn(house, room).map((f) => f.id).join(",");
    return `room:${level}:${room.type}:${room.labels.length}:${furniture}:${room.polygon.map((p) => `${p.x},${p.y}`).join(";")}:${house.levels}`;
  }
  if (sel.kind === "wall") {
    const w = house.wall(sel.id);
    const layout = w ? analyzeLayout(house, w.level) : null;
    return `wall:${sel.id}:${w?.boundary}:${layout?.ok && layout.value.exterior.has(sel.id)}`;
  }
  if (sel.kind === "opening") return `opening:${sel.id}:${house.opening(sel.id)?.kind}`;
  if (sel.kind === "roof") return `roof:${house.roof?.style ?? "none"}`;
  if (sel.kind === "facade") return "facade";
  if (sel.kind === "garden") return "garden";
  if (sel.kind === "house") return "house";
  return `${sel.kind}:${sel.id}`;
}

const section = (title: string, ...children: (Node | string)[]) => el("div", { className: "menu-section" }, el("div", { className: "menu-title" }, title), ...children);

export function buildInspector(store: Store, sel: NonNullable<Selection>): Inspector | null {
  switch (sel.kind) {
    case "garden":
      return gardenInspector(store);
    case "house":
      return houseInspector(store);
    case "balcony":
      return balconyInspector(store, sel.id);
    case "dormer":
      return dormerInspector(store, sel.id);
    case "room":
      return roomInspector(store, sel.at);
    case "wall":
      return wallInspector(store, sel.id);
    case "opening":
      return openingInspector(store, sel.id);
    case "stair":
      return stairInspector(store, sel.id);
    case "furniture":
      return furnitureInspector(store, sel.id);
    case "roof":
      return roofInspector(store);
    case "facade":
      return facadeInspector(store);
    case "label":
      return labelInspector(store, sel.id);
  }
}

function deleteButton(store: Store): HTMLButtonElement {
  return button(m.ui.delete, () => store.deleteSelection(), { className: "danger", title: m.ui.deleteTitle });
}

const wallSwatches = (store: Store) =>
  WALL_MATERIALS.map((w) => ({ value: w, label: m.wallMaterial[w], image: swatchUrl(wallTexture(w)), lock: () => store.lockOf({ kind: "wall", material: w }) }));

// --- Rooms ------------------------------------------------------------------------

function roomInspector(store: Store, at: import("../core").Vec2): Inspector | null {
  const level = store.level;
  const current = () => {
    const a = analyzeRooms(store.house, level);
    return a.ok ? roomAt(a.value.rooms, at) : undefined;
  };
  const room = current();
  if (!room) return null;

  // "Open to below" only on upper floors, once double height has been learned.
  const types = [
    { value: "none" as const, label: m.ui.notSet, color: "#f7f3ea" },
    ...ROOM_TYPES.filter((t) => t !== "Void" || level > 0).map((t) => ({
      value: t,
      label: m.rooms[t].name,
      color: ROOM_INFO[t].color,
      lock: t === "Void" ? () => store.lockOf({ kind: "doubleHeight" }) : undefined,
    })),
  ];
  const use = choices<RoomType | "none">(
    m.ui.usedAs,
    types,
    () => current()?.type ?? "none",
    (v) =>
      store.edit((h) => {
        const type = v === "none" ? null : v;
        if (current()?.type === type) return;
        setRoomType(h, at, type, level);
        // Its usual floor, or one that can be built with what has been learned.
        if (type && !store.abilities.floors.has(ROOM_INFO[type].floor)) setRoomFloor(h, at, buildableFloor(ROOM_INFO[type].floor, ROOM_INFO[type].floors, store.abilities), level);
        // A room put to a new use gets that use's furniture; one without a use is emptied.
        if (type) refurnishRoomAt(h, at, level);
        else clearRoomFurnitureAt(h, at, level);
      }),
    "rooms",
    store.onLocked,
  );
  const floor = choices(
    m.ui.floor,
    FLOOR_FINISHES.map((f) => ({ value: f, label: m.floorFinish[f], image: swatchUrl(floorTexture(f)), lock: () => store.lockOf({ kind: "floor", finish: f }) })),
    () => (current()?.labels.length ? current()!.floor : null),
    (v) => store.edit((h) => void setRoomFloor(h, at, v, level)),
    "swatches",
    store.onLocked,
  );
  const paint = choices(
    m.ui.wallColour,
    PAINT_COLORS.map((c) => ({ value: c, label: m.paintColor[c], color: PAINT_HEX[c], lock: c === "White" ? undefined : () => store.lockOf({ kind: "paint" }) })),
    () => (current()?.labels.length ? current()!.paint : null),
    (v) => store.edit((h) => void setRoomPaint(h, at, v, level)),
    "paints",
    store.onLocked,
  );
  // Double height: open the floor above this room (or close it again).
  const tall = () => !!openingAbove(store.house, at, level);
  const { button: tallBtn, field: tallField } = lockable(store, "", { kind: "doubleHeight" }, () =>
    store.edit((h) => void (tall() ? clearDoubleHeight(h, at, level) : makeDoubleHeight(h, at, level))),
  );
  const tallLabel = { el: tallBtn, update: () => {
    tallField.update();
    tallBtn.textContent = tall() ? m.ui.closeDoubleHeight : `⬍ ${m.ui.doubleHeight}`;
    tallBtn.title = tall() ? m.ui.closeDoubleHeightTitle : tallBtn.classList.contains("locked") ? tallBtn.title : m.ui.doubleHeightTitle;
  } };
  const canBeTall = room.type !== "Void" && level + 1 < store.house.levels;
  const facts = readout(m.ui.area, () => {
    const r = current();
    return r ? `${area(m, r.area)} · ${m.ui.openingsSummary(r.doors.length, r.doors.some((d) => d.to === OUTSIDE), r.windows.length)}` : "";
  });

  // Furniture: what is in the room, with a way to remove each piece or add more.
  const list = el("ul", { className: "furniture-list" });
  for (const f of furnitureIn(store.house, room)) {
    const remove = button("×", () => store.edit((h) => h.removeFurniture(f.id!)), { className: "icon", title: m.ui.remove, ariaLabel: `${m.ui.remove} ${m.furnitureName[f.kind]}` });
    const name = button(m.furnitureName[f.kind], () => store.select({ kind: "furniture", id: f.id! }), { className: "link" });
    list.append(el("li", {}, name, remove));
  }
  if (!list.children.length) list.append(el("li", { className: "sub" }, m.ui.noFurniture));
  const suggested = room.type ? SUGGESTED_FURNITURE[room.type] : [];
  const others = FURNITURE_KINDS.filter((k) => !suggested.includes(k));
  const plantLock = () => store.lockOf({ kind: "houseplants" });
  const lockFor = (k: FurnitureKind) => () => (INDOOR_PLANTS.includes(k) ? plantLock() : k === "Fireplace" ? store.lockOf({ kind: "fireplace" }) : null);
  const add = el(
    "select",
    { className: "add-furniture" },
    el("option", { value: "" }, m.ui.addFurniture),
    ...[...suggested, ...others].map((k, i) =>
      el("option", { value: k, className: i < suggested.length ? "suggested" : "" }, `${lockFor(k)() ? "🔒 " : ""}${m.furnitureName[k]}`),
    ),
  );
  add.addEventListener("change", () => {
    const kind = add.value as FurnitureKind;
    if (!kind) return;
    const lock = lockFor(kind)();
    if (lock) {
      add.value = "";
      return store.onLocked(lock);
    }
    let id = 0;
    store.edit((h) => (id = addFurnitureAt(h, kind, current()?.anchor ?? at, level)));
    store.select({ kind: "furniture", id });
  });
  const actions = el("div", { className: "row" }, add);
  if (room.type) actions.append(button(m.ui.refurnish, () => store.edit((h) => refurnishRoomAt(h, at, level))));
  if (furnitureIn(store.house, room).length) actions.append(button(m.ui.clearFurniture, () => store.edit((h) => clearRoomFurnitureAt(h, at, level))));

  const info = room.type && ROOM_INFO[room.type];
  const note = el("p", { className: "sub" }, room.type === "Void" ? m.ui.voidNote : room.type && info ? m.ui.roomNeeds(room.type, `${num(m, info.minArea)} m²`, info.needsWindow) : m.ui.chooseRoomUse);
  return {
    el: el(
      "div",
      {},
      el("h2", {}, roomName(room, m)),
      use.el,
      note,
      ...(room.type === "Void" ? [] : [floor.el, paint.el]),
      facts.el,
      ...(canBeTall ? [el("div", { className: "row" }, tallBtn)] : []),
      ...(room.type === "Void" ? [] : [section(m.ui.furniture, list, actions)]),
      el("div", { className: "row" }, deleteButton(store)),
    ),
    fields: [use, floor, paint, facts, ...(canBeTall ? [tallLabel] : [])],
  };
}

// --- Walls -------------------------------------------------------------------------

/** Where facade changes from a wall's menu go: this wall, or every outer wall. */
let facadeScope: "wall" | "all" = "all";

function wallInspector(store: Store, id: number): Inspector | null {
  const wall = () => store.house.wall(id);
  const w = wall();
  if (!w) return null;
  const layout = analyzeLayout(store.house, w.level);
  const exterior = layout.ok && layout.value.exterior.has(id);
  const fields: Field[] = [readout(m.ui.length, () => meters(m, wall()?.length() ?? 0))];
  const parts: (Node | string)[] = [];

  if (w.boundary) {
    const makeWall = button(m.ui.makeWall, () => store.edit((h) => void (h.wall(id)!.boundary = false)));
    return { el: el("div", {}, el("h2", {}, m.ui.boundary), fields[0].el, el("p", { className: "sub" }, m.ui.boundaryNote), el("div", { className: "row" }, makeWall, deleteButton(store))), fields };
  }

  if (exterior) {
    const scope = choices<"wall" | "all">(
      m.ui.facade,
      [
        { value: "all", label: m.ui.allOuterWalls },
        { value: "wall", label: m.ui.thisWall },
      ],
      () => facadeScope,
      (v) => {
        facadeScope = v;
        scope.update();
      },
      "segmented",
    );
    const facade = choices(
      "",
      wallSwatches(store),
      () => wall()?.material ?? null,
      (v) => store.edit((h) => setFacade(h, v, facadeScope === "all" ? null : id)),
      "swatches",
      store.onLocked,
    );
    fields.push(scope, facade);
    parts.push(scope.el, facade.el);
  }

  const height = slider(
    m.ui.wallHeight,
    { min: MIN_WALL_HEIGHT, max: MAX_WALL_HEIGHT, step: 0.1, unit: " m", digits: 1 },
    () => wall()?.height ?? null,
    // Walls of a storey share a height, so the roof and floors above line up.
    (v) => store.edit((h) => h.wallsOn(w.level).forEach((x) => (x.height = v)), `wall-height:${w.level}`),
  );
  fields.push(height);

  const addOpening = (kind: OpeningKind) => () => {
    let opening: number | null = null;
    const cur = wall();
    if (cur) store.edit((h) => (opening = placeOpening(h, cur.id, kind, cur.length() / 2)));
    if (opening !== null) store.select({ kind: "opening", id: opening });
  };
  const add = (kind: OpeningKind) => {
    const needs = OPENING_LOCK[kind];
    if (!needs) return button(m.ui.add(kind), addOpening(kind));
    const { button: b, field } = lockable(store, m.ui.add(kind), needs, addOpening(kind));
    fields.push(field);
    return b;
  };
  const { button: makeOpen, field: makeOpenField } = lockable(store, m.ui.makeBoundary, { kind: "openPlan" }, () =>
    store.edit((h) => {
      const cur = h.wall(id);
      if (!cur) return;
      cur.boundary = true;
      h.openingsIn(cur.id).forEach((o) => h.removeOpening(o.id));
    }),
  );
  if (!exterior) fields.push(makeOpenField);
  const buttons = exterior ? [add("Window"), add("Door"), add("GlassDoor"), add("GarageDoor")] : [add("Door"), add("Passage"), makeOpen];
  // Balconies hang off the outer walls of upper storeys; on the ground floor, a terrace.
  if (exterior && w.level >= 0) {
    const ground = w.level === 0;
    const { button: b, field } = lockable(store, ground ? m.ui.addTerrace : m.ui.addBalcony, { kind: ground ? "terraces" : "balconies" }, () => {
      let balcony: number | null = null;
      store.edit((h) => (balcony = ground ? placeTerrace(h, id) : placeBalcony(h, id)));
      if (balcony !== null) store.select({ kind: "balcony", id: balcony });
    });
    fields.push(field);
    buttons.push(b);
  }
  // A dormer in the roof slope over an outer wall of the top storey (it needs a pitched roof).
  if (exterior && w.level === store.house.topLevel()) {
    const { button: b, field } = lockable(store, m.ui.addDormer, { kind: "dormers" }, () => {
      let dormer: number | null = null;
      store.edit((h) => (dormer = placeDormer(h, id)));
      if (dormer !== null) store.select({ kind: "dormer", id: dormer });
    });
    const pitched = () => !!store.house.roof && store.house.roof.style !== "Flat";
    fields.push({
      el: b,
      update: () => {
        field.update();
        b.disabled = !pitched();
        if (!pitched()) b.title = m.ui.dormerNeedsRoof;
      },
    });
    buttons.push(b);
  }
  return {
    el: el("div", {}, el("h2", {}, exterior ? m.ui.exteriorWall : m.ui.interiorWall), fields[0].el, ...parts, height.el, el("div", { className: "row" }, ...buttons, deleteButton(store))),
    fields,
  };
}

/** Set the facade of one wall, or of every outer wall of the house when `only` is null. */
function setFacade(h: House, material: WallMaterial, only: number | null): void {
  if (only !== null) {
    const w = h.wall(only);
    if (w) w.material = material;
    return;
  }
  for (let level = 0; level < h.levels; level++) {
    const layout = analyzeLayout(h, level);
    for (const w of h.wallsOn(level)) if (!layout.ok || layout.value.exterior.has(w.id)) w.material = material;
  }
}

function facadeInspector(store: Store): Inspector {
  const firstOuter = () => {
    const layout = analyzeLayout(store.house, 0);
    return store.house.wallsOn(0).find((w) => !w.boundary && (!layout.ok || layout.value.exterior.has(w.id)));
  };
  const facade = choices(m.ui.allOuterWalls, wallSwatches(store), () => firstOuter()?.material ?? null, (v) => store.edit((h) => setFacade(h, v, null)), "swatches", store.onLocked);
  return { el: el("div", {}, el("h2", {}, m.ui.facade), facade.el), fields: [facade] };
}

// --- Windows and doors -------------------------------------------------------------

function openingInspector(store: Store, id: number): Inspector | null {
  const op = (h: House = store.house): Opening | undefined => h.opening(id);
  const o = op();
  if (!o) return null;
  const editOp = (fn: (o: Opening, h: House) => void, k: string) =>
    store.edit((h) => {
      const cur = op(h);
      if (cur) fn(cur, h);
    }, `${k}:${id}`);
  const ownWall = store.house.wall(o.wall);
  const ownLayout = ownWall ? analyzeLayout(store.house, ownWall.level) : null;
  const outer = !ownLayout?.ok || ownLayout.value.exterior.has(o.wall);
  const fields: Field[] = [
    choices(
      m.ui.type,
      OPENING_KINDS.filter((k) => (outer ? k !== "Passage" : k !== "Window" && k !== "GarageDoor" && k !== "GlassDoor") || k === o.kind).map((k) => ({
        value: k,
        label: m.opening[k],
        lock: OPENING_LOCK[k] ? () => store.lockOf(OPENING_LOCK[k]!) : undefined,
      })),
      () => op()?.kind ?? null,
      (v) =>
        editOp((cur, h) => {
          const d = DEFAULT_OPENING[v];
          Object.assign(cur, { kind: v, sill: d.sill, height: d.height, width: d.width });
          const w = h.wall(cur.wall);
          if (w) cur.offset = clampOffset(w, cur.width, cur.offset);
        }, "kind"),
      "segmented",
      store.onLocked,
    ),
    numberField(m.ui.width, { min: MIN_OPENING_SIZE, max: 6, step: 0.1 }, () => op()?.width ?? 0, (v) =>
      editOp((cur, h) => {
        cur.width = v;
        const w = h.wall(cur.wall);
        if (w) cur.offset = clampOffset(w, v, cur.offset);
      }, "width"),
    ),
    numberField(m.ui.height, { min: MIN_OPENING_SIZE, max: 4, step: 0.1 }, () => op()?.height ?? 0, (v) => editOp((cur) => (cur.height = v), "height")),
    ...(o.kind === "Window" ? [numberField(m.ui.sill, { min: 0, max: 3, step: 0.1 }, () => op()?.sill ?? 0, (v) => editOp((cur) => (cur.sill = v), "sill"))] : []),
    numberField(m.ui.position, { min: 0, max: 100, step: 0.05 }, () => op()?.offset ?? 0, (v) => editOp((cur) => (cur.offset = v), "offset")),
  ];
  return { el: el("div", {}, el("h2", {}, m.opening[o.kind]), ...fields.map((f) => f.el), el("div", { className: "row" }, deleteButton(store))), fields };
}

// --- Stairs and furniture ----------------------------------------------------------

function stairInspector(store: Store, id: number): Inspector | null {
  const stair = store.house.stair(id);
  if (!stair) return null;
  const rotate = button(`⟳ ${m.ui.rotate}`, () =>
    store.edit((h) => {
      const s = h.stair(id);
      if (s) s.facing = (s.facing + 1) % 4;
    }),
  );
  const route = m.ui.stairsRoute(m.levelName(stair.level), m.levelName(stair.level + 1));
  return { el: el("div", {}, el("h2", {}, m.ui.stairs), el("p", { className: "sub" }, route), el("div", { className: "row" }, rotate, deleteButton(store))), fields: [] };
}

function furnitureInspector(store: Store, id: number): Inspector | null {
  const piece = () => store.house.furniturePiece(id);
  const f = piece();
  if (!f) return null;
  const rotate = button(`⟳ ${m.ui.rotate}`, () =>
    store.edit((h) => {
      const cur = h.furniturePiece(id);
      if (cur) rotateFurniture(cur);
    }),
  );
  const size = (label: string, key: "width" | "depth") =>
    numberField(label, { min: 0.2, max: 6, step: 0.05 }, () => piece()?.[key] ?? 0, (v) =>
      store.edit((h) => {
        const cur = h.furniturePiece(id);
        if (cur) cur[key] = v;
      }, `furniture-${key}:${id}`),
    );
  const fields = [size(m.ui.width, "width"), size(m.ui.depth, "depth")];
  return { el: el("div", {}, el("h2", {}, m.furnitureName[f.kind]), ...fields.map((x) => x.el), el("div", { className: "row" }, rotate, deleteButton(store))), fields };
}

// --- Labels left outside every room ------------------------------------------------

function labelInspector(store: Store, id: number): Inspector | null {
  const label = store.house.label(id);
  if (!label) return null;
  const issue = { kind: "LabelOutsideRooms" as const, label: id, at: label.at, type: label.type, level: label.level };
  return { el: el("div", {}, el("h2", {}, m.rooms[label.type].name), el("p", { className: "sub" }, m.issue(issue)), el("div", { className: "row" }, deleteButton(store))), fields: [] };
}

// --- Roof --------------------------------------------------------------------------

function roofInspector(store: Store): Inspector {
  const roof = () => store.house.roof;
  const editRoof = (fn: (r: Roof) => void, key: string) => store.edit((h) => h.roof && fn(h.roof), key);
  const pitched = () => roof() !== null && roof()!.style !== "Flat";
  const fields: Field[] = [
    choices(
      m.ui.roof,
      [{ value: "none" as const, label: m.ui.noRoof }, ...ROOF_STYLES.map((s) => ({ value: s, label: m.roofStyle[s], lock: () => store.lockOf({ kind: "roofStyle", style: s }) }))],
      () => roof()?.style ?? "none",
      (v) =>
        store.edit((h) => {
          if (v === "none") h.roof = null;
          else {
            h.roof = { ...(h.roof ?? DEFAULT_ROOF), style: v };
            if (v !== "Flat" && h.roof.pitchDeg < PITCH_RANGE[0]) h.roof.pitchDeg = DEFAULT_ROOF.pitchDeg;
          }
        }),
      "segmented",
      store.onLocked,
    ),
    slider(m.ui.pitch, { min: PITCH_RANGE[0], max: PITCH_RANGE[1], step: 1, unit: "°", digits: 0 }, () => (pitched() ? roof()!.pitchDeg : null), (v) => editRoof((r) => (r.pitchDeg = v), "pitch")),
    slider(m.ui.overhang, { min: 0, max: MAX_OVERHANG, step: 0.1, unit: " m", digits: 1 }, () => (pitched() ? roof()!.overhang : null), (v) => editRoof((r) => (r.overhang = v), "overhang")),
    choices(
      m.ui.covering,
      ROOF_MATERIALS.map((r) => ({ value: r, label: m.roofMaterial[r], image: swatchUrl(roofTexture(r)), lock: () => store.lockOf({ kind: "roofMaterial", material: r }) })),
      () => roof()?.material ?? null,
      (v) => editRoof((r) => (r.material = v), "roof-material"),
      "swatches",
      store.onLocked,
    ),
  ];
  // Dormers: on the best wall for one (road side first), or from an outer wall's menu.
  const { button: dormerBtn, field: dormerField } = lockable(store, m.ui.addDormer, { kind: "dormers" }, () => {
    let dormer: number | null = null;
    store.edit((h) => (dormer = placeDormerAnywhere(h, store.plot.access.side)));
    if (dormer !== null) store.select({ kind: "dormer", id: dormer });
  });
  fields.push({
    el: dormerBtn,
    update: () => {
      dormerField.update();
      dormerBtn.disabled = !pitched();
    },
  });
  return {
    el: el("div", {}, el("h2", {}, m.ui.roof), ...fields.slice(0, -1).map((f) => f.el), el("div", { className: "row" }, dormerBtn), el("p", { className: "sub" }, m.ui.dormerHint)),
    fields,
  };
}

/** The techniques some openings need. */
const OPENING_LOCK: Partial<Record<OpeningKind, Unlock>> = { GarageDoor: { kind: "garageDoors" }, GlassDoor: { kind: "glassDoors" }, Passage: { kind: "openPlan" } };

// --- Garden --------------------------------------------------------------------------

function gardenInspector(store: Store): Inspector {
  const fields: Field[] = [];
  const buttons = GARDEN_PLANTS.map((kind) => {
    const { button: b, field } = lockable(store, m.ui.addPlant(m.furnitureName[kind]), { kind: "garden" }, () => {
      let id: number | null = null;
      store.edit((h) => (id = addGardenPlant(h, store.plot, kind)));
      if (id !== null) store.select({ kind: "furniture", id });
    });
    fields.push(field);
    return b;
  });
  return {
    el: el("div", {}, el("h2", {}, m.ui.garden), el("p", { className: "sub" }, m.ui.gardenTitle), el("div", { className: "row" }, ...buttons), el("p", { className: "sub" }, m.ui.gardenNote)),
    fields,
  };
}

// --- Balconies -----------------------------------------------------------------------

function balconyInspector(store: Store, id: number): Inspector | null {
  const balcony = (h: House = store.house) => h.balcony(id);
  if (!balcony()) return null;
  const terrace = store.house.wall(balcony()!.wall)?.level === 0;
  const editBalcony = (fn: (b: Balcony, wall: Wall) => void, key: string) =>
    store.edit((h) => {
      const b = balcony(h);
      const wall = b && h.wall(b.wall);
      if (b && wall) {
        fn(b, wall);
        b.offset = clampBalcony(wall, b);
      }
    }, `${key}:${id}`);
  const wallLength = () => {
    const b = balcony();
    return (b && store.house.wall(b.wall)?.length()) ?? 1;
  };
  const fields: Field[] = [
    slider(m.ui.width, { min: BALCONY_LIMITS.width[0], max: BALCONY_LIMITS.width[1], step: 0.1, unit: " m", digits: 1 }, () => balcony()?.width ?? null, (v) =>
      editBalcony((b, wall) => (b.width = Math.min(v, wall.length())), "balcony-width"),
    ),
    slider(m.ui.depth, { min: BALCONY_LIMITS.depth[0], max: BALCONY_LIMITS.depth[1], step: 0.1, unit: " m", digits: 1 }, () => balcony()?.depth ?? null, (v) =>
      editBalcony((b) => (b.depth = v), "balcony-depth"),
    ),
    slider(m.ui.position, { min: 0, max: 100, step: 1, unit: " %", digits: 0 }, () => {
      const b = balcony();
      return b ? Math.round((b.offset / wallLength()) * 100) : null;
    }, (v) => editBalcony((b, wall) => (b.offset = (v / 100) * wall.length()), "balcony-offset")),
  ];
  return {
    el: el(
      "div",
      {},
      el("h2", {}, terrace ? m.ui.terrace : m.ui.balcony),
      ...fields.map((f) => f.el),
      el("p", { className: "sub" }, terrace ? m.ui.terraceNote : m.ui.balconyNote),
      el("div", { className: "row" }, deleteButton(store)),
    ),
    fields,
  };
}

// --- The whole house -----------------------------------------------------------------

function houseInspector(store: Store): Inspector {
  // Turning on screen: the plan shows +x to the left, so a turn that looks clockwise there
  // is anticlockwise in plan coordinates.
  const turn = (degrees: number) => () => store.edit((h) => rotateHouse(h, degrees));
  const turns = [
    button(m.ui.turnLeft, turn(-90)),
    button(m.ui.turnRight, turn(90)),
    button("⟲ 15°", turn(-15), { title: m.ui.turnLittle }),
    button("⟳ 15°", turn(15), { title: m.ui.turnLittle }),
  ];
  const move = button(`✋ ${m.ui.tools.move} (M)`, () => store.setTool("move"));
  const empty = () => store.house.walls.length === 0;
  const buttons: Field = { el: el("div"), update: () => [...turns, move].forEach((b) => (b.disabled = empty())) };
  const fields: Field[] = [buttons];
  const parts: Node[] = [el("h2", {}, m.ui.wholeHouse), el("div", { className: "row" }, ...turns), el("div", { className: "row" }, move), el("p", { className: "sub" }, m.ui.moveHint)];
  // On sloping ground: how high the platform stands, from digging more to filling more.
  if (store.plot.terrain) {
    const platform = slider(
      m.ui.platformHeight,
      { min: -PLATFORM_RANGE, max: PLATFORM_RANGE, step: 0.05, unit: " m", digits: 2 },
      () => (empty() ? null : store.house.platformOffset),
      (v) => store.edit((h) => void (h.platformOffset = Math.round(v * 20) / 20 + 0), "platform"),
    );
    fields.push(platform);
    parts.push(platform.el, el("p", { className: "sub" }, m.ui.platformHint));
  }
  return { el: el("div", {}, ...parts), fields };
}

// --- Dormers -------------------------------------------------------------------------

function dormerInspector(store: Store, id: number): Inspector | null {
  const dormer = (h: House = store.house) => h.dormer(id);
  if (!dormer()) return null;
  const editDormer = (fn: (d: Dormer, wall: Wall) => void, key: string) =>
    store.edit((h) => {
      const d = dormer(h);
      const wall = d && h.wall(d.wall);
      if (d && wall) {
        fn(d, wall);
        d.offset = clampBalcony(wall, d);
      }
    }, `${key}:${id}`);
  const wallLength = () => {
    const d = dormer();
    return (d && store.house.wall(d.wall)?.length()) ?? 1;
  };
  const fields: Field[] = [
    slider(m.ui.width, { min: DORMER_WIDTH[0], max: DORMER_WIDTH[1], step: 0.1, unit: " m", digits: 1 }, () => dormer()?.width ?? null, (v) =>
      editDormer((d, wall) => (d.width = Math.min(v, wall.length() - 0.4)), "dormer-width"),
    ),
    slider(m.ui.position, { min: 0, max: 100, step: 1, unit: " %", digits: 0 }, () => {
      const d = dormer();
      return d ? Math.round((d.offset / wallLength()) * 100) : null;
    }, (v) => editDormer((d, wall) => (d.offset = (v / 100) * wall.length()), "dormer-offset")),
  ];
  const ok = !!dormerShape(store.house, dormer()!);
  return {
    el: el("div", {}, el("h2", {}, m.ui.dormer), ...fields.map((f) => f.el), el("p", { className: ok ? "sub" : "sub bad" }, ok ? m.ui.dormerNote : m.issue({ kind: "DormerNotOnSlope", dormer: id })), el("div", { className: "row" }, deleteButton(store))),
    fields,
  };
}
