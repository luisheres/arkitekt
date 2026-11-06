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
import {
  type DesignListItem,
  type Offer,
  isModalOpen,
  onLearn,
  showClient,
  showDesigns,
  showOffers,
  showSaveDialog,
  showVerdict,
  showWelcome,
  showCareer,
  showPlayers,
  showWorkshop,
  toast,
} from "./dialogs";
import { deleteDesign, listDesigns } from "./designs";
import { careerHtml } from "./careerView";
import { CostPanel } from "./costChart";
import { Panel } from "./panel";
import { AVATARS, addProfile, currentProfile, deleteProfile, initProfiles, listProfiles, readPlayerData, renameProfile, switchProfile } from "./profiles";
import { Popover } from "./popover";
import { PlanView } from "./plan";
import { type Mode, Store, type Tool } from "./store";
import { View3D } from "./view3d";

translatePage();
initProfiles(m.progress.defaultPlayer);

/** The mode chosen in this tab, so reloading (e.g. to change language) skips the welcome. */
const MODE_KEY = "architect.session.mode";
const sessionMode = (() => {
  try {
    return sessionStorage.getItem(MODE_KEY) as Mode | null;
  } catch {
    return null;
  }
})();
/** The mode played in this tab, once chosen (or carried on with). */
let chosenMode: Mode | null = sessionMode;
const rememberMode = (mode: Mode) => {
  chosenMode = mode;
  try {
    sessionStorage.setItem(MODE_KEY, mode);
  } catch {
    // Only a convenience.
  }
};
const store = new Store(defaultPrices(), sessionMode ?? "campaign");

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

// --- Campaign: clients, the Workshop, selling designs ---------------------------------

/** The brief of the current client, or the clients to choose from between commissions. */
const meetClient = () => (store.working ? showClient(store.client, true, () => {}) : showClients());

function showClients(): void {
  if (store.mode !== "campaign") return;
  const can = store.abilities;
  const offers: Offer[] = store.offers().map((client) => {
    return {
      client,
      tier: core.clientTier(client),
      story: client.id in core.STORY_TIER,
      needs: core.clientNeeds(client, can),
      maxFee: Math.round((client.feeBudget ?? client.budget) * (core.BASE_FEE_SHARE + can.feePoints / 100) * 1.5),
    };
  });
  const next = core.starsToNextTier(store.career);
  showOffers(offers, next ? { tier: next.tier, stars: next.needed } : null, {
    pick: (client) =>
      showClient(client, false, () => takeClient(client), {
        onBack: showClients,
        needs: core.clientNeeds(client, store.abilities),
      }),
    refresh: () => {
      store.refreshOffers();
      showClients();
    },
  });
}

/** Take a client on; a design in progress for another client is saved first. */
function takeClient(client: core.Client): void {
  if (store.working && store.client.id !== client.id && store.house.walls.length) {
    const name = store.design?.name ?? defaultDesignName();
    if (saveDesign(name, false, true)) toast(m.progress.designSetAside(name));
  }
  store.takeClient(client);
}

function openWorkshop(focus?: core.TechniqueId): void {
  if (store.mode !== "campaign") return;
  showWorkshop(
    store.career,
    (id) => {
      if (!store.buyTechnique(id)) return;
      toast(m.progress.boughtToast(m.technique[id].name));
      openWorkshop(id);
    },
    focus,
  );
}
store.onLocked = (id) => openWorkshop(id);
onLearn(openWorkshop);

/** How many techniques the career could buy now. */
const affordable = (c: core.Career) => core.TECHNIQUES.filter((t) => core.cannotBuy(c, t.id) === null).length;

const present = () => {
  const campaign = store.mode === "campaign";
  const verdict = presentDesign(store.house, store.client, store.prices, m, campaign ? store.abilities : undefined);
  const before = store.career;
  const after = verdict.accepted ? core.completeCommission(before, store.client.id, verdict.fee, verdict.stars) : before;
  const news: string[] = [];
  if (verdict.accepted) {
    news.push(m.progress.starsEarned(verdict.stars, core.careerStars(after)));
    const tier = core.careerTier(after);
    if (tier > core.careerTier(before)) news.push(m.progress.tierUp(tier, m.tierName[tier]));
    if (affordable(after) > affordable(before)) news.push(m.progress.canAfford(affordable(after)));
  }
  showVerdict(
    store.client,
    verdict,
    () =>
      store.completeCommission(verdict.fee, verdict.stars, {
        at: Date.now(),
        tier: core.clientTier(store.client),
        budget: store.client.budget,
        area: store.house.floorArea(),
        cost: core.totalCost(core.estimate(store.house, store.prices)),
        thumbnail: view3d.thumbnail(),
      }),
    showClients,
    news,
  );
};

