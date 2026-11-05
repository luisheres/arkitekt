/** Modal dialogs: meeting a client, and their verdict on a design. */

import { type Client, type CostLine, type SavedDesign, type Verdict, num } from "../core";
import { GROUP_COLORS, groupTotals, treemapSvg } from "./costChart";
import { esc, money } from "./hud";
import { lang, m } from "./i18n";

const modal = (): HTMLElement => document.querySelector<HTMLElement>("#modal")!;

/** Show `html` in the modal; buttons with `data-action` call the matching handler and close it. */
function open(html: string, actions: Record<string, () => void>, dismissable: boolean): void {
  const root = modal();
  root.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">${html}</div>`;
  root.hidden = false;
  const close = () => {
    root.hidden = true;
    root.innerHTML = "";
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && dismissable) {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", onKey, true);
  for (const b of root.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
    b.addEventListener("click", () => {
      close();
      actions[b.dataset.action!]?.();
    });
  }
  // The safe choice gets the focus, so Enter never confirms something destructive.
  (root.querySelector<HTMLButtonElement>("button[data-focus]") ?? root.querySelector<HTMLButtonElement>("button.primary"))?.focus();
}

export function isModalOpen(): boolean {
  return !modal().hidden;
}

/** Plot size as "28 × 32 m". */
export const plotSize = (c: Client): string => `${num(m, c.plot.width)} × ${num(m, c.plot.depth)} m`;

/** Introduce a client and their brief. */
export function showClient(client: Client, working: boolean, onAccept: () => void): void {
  const text = client.text[lang];
  const list = (must: boolean) =>
    client.items
      .filter((i) => i.must === must)
      .map((i) => `<li>${esc(m.requirement(i.req))}</li>`)
      .join("");
  open(
    `<p class="eyebrow">${esc(working ? m.ui.theBrief : m.ui.newClient)}</p>
     <h2>${esc(text.name)}</h2>
     <p class="sub">${esc(text.who)}</p>
     <blockquote>${esc(text.story)}</blockquote>
     <dl class="facts">
       <div><dt>${esc(m.ui.plot)}</dt><dd>${esc(client.plot.name[lang])}, ${plotSize(client)}</dd></div>
       <div><dt>${esc(m.ui.budget)}</dt><dd>${money(client.budget)}</dd></div>
     </dl>
     <div class="columns">
       <div><h3>${esc(m.ui.mustHave)}</h3><ul>${list(true)}</ul></div>
       <div><h3>${esc(m.ui.wouldLove)}</h3><ul>${list(false)}</ul></div>
     </div>
     <p class="sub">${esc(m.ui.briefFooter)}</p>
     <div class="actions"><button type="button" class="primary" data-action="accept">${esc(working ? m.ui.backToDrawingBoard : m.ui.takeJob)}</button></div>`,
    { accept: onAccept },
    working,
  );
}

/** The client's reaction to a presented design. */
export function showVerdict(client: Client, v: Verdict, onNext: () => void): void {
  const name = esc(client.text[lang].name);
  if (!v.accepted) {
    const shown = v.problems.slice(0, 8);
    const more = v.problems.length - shown.length;
    open(
      `<p class="eyebrow">${name}</p>
       <h2>${esc(m.ui.notYet)}</h2>
       <blockquote>${esc(v.quote)}</blockquote>
       <ul class="problems">${shown.map((p) => `<li>${esc(p)}</li>`).join("")}${more > 0 ? `<li class="sub">${esc(m.ui.andMore(more))}</li>` : ""}</ul>
       <div class="actions"><button type="button" class="primary" data-action="close">${esc(m.ui.keepWorking)}</button></div>`,
      {},
      true,
    );
    return;
  }
  const stars = "★".repeat(v.stars) + "☆".repeat(3 - v.stars);
  open(
    `<p class="eyebrow">${name}</p>
     <h2>${esc(m.ui.sold)} <span class="stars" aria-label="${esc(m.ui.stars(v.stars))}">${stars}</span></h2>
     <blockquote>${esc(v.quote)}</blockquote>
     <dl class="facts">
       <div><dt>${esc(m.ui.wishesGranted)}</dt><dd>${esc(m.brief.countOf(v.wishesMet, v.wishesTotal))}</dd></div>
       <div><dt>${esc(m.ui.yourFee)}</dt><dd>${money(v.fee)}</dd></div>
     </dl>
     <div class="actions"><button type="button" class="primary" data-action="next">${esc(m.ui.nextClient)}</button></div>`,
    { next: onNext },
    false,
  );
}

/** Where the money goes: a treemap of the costs, with the totals per group. */
export function showCostChart(lines: readonly CostLine[], budget: number): void {
  const groups = groupTotals(lines);
  const total = groups.reduce((s, g) => s + g.amount, 0);
  const rows = m.ui.costRows;
  const left = budget - total;
  const legend = groups
    .map(
      (g) =>
        `<li><span class="swatch" style="background:${GROUP_COLORS[g.group]}"></span><span>${esc(m.ui.costChart.groups[g.group])}</span><span class="amount">${money(g.amount)}</span><span class="share">${Math.round((g.amount / total) * 100)} %</span></li>`,
    )
    .join("");
  open(
    `<h2>${esc(m.ui.costChart.title)}</h2>
     ${
       groups.length
         ? `<p class="sub">${esc(m.ui.costChart.hint)}</p>
            ${treemapSvg(groups)}
            <ul class="cost-legend">${legend}</ul>
            <dl class="facts">
              <div><dt>${esc(rows.total)}</dt><dd>${money(total)}</dd></div>
              <div><dt>${esc(m.ui.budget)}</dt><dd>${money(budget)}</dd></div>
              <div class="${left >= 0 ? "" : "over"}"><dt>${esc(left >= 0 ? rows.budgetLeft : rows.overBudget)}</dt><dd>${money(Math.abs(left))}</dd></div>
            </dl>`
         : `<p>${esc(m.ui.costChart.empty)}</p>`
     }
     <div class="actions"><button type="button" class="primary" data-action="close">${esc(m.ui.close)}</button></div>`,
    {},
    true,
  );
  modal().querySelector(".dialog")?.classList.add("wide");
}

/** Ask before turning a client down: the design so far is thrown away. */
export function confirmTurnDown(client: Client, onConfirm: () => void): void {
  open(
    `<p class="eyebrow">${esc(client.text[lang].name)}</p>
     <h2>${esc(m.ui.turnDownTitle)}</h2>
     <p>${esc(m.ui.turnDownText(client.text[lang].name))}</p>
     <div class="actions"><button type="button" data-action="cancel" data-focus>${esc(m.ui.keepWorking)}</button><button type="button" class="primary danger-primary" data-action="confirm">${esc(m.ui.turnDown)}</button></div>`,
    { confirm: onConfirm },
    true,
  );
}

/** Name a design and save it, over the one being worked on or as a new one. */
export function showSaveDialog(defaultName: string, current: { name: string } | null, onSave: (name: string, asNew: boolean) => void): void {
  let name = current?.name ?? defaultName;
  open(
    `<h2>${esc(m.ui.saveDesign)}</h2>
     <label class="field wide"><span>${esc(m.ui.designName)}</span><input type="text" class="design-name" maxlength="120" value="${esc(name)}"></label>
     <div class="actions">
       <button type="button" data-action="cancel">${esc(m.ui.cancel)}</button>
       ${current ? `<button type="button" data-action="saveNew">${esc(m.ui.saveAsNew)}</button>` : ""}
       <button type="button" class="primary" data-action="save">${esc(m.ui.save)}</button>
     </div>`,
    { save: () => onSave(name.trim() || defaultName, false), saveNew: () => onSave(name.trim() || defaultName, true) },
    true,
  );
  const input = modal().querySelector<HTMLInputElement>("input.design-name")!;
  input.addEventListener("input", () => (name = input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") modal().querySelector<HTMLButtonElement>("button.primary")?.click();
  });
  input.focus();
  input.select();
}

export interface DesignListItem {
  design: SavedDesign;
  client: string;
  /** e.g. "112.0 m² · 64,300" */
  facts: string;
  sold: boolean;
}

export interface DesignListActions {
  open(d: SavedDesign): void;
  remove(d: SavedDesign): void;
  export(d: SavedDesign): void;
  import(file: File): void;
}

/** The saved designs, newest first, with what can be done with each. */
export function showDesigns(items: DesignListItem[], actions: DesignListActions, notice = ""): void {
  const date = new Intl.DateTimeFormat(m.locale, { dateStyle: "medium", timeStyle: "short" });
  const cards = items
    .map(
      ({ design: d, client, facts, sold }, i) => `
      <li class="design-card">
        ${d.thumbnail ? `<img src="${esc(d.thumbnail)}" alt="">` : `<div class="no-thumb"></div>`}
        <div class="design-info">
          <strong>${esc(d.name)}</strong>
          <span class="sub">${esc(client)}</span>
          <span class="sub">${esc(facts)} · ${esc(date.format(d.savedAt))}</span>
        </div>
        <div class="design-actions">
          ${sold ? `<span class="tag">${esc(m.ui.soldTag)}</span>` : `<button type="button" class="primary" data-cmd="open" data-i="${i}">${esc(m.ui.openDesign)}</button>`}
          <button type="button" data-cmd="export" data-i="${i}">${esc(m.ui.exportDesign)}</button>
          <button type="button" class="danger" data-cmd="remove" data-i="${i}">${esc(m.ui.delete)}</button>
        </div>
      </li>`,
    )
    .join("");
  open(
    `<h2>${esc(m.ui.savedDesigns)}</h2>
     ${notice ? `<p class="notice">${esc(notice)}</p>` : ""}
     ${items.length ? `<ul class="design-list">${cards}</ul>` : `<p class="sub">${esc(m.ui.noSavedDesigns)}</p>`}
     <div class="actions">
       <label class="button-like">${esc(m.ui.importDesign)}<input type="file" accept=".json,application/json" hidden></label>
       <button type="button" class="primary" data-action="close" data-focus>${esc(m.ui.close)}</button>
     </div>`,
    {},
    true,
  );
  const root = modal();
  root.querySelectorAll<HTMLButtonElement>("button[data-cmd]").forEach((b) =>
    b.addEventListener("click", () => {
      const d = items[Number(b.dataset.i)].design;
      if (b.dataset.cmd === "open") {
        root.hidden = true;
        root.innerHTML = "";
        actions.open(d);
      } else if (b.dataset.cmd === "export") actions.export(d);
      else actions.remove(d);
    }),
  );
  const file = root.querySelector<HTMLInputElement>("input[type=file]")!;
  file.addEventListener("change", () => {
    if (file.files?.[0]) actions.import(file.files[0]);
  });
}

/** A short message that fades away, e.g. after saving. */
export function toast(text: string): void {
  // One message at a time: a new one replaces the last.
  document.querySelectorAll(".toast").forEach((old) => old.remove());
  const t = Object.assign(document.createElement("div"), { className: "toast", textContent: text, role: "status" });
  document.body.append(t);
  setTimeout(() => t.classList.add("gone"), 1800);
  setTimeout(() => t.remove(), 2400);
}
