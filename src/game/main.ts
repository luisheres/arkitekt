/**
 * Architect: clients bring you a brief and a budget; design a house that meets it and
 * sell them the design.
 *
 * URL parameters: `?sample=N` puts sample house N (1-based) on the current client's plot,
 * for screenshots. `window.architect` exposes the store, the plan and `captureViews()`
 * (the four appraisal views as PNG data URLs) for automation.
 */

import * as core from "../core";
import { allSamples, defaultPrices, presentDesign } from "../core";
import { lang, m, translatePage } from "./i18n";
import type { CapturedView } from "./capture";
import { type DesignListItem, confirmTurnDown, isModalOpen, showClient, showDesigns, showSaveDialog, showVerdict, toast } from "./dialogs";
import { deleteDesign, listDesigns, newDesignId, putDesign } from "./designs";
import { Panel } from "./panel";
import { Popover } from "./popover";
import { PlanView } from "./plan";
import { Store, type Tool } from "./store";
import { View3D } from "./view3d";

translatePage();
const store = new Store(defaultPrices());

// --- Views --------------------------------------------------------------------------

const main = document.querySelector<HTMLElement>("#main")!;
const capturesEl = document.querySelector<HTMLElement>("#captures")!;
const view3d = new View3D(document.querySelector<HTMLCanvasElement>("#view")!, store);
const popover = new Popover(store);
const openMenu = (x: number, y: number) => popover.open(x, y);
const plan = new PlanView(document.querySelector<HTMLElement>("#plan")!, store, openMenu);

// Clicking something in 3D selects it (switching to its floor) and opens its menu.
view3d.onPick = (pick, x, y) => {
  if (!pick) return store.select(null);
  const { house } = store;
  const level =
    pick.kind === "room"
      ? pick.level
      : pick.kind === "wall"
        ? house.wall(pick.id)?.level
        : pick.kind === "opening"
          ? house.levelOf(house.opening(pick.id)?.wall ?? -1)
          : pick.kind === "stair"
            ? house.stair(pick.id)?.level
            : pick.kind === "furniture"
              ? house.furniturePiece(pick.id)?.level
              : undefined;
  if (level !== undefined && level !== store.level) store.setLevel(level);
  store.select(pick.kind === "room" ? { kind: "room", at: pick.at } : pick);
  openMenu(x, y);
};

const meetClient = () => showClient(store.client, store.working, () => store.working || store.startCommission());
const present = () => {
  const verdict = presentDesign(store.house, store.client, store.prices, m);
  showVerdict(store.client, verdict, () => {
    store.completeCommission(verdict.fee, verdict.stars);
    meetClient();
  });
};
// --- Saved designs ------------------------------------------------------------------

const defaultDesignName = () => `${store.client.text[lang].name} – ${new Intl.DateTimeFormat(m.locale, { dateStyle: "medium" }).format(Date.now())}`;

/** Save without asking; reports success or a full browser storage. */
function saveDesign(name: string, asNew: boolean, quiet = false): boolean {
  try {
    store.saveDesign(name, asNew, view3d.thumbnail());
    if (!quiet) toast(m.ui.saved(name));
    return true;
  } catch {
    toast(m.ui.storageFull);
    return false;
  }
}

const askToSave = () => {
  if (store.working) showSaveDialog(defaultDesignName(), store.design, (name, asNew) => saveDesign(name, asNew));
};