// --- Welcome ------------------------------------------------------------------------

function showMenu(): void {
  const career = store.campaignCareer();
  const started = career.completed.length > 0 || (career.techniques?.length ?? 0) > 0 || (store.mode === "campaign" && store.working);
  const difficulty = career.difficulty ?? "moderate";
  const progress = started ? { houses: career.completed.length, stars: core.careerStars(career), money: core.careerMoney(career), difficulty } : null;
  const nowPlaying = chosenMode
    ? {
        mode: store.mode,
        text: store.mode === "campaign" ? `${m.progress.campaign} · ${m.difficulty[difficulty].name}` : `${m.progress.freePlay} · ${store.plot.name[lang]}`,
      }
    : undefined;
  showWelcome(progress, {
    dismiss: () => chosenMode ?? rememberMode(store.mode),
    campaign: () => {
      rememberMode("campaign");
      store.setMode("campaign");
      if (!store.working) showClients();
    },
    startOver: (difficulty) => {
      rememberMode("campaign");
      store.startOver(difficulty);
      showClients();
    },
    free: (setting) => {
      rememberMode("free");
      store.setMode("free");
      store.setFreePlot(setting);
    },
    players: showPlayersDialog,
  }, nowPlaying, currentProfile());
}

// --- Players ------------------------------------------------------------------------

/** Start over as another player: their own game, from the welcome screen. */
function becomePlayer(id: string): void {
  store.save();
  switchProfile(id);
  try {
    sessionStorage.removeItem(MODE_KEY);
  } catch {
    // Only a convenience.
  }
  location.reload();
}

function showPlayersDialog(): void {
  const me = currentProfile().id;
  const cards = listProfiles().map((p) => {
    const career = p.id === me ? store.campaignCareer() : readPlayerData<{ career?: core.Career }>(p.id, "game.v2")?.career;
    const houses = career?.completed.length ?? 0;
    return {
      ...p,
      current: p.id === me,
      summary: career && (houses || career.techniques?.length) ? m.progress.playerSummary(houses, core.careerStars(career)) : m.progress.notStarted,
    };
  });
  showPlayers(cards, AVATARS, {
    play: becomePlayer,
    create: (name, avatar) => becomePlayer(addProfile(name, avatar).id),
    edit: (id, name, avatar) => {
      renameProfile(id, name, avatar);
      store.emitUi();
      showPlayersDialog();
    },
    remove: (id) => {
      deleteProfile(id);
      showPlayersDialog();
    },
  });
}
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
    },
    notice,
  );
}

new CostPanel(main, store);

// Saving waits a moment after each change; don't lose that moment when the page closes.
window.addEventListener("pagehide", () => store.save());

new Panel(document.querySelector<HTMLElement>("#sidebar")!, store, {
  save: askToSave,
  openDesigns: () => openDesigns(),
  capture: () => showCaptures(view3d.capture()),
  openMenu,
  beforeReload: () => store.save(),
  showClients,
  showWorkshop: () => openWorkshop(),
  showMenu,
  showPlayers: showPlayersDialog,
  showCareer: () => showCareer(careerHtml(store.career, currentProfile().name)),
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
  close.textContent = "×";
  close.className = "dialog-close";
  close.title = m.ui.close;
  close.setAttribute("aria-label", m.ui.close);
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
} else if (!sessionMode) {
  showMenu();
} else if (store.mode === "campaign" && !store.working) {
  showClients();
}

declare global {
  interface Window {
    architect: { captureViews: () => CapturedView[]; store: Store; plan: PlanView; view3d: View3D; core: typeof core };
  }
}
window.architect = { captureViews: () => view3d.capture(), store, plan, view3d, core };
