/**
 * The sidebar: the studio (money, reputation, tier) or the free-play plot, the client's
 * brief, tools, a way to the roof and facade, costs. Everything else is edited by
 * clicking it.
 */

import {
  House as HouseClass,
  LANGS,
  TIER_STARS,
  Vec2,
  careerMoney,
  careerStars,
  careerTier,
  messages,
  starsToNextTier,
  SETTINGS,
  allPlots,
  type TechniqueId,
} from "../core";
import { plotSize } from "./dialogs";
import { esc, money, renderBrief, renderStatus } from "./hud";
import { lang, m, setLang } from "./i18n";
import type { Store, Tool } from "./store";
import { currentProfile } from "./profiles";
import { el, setLocked } from "./ui";

const TOOLS: { tool: Tool; key: string; icon: string }[] = [
  { tool: "select", key: "V", icon: "👆" },
  { tool: "room", key: "R", icon: "🏠" },
  { tool: "wall", key: "W", icon: "🧱" },
  { tool: "boundary", key: "B", icon: "✂️" },
  { tool: "window", key: "N", icon: "🪟" },
  { tool: "door", key: "D", icon: "🚪" },
  { tool: "stairs", key: "S", icon: "🪜" },
  { tool: "path", key: "P", icon: "🛤️" },
  { tool: "move", key: "M", icon: "✋" },
];

export interface PanelActions {
  capture(): void;
  /** Save the design (asking for a name). */
  save(): void;
  /** Show the saved designs. */
  openDesigns(): void;
  /** Open the pop-up menu for the current selection near (x, y). */
  openMenu(x: number, y: number): void;
  /** Show the clients to choose from. */
  showClients(): void;
  /** Show the Workshop. */
  showWorkshop(): void;
  /** Back to the welcome screen. */
  showMenu(): void;
  /** Who is playing. */
  showPlayers(): void;
  /** The career so far. */
  showCareer(): void;
  /** Save state before the page reloads in another language. */
  beforeReload(): void;
  present(): void;
  showBrief(): void;
}

export class Panel {
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly studio: HTMLElement;
  private readonly clientSection: HTMLElement;
  private readonly clientBox: HTMLElement;
  private readonly clientActions: HTMLElement;
  private readonly brief: HTMLElement;
  private readonly status: HTMLElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly designName: HTMLElement;

