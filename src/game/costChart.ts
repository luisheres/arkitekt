/**
 * A live treemap of where the money goes: one box per group (facade, roof, floors, ...),
 * split into a box per material, finish or kind of opening, each sized by its cost. It
 * sits in a panel over the views that can be moved and resized, and follows every edit;
 * boxes whose cost just changed flash.
 */

import { COST_GROUPS, type CostGroup, type CostLine, type Rect, area, costLines, squarify } from "../core";
import { esc, money } from "./hud";
import { m } from "./i18n";
import type { Store } from "./store";

export const GROUP_COLORS: Record<CostGroup, string> = {
  facade: "#f08a4b",
  roof: "#e2574c",
  floors: "#5fb85a",
  openings: "#4fb0e6",
  interiorWalls: "#e7b94a",
  stairs: "#a77de0",
};

const HEADER = 22;
const GAP = 3;

/** What a line pays for, in words; `short` leaves out what the group already says. */
export function lineName(l: CostLine, short = false): string {
  const w = l.what;
  switch (w.kind) {
    case "facade":
      return m.wallMaterial[w.material];
    case "interiorWalls":
      return m.ui.costChart.groups.interiorWalls;
    case "opening":
      return `${m.ui.costChart.count(l.quantity)} ${m.opening[w.opening]}`;
    case "roofCovering":
      return m.roofMaterial[w.material];
    case "terrace":
      return m.ui.costChart.terrace;
    case "foundation":
      return m.ui.costRows.foundation;
    case "upperFloors":
      return m.ui.costRows.floors;
    case "finish":
      return short ? m.floorFinish[w.finish] : `${m.ui.costRows.finishes}: ${m.floorFinish[w.finish]}`;
    case "stairs":
      return `${m.ui.costChart.count(l.quantity)} ${m.ui.costRows.stairs}`;
  }
}

/** How the amount comes about: "42.5 m² × 220". */
function lineDetail(l: CostLine): string {
  return l.unit === "m2" ? `${area(m, l.quantity)} × ${money(l.amount / l.quantity)}` : "";
}

/** A lighter or darker shade of a colour: k > 0 towards white, k < 0 towards black. */
function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${c.join(",")})`;
}

/** Text that fits a box of width `w`, cut short with an ellipsis if need be. */
function fit(text: string, w: number, size: number): string {
  const max = Math.floor((w - 10) / (size * 0.56));
  if (max < 3) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export interface GroupTotal {
  group: CostGroup;
  amount: number;
  lines: CostLine[];
}

/** The groups that cost anything, largest first, with their lines largest first. */
export function groupTotals(lines: readonly CostLine[]): GroupTotal[] {
  return COST_GROUPS.map((group) => {
    const ls = lines.filter((l) => l.group === group).sort((a, b) => b.amount - a.amount);
    return { group, amount: ls.reduce((s, l) => s + l.amount, 0), lines: ls };
  })
    .filter((g) => g.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/** A key that names what a line pays for, the same from one edit to the next. */
export const lineKey = (l: CostLine): string => JSON.stringify(l.what);

/** The treemap as an SVG element's markup, `W` × `H` pixels; lines in `changed` flash. */
export function treemapSvg(groups: readonly GroupTotal[], W: number, H: number, changed: ReadonlySet<string> = new Set()): string {
  const total = groups.reduce((s, g) => s + g.amount, 0);
  const percent = (v: number) => `${Math.round((v / total) * 100)} %`;
  const out: string[] = [];
  const boxes = squarify(
    groups.map((g) => g.amount),
    { x: 0, y: 0, w: W, h: H },
  );
  groups.forEach((g, gi) => {
    const b = inset(boxes[gi], GAP / 2);
    const color = GROUP_COLORS[g.group];
    const name = m.ui.costChart.groups[g.group];
    const header = b.h > HEADER * 2.2 && b.w > 70;
    out.push(`<g class="cost-group" data-group="${g.group}"><rect class="group-box" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="${shade(color, -0.25)}"><title>${esc(`${name}: ${money(g.amount)} (${percent(g.amount)})`)}</title></rect>`);
    if (header) {
      out.push(`<text class="group-name" x="${b.x + 8}" y="${b.y + 15}">${esc(fit(`${name} · ${money(g.amount)}`, b.w, 12))}</text>`);
    }
    const inner = header ? { x: b.x + 3, y: b.y + HEADER, w: b.w - 6, h: b.h - HEADER - 3 } : inset(b, 3);
    const cells = squarify(
      g.lines.map((l) => l.amount),
      inner,
    );
    g.lines.forEach((l, li) => {
      const c = inset(cells[li], 1.5);
      if (c.w <= 0 || c.h <= 0) return;
      const label = lineName(l, true);
      const detail = lineDetail(l);
      const tip = [`${name}: ${lineName(l)}`, detail ? `${detail} = ${money(l.amount)}` : money(l.amount), percent(l.amount)].join("\n");
      out.push(`<g class="cost-line${changed.has(lineKey(l)) ? " changed" : ""}" data-key="${esc(lineKey(l))}"><rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="6" fill="${shade(color, 0.08 + (li % 4) * 0.1)}"/>`);
      out.push(lineLabels(c, label, money(l.amount), detail));
      // On top, so pointing anywhere in the box shows the details.
      out.push(`<rect class="hit" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="transparent"><title>${esc(tip)}</title></rect></g>`);
    });
    out.push("</g>");
  });
  return `<svg class="cost-treemap" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.ui.costChart.title)}">${out.join("")}</svg>`;
}

