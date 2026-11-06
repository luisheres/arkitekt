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
  SETTINGS,
  allPlots,
  technique,
} from "../core";
import { esc, money } from "./hud";
import { lang, m } from "./i18n";

const modal = (): HTMLElement => document.querySelector<HTMLElement>("#modal")!;

/** Closes the dialog on screen (without its dismiss handler), when there is one. */
let closeCurrent: (() => void) | null = null;

/**
 * Show `html` in the modal; buttons with `data-action` call the matching handler and close
 * it. Every dialog has a × in its corner; it and Escape close the dialog and then call
 * `onDismiss` (for dialogs where closing should still do something, like getting paid).
 */
function open(html: string, actions: Record<string, () => void>, onDismiss: () => void = () => {}): void {
  closeCurrent?.();
  const root = modal();
  root.innerHTML = `<div class="dialog" role="dialog" aria-modal="true"><button type="button" class="dialog-close" aria-label="${esc(m.ui.close)}" title="${esc(m.ui.close)}">×</button>${html}</div>`;
  root.hidden = false;
  const close = () => {
    root.hidden = true;
    root.innerHTML = "";
    document.removeEventListener("keydown", onKey, true);
    closeCurrent = null;
  };
  closeCurrent = close;
  const dismiss = () => {
    close();
    onDismiss();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      dismiss();
    }
  };
  document.addEventListener("keydown", onKey, true);
  root.querySelector(".dialog-close")!.addEventListener("click", dismiss);
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

/** The career page (built by careerView). */
export function showCareer(html: string): void {
  open(`${html}<div class="actions"><button type="button" class="primary" data-action="close">${esc(m.ui.close)}</button></div>`, {});
  const dialog = modal().querySelector<HTMLElement>(".dialog")!;
  dialog.classList.add("wide", "career");
  // Start at the top (the Close button at the bottom would otherwise scroll there).
  dialog.querySelector<HTMLButtonElement>(".dialog-close")?.focus();
  dialog.scrollTop = 0;
}

// --- Players ---------------------------------------------------------------------------

export interface PlayerCard {
  id: string;
  name: string;
  avatar: string;
  summary: string;
  current: boolean;
}

export interface PlayerActions {
  play(id: string): void;
  create(name: string, avatar: string): void;
  edit(id: string, name: string, avatar: string): void;
  remove(id: string): void;
}

/** Who is playing: switch to another player, add one, or edit or remove one. */
export function showPlayers(players: readonly PlayerCard[], avatars: readonly string[], actions: PlayerActions): void {
  const p = m.progress;
  const again = () => showPlayers(players, avatars, actions);
  const cards = players
    .map(
      (pl, i) => `<li class="player-card${pl.current ? " current" : ""}">
          <span class="player-avatar" aria-hidden="true">${esc(pl.avatar)}</span>
          <span class="player-info"><strong>${esc(pl.name)}</strong><span class="sub">${esc(pl.summary)}</span></span>
          <span class="player-actions">
            ${pl.current ? `<span class="tag">${esc(p.playingNow)}</span>` : `<button type="button" class="primary" data-action="play-${i}">${esc(p.play)}</button>`}
            <button type="button" data-action="edit-${i}">${esc(p.edit)}</button>
            ${pl.current ? "" : `<button type="button" class="danger" data-action="remove-${i}">${esc(p.deletePlayer)}</button>`}
          </span>
        </li>`,
    )
    .join("");
  const handlers: Record<string, () => void> = {
    new: () => playerForm(p.newPlayer, "", avatars[players.length % avatars.length], avatars, again, actions.create),
  };
  players.forEach((pl, i) => {
    handlers[`play-${i}`] = () => actions.play(pl.id);
    handlers[`edit-${i}`] = () => playerForm(p.edit, pl.name, pl.avatar, avatars, again, (name, avatar) => actions.edit(pl.id, name, avatar));
    handlers[`remove-${i}`] = () =>
      open(
        `<h2>${esc(p.deletePlayer)}: ${esc(pl.name)}</h2>
         <p>${esc(p.deletePlayerText(pl.name))}</p>
         <div class="actions"><button type="button" data-action="cancel" data-focus>${esc(p.back)}</button><button type="button" class="primary danger-primary" data-action="confirm">${esc(p.deletePlayer)}</button></div>`,
        { cancel: again, confirm: () => actions.remove(pl.id) },
      );
  });
  open(
    `<h2>${esc(p.whoIsPlaying)}</h2>
     <ul class="player-list">${cards}</ul>
     <div class="actions"><button type="button" class="primary" data-action="new">＋ ${esc(p.newPlayer)}</button></div>`,
    handlers,
  );
}

