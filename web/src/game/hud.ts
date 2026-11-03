/** On-screen status: cost breakdown and validation result. */

import { type House, type Plot, type PriceList, describeIssue, estimate, totalCost, validate } from "../core";

/** Format money with thousands separators, e.g. 42,150. */
export function money(v: number): string {
  const digits = Math.abs(v).toFixed(0);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return v < 0 && digits !== "0" ? `-${grouped}` : grouped;
}

export interface HudState {
  name: string;
  index: number;
  count: number;
  house: House;
  plot: Plot;
  budget: number;
  prices: PriceList;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderStatus(el: HTMLElement, s: HudState): void {
  const { house, plot } = s;
  const cost = estimate(house, s.prices);
  const issues = validate(house, plot, s.budget, s.prices);
  const firstWall = house.walls[0];
  const walls = firstWall ? `${firstWall.material}, ${firstWall.height.toFixed(1)} m` : "–";
  const r = house.roof;
  const roof = r ? `${r.style}, ${r.pitchDeg.toFixed(0)}°, overhang ${r.overhang.toFixed(1)} m, ${r.material}` : "none";

  const row = (label: string, v: number, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="amount">${money(v)}</td></tr>`;
  const status = issues.length
    ? `<div class="bad">Not sellable yet</div><ul>${issues.map((i) => `<li>${esc(describeIssue(i))}</li>`).join("")}</ul>`
    : `<div class="ok">Ready to sell</div>`;

  el.innerHTML = `
    <h1>${esc(s.name)} <span class="sub">(${s.index + 1}/${s.count})</span></h1>
    <div class="sub">on ${esc(plot.name)} (${plot.width} × ${plot.depth} m)</div>
    <div class="sub">Floor area ${house.floorArea().toFixed(1)} m² · Walls: ${walls}</div>
    <div class="sub">Roof: ${roof}</div>
    <table>
      ${row("Walls", cost.walls)}
      ${row("Windows", cost.windows)}
      ${row("Doors", cost.doors)}
      ${row("Roof", cost.roof)}
      ${row("Foundation", cost.foundation)}
      ${row("Total", totalCost(cost), "total")}
    </table>
    <div class="sub">Budget ${money(s.budget)}</div>
    ${status}`;
}
