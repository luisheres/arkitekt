/**
 * The architect's career, to look back on: a few headline numbers, how the money and
 * the stars came in house by house (with the tiers marked where they opened), every house
 * sold with its picture, and the techniques learned along the way.
 */

import { type Career, type CareerPoint, TECHNIQUES, area, careerHistory, careerStars, careerTier, clientById, money as formatMoney } from "../core";
import { esc, money } from "./hud";
import { lang, m } from "./i18n";

/** One hue per chart (each chart has a single series); checked against the white surface. */
const EARNED = "#2f8fe0";
const STARS = "#c08a0a";

const W = 720;
const PAD = { left: 64, right: 20, top: 22, bottom: 28 };

/** A round step for about `count` axis ticks up to `max`. */
function niceStep(max: number, count: number): number {
  const raw = max / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => s >= raw) ?? 10 * p);
}

const clientName = (id: string) => clientById(id)?.text[lang].name ?? "";

function tooltip(p: CareerPoint): string {
  return [`${m.progress.houseN(p.house)} · ${clientName(p.commission.clientId)}`, `${m.ui.yourFee}: ${money(p.commission.fee)}`, `${m.progress.earnedSoFar}: ${money(p.earned)}`, `${"★".repeat(p.commission.stars)}`].join("\n");
}

/** House numbers along the bottom, thinned out when there are many. */
function xLabels(points: readonly CareerPoint[], x: (house: number) => number, y: number): string {
  const every = Math.ceil(points.length / 12);
  return points
    .filter((p) => p.house % every === 0)
    .map((p) => `<text class="axis" x="${x(p.house).toFixed(1)}" y="${y}" text-anchor="middle">${p.house}</text>`)
    .join("");
}

/** Everything earned, house by house: a line from nothing, with the tiers marked. */
function earningsChart(points: readonly CareerPoint[]): string {
  const H = 230;
  const n = points.length;
  const max = Math.max(...points.map((p) => p.earned));
  const step = niceStep(max, 4);
  const top = Math.ceil(max / step) * step;
  const x = (house: number) => PAD.left + (house / n) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / top) * (H - PAD.top - PAD.bottom);
  const grid: string[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) {
    grid.push(`<line class="grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`);
    grid.push(`<text class="axis" x="${PAD.left - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${formatMoney(m, v)}</text>`);
  }
  const line = [[0, 0], ...points.map((p) => [p.house, p.earned])].map(([h, v]) => `${x(h).toFixed(1)},${y(v).toFixed(1)}`);
  const area = `M${x(0)},${y(0)} L${line.join(" L")} L${x(n).toFixed(1)},${y(0)} Z`;
  const tiers = points
    .filter((p) => p.tierUp)
    .map(
      (p) =>
        `<line class="tier-line" x1="${x(p.house).toFixed(1)}" x2="${x(p.house).toFixed(1)}" y1="${PAD.top - 6}" y2="${H - PAD.bottom}"/>` +
        // Near the end of the line, where its total is written, the label goes a row lower.
        `<text class="tier-label" x="${(x(p.house) + 4).toFixed(1)}" y="${PAD.top + (x(n) - x(p.house) < 110 ? 22 : 4)}">${esc(m.progress.tierShort(p.tierUp!))}</text>`,
    )
    .join("");
  const slot = (W - PAD.left - PAD.right) / n;
  const hover = points
    .map(
      (p) =>
        `<g class="hover-point"><rect class="hit" x="${(x(p.house) - slot / 2).toFixed(1)}" y="${PAD.top}" width="${slot.toFixed(1)}" height="${H - PAD.top - PAD.bottom}"><title>${esc(tooltip(p))}</title></rect>` +
        `<line class="crosshair" x1="${x(p.house).toFixed(1)}" x2="${x(p.house).toFixed(1)}" y1="${PAD.top}" y2="${H - PAD.bottom}"/>` +
        `<circle class="marker" cx="${x(p.house).toFixed(1)}" cy="${y(p.earned).toFixed(1)}" r="5" fill="${EARNED}"/></g>`,
    )
    .join("");
  const last = points[n - 1];
  const endLabel = `<text class="end-label" x="${(x(n) - 6).toFixed(1)}" y="${(y(last.earned) - 10).toFixed(1)}" text-anchor="end">${money(last.earned)}</text>`;
  return `<svg class="career-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.progress.chartEarnings)}">
      ${grid.join("")}
      <path d="${area}" fill="${EARNED}" opacity="0.12"/>
      <polyline points="${line.join(" ")}" fill="none" stroke="${EARNED}" stroke-width="2" stroke-linejoin="round"/>
      ${tiers}${endLabel}
      ${xLabels(points, x, H - 8)}
      ${hover}
    </svg>`;
}

