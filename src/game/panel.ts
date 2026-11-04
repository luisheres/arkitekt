/** The sidebar: the client's brief, tools, a way to the roof and facade, costs. Everything else is edited by clicking it. */

import { House as HouseClass, LANGS, Vec2, messages } from "../core";
import { plotSize } from "./dialogs";
import { money, renderBrief, renderStatus } from "./hud";
import { lang, m, setLang } from "./i18n";
import type { Store, Tool } from "./store";
import { el } from "./ui";

const TOOLS: { tool: Tool; key: string }[] = [
  { tool: "select", key: "V" },
  { tool: "room", key: "R" },
  { tool: "wall", key: "W" },
  { tool: "boundary", key: "B" },
  { tool: "window", key: "N" },
  { tool: "door", key: "D" },
  { tool: "stairs", key: "S" },
];

export interface PanelActions {
  capture(): void;
  /** Save the design (asking for a name). */
  save(): void;
  /** Show the saved designs. */
  openDesigns(): void;
  /** Open the pop-up menu for the current selection near (x, y). */
  openMenu(x: number, y: number): void;
  /** Turn the current client down and meet another. */
  newClient(): void;
  /** Save state before the page reloads in another language. */
  beforeReload(): void;
  present(): void;
  showBrief(): void;
}

export class Panel {
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly career: HTMLElement;
  private readonly clientBox: HTMLElement;
  private readonly brief: HTMLElement;
  private readonly status: HTMLElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly designName: HTMLElement;

  constructor(
    root: HTMLElement,
    private readonly store: Store,
    private readonly actions: PanelActions,
  ) {

    // Header and career.
    this.career = el("div", { className: "sub" });
    const langSelect = el("select", { title: m.ui.language, ariaLabel: m.ui.language }, ...LANGS.map((l) => el("option", { value: l, selected: l === lang }, messages(l).languageName)));
    langSelect.addEventListener("change", () => setLang(langSelect.value as (typeof LANGS)[number], actions.beforeReload));
    this.saveBtn = el("button", { type: "button", title: m.ui.saveTitle }, m.ui.save);
    this.saveBtn.addEventListener("click", actions.save);
    const openBtn = el("button", { type: "button", title: m.ui.openTitle }, m.ui.open);
    openBtn.addEventListener("click", actions.openDesigns);
    this.designName = el("span", { className: "sub design-name" });
    root.append(
      el("header", {}, el("div", { className: "title-row" }, el("h1", {}, m.ui.title), langSelect), this.career, el("div", { className: "row files" }, this.saveBtn, openBtn, this.designName)),
    );

    // The client and their brief.
    this.clientBox = el("div", { className: "client" });
    this.brief = el("div");
    const briefBtn = el("button", { type: "button", title: m.ui.briefTitle }, m.ui.brief);
    briefBtn.addEventListener("click", actions.showBrief);
    const presentBtn = el("button", { type: "button", className: "primary", title: m.ui.presentTitle }, m.ui.present);
    presentBtn.addEventListener("click", actions.present);
    const newClientBtn = el("button", { type: "button", className: "new-client", title: m.ui.newClientTitle }, `↻ ${m.ui.newClientButton}`);
    newClientBtn.addEventListener("click", actions.newClient);
    root.append(el("section", { className: "client-section" }, this.clientBox, this.brief, el("div", { className: "row" }, presentBtn, briefBtn, newClientBtn)));

    // Tools.
    const tools = el("div", { className: "tools", role: "toolbar" });
    for (const t of TOOLS) {
      const label = m.ui.tools[t.tool];
      const b = el("button", { type: "button", title: `${label} (${t.key})` }, label, el("kbd", {}, t.key));
      b.addEventListener("click", () => store.setTool(t.tool));
      this.toolButtons.set(t.tool, b);
      tools.append(b);
    }
    root.append(el("section", {}, tools));

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

    // Roof and facade (everything else opens by clicking it in the plan or 3D view).
    const menuFor = (kind: "roof" | "facade") => (e: MouseEvent) => {
      store.select({ kind });
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      actions.openMenu(r.right, r.top + 12);
    };
    const roofBtn = el("button", { type: "button", className: "opens-menu" }, `${m.ui.roof} ▸`);
    roofBtn.addEventListener("click", menuFor("roof"));
    const facadeBtn = el("button", { type: "button", className: "opens-menu" }, `${m.ui.facade} ▸`);
    facadeBtn.addEventListener("click", menuFor("facade"));
    root.append(el("section", { className: "house" }, el("h2", {}, m.ui.house), el("div", { className: "row" }, roofBtn, facadeBtn), el("p", { className: "sub hint" }, m.ui.clickToEdit)));

    // Costs and issues.
    this.status = el("section", { className: "status" });
    this.status.addEventListener("click", (e) => this.selectIssue(e));
    this.status.addEventListener("keydown", (e) => e.key === "Enter" && this.selectIssue(e));
    root.append(el("h2", { className: "status-title" }, m.ui.cost), this.status);

    store.subscribe((change) => this.update(change !== "ui"));
    this.update(true);
  }

  private selectIssue(e: Event): void {
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-kind], li[data-level]");
    if (!li) return;
    const d = li.dataset;
    if (d.level !== undefined) this.store.setLevel(Number(d.level));
    if (d.kind === "room") this.store.select({ kind: "room", at: new Vec2(Number(d.x), Number(d.y)) });
    else if (d.kind) this.store.select({ kind: d.kind as "wall" | "opening" | "stair" | "label", id: Number(d.id) });
    this.store.setTool("select");
    if (d.kind) {
      const r = li.getBoundingClientRect();
      this.actions.openMenu(r.right + 8, r.top);
    }
  }


  private update(houseChanged: boolean): void {
    const { store } = this;
    const { career, client } = store;
    this.career.textContent = m.ui.career(money(career.earnings), career.completed.length);
    this.clientBox.innerHTML = "";
    this.clientBox.append(
      el("h2", {}, m.ui.client),
      el("div", { className: "client-name" }, client.text[lang].name),
      el("div", { className: "sub" }, m.ui.clientPlot(client.plot.name[lang], plotSize(client), money(client.budget))),
    );
    for (const [tool, b] of this.toolButtons) b.classList.toggle("active", tool === store.tool);
    this.saveBtn.disabled = !store.working;
    this.designName.textContent = store.design?.name ?? "";
    this.undoBtn.disabled = !store.canUndo();
    this.redoBtn.disabled = !store.canRedo();

    if (houseChanged) {
      renderBrief(this.brief, store);
      renderStatus(this.status, store);
    }
  }
}