  constructor(
    root: HTMLElement,
    private readonly store: Store,
    private readonly actions: PanelActions,
  ) {

    // Header and the studio.
    this.studio = el("div", { className: "studio" });
    this.studio.addEventListener("click", (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action;
      if (action === "workshop") actions.showWorkshop();
      else if (action === "clients") actions.showClients();
      else if (action === "menu") actions.showMenu();
      else if (action === "players") actions.showPlayers();
      else if (action === "career") actions.showCareer();
    });
    this.studio.addEventListener("change", (e) => {
      const select = (e.target as HTMLElement).closest<HTMLSelectElement>("select[data-plot]");
      if (select) store.setFreePlot(select.value);
    });
    const langSelect = el("select", { title: m.ui.language, ariaLabel: m.ui.language }, ...LANGS.map((l) => el("option", { value: l, selected: l === lang }, messages(l).languageName)));
    langSelect.addEventListener("change", () => setLang(langSelect.value as (typeof LANGS)[number], actions.beforeReload));
    this.saveBtn = el("button", { type: "button", title: m.ui.saveTitle }, m.ui.save);
    this.saveBtn.addEventListener("click", actions.save);
    const openBtn = el("button", { type: "button", title: m.ui.openTitle }, m.ui.open);
    openBtn.addEventListener("click", actions.openDesigns);
    this.designName = el("span", { className: "sub design-name" });
    root.append(
      el("header", {}, el("div", { className: "title-row" }, el("h1", {}, m.ui.title), langSelect), this.studio, el("div", { className: "row files" }, this.saveBtn, openBtn, this.designName), el("p", { className: "sub auto-saved" }, m.progress.autoSaved)),
    );

    // The client and their brief.
    this.clientBox = el("div", { className: "client" });
    this.brief = el("div");
    const briefBtn = el("button", { type: "button", title: m.ui.briefTitle }, m.ui.brief);
    briefBtn.addEventListener("click", actions.showBrief);
    const presentBtn = el("button", { type: "button", className: "primary", title: m.ui.presentTitle }, m.ui.present);
    presentBtn.addEventListener("click", actions.present);
    this.clientActions = el("div", { className: "row" }, presentBtn, briefBtn);
    this.clientSection = el("section", { className: "client-section" }, this.clientBox, this.brief, this.clientActions);
    root.append(this.clientSection);

    // Tools.
    const tools = el("div", { className: "tools", role: "toolbar" });
    for (const t of TOOLS) {
      const label = m.ui.tools[t.tool];
      const b = el("button", { type: "button", title: `${label} (${t.key})` }, el("span", { className: "tool-icon", ariaHidden: "true" }, t.icon), label, el("kbd", {}, t.key));
      b.addEventListener("click", () => store.setTool(t.tool));
      b.dataset.title = `${label} (${t.key})`;
      this.toolButtons.set(t.tool, b);
      tools.append(b);
    }
    // The roof is drawn over the whole house: its menu opens from here (or by clicking it in 3D).
    const roofBtn = el("button", { type: "button", className: "opens-menu roof-button", title: m.ui.roofTitle }, el("span", { className: "tool-icon", ariaHidden: "true" }, "🔺"), `${m.ui.roof} ▸`);
    roofBtn.addEventListener("click", (e) => {
      store.select({ kind: "roof" });
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      actions.openMenu(r.right, r.top + 12);
    });
    tools.append(roofBtn);
    root.append(el("section", {}, tools, el("p", { className: "sub hint" }, m.ui.clickToEdit)));

    // History.
    this.undoBtn = el("button", { type: "button", title: m.ui.undoTitle }, m.ui.undo);
    this.redoBtn = el("button", { type: "button", title: m.ui.redoTitle }, m.ui.redo);
    this.undoBtn.addEventListener("click", () => store.undo());
    this.redoBtn.addEventListener("click", () => store.redo());
    const clear = el("button", { type: "button", title: m.ui.clearPlotTitle }, m.ui.clearPlot);
    clear.addEventListener("click", () => store.load(new HouseClass()));
    const captureBtn = el("button", { type: "button", title: m.ui.captureTitle }, m.ui.capture);
    captureBtn.addEventListener("click", actions.capture);
    root.append(el("section", { className: "row" }, this.undoBtn, this.redoBtn, clear, captureBtn));

    // Costs and issues.
    this.status = el("section", { className: "status" });
    this.status.addEventListener("click", (e) => this.selectIssue(e));
    this.status.addEventListener("keydown", (e) => e.key === "Enter" && this.selectIssue(e));
    root.append(el("h2", { className: "status-title" }, m.ui.cost), this.status);

    store.subscribe((change) => this.update(change !== "ui"));
    this.update(true);
  }