/** The stars each house earned, as bars. */
function starsChart(points: readonly CareerPoint[]): string {
  const H = 150;
  const n = points.length;
  const slot = (W - PAD.left - PAD.right) / n;
  const barW = Math.min(28, slot - 2);
  const x = (house: number) => PAD.left + (house - 0.5) * slot;
  const y = (v: number) => H - PAD.bottom - (v / 3) * (H - PAD.top - PAD.bottom);
  const grid = [1, 2, 3]
    .map(
      (v) =>
        `<line class="grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>` +
        `<text class="axis" x="${PAD.left - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${"★".repeat(v)}</text>`,
    )
    .join("");
  const base = y(0);
  const bars = points
    .map((p) => {
      const top = y(p.commission.stars);
      const [x0, x1] = [x(p.house) - barW / 2, x(p.house) + barW / 2];
      const r = Math.min(4, barW / 2, base - top);
      // Rounded at the top, square on the baseline.
      const d = `M${x0.toFixed(1)},${base} V${(top + r).toFixed(1)} Q${x0.toFixed(1)},${top.toFixed(1)} ${(x0 + r).toFixed(1)},${top.toFixed(1)} H${(x1 - r).toFixed(1)} Q${x1.toFixed(1)},${top.toFixed(1)} ${x1.toFixed(1)},${(top + r).toFixed(1)} V${base} Z`;
      const label = barW >= 14 ? `<text class="bar-label" x="${x(p.house).toFixed(1)}" y="${(top - 5).toFixed(1)}" text-anchor="middle">${p.commission.stars}</text>` : "";
      return `<g class="hover-bar"><rect class="hit" x="${(x(p.house) - slot / 2).toFixed(1)}" y="${PAD.top}" width="${slot.toFixed(1)}" height="${base - PAD.top}"><title>${esc(tooltip(p))}</title></rect><path class="bar" d="${d}" fill="${STARS}"/>${label}</g>`;
    })
    .join("");
  return `<svg class="career-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.progress.chartStars)}">
      ${grid}<line class="baseline" x1="${PAD.left}" x2="${W - PAD.right}" y1="${base}" y2="${base}"/>
      ${bars}
      ${xLabels(points, (h) => x(h), H - 8)}
    </svg>`;
}

/** The career page, as the content of a dialog. */
export function careerHtml(career: Career, playerName: string): string {
  const p = m.progress;
  const points = careerHistory(career);
  const stars = careerStars(career);
  const tier = careerTier(career);
  const learned = career.techniques ?? [];
  const date = new Intl.DateTimeFormat(m.locale, { dateStyle: "medium" });
  const tile = (label: string, value: string, sub = "", cls = "") =>
    `<div class="stat-tile"><span class="stat-label">${esc(label)}</span><span class="stat-value ${cls}">${value}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</div>`;
  const tiles = [
    tile(p.statHouses, String(points.length)),
    tile(p.statEarned, `💰 ${money(career.earnings)}`),
    tile(p.reputation, `⭐ ${stars}`, points.length ? p.avgStars((stars / points.length).toLocaleString(m.locale, { maximumFractionDigits: 1 })) : ""),
    tile(p.statTier, esc(m.tierName[tier]), p.tierShort(tier), "words"),
    tile(p.statTechniques, `${learned.length}`, p.ofTotal(TECHNIQUES.length)),
  ].join("");

  const houses = [...points]
    .reverse()
    .map((pt) => {
      const c = pt.commission;
      const facts = [c.area ? area(m, c.area) : "", c.cost ? `${m.ui.costRows.total} ${money(c.cost)}` : "", c.budget ? `${m.ui.budget} ${money(c.budget)}` : ""].filter(Boolean).join(" · ");
      return `<li class="career-house">
          ${c.thumbnail ? `<img src="${esc(c.thumbnail)}" alt="">` : `<div class="no-thumb" aria-hidden="true">🏠</div>`}
          <div class="career-house-info">
            <strong>${esc(p.houseN(pt.house))} · ${esc(clientName(c.clientId))}</strong>
            <span><span class="stars" aria-label="${esc(m.ui.stars(c.stars))}">${"★".repeat(c.stars)}${"☆".repeat(3 - c.stars)}</span> · ${esc(m.ui.yourFee)} ${money(c.fee)}${c.tier ? ` · <span class="tier-tag tier${c.tier}">${esc(m.tierName[c.tier])}</span>` : ""}</span>
            ${facts ? `<span class="sub">${esc(facts)}</span>` : ""}
            ${c.at ? `<span class="sub">${esc(date.format(c.at))}</span>` : ""}
          </div>
        </li>`;
    })
    .join("");

  const techniques = learned.length
    ? `<ul class="career-techniques">${learned
        .map((id) => {
          const at = career.learnedAt?.[id];
          return `<li><strong>${esc(m.technique[id].name)}</strong>${at ? ` <span class="sub">${esc(date.format(at))}</span>` : ""}</li>`;
        })
        .join("")}</ul>`
    : `<p class="sub">${esc(p.noTechniques)}</p>`;

  return `<h2>📈 ${esc(p.careerTitle(playerName))}</h2>
    <div class="stat-tiles">${tiles}</div>
    ${
      points.length
        ? `<h3>${esc(p.chartEarnings)}</h3>${earningsChart(points)}
           <h3>${esc(p.chartStars)}</h3>${starsChart(points)}
           <h3>${esc(p.housesTitle)}</h3><ul class="career-houses">${houses}</ul>`
        : `<p class="career-empty">${esc(p.careerEmpty)}</p>`
    }
    <h3>${esc(p.techniquesTitle)}</h3>${techniques}`;
}