/** A player's name and picture. */
function playerForm(title: string, name: string, avatar: string, avatars: readonly string[], back: () => void, done: (name: string, avatar: string) => void): void {
  const p = m.progress;
  const options = avatars
    .map((a, i) => `<label class="avatar-choice"><input type="radio" name="avatar" value="${esc(a)}"${a === avatar ? " checked" : ""} aria-label="${i + 1}"><span>${esc(a)}</span></label>`)
    .join("");
  open(
    `<h2>${esc(title)}</h2>
     <label class="field-label">${esc(p.playerName)}<input type="text" class="player-name" maxlength="24" value="${esc(name)}" autocomplete="off"></label>
     <div class="field-label">${esc(p.pickAvatar)}</div>
     <div class="avatar-choices">${options}</div>
     <div class="actions"><button type="button" data-action="back">← ${esc(p.back)}</button><button type="button" class="primary" data-action="done" disabled>${esc(name ? m.ui.save : p.create)}</button></div>`,
    {
      back,
      // (The dialog is gone by now: use what was picked while it was open.)
      done: () => done(input.value.trim(), picked),
    },
  );
  const root = modal();
  let picked = avatar;
  for (const r of root.querySelectorAll<HTMLInputElement>("input[name=avatar]")) r.addEventListener("change", () => (picked = r.value));
  const input = root.querySelector<HTMLInputElement>("input.player-name")!;
  const ok = root.querySelector<HTMLButtonElement>('button[data-action="done"]')!;
  const check = () => (ok.disabled = input.value.trim().length === 0);
  input.addEventListener("input", check);
  input.addEventListener("keydown", (e) => e.key === "Enter" && !ok.disabled && ok.click());
  check();
  input.focus();
}

// --- Welcome, clients and the Workshop --------------------------------------------------

export interface WelcomeActions {
  /** Closed without choosing: carry on as before. */
  dismiss(): void;
  /** Change or add players. */
  players(): void;
  /** Continue the campaign in progress. */
  campaign(): void;
  /** Start a new campaign at a difficulty. */
  startOver(difficulty: Difficulty): void;
  /** Free play on a plot. */
  free(plotId: string): void;
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
    actions
  );
  modal().querySelector(".dialog")?.classList.add("wide");
  modal().querySelector<HTMLButtonElement>(".difficulty.moderate")?.focus();
}

export const SETTING_ICON: Record<Setting, string> = {
  suburban: "🏘️",
  town: "🏙️",
  lakeside: "🏞️",
  riverside: "🛶",
  forest: "🌲",
  farmland: "🌾",
  seaside: "🏖️",
  hillside: "⛰️",
  mountain: "🏔️",
};

/** The first thing on screen: campaign or free play. */
export function showWelcome(
  progress: { houses: number; stars: number; money: number; difficulty: Difficulty } | null,
  actions: WelcomeActions,
  /** What is being played now, when coming back from the game ("Campaign · Moderate"). */
  nowPlaying: { mode: "campaign" | "free"; text: string } | undefined,
  player: { name: string; avatar: string },
): void {
  const again = () => showWelcome(progress, actions, nowPlaying, player);
  const p = m.progress;
  const current = (mode: string) => (nowPlaying?.mode === mode ? ` current" aria-current="true` : "");
  open(
    `<div class="welcome">
       <div class="welcome-art" aria-hidden="true">🏡</div>
       <h2>${esc(p.welcomeTitle)}</h2>
       <p class="sub">${esc(p.welcomeText)}</p>
       <p class="playing-as"><span aria-hidden="true">${esc(player.avatar)}</span> ${esc(p.playingAs(player.name))} · <button type="button" class="link" data-action="players">${esc(p.changePlayer)}</button></p>
       ${nowPlaying ? `<p class="now-playing">▶ ${esc(p.nowPlaying(nowPlaying.text))}</p>` : ""}
       <div class="mode-cards">
         <button type="button" class="mode-card campaign${current("campaign")}" data-action="campaign">
           <span class="mode-icon" aria-hidden="true">🏆</span>
           <strong>${esc(p.campaign)}</strong>
           <span>${esc(p.campaignText)}</span>
           ${progress ? `<span class="continue">${esc(p.continueCampaign(progress.houses, progress.stars, money(progress.money)))} · ${DIFFICULTY_ICON[progress.difficulty]} ${esc(m.difficulty[progress.difficulty].name)}</span>` : ""}
         </button>
         <button type="button" class="mode-card free${current("free")}" data-action="free">
           <span class="mode-icon" aria-hidden="true">🎨</span>
           <strong>${esc(p.freePlay)}</strong>
           <span>${esc(p.freePlayText)}</span>
         </button>
       </div>
       ${progress ? `<div class="actions start-over"><button type="button" class="link" data-action="startOver">${esc(p.startOver)}</button></div>` : ""}
       <p class="version">${esc(p.version(__APP_VERSION__))}</p>
     </div>`,
    {
      campaign: () => (progress ? actions.campaign() : chooseDifficulty(again, actions.startOver)),
      startOver: () =>
        open(
          `<h2>${esc(p.startOverTitle)}</h2>
           <p>${esc(p.startOverText)}</p>
           <div class="actions"><button type="button" data-action="cancel" data-focus>${esc(p.back)}</button><button type="button" class="primary danger-primary" data-action="confirm">${esc(p.startOver)}</button></div>`,
          { cancel: again, confirm: () => chooseDifficulty(again, actions.startOver) }
        ),
      free: () => choosePlot(again, actions.free),
      players: actions.players,
    },
    actions.dismiss,
  );
  modal().querySelector(".dialog")?.classList.add("wide");
}