function downloadDesign(d: core.SavedDesign): void {
  const url = URL.createObjectURL(new Blob([core.designToFile(d)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${d.name.replace(/[\\/:*?"<>|]+/g, "-")}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openDesigns(notice = ""): void {
  const items: DesignListItem[] = listDesigns().map((d) => {
    const house = core.House.fromJSON(d.house);
    const cost = core.totalCost(core.estimate(house, store.prices));
    return {
      design: d,
      client: core.clientById(d.clientId)?.text[lang].name ?? "",
      facts: `${core.area(m, house.floorArea())} · ${core.money(m, cost)}`,
      sold: store.isSold(d.clientId),
    };
  });
  showDesigns(
    items,
    {
      open: (d) => {
        // Keep the design being worked on: save it before switching.
        if (store.working && store.house.walls.length && store.design?.id !== d.id) saveDesign(store.design?.name ?? defaultDesignName(), false, true);
        if (store.openDesign(d)) toast(d.name);
      },
      remove: (d) => {
        deleteDesign(d.id);
        openDesigns();
      },
      export: downloadDesign,
      import: async (file) => {
        const d = core.parseDesignFile(await file.text(), newDesignId());
        if (!d) return openDesigns(m.ui.importFailed);
        try {
          putDesign(d);
        } catch {
          return openDesigns(m.ui.storageFull);
        }
        openDesigns();
      },
    },
    notice,
  );
}

new Panel(document.querySelector<HTMLElement>("#sidebar")!, store, {
  save: askToSave,
  openDesigns: () => openDesigns(),
  capture: () => showCaptures(view3d.capture()),
  openMenu,
  beforeReload: () => store.save(),
  newClient: () =>
    confirmTurnDown(store.client, () => {
      store.declineClient();
      meetClient();
    }),
  present,
  showBrief: meetClient,
});

function setLayout(layout: string): void {
  main.dataset.layout = layout;
  for (const b of main.querySelectorAll<HTMLButtonElement>(".layout-switch button")) {
    b.classList.toggle("active", b.dataset.layout === layout);
  }
  view3d.refresh();
}
main.querySelector(".layout-switch")!.addEventListener("click", (e) => {
  const layout = (e.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.layout;
  if (layout) setLayout(layout);
});
setLayout("split");

// What the 3D view shows: the roof, each storey, the furniture.
const toggles = document.querySelector<HTMLElement>("#view-toggles")!;
function renderToggles(): void {
  const { house, showRoof, hiddenLevels, showFurniture } = store;
  const row = (key: string, label: string, on: boolean, hint = "") =>
    `<label${hint ? ` title="${hint}"` : ""}><input type="checkbox" data-toggle="${key}"${on ? " checked" : ""}> ${label}</label>`;
  const levels = Array.from({ length: house.levels }, (_, k) => house.levels - 1 - k).map((k) => row(`level:${k}`, m.levelName(k), !hiddenLevels.has(k)));
  const html = `<div class="label">${m.ui.show}</div>${row("roof", `${m.ui.roofToggle} <kbd>H</kbd>`, showRoof, m.ui.roofToggleTitle)}${house.levels > 1 ? levels.join("") : ""}${row("furniture", m.ui.furniture, showFurniture)}`;
  if (toggles.innerHTML !== html) toggles.innerHTML = html;
}
toggles.addEventListener("change", (e) => {
  const key = (e.target as HTMLInputElement).dataset.toggle ?? "";
  if (key === "roof") store.toggleRoof();
  else if (key === "furniture") store.toggleFurniture();
  else if (key.startsWith("level:")) store.toggleLevelShown(Number(key.slice(6)));
  (e.target as HTMLElement).blur();
});
store.subscribe(renderToggles);
renderToggles();

function showCaptures(views: CapturedView[]): void {
  capturesEl.replaceChildren();
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = m.ui.close;
  close.addEventListener("click", () => (capturesEl.hidden = true));
  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = m.ui.appraisalViews;
  header.append(title);
  header.append(close);
  capturesEl.append(header);
  const prefix = store.client.id;
  for (const v of views) {
    const fig = document.createElement("figure");
    const img = Object.assign(document.createElement("img"), { alt: v.name, src: v.dataUrl });
    const link = Object.assign(document.createElement("a"), { href: v.dataUrl, download: `${prefix}-${v.name}.png`, textContent: m.ui.download(`${v.name}.png`) });
    const caption = document.createElement("figcaption");
    caption.append(link);
    fig.append(img, caption);
    capturesEl.append(fig);
  }
  capturesEl.hidden = false;
}

// --- Keyboard -----------------------------------------------------------------------

const TOOL_KEYS: Record<string, Tool> = { KeyV: "select", KeyR: "room", KeyW: "wall", KeyB: "boundary", KeyN: "window", KeyD: "door", KeyS: "stairs" };

window.addEventListener("keydown", (e) => {
  if (isModalOpen()) return;
  const target = e.target as HTMLElement;
  // Sliders keep shortcuts working; text fields and dropdowns need their keys.
  const typing = target.matches("input:not([type=range]), select, textarea");
  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.code === "KeyZ") {
    if (typing && target.matches("input[type=number]")) return; // let the field undo its own text
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if (mod && e.code === "KeyS") {
    e.preventDefault();
    // Saving again updates the design quietly; the first time asks for a name.
    if (store.design && store.working) saveDesign(store.design.name, false);
    else askToSave();
    return;
  }
  if (mod && e.code === "KeyY") {
    e.preventDefault();
    store.redo();
    return;
  }
  if (e.key === "Escape") {
    if (typing) target.blur();
    else if (popover.isOpen) {
      popover.close();
      store.select(null);
    }
    else if (!capturesEl.hidden) capturesEl.hidden = true;
    else if (plan.cancel()) return;
    else if (store.tool !== "select") store.setTool("select");
    else store.select(null);
    return;
  }
  if (typing || mod || e.altKey) return;

  const tool = TOOL_KEYS[e.code];
  if (tool) store.setTool(tool);
  else if (e.key === "Enter") plan.finish();
  else if (e.key === "Delete" || e.key === "Backspace") store.deleteSelection();
  else if (e.code === "KeyF") plan.fit();
  else if (e.code === "KeyG") store.toggleGuides();
  else if (e.code === "KeyH") store.toggleRoof();
  else if (e.code === "KeyC") showCaptures(view3d.capture());
  else if (/^Digit[1-4]$/.test(e.code)) view3d.showPreset(Number(e.code.slice(5)) - 1);
  else return;
  e.preventDefault();
});

// --- Start --------------------------------------------------------------------------

const sampleParam = Number(new URLSearchParams(location.search).get("sample"));
if (sampleParam >= 1) {
  const samples = allSamples(store.plot);
  store.startCommission(samples[Math.min(sampleParam, samples.length) - 1].house);
} else if (!store.working) {
  meetClient();
}

declare global {
  interface Window {
    architect: { captureViews: () => CapturedView[]; store: Store; plan: PlanView; view3d: View3D; core: typeof core };
  }
}
window.architect = { captureViews: () => view3d.capture(), store, plan, view3d, core };