/**
 * The name, amount and detail of a box: centred and larger in big boxes, along the side
 * of tall, narrow ones, on one line in short, wide ones, and left out of boxes too small to read (pointing at them still
 * shows everything).
 */
function lineLabels(c: Rect, name: string, amount: string, detail: string): string {
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  if (c.w < 50 && c.h > 80 && c.w >= 16) {
    const size = Math.min(12, c.w - 4);
    return `<text class="line-name" font-size="${size}" text-anchor="middle" transform="translate(${cx + size * 0.35} ${cy}) rotate(-90)">${esc(fit(`${name} · ${amount}`, c.h, size))}</text>`;
  }
  if (c.h < 30 && c.h >= 14 && c.w > 80) {
    const size = Math.min(12, c.h - 4);
    return `<text class="line-name" font-size="${size}" text-anchor="middle" x="${cx}" y="${cy + size * 0.35}">${esc(fit(`${name} · ${amount}`, c.w, size))}</text>`;
  }
  if (c.w < 50 || c.h < 30) return "";
  const size = Math.max(12, Math.min(20, Math.min(c.w / 9, c.h / 5)));
  const rows: [string, string, number][] = [
    ["line-name", name, size],
    ["line-amount", amount, size * 0.9],
  ];
  if (detail && c.h > size * 4) rows.push(["line-detail", detail, size * 0.75]);
  const height = rows.reduce((s, [, , sz]) => s + sz * 1.25, 0);
  let y = cy - height / 2;
  return rows
    .map(([cls, text, sz]) => {
      y += sz * 1.25;
      return `<text class="${cls}" font-size="${sz.toFixed(1)}" text-anchor="middle" x="${cx}" y="${(y - sz * 0.3).toFixed(1)}">${esc(fit(text, c.w, sz))}</text>`;
    })
    .join("");
}

function inset(r: Rect, d: number): Rect {
  return { x: r.x + d, y: r.y + d, w: Math.max(r.w - 2 * d, 0), h: Math.max(r.h - 2 * d, 0) };
}

const STORAGE_KEY = "architect.costPanel.v1";

interface PanelPlace {
  open: boolean;
  /** Position within the views and size, in pixels; unset until moved or resized. */
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

function loadPlace(): PanelPlace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PanelPlace) : { open: false };
  } catch {
    return { open: false };
  }
}