/** Free play: pick a plot to build on, from every kind of surroundings. */
function choosePlot(back: () => void, pick: (id: string) => void): void {
  const groups = SETTINGS.map((setting) => {
    const cards = allPlots()
      .filter((p) => p.setting === setting)
      .map(
        (plot) =>
          `<button type="button" class="plot-choice" data-action="plot-${plot.id}">
             <strong>${esc(plot.name[lang])}</strong>
             <span class="sub">${num(m, plot.width)} × ${num(m, plot.depth)} m</span>
           </button>`,
      )
      .join("");
    return `<section class="plot-group"><h3>${SETTING_ICON[setting]} ${esc(m.settingName[setting])}</h3><div class="plot-choices">${cards}</div></section>`;
  }).join("");
  const actions: Record<string, () => void> = { back };
  for (const plot of allPlots()) actions[`plot-${plot.id}`] = () => pick(plot.id);
  open(
    `<h2>${esc(m.progress.choosePlot)}</h2>
     <div class="plot-groups">${groups}</div>
     <div class="actions"><button type="button" data-action="back">← ${esc(m.progress.back)}</button></div>`,
    actions,
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
  const handlers: Record<string, () => void> = { refresh: actions.refresh };
  offers.forEach((o, i) => (handlers[`pick-${i}`] = () => actions.pick(o.client)));
  open(
    `<h2>${esc(p.offersTitle)}</h2>
     <p class="sub">${esc(p.offersText)}</p>
     <div class="offers">${cards}${teaserCard}</div>
     <div class="actions"><button type="button" data-action="refresh">${esc(p.otherClients)}</button></div>`,
    handlers,
  );
  modal().querySelector(".dialog")?.classList.add("wide");
}

const BRANCH_ICON = { facades: "🧱", roofs: "🏠", floors: "🪵", interiors: "🎨", garden: "🌳", structure: "🏗️", business: "💼" } as const;

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
    {}
  );
  const root = modal();
  root.querySelector(".dialog")?.classList.add("wide");
  for (const b of root.querySelectorAll<HTMLButtonElement>("button[data-buy]")) b.addEventListener("click", () => buy(b.dataset.buy as TechniqueId));
  if (focus) root.querySelector(`[data-tech="${focus}"]`)?.scrollIntoView({ block: "center" });
}

/**
 * The client's reaction to a presented design. When they buy it, `onSold` books the sale
 * (also when the dialog is just closed) and `onNext` goes on to the next clients.
 */
export function showVerdict(client: Client, v: Verdict, onSold: () => void, onNext: () => void, progress: string[] = []): void {
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
    {
      next: () => {
        onSold();
        onNext();
      },
    },
    onSold,
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
    { save: () => onSave(name.trim() || defaultName, false), saveNew: () => onSave(name.trim() || defaultName, true) }
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
       <button type="button" class="primary" data-action="close" data-focus>${esc(m.ui.close)}</button>
     </div>`,
    {}
  );
  const root = modal();
  root.querySelectorAll<HTMLButtonElement>("button[data-cmd]").forEach((b) =>
    b.addEventListener("click", () => {
      const d = items[Number(b.dataset.i)].design;
      if (b.dataset.cmd === "open") {
        root.hidden = true;
        root.innerHTML = "";
        actions.open(d);
      } else actions.remove(d);
    }),
  );
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
