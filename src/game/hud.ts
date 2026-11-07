/** Read-only sidebar sections: the client's brief checklist, costs and issues. */

import { type Issue, area, earthworks, estimate, evaluateBrief, fixed, money as formatMoney, num, siteLevel, totalCost, validate, voidArea } from "../core";
import { m } from "./i18n";
import type { Selection, Store } from "./store";

/** Format money in the current language, e.g. 42,150 or 42 150. */
export const money = (v: number): string => formatMoney(m, v);

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The wall, opening or room an issue is about, so clicking the issue can select it. */
function issueTarget(i: Issue): Selection {
  if ("wall" in i) return { kind: "wall", id: i.wall };
  if ("opening" in i) return { kind: "opening", id: i.opening };
  if (i.kind === "OpeningsOverlap") return { kind: "opening", id: i.b };
  if ("room" in i) return { kind: "room", at: i.room.at };
  if (i.kind === "LabelOutsideRooms") return { kind: "label", id: i.label };
  if ("stair" in i) return { kind: "stair", id: i.stair };
  if ("balcony" in i) return { kind: "balcony", id: i.balcony };
  return null;
}

/** The storey the thing an issue is about is on, so clicking it can switch to that storey. */
function issueLevel(i: Issue, store: Store): number | null {
  if ("room" in i) return i.room.level;
  if ("wall" in i) return store.house.wall(i.wall)?.level ?? null;
  if ("opening" in i) return store.house.levelOf(store.house.opening(i.opening)?.wall ?? -1);
  if ("stair" in i) return store.house.stair(i.stair)?.level ?? null;
  if ("balcony" in i) return store.house.wall(store.house.balcony(i.balcony)?.wall ?? -1)?.level ?? null;
  if ("level" in i) return i.level;
  return null;
}

function targetAttrs(i: Issue, store: Store): string {
  // Something not learned yet: clicking it opens the Workshop.
  if (i.kind === "NotLearned") return ` data-technique="${i.technique}" tabindex="0"`;
  const t = issueTarget(i);
  const level = issueLevel(i, store);
  const levelAttr = level !== null ? ` data-level="${level}"` : "";
  if (!t) return level ? `${levelAttr} tabindex="0"` : "";
  const data = t.kind === "room" ? `data-x="${t.at.x}" data-y="${t.at.y}"` : "id" in t ? `data-id="${t.id}"` : "";
  return ` data-kind="${t.kind}" ${data}${levelAttr} tabindex="0"`;
}

/** "Platform +1.35 m · 19 m³ dug, 19 m³ filled" */
function groundLine(store: Store): string {
  const { house, plot } = store;
  const e = earthworks(house, plot);
  return m.ui.platform(fixed(m, siteLevel(house, plot), 2), num(m, Math.round(e.cut)), num(m, Math.round(e.fill)));
}

/** Live checklist of the client's must-haves and wishes. */
export function renderBrief(el: HTMLElement, store: Store): void {
  const results = evaluateBrief(store.house, store.client, store.prices, m);
  const item = (r: (typeof results)[number]) =>
    `<li class="${r.met ? "met" : "unmet"}"><span class="mark" aria-hidden="true">${r.item.must ? (r.met ? "✓" : "✗") : r.met ? "★" : "☆"}</span><span>${esc(r.text)}</span><span class="detail">${esc(r.detail)}</span></li>`;
  const musts = results.filter((r) => r.item.must);
  const wishes = results.filter((r) => !r.item.must);
  el.innerHTML = `
    <h3>${esc(m.ui.mustHave)} <span class="count">${musts.filter((r) => r.met).length}/${musts.length}</span></h3>
    <ul class="brief">${musts.map(item).join("")}</ul>
    <h3>${esc(m.ui.wouldLove)} <span class="count">${wishes.filter((r) => r.met).length}/${wishes.length}</span></h3>
    <ul class="brief wishes">${wishes.map(item).join("")}</ul>`;
}

export function renderStatus(el: HTMLElement, store: Store): void {
  const { house, plot, budget, prices } = store;
  const cost = estimate(house, prices, plot);
  const total = totalCost(cost);
  const issues = validate(house, plot, budget, prices, store.mode === "campaign" ? store.abilities : undefined);
  const rows = m.ui.costRows;

  const row = (label: string, v: number, cls = "") => `<tr class="${cls}"><td>${esc(label)}</td><td class="amount">${money(v)}</td></tr>`;
  const left = budget - total;
  el.innerHTML = `
    <div class="sub">${esc(m.ui.floorArea(area(m, house.floorArea() - voidArea(house))))}</div>
    ${plot.terrain && house.walls.length ? `<div class="sub">${esc(groundLine(store))}</div>` : ""}
    <table>
      ${row(rows.walls, cost.walls)}
      ${row(rows.interiorWalls, cost.interiorWalls)}
      ${row(rows.windows, cost.windows)}
      ${row(rows.doors, cost.doors)}
      ${row(rows.roof, cost.roof)}
      ${row(rows.foundation, cost.foundation)}
      ${cost.floors ? row(rows.floors, cost.floors) : ""}
      ${cost.finishes ? row(rows.finishes, cost.finishes) : ""}
      ${cost.stairs ? row(rows.stairs, cost.stairs) : ""}
      ${cost.extras ? row(rows.extras, cost.extras) : ""}
      ${cost.groundworks ? row(rows.groundworks, cost.groundworks) : ""}
      ${row(rows.total, total, "total")}
      ${Number.isFinite(budget) ? row(left >= 0 ? rows.budgetLeft : rows.overBudget, Math.abs(left), left >= 0 ? "" : "over") : ""}
    </table>
    <button type="button" class="cost-chart-open${store.showCosts ? " active" : ""}" aria-pressed="${store.showCosts}">📊 ${esc(m.ui.costChart.open)}</button>
    ${
      issues.length
        ? `<div class="bad">${esc(m.ui.buildingProblems)}</div><ul class="issues">${issues
            .map((i) => `<li${targetAttrs(i, store)}>${esc(m.issue(i))}</li>`)
            .join("")}</ul>`
        : `<div class="ok">${esc(m.ui.noBuildingProblems)}</div>`
    }`;
}