/** The floating cost panel over the views. */
export class CostPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly summary: HTMLElement;
  private previous = new Map<string, number>();
  private frame = 0;
  private flashNext = false;
  private place: PanelPlace;

  constructor(
    private readonly container: HTMLElement,
    private readonly store: Store,
  ) {
    this.place = loadPlace();
    this.root = document.createElement("section");
    this.root.className = "cost-panel";
    this.root.setAttribute("aria-label", m.ui.costChart.title);
    this.root.innerHTML = `<header title="${esc(m.ui.costChart.hint)}"><strong>${esc(m.ui.costChart.title)}</strong><span class="cost-summary"></span><button type="button" class="close" aria-label="${esc(m.ui.close)}" title="${esc(m.ui.close)}">×</button></header><div class="cost-body"></div>`;
    this.body = this.root.querySelector(".cost-body")!;
    this.summary = this.root.querySelector(".cost-summary")!;
    container.append(this.root);
    this.applyPlace();

    this.root.querySelector(".close")!.addEventListener("click", () => store.toggleCosts());
    this.enableDragging(this.root.querySelector("header")!);
    let sized = false;
    new ResizeObserver(() => {
      // The first call is the panel appearing; later ones are the reader resizing it.
      if (sized && this.store.showCosts) {
        this.place.width = this.root.offsetWidth;
        this.place.height = this.root.offsetHeight;
        this.savePlace();
      }
      sized = true;
      this.schedule(false);
    }).observe(this.body);

    store.showCosts = this.place.open;
    store.subscribe((change) => {
      if (this.root.hidden === store.showCosts) {
        this.root.hidden = !store.showCosts;
        this.place.open = store.showCosts;
        this.savePlace();
        if (store.showCosts) this.previous.clear();
      }
      if (store.showCosts) this.schedule(change !== "ui");
    });
    this.root.hidden = !store.showCosts;
    if (store.showCosts) this.schedule(false);
  }

  /** Redraw on the next frame; `flash` marks the boxes whose cost changed. */
  private schedule(flash: boolean): void {
    if (this.frame) {
      if (flash) this.flashNext = true;
      return;
    }
    this.flashNext = flash;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render(this.flashNext);
    });
  }
  private render(flash: boolean): void {
    if (this.root.hidden) return;
    const { house, prices, budget } = this.store;
    const lines = costLines(house, prices);
    const groups = groupTotals(lines);
    const total = groups.reduce((s, g) => s + g.amount, 0);
    const left = budget - total;
    const rows = m.ui.costRows;
    this.summary.innerHTML = `${esc(rows.total)} <b>${money(total)}</b>${
      Number.isFinite(budget) ? ` · <span class="${left >= 0 ? "" : "over"}">${esc(left >= 0 ? rows.budgetLeft : rows.overBudget)} <b>${money(Math.abs(left))}</b></span>` : ""
    }`;

    const changed = new Set<string>();
    const now = new Map(lines.map((l) => [lineKey(l), l.amount]));
    if (flash && this.previous.size) for (const [k, v] of now) if (Math.abs((this.previous.get(k) ?? 0) - v) > 0.5) changed.add(k);
    this.previous = now;

    const pad = getComputedStyle(this.body);
    const w = Math.floor(this.body.clientWidth - Number.parseFloat(pad.paddingLeft) - Number.parseFloat(pad.paddingRight));
    const h = Math.floor(this.body.clientHeight - Number.parseFloat(pad.paddingTop) - Number.parseFloat(pad.paddingBottom));
    this.body.innerHTML = groups.length && w > 0 && h > 0 ? treemapSvg(groups, w, h, changed) : `<p class="empty">${esc(m.ui.costChart.empty)}</p>`;
  }

  /** Move the panel by dragging its title bar, keeping it inside the views. */
  private enableDragging(handle: HTMLElement): void {
    handle.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button") || e.button !== 0) return;
      e.preventDefault();
      const box = this.root.getBoundingClientRect();
      const area = this.container.getBoundingClientRect();
      const dx = e.clientX - box.left;
      const dy = e.clientY - box.top;
      handle.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        this.place.left = Math.min(Math.max(ev.clientX - dx - area.left, 0), area.width - box.width);
        this.place.top = Math.min(Math.max(ev.clientY - dy - area.top, 0), area.height - box.height);
        this.applyPlace();
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        this.savePlace();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  private applyPlace(): void {
    const s = this.root.style;
    const p = this.place;
    if (p.left !== undefined && p.top !== undefined) {
      // Saved in a larger window: pull it back into view.
      const area = this.container.getBoundingClientRect();
      const left = area.width ? Math.min(p.left, Math.max(area.width - 120, 0)) : p.left;
      const top = area.height ? Math.min(p.top, Math.max(area.height - 60, 0)) : p.top;
      Object.assign(s, { left: `${left}px`, top: `${top}px`, right: "auto", bottom: "auto" });
    }
    if (p.width) s.width = `${p.width}px`;
    if (p.height) s.height = `${p.height}px`;
  }

  private savePlace(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.place));
    } catch {
      // Remembering the panel is a convenience only.
    }
  }
}
