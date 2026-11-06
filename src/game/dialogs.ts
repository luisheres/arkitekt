/** Modal dialogs: meeting a client, and their verdict on a design. */

import {
  BRANCHES,
  type Career,
  DIFFICULTIES,
  type Difficulty,
  type Client,
  type SavedDesign,
  type Setting,
  TECHNIQUES,
  type TechniqueId,
  type Tier,
  type Verdict,
  cannotBuy,
  careerMoney,
  num,
  starterPlots,
  technique,
} from "../core";
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
export function showClient(client: Client, working: boolean, onAccept: () => void, choosing?: { onBack: () => void; needs: TechniqueId[] }): void {
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
     ${choosing?.needs.length ? needsLine(choosing.needs) : ""}
     <div class="actions">${choosing ? `<button type="button" data-action="back">← ${esc(m.progress.back)}</button>` : ""}${
       choosing?.needs.length
         ? `<button type="button" class="primary" data-action="learn">🔨 ${esc(m.progress.learnFirst)}</button>`
         : `<button type="button" class="primary" data-action="accept">${esc(working ? m.ui.backToDrawingBoard : m.ui.takeJob)}</button>`
     }</div>`,
    { accept: onAccept, back: () => choosing?.onBack(), learn: () => choosing && learnHandler(choosing.needs[0]) },
    working || !!choosing,
  );
}

/** "Needs: 🔒 Brickwork, 🔒 Garages" */
function needsLine(needs: readonly TechniqueId[]): string {
  return `<p class="needs"><b>${esc(m.progress.needs)}:</b> ${needs.map((id) => `<span class="lock-tag">🔒 ${esc(m.technique[id].name)}</span>`).join(" ")}</p>`;
}

/** Where "learn this" goes: the Workshop, set up by the game. */
let learnHandler: (id: TechniqueId) => void = () => {};
export function onLearn(fn: (id: TechniqueId) => void): void {
  learnHandler = fn;
}

// --- Welcome, clients and the Workshop --------------------------------------------------

export interface WelcomeActions {
  /** Continue the campaign in progress. */
  campaign(): void;
  /** Start a new campaign at a difficulty. */
  startOver(difficulty: Difficulty): void;
  free(setting: Setting): void;
}

const DIFFICULTY_ICON: Record<Difficulty, string> = { easy: "🌱", moderate: "🏗️", hard: "🔥" };

/** A new campaign: how tight should budgets be? */
function chooseDifficulty(back: () => void, pick: (d: Difficulty) => void): void {
  const cards = DIFFICULTIES.map(
    (d) =>
      `<button type="button" class="mode-card difficulty ${d}" data-action="difficulty-${d}">
         <span class="mode-icon" aria-hidden="true">${DIFFICULTY_ICON[d]}</span>
         <strong>${esc(m.difficulty[d].name)}</strong>
         <span>${esc(m.difficulty[d].text)}</span>
       </button>`,
  ).join("");
  const actions: Record<string, () => void> = { back };
  for (const d of DIFFICULTIES) actions[`difficulty-${d}`] = () => pick(d);
  open(
    `<h2>${esc(m.progress.chooseDifficulty)}</h2>
     <p class="sub">${esc(m.progress.difficultyText)}</p>
     <div class="mode-cards three">${cards}</div>
     <div class="actions"><button type="button" data-action="back">← ${esc(m.progress.back)}</button></div>`,
    actions,
    false,
  );
  modal().querySelector(".dialog")?.classList.add("wide");
  modal().querySelector<HTMLButtonElement>(".difficulty.moderate")?.focus();
}

const SETTING_ICON: Record<Setting, string> = { suburban: "🏘️", lakeside: "🏞️", hillside: "⛰️" };

/** The first thing on screen: campaign or free play. */
export function showWelcome(progress: { houses: number; stars: number; money: number; difficulty: Difficulty } | null, actions: WelcomeActions): void {
  const again = () => showWelcome(progress, actions);
  const p = m.progress;
  open(
    `<div class="welcome">
       <div class="welcome-art" aria-hidden="true">🏡</div>
       <h2>${esc(p.welcomeTitle)}</h2>
       <p class="sub">${esc(p.welcomeText)}</p>
       <div class="mode-cards">
         <button type="button" class="mode-card campaign" data-action="campaign">
           <span class="mode-icon" aria-hidden="true">🏆</span>
           <strong>${esc(p.campaign)}</strong>
           <span>${esc(p.campaignText)}</span>
           ${progress ? `<span class="continue">${esc(p.continueCampaign(progress.houses, progress.stars, money(progress.money)))} · ${DIFFICULTY_ICON[progress.difficulty]} ${esc(m.difficulty[progress.difficulty].name)}</span>` : ""}
         </button>
         <button type="button" class="mode-card free" data-action="free">
           <span class="mode-icon" aria-hidden="true">🎨</span>
           <strong>${esc(p.freePlay)}</strong>
           <span>${esc(p.freePlayText)}</span>
         </button>
       </div>
       ${progress ? `<div class="actions start-over"><button type="button" class="link" data-action="startOver">${esc(p.startOver)}</button></div>` : ""}
     </div>`,
    {
      campaign: () => (progress ? actions.campaign() : chooseDifficulty(again, actions.startOver)),
      startOver: () =>
        open(
          `<h2>${esc(p.startOverTitle)}</h2>
           <p>${esc(p.startOverText)}</p>
           <div class="actions"><button type="button" data-action="cancel" data-focus>${esc(p.back)}</button><button type="button" class="primary danger-primary" data-action="confirm">${esc(p.startOver)}</button></div>`,
          { cancel: again, confirm: () => chooseDifficulty(again, actions.startOver) },
          false,
        ),
      free: () => choosePlot(again, actions.free),
    },
    false,
  );
  modal().querySelector(".dialog")?.classList.add("wide");
}

/** Free play: pick a plot to build on. */
function choosePlot(back: () => void, pick: (s: Setting) => void): void {
  const cards = starterPlots()
    .map(
      (plot) =>
        `<button type="button" class="mode-card plot-card" data-action="plot-${plot.setting}">
           <span class="mode-icon" aria-hidden="true">${SETTING_ICON[plot.setting]}</span>
           <strong>${esc(plot.name[lang])}</strong>
           <span>${num(m, plot.width)} × ${num(m, plot.depth)} m</span>
         </button>`,
    )
    .join("");
  const actions: Record<string, () => void> = { back };
  for (const plot of starterPlots()) actions[`plot-${plot.setting}`] = () => pick(plot.setting);
  open(
    `<h2>${esc(m.progress.choosePlot)}</h2>
     <div class="mode-cards three">${cards}</div>
     <div class="actions"><button type="button" data-action="back">← ${esc(m.progress.back)}</button></div>`,
    actions,
    false,
  );
  modal().querySelector(".dialog")?.classList.add("wide");
}

export interface Offer {
  client: Client;
  tier: Tier;
  story: boolean;
  /** Techniques its must-haves need that are not learned yet. */
  needs: TechniqueId[];
  maxFee: number;
}

export interface OfferActions {
  pick(client: Client): void;
  refresh(): void;
  /** Null when the player must pick (no commission in progress). */
  close: (() => void) | null;
}

/** The clients to choose from. */
export function showOffers(offers: readonly Offer[], teaser: { tier: Tier; stars: number } | null, actions: OfferActions): void {
  const p = m.progress;
  const cards = offers
    .map((o, i) => {
      const t = o.client.text[lang];
      return `<article class="offer-card${o.needs.length ? " needs-tech" : ""}">
          <div class="offer-tags"><span class="tier-tag tier${o.tier}">${esc(m.tierName[o.tier])}</span>${o.story ? `<span class="story-tag">📖 ${esc(p.story)}</span>` : ""}</div>
          <h3>${esc(t.name)}</h3>
          <p class="sub">${esc(t.who)}</p>
          <dl>
            <div><dt>${esc(m.ui.plot)}</dt><dd>${SETTING_ICON[o.client.plot.setting]} ${esc(o.client.plot.name[lang])}</dd></div>
            <div><dt>${esc(m.ui.budget)}</dt><dd>${money(o.client.budget)}</dd></div>
          </dl>
          <p class="fee">💰 ${esc(p.feeUpTo(money(o.maxFee)))}</p>
          ${o.needs.length ? needsLine(o.needs) : ""}
          <button type="button" class="primary" data-action="pick-${i}">${esc(p.choose)}</button>
        </article>`;
    })
    .join("");
  const teaserCard = teaser
    ? `<article class="offer-card teaser" aria-disabled="true"><div class="offer-tags"><span class="tier-tag tier${teaser.tier}">${esc(m.tierName[teaser.tier])}</span></div><div class="teaser-lock" aria-hidden="true">🔒</div><p>${esc(p.nextTierTeaser(m.tierName[teaser.tier], teaser.stars))}</p></article>`
    : "";
  const handlers: Record<string, () => void> = {
    refresh: actions.refresh,
    close: () => actions.close?.(),
  };
  offers.forEach((o, i) => (handlers[`pick-${i}`] = () => actions.pick(o.client)));
  open(
    `<h2>${esc(p.offersTitle)}</h2>
     <p class="sub">${esc(p.offersText)}</p>
     <div class="offers">${cards}${teaserCard}</div>
     <div class="actions"><button type="button" data-action="refresh">${esc(p.otherClients)}</button>${actions.close ? `<button type="button" data-action="close">${esc(m.ui.close)}</button>` : ""}</div>`,
    handlers,
    actions.close !== null,
  );
  modal().querySelector(".dialog")?.classList.add("wide");
}

const BRANCH_ICON = { facades: "🧱", roofs: "🏠", floors: "🪵", structure: "🏗️", business: "💼" } as const;

/** The Workshop: buy techniques with the money earned. */
export function showWorkshop(career: Career, buy: (id: TechniqueId) => void, focus?: TechniqueId): void {
  const p = m.progress;
  const card = (id: TechniqueId) => {
    const t = technique(id);
    const why = cannotBuy(career, id);
    const state =
      why === "owned"
        ? `<span class="learned">✓ ${esc(p.learned)}</span>`
        : why === "needs"
          ? `<span class="sub">🔒 ${esc(p.needsFirst(m.technique[t.requires!].name))}</span>`
          : why === "money"
            ? `<button type="button" disabled>${esc(p.buy(money(t.price)))}</button><span class="sub">${esc(p.saveMore(money(t.price - careerMoney(career))))}</span>`
            : `<button type="button" class="primary" data-buy="${id}">${esc(p.buy(money(t.price)))}</button>`;
    return `<article class="tech-card ${why ?? "can-buy"}${id === focus ? " focus" : ""}" data-tech="${id}">
        <h4>${esc(m.technique[id].name)}</h4>
        <p>${esc(m.technique[id].text)}</p>
        <div class="tech-state">${state}</div>
      </article>`;
  };
  const branches = BRANCHES.map(
    (b) =>
      `<section class="branch"><h3>${BRANCH_ICON[b]} ${esc(m.branch[b])}</h3><div class="tech-cards">${TECHNIQUES.filter((t) => t.branch === b)
        .map((t) => card(t.id))
        .join("")}</div></section>`,
  ).join("");
  open(
    `<div class="workshop-head"><h2>🔨 ${esc(p.workshop)}</h2><span class="wallet">💰 <b>${money(careerMoney(career))}</b></span></div>
     <p class="sub">${esc(p.workshopText)}</p>
     <div class="workshop">${branches}</div>
     <div class="actions"><button type="button" class="primary" data-action="close">${esc(m.ui.close)}</button></div>`,
    {},
    true,
  );
  const root = modal();
  root.querySelector(".dialog")?.classList.add("wide");
  for (const b of root.querySelectorAll<HTMLButtonElement>("button[data-buy]")) b.addEventListener("click", () => buy(b.dataset.buy as TechniqueId));
  if (focus) root.querySelector(`[data-tech="${focus}"]`)?.scrollIntoView({ block: "center" });
}

/** The client's reaction to a presented design. */
export function showVerdict(client: Client, v: Verdict, onNext: () => void, progress: string[] = []): void {
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
     ${progress.length ? `<ul class="progress-news">${progress.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
     <div class="actions"><button type="button" class="primary" data-action="next">${esc(m.ui.nextClient)}</button></div>`,
    { next: onNext },
    false,
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
