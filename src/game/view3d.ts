/** The live 3D view of the house on its plot, with an orbit camera. */

import * as THREE from "three";
import { type Orbit, applyPreset, attachOrbitControls, placeCamera } from "./camera";
import { type CapturedView, captureViews } from "./capture";
import { buildHouse, buildWorld, disposeHouse } from "./scene";
import type { Store } from "./store";

/** Vertical field of view, in degrees, on a wide enough screen (and in captures). */
const BASE_FOV = 45;

export class View3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 1000);
  private readonly guides: THREE.Object3D;
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.guides = buildWorld(this.scene, store.plot);
    this.orbit = this.homeOrbit();

    store.subscribe((change) => {
      if (change === "house") this.houseDirty = true;
      this.requestRender();
    });
    attachOrbitControls(canvas, this.orbit, () => this.requestRender());
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  /** The default camera: looking at the plot center from the front-right. */
  private homeOrbit(): Orbit {
    const { plot } = this.store;
    const o: Orbit = { target: new THREE.Vector3(plot.width * 0.5, 2, plot.depth * 0.5), yaw: 0, pitch: 0, distance: 24 };
    applyPreset(o, 1);
    return o;
  }

  showPreset(index: number): void {
    applyPreset(this.orbit, index);
    this.requestRender();
  }

  /** Render the four appraisal views (always from the default camera, without guides). */
  capture(): CapturedView[] {
    this.syncHouse();
    const views = captureViews(this.renderer, this.scene, this.homeOrbit(), [this.guides]);
    this.requestRender();
    return views;
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
    this.houseGroup = buildHouse(this.store.house);
    this.scene.add(this.houseGroup);
  }

  private requestRender(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      if (this.canvas.clientWidth === 0) return; // hidden in plan-only layout
      this.syncHouse();
      this.guides.visible = this.store.showGuides;
      placeCamera(this.camera, this.orbit);
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Re-render after the canvas becomes visible again. */
  refresh(): void {
    this.resize();
  }
}
