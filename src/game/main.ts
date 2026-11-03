/**
 * Architect: clients bring you a brief and a budget; design a house that meets it and
 * sell them the design.
 *
 * URL parameters: `?sample=N` puts sample house N (1-based) on the current client's plot,
 * for screenshots. `window.architect` exposes the store, the plan and `captureViews()`
 * (the four appraisal views as PNG data URLs) for automation.
 */

import { allSamples, defaultPrices, presentDesign } from "../core";
import type { CapturedView } from "./capture";
import { isModalOpen, showClient, showVerdict } from "./dialogs";
import { Panel } from "./panel";
import { PlanView } from "./plan";
import { Store, type Tool } from "./store";
import { View3D } from "./view3d";

const store = new Store(defaultPrices());

// --- Views --------------------------------------------------------------------------

const main = document.querySelector<HTMLElement>("#main")!;
const capturesEl = document.querySelector<HTMLElement>("#captures")!;
const view3d = new View3D(document.querySelector<HTMLCanvasElement>("#view")!, store);
const plan = new PlanView(document.querySelector<HTMLElement>("#plan")!, store);

const meetClient = () => showClient(store.client, store.working, () => store.working || store.startCommission());
const present = () => {
  const verdict = presentDesign(store.house, store.client, store.prices);
  showVerdict(store.client, verdict, () => {
    store.completeCommission(verdict.fee, verdict.stars);
    meetClient();
  });
};
new Panel(document.querySelector<HTMLElement>("#sidebar")!, store, {
  capture: () => showCaptures(view3d.capture()),
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

document.querySelector("#roof-toggle")!.addEventListener("click", () => store.toggleRoof());

function showCaptures(views: CapturedView[]): void {
  capturesEl.replaceChildren();
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => (capturesEl.hidden = true));
  const header = document.createElement("header");
  header.innerHTML = "<strong>Appraisal views</strong>";
  header.append(close);
  capturesEl.append(header);
  const prefix = store.client.id;
  for (const v of views) {
    const fig = document.createElement("figure");
    const img = Object.assign(document.createElement("img"), { alt: v.name, src: v.dataUrl });
    const link = Object.assign(document.createElement("a"), { href: v.dataUrl, download: `${prefix}-${v.name}.png`, textContent: `Download ${v.name}.png` });
    const caption = document.createElement("figcaption");
    caption.append(link);
    fig.append(img, caption);
    capturesEl.append(fig);
  }
  capturesEl.hidden = false;
}

// --- Keyboard -----------------------------------------------------------------------

const TOOL_KEYS: Record<string, Tool> = { KeyV: "select", KeyR: "room", KeyW: "wall", KeyN: "window", KeyD: "door" };

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
  if (mod && e.code === "KeyY") {
    e.preventDefault();
    store.redo();
    return;
  }
  if (e.key === "Escape") {
    if (typing) target.blur();
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
    architect: { captureViews: () => CapturedView[]; store: Store; plan: PlanView };
  }
}
window.architect = { captureViews: () => view3d.capture(), store, plan };
