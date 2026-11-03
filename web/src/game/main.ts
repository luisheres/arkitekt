/**
 * Architect: buy a plot, build a house, sell it for a profit.
 *
 * Milestone 2: a 3D viewer for the sample houses from the core model.
 *
 * URL parameters: `?sample=N` starts on sample house N (1-based).
 * `window.architect.captureViews()` returns the four appraisal views as PNG data URLs.
 */

import * as THREE from "three";
import {
  type House,
  type Roof,
  ROOF_MATERIALS,
  ROOF_STYLES,
  WALL_MATERIALS,
  allSamples,
  defaultPrices,
  starterPlots,
} from "../core";
import { type Orbit, applyPreset, attachOrbitControls, placeCamera } from "./camera";
import { type CapturedView, captureViews } from "./capture";
import { renderStatus } from "./hud";
import { buildHouse, buildWorld, disposeHouse } from "./scene";

const STARTING_BUDGET = 60_000;

// --- State --------------------------------------------------------------------------

const plot = starterPlots()[0];
const samples = allSamples(plot);
const prices = defaultPrices();
const params = new URLSearchParams(location.search);
let index = THREE.MathUtils.clamp((Number(params.get("sample")) || 1) - 1, 0, samples.length - 1);
let showGuides = true;

const currentHouse = (): House => samples[index].house;

// --- Rendering ----------------------------------------------------------------------

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const capturesEl = document.querySelector<HTMLElement>("#captures")!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const guides = buildWorld(scene, plot);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

const homeOrbit = (): Orbit => {
  const o: Orbit = { target: new THREE.Vector3(plot.width * 0.5, 2, plot.depth * 0.5), yaw: 0, pitch: 0, distance: 24 };
  applyPreset(o, 1);
  return o;
};
const orbit = homeOrbit();

let houseGroup: THREE.Group | null = null;
let frameRequested = false;

function requestRender(): void {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(() => {
    frameRequested = false;
    placeCamera(camera, orbit);
    renderer.render(scene, camera);
  });
}

/** Rebuild the house meshes and HUD after the model changed. */
function houseChanged(): void {
  if (houseGroup) disposeHouse(houseGroup);
  houseGroup = buildHouse(currentHouse());
  scene.add(houseGroup);
  guides.visible = showGuides;
  renderStatus(statusEl, {
    name: samples[index].name,
    index,
    count: samples.length,
    house: currentHouse(),
    plot,
    budget: STARTING_BUDGET,
    prices,
  });
  requestRender();
}

function resize(): void {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  requestRender();
}

// --- Input --------------------------------------------------------------------------

/** The element after `cur` in `all`, wrapping around. */
function next<T>(all: readonly T[], cur: T): T {
  return all[(Math.max(all.indexOf(cur), 0) + 1) % all.length];
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function roofOf(house: House): Roof {
  house.roof ??= { style: "Gable", pitchDeg: 30, overhang: 0.4, material: "Shingles" };
  return house.roof;
}

/** Keyboard tweaks so the generated geometry can be explored before the real editor exists. */
const editKeys: Record<string, (house: House) => void> = {
  KeyR: (h) => (roofOf(h).style = next(ROOF_STYLES, roofOf(h).style)),
  KeyT: (h) => (roofOf(h).material = next(ROOF_MATERIALS, roofOf(h).material)),
  KeyM: (h) => {
    const material = next(WALL_MATERIALS, h.walls[0]?.material ?? "Wood");
    h.walls.forEach((w) => (w.material = material));
  },
  BracketLeft: (h) => (roofOf(h).pitchDeg = THREE.MathUtils.clamp(roofOf(h).pitchDeg - 5, 5, 65)),
  BracketRight: (h) => (roofOf(h).pitchDeg = THREE.MathUtils.clamp(roofOf(h).pitchDeg + 5, 5, 65)),
  KeyO: (h) => (roofOf(h).overhang = round1(THREE.MathUtils.clamp(roofOf(h).overhang - 0.1, 0, 1.5))),
  KeyP: (h) => (roofOf(h).overhang = round1(THREE.MathUtils.clamp(roofOf(h).overhang + 0.1, 0, 1.5))),
  Minus: (h) => h.walls.forEach((w) => (w.height = round1(THREE.MathUtils.clamp(w.height - 0.1, 2, 5)))),
  Equal: (h) => h.walls.forEach((w) => (w.height = round1(THREE.MathUtils.clamp(w.height + 0.1, 2, 5)))),
};

window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const edit = editKeys[e.code];
  if (edit) {
    edit(currentHouse());
    houseChanged();
  } else if (e.code === "Tab") {
    e.preventDefault();
    index = (index + 1) % samples.length;
    houseChanged();
  } else if (e.code === "KeyG") {
    showGuides = !showGuides;
    houseChanged();
  } else if (e.code === "KeyC") {
    showCaptures(capture());
  } else if (/^Digit[1-4]$/.test(e.code)) {
    applyPreset(orbit, Number(e.code.slice(5)) - 1);
    requestRender();
  }
});

attachOrbitControls(canvas, orbit, requestRender);
window.addEventListener("resize", resize);

// --- Capture ------------------------------------------------------------------------

function capture(): CapturedView[] {
  const views = captureViews(renderer, scene, homeOrbit(), [guides]);
  requestRender();
  return views;
}

function showCaptures(views: CapturedView[]): void {
  const prefix = `house${index + 1}`;
  capturesEl.innerHTML = `<header><strong>Appraisal views</strong><button type="button">Close</button></header>`;
  for (const v of views) {
    const fig = document.createElement("figure");
    fig.innerHTML = `<img alt="${v.name}" src="${v.dataUrl}"><figcaption><a download="${prefix}-${v.name}.png" href="${v.dataUrl}">Download ${v.name}.png</a></figcaption>`;
    capturesEl.append(fig);
  }
  capturesEl.querySelector("button")!.addEventListener("click", () => (capturesEl.hidden = true));
  capturesEl.hidden = false;
}

declare global {
  interface Window {
    architect: { captureViews: () => CapturedView[] };
  }
}
window.architect = { captureViews: capture };

// --- Start --------------------------------------------------------------------------

resize();
houseChanged();
