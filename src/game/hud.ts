/** Read-only sidebar sections: the client's brief checklist, costs and issues. */

import { type Issue, describeIssue, estimate, evaluateBrief, totalCost, validate } from "../core";
import type { Selection, Store } from "./store";

/** Format money with thousands separators, e.g. 42,150. */
export function money(v: number): string {
  const digits = Math.abs(v).toFixed(0);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return v < 0 && digits !== "0" ? `-${grouped}` : grouped;
}

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The wall, opening or room an issue is about, so clicking the issue can select it. */
function issueTarget(i: Issue): Selection {
  if ("wall" in i) return { kind: "wall", id: i.wall };
  if ("opening" in i) return { kind: "opening", id: i.opening };
  if (i.kind === "OpeningsOverlap") return { kind: "opening", id: i.b };
  if ("room" in i) return { kind: "room", at: i.room.at };
  if (i.kind === "LabelOutsideRooms") return null;
  return null;
}

function targetAttrs(t: Selection): string {
  if (!t) return "";
  const data = t.kind === "room" ? `data-x="${t.at.x}" data-y="${t.at.y}"` : `data-id="${t.id}"`;
  return ` data-kind="${t.kind}" ${data} tabindex="0"`;
}

/** Live checklist of the client's must-haves and wishes. */
export function renderBrief(el: HTMLElement, store: Store): void {
  const results = evaluateBrief(store.house, store.client, store.prices);
  const item = (r: (typeof results)[number]) =>
    `<li class="${r.met ? "met" : "unmet"}"><span class="mark" aria-hidden="true">${r.item.must ? (r.met ? "✓" : "✗") : r.met ? "★" : "☆"}</span><span>${esc(r.text)}</span><span class="detail">${esc(r.detail)}</span></li>`;
  const musts = results.filter((r) => r.item.must);
  const wishes = results.filter((r) => !r.item.must);
  el.innerHTML = `
    <h3>Must have <span class="count">${musts.filter((r) => r.met).length}/${musts.length}</span></h3>
    <ul class="brief">${musts.map(item).join("")}</ul>
    <h3>Would love <span class="count">${wishes.filter((r) => r.met).length}/${wishes.length}</span></h3>
    <ul class="brief wishes">${wishes.map(item).join("")}</ul>`;
}

export function renderStatus(el: HTMLElement, store: Store): void {
  const { house, plot, budget, prices } = store;
  const cost = estimate(house, prices);
  const total = totalCost(cost);
  const issues = validate(house, plot, budget, prices);

  const row = (label: string, v: number, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="amount">${money(v)}</td></tr>`;
  const left = budget - total;
  el.innerHTML = `
    <div class="sub">Floor area ${house.floorArea().toFixed(1)} m²</div>
    <table>
      ${row("Exterior walls", cost.walls)}
      ${row("Interior walls", cost.interiorWalls)}
      ${row("Windows", cost.windows)}
      ${row("Doors", cost.doors)}
      ${row("Roof", cost.roof)}
      ${row("Foundation", cost.foundation)}
      ${row("Total", total, "total")}
      ${row(left >= 0 ? "Budget left" : "Over budget", Math.abs(left), left >= 0 ? "" : "over")}
    </table>
    ${
      issues.length
        ? `<div class="bad">Building problems</div><ul class="issues">${issues
            .map((i) => `<li${targetAttrs(issueTarget(i))}>${esc(describeIssue(i))}</li>`)
            .join("")}</ul>`
        : `<div class="ok">No building problems</div>`
    }`;
}