  private selectIssue(e: Event): void {
    const learn = (e.target as HTMLElement).closest<HTMLElement>("li[data-technique]");
    if (learn) return this.store.onLocked(learn.dataset.technique as TechniqueId);
    if ((e.target as HTMLElement).closest(".cost-chart-open")) {
      if (e.type === "click") this.store.toggleCosts();
      return;
    }
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-kind], li[data-level]");
    if (!li) return;
    const d = li.dataset;
    if (d.level !== undefined) this.store.setLevel(Number(d.level));
    if (d.kind === "room") this.store.select({ kind: "room", at: new Vec2(Number(d.x), Number(d.y)) });
    else if (d.kind) this.store.select({ kind: d.kind as "wall" | "opening" | "stair" | "label" | "balcony" | "dormer", id: Number(d.id) });
    this.store.setTool("select");
    if (d.kind) {
      const r = li.getBoundingClientRect();
      this.actions.openMenu(r.right + 8, r.top);
    }
  }


  private update(houseChanged: boolean): void {
    const { store } = this;
    const { client } = store;
    this.renderStudio();
    this.clientSection.hidden = store.mode === "free";
    // Between commissions there is no brief yet: just a way to choose the next client.
    const waiting = store.mode === "campaign" && !store.working;
    this.brief.hidden = waiting;
    this.clientActions.hidden = waiting;
    this.clientBox.innerHTML = "";
    if (waiting) {
      const choose = el("button", { type: "button", className: "primary choose-client" }, `📋 ${m.progress.chooseClient}`);
      choose.addEventListener("click", this.actions.showClients);
      this.clientBox.append(el("h2", {}, m.ui.client), el("p", { className: "sub" }, m.progress.noClient), choose);
    } else {
      this.clientBox.append(
        el("h2", {}, m.ui.client),
        el("div", { className: "client-name" }, client.text[lang].name),
        el("div", { className: "sub" }, m.ui.clientPlot(client.plot.name[lang], plotSize(client), money(client.budget))),
      );
    }
    for (const [tool, b] of this.toolButtons) {
      b.classList.toggle("active", tool === store.tool);
      setLocked(b, store.toolLock(tool), b.dataset.title ?? "");
    }
    this.saveBtn.disabled = !store.working;
    this.designName.textContent = store.design?.name ?? "";
    this.undoBtn.disabled = !store.canUndo();
    this.redoBtn.disabled = !store.canRedo();

    if (houseChanged) {
      renderBrief(this.brief, store);
      renderStatus(this.status, store);
    }
  }

  /** Money, reputation and the way to the next tier; or, in free play, the plot. */
  private renderStudio(): void {
    const { store } = this;
    const button = (action: string, label: string, title: string) => `<button type="button" data-action="${action}" title="${esc(title)}">${label}</button>`;
    const menu = button("menu", `🏠 ${esc(m.progress.menu)}`, m.progress.menuTitle);
    const me = currentProfile();
    const player = `<button type="button" class="player-chip" data-action="players" title="${esc(m.progress.changePlayer)}"><span aria-hidden="true">${esc(me.avatar)}</span> ${esc(me.name)}</button>`;
    let html: string;
    if (store.mode === "free") {
      const options = SETTINGS.map(
        (setting) =>
          `<optgroup label="${esc(m.settingName[setting])}">${allPlots()
            .filter((p) => p.setting === setting)
            .map((p) => `<option value="${p.id}"${p.id === store.plot.id ? " selected" : ""}>${esc(p.name[lang])}</option>`)
            .join("")}</optgroup>`,
      ).join("");
      html = `${player}<div class="studio-mode">🎨 ${esc(m.progress.freePlay)}</div>
        <label class="studio-plot">${esc(m.progress.plot)} <select data-plot>${options}</select></label>
        <div class="row">${menu}</div>`;
    } else {
      const { career } = store;
      const stars = careerStars(career);
      const tier = careerTier(career);
      const next = starsToNextTier(career);
      const from = TIER_STARS[tier];
      const progress = next ? (stars - from) / (TIER_STARS[next.tier] - from) : 1;
      html = `${player}<div class="studio-stats">
          <span title="${esc(m.progress.money)}">💰 <b>${money(careerMoney(career))}</b></span>
          <span title="${esc(m.progress.reputation)}">⭐ <b>${stars}</b></span>
        </div>
        <div class="studio-tier">${esc(m.progress.tier(tier, m.tierName[tier]))} <span class="difficulty-tag ${career.difficulty ?? "moderate"}">${esc(m.difficulty[career.difficulty ?? "moderate"].name)}</span></div>
        <div class="tier-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress * 100)}"><span style="width:${Math.round(progress * 100)}%"></span></div>
        <div class="sub">${esc(next ? m.progress.toNextTier(next.needed, m.tierName[next.tier]) : m.progress.topTier)}</div>
        <div class="row">${button("clients", `📋 ${esc(m.progress.clients)}`, m.progress.clientsTitle)}${button("workshop", `🔨 ${esc(m.progress.workshop)}`, m.progress.workshopTitle)}</div>
        <div class="row">${button("career", `📈 ${esc(m.progress.career)}`, m.progress.careerButtonTitle)}${menu}</div>`;
    }
    if (this.studio.innerHTML !== html) this.studio.innerHTML = html;
  }
}
