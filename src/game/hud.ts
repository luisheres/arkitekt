/** Cost breakdown and validation status. */

import { type Issue, describeIssue, estimate, totalCost, validate } from "../core";
import type { Selection, Store } from "./store";

/** Format money with thousands separators, e.g. 42,150. */
export function money(v: number): string {
  const digits = Math.abs(v).toFixed(0);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return v < 0 && digits !== "0" ? `-${grouped}` : grouped;
}

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The wall or opening an issue is about, so clicking the issue can select it. */
function issueTarget(i: Issue): Selection {
  if ("wall" in i) return { kind: "wall", id: i.wall };
  if ("opening" in i) return { kind: "opening", id: i.opening };
  if (i.kind === "OpeningsOverlap") return { kind: "opening", id: i.b };
  return null;
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
      ${row("Walls", cost.walls)}
      ${row("Windows", cost.windows)}
      ${row("Doors", cost.doors)}
      ${row("Roof", cost.roof)}
      ${row("Foundation", cost.foundation)}
      ${row("Total", total, "total")}
      ${row(left >= 0 ? "Budget left" : "Over budget", Math.abs(left), left >= 0 ? "" : "over")}
    </table>
    ${
      issues.length
        ? `<div class="bad">Not sellable yet</div><ul class="issues">${issues
            .map((i) => {
              const target = issueTarget(i);
              const data = target ? ` data-kind="${target.kind}" data-id="${target.id}" tabindex="0"` : "";
              return `<li${data}>${esc(describeIssue(i))}</li>`;
            })
            .join("")}</ul>`
        : `<div class="ok">Ready to sell</div>`
    }`;
}
