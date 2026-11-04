/** The live 3D view of the house on its plot, with an orbit camera. */

import * as THREE from "three";
import { type Orbit, applyPreset, attachOrbitControls, placeCamera } from "./camera";
import { type CapturedView, captureThumbnail, captureViews } from "./capture";
import { HAZE } from "./landscape";
import { ToonRenderer } from "./toonPost";
import { type Pick, type World, buildHouse, buildWorld, disposeHouse, disposeWorld } from "./scene";
import type { Store } from "./store";

/** Vertical field of view, in degrees, on a wide enough screen (and in captures). */
const BASE_FOV = 45;

export class View3D {
  /** Called when something is clicked (not dragged): what it was (or null), and where. */
  onPick: (pick: Pick | null, x: number, y: number) => void = () => {};
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 1000);
  private world: World;
  private readonly toon: ToonRenderer;
  private readonly orbit: Orbit;
  private houseGroup: THREE.Group | null = null;
  private houseDirty = true;
  private frameRequested = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly store: Store,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // No tone mapping: cartoon colours are meant to be shown as they are.
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene.background = HAZE;
    // Distant hills fade into a soft haze.
    this.scene.fog = new THREE.Fog(HAZE, 150, 480);
    // Dark outlines on everything alike: the cartoon look.
    this.toon = new ToonRenderer(this.renderer);
    this.world = buildWorld(store.plot);
    this.scene.add(this.world.root);
    this.orbit = this.homeOrbit();

    // What the house was last built for: rebuild when the house or what is shown changes.
    const shownKey = () => `${store.showRoof}|${store.showFurniture}|${[...store.hiddenLevels].sort().join(",")}`;
    let shown = shownKey();
    store.subscribe((change) => {
      if (change !== "ui" || shownKey() !== shown) this.houseDirty = true;
      shown = shownKey();
      if (change === "client") {
        // A new client means a new plot.
        disposeWorld(this.world);
        this.world = buildWorld(store.plot);
        this.scene.add(this.world.root);
        Object.assign(this.orbit, this.homeOrbit());
      }
      this.requestRender();
    });
    attachOrbitControls(canvas, this.orbit, () => this.requestRender());
    // A click without dragging picks what is under the pointer (left or right button).
    let down: { x: number; y: number; button: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY, button: e.button }));
    canvas.addEventListener("pointerup", (e) => {
      if (down && down.button === e.button && (e.button === 0 || e.button === 2) && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        this.onPick(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
      }
      down = null;
    });
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  /** The default camera: looking at the plot center from the front-right. */
  private homeOrbit(): Orbit {
    const { plot } = this.store;
    const o: Orbit = { target: new THREE.Vector3(plot.width * 0.5, 2, plot.depth * 0.5), yaw: 0, pitch: 0, distance: 24 };
    applyPreset(o, 1);
    return o;
  }

  /** What is under the page point (x, y), if anything pickable. */
  pick(x: number, y: number): Pick | null {
    if (!this.houseGroup) return null;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    placeCamera(this.camera, this.orbit);
    this.camera.updateMatrixWorld();
    ray.setFromCamera(ndc, this.camera);
    for (const hit of ray.intersectObject(this.houseGroup, true)) {
      const pick = hit.object.userData.pick as Pick | undefined;
      if (pick) return pick;
    }
    return null;
  }

  showPreset(index: number): void {
    applyPreset(this.orbit, index);
    this.requestRender();
  }

  /** Render the four appraisal views (always from the default camera, without guides). */
  capture(): CapturedView[] {
    return this.withWholeHouse(() => captureViews(this.renderer, this.scene, this.homeOrbit(), [this.world.guides], (sc, c) => this.toon.render(sc, c as THREE.PerspectiveCamera)));
  }

  /** A small picture of the whole house, for saved designs. */
  thumbnail(): string {
    return this.withWholeHouse(() => captureThumbnail(this.renderer, this.scene, this.homeOrbit(), [this.world.guides], (sc, c) => this.toon.render(sc, c as THREE.PerspectiveCamera)));
  }

  /** Render with the whole house and its roof, whatever the player is viewing. */
  private withWholeHouse<T>(render: () => T): T {
    this.syncHouse();
    const full = buildHouse(this.store.house, { roof: true, furniture: true });
    const shown = this.houseGroup;
    if (shown) shown.visible = false;
    this.scene.add(full);
    try {
      return render();
    } finally {
      disposeHouse(full);
      if (shown) shown.visible = true;
      this.requestRender();
    }
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep at least the horizontal view of a 16:10 frame, so a narrow pane (the split
    // layout) shows the whole house instead of cropping it.
    const minAspect = 1.6;
    const halfFov = THREE.MathUtils.degToRad(BASE_FOV / 2);
    this.camera.fov = w / h >= minAspect ? BASE_FOV : THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(halfFov) * minAspect) / (w / h)));
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private syncHouse(): void {
    if (!this.houseDirty) return;
    this.houseDirty = false;
    if (this.houseGroup) disposeHouse(this.houseGroup);
    const { house, showRoof, hiddenLevels, showFurniture } = this.store;
    this.houseGroup = buildHouse(house, { roof: showRoof, hidden: hiddenLevels, furniture: showFurniture });
    this.scene.add(this.houseGroup);
  }

  private requestRender(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      if (this.canvas.clientWidth === 0) return; // hidden in plan-only layout
      this.syncHouse();
      this.world.guides.visible = this.store.showGuides;
      placeCamera(this.camera, this.orbit);
      this.toon.render(this.scene, this.camera);
    });
  }

  /** Re-render after the canvas becomes visible again. */
  refresh(): void {
    this.resize();
  }
}
