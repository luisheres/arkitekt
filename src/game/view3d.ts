/** The live 3D view of the house on its plot, with an orbit camera. */

import * as THREE from "three";
import { FLOOR_SLAB_HEIGHT, SEASON_DAY, SIDE_YAW, Vec2, pointInPolygon, sceneryFor, shapedGround, sideEdge, siteLevel, sunPosition } from "../core";
import { type Orbit, type OrbitTween, type Walker, applyPreset, attachOrbitControls, placeCamera, placeWalker, stepTween, tweenOrbit } from "./camera";
import { type CapturedView, captureThumbnail, captureViews } from "./capture";
import { HAZE } from "./landscape";
import { ToonRenderer } from "./toonPost";
import { type Pick, type World, buildHouse, buildShadowCaster, buildWorld, disposeHouse, disposeWorld, setDusk } from "./scene";
import type { Store } from "./store";

/** Vertical field of view, in degrees, on a wide enough screen (and in captures). */
const BASE_FOV = 45;

export class View3D {
  /** Called when something is clicked (not dragged): what it was (or null), and where. */
  onPick: (pick: Pick | null, x: number, y: number) => void = () => {};
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 3000);
  private world: World;
  private readonly toon: ToonRenderer;
  private readonly orbit: Orbit;
  private houseGroup: THREE.Group | null = null;
  private houseDirty = true;
  private frameRequested = false;
  /** Things moving: trees in the wind, clouds, water. Off in automated tests (they wait for stillness). */
  motion = typeof navigator !== "undefined" && !navigator.webdriver;
  private readonly started = performance.now();
  private tween: OrbitTween | null = null;
  /** Walking round at eye height, when not null. */
  walker: Walker | null = null;
  private readonly walkKeys = new Set<string>();
  /** The day playing: the sun moving on its own. */
  playingDay = false;
  /** Called when walking or playing starts or stops (for the buttons). */
  onModeChange: () => void = () => {};

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly store: Store,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // (soft edges come from shadow.radius in this three.js)
    // No tone mapping: cartoon colours are meant to be shown as they are.
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene.background = HAZE;
    // Distant hills fade into a soft haze.
    // The land reaches far beyond this, so it never ends in sight: it fades into the haze,
    // the same colour as the sky at the horizon.
    this.scene.fog = new THREE.Fog(HAZE, 170, 1150);
    // Dark outlines on everything alike: the cartoon look.
    this.toon = new ToonRenderer(this.renderer);
    this.world = buildWorld(store.plot);
    this.scene.add(this.world.root);
    this.orbit = this.homeOrbit();

    // What the house was last built for: rebuild when the house or what is shown changes.
    const shownKey = () => `${store.showRoof}|${store.showFurniture}|${[...store.hiddenLevels].sort().join(",")}`;
    this.updateSun();
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
    attachOrbitControls(canvas, this.orbit, () => {
      this.tween = null;
      this.requestRender();
    });
    // Walking: dragging looks round, the wheel steps forward or back.
    canvas.addEventListener("pointermove", (e) => {
      if (!this.walker || !(e.buttons & 1)) return;
      this.walker.yaw -= e.movementX * 0.005;
      this.walker.pitch = THREE.MathUtils.clamp(this.walker.pitch - e.movementY * 0.005, -1.2, 1.2);
      this.requestRender();
    });
    canvas.addEventListener("wheel", (e) => {
      if (!this.walker) return;
      this.walkStep(e.deltaY > 0 ? -0.6 : 0.6, 0);
    });
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
  /** The height of the land under a point (for keeping the camera out of hillsides). */
  private readonly ground = (x: number, z: number): number => sceneryFor(this.store.plot).height(x, z);

  private homeOrbit(): Orbit {
    const { plot } = this.store;
    // The views look at the house from the side the road comes in.
    const baseYaw = SIDE_YAW[plot.access.side] - Math.PI;
    const o: Orbit = { target: new THREE.Vector3(plot.width * 0.5, 2, plot.depth * 0.5), yaw: 0, pitch: 0, distance: 24, baseYaw };
    applyPreset(o, 1);
    return o;
  }

  /** What is under the page point (x, y), if anything pickable. */
  pick(x: number, y: number): Pick | null {
    if (!this.houseGroup) return null;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    placeCamera(this.camera, this.orbit, this.ground);
    this.camera.updateMatrixWorld();
    ray.setFromCamera(ndc, this.camera);
    for (const hit of ray.intersectObject(this.houseGroup, true)) {
      const pick = hit.object.userData.pick as Pick | undefined;
      if (pick) return pick;
    }
    return null;
  }

  showPreset(index: number): void {
    if (this.walker) this.stopWalking();
    const to = { ...this.orbit, target: this.orbit.target.clone() };
    applyPreset(to, index);
    this.tween = tweenOrbit(this.orbit, to, this.now());
    this.requestRender();
  }

  private now(): number {
    return (performance.now() - this.started) / 1000;
  }

  /** Start walking round at eye height, from the middle of the plot's road side; or stop. */
  toggleWalking(): void {
    if (this.walker) return this.stopWalking();
    const { plot } = this.store;
    const e = sideEdge(plot, plot.access.side);
    const at = e.mid.add(e.out.scale(-3));
    this.walker = { at: new THREE.Vector2(at.x, at.y), yaw: Math.atan2(e.out.x, e.out.y), pitch: -0.05 };
    this.onModeChange();
    this.requestRender();
  }

  stopWalking(): void {
    this.walker = null;
    this.walkKeys.clear();
    this.onModeChange();
    this.requestRender();
  }

  /** Arrow keys or WASD while walking; false when not walking. */
  walkKey(code: string, down: boolean): boolean {
    if (!this.walker) return false;
    if (code === "Escape") {
      this.stopWalking();
      return true;
    }
    if (!/^(Arrow(Up|Down|Left|Right)|Key[WASD])$/.test(code)) return false;
    if (down) this.walkKeys.add(code);
    else this.walkKeys.delete(code);
    this.requestRender();
    return true;
  }

  /** Move the walker forward (and to the side), in metres. */
  private walkStep(forward: number, side: number): void {
    const w = this.walker;
    if (!w) return;
    const f = new THREE.Vector2(-Math.sin(w.yaw), -Math.cos(w.yaw));
    const r = new THREE.Vector2(Math.cos(w.yaw), -Math.sin(w.yaw));
    w.at.addScaledVector(f, forward).addScaledVector(r, side);
    this.requestRender();
  }

  /** The floor under the walker: the house's floor inside it, the ground outside. */
  private floorAt(x: number, y: number): number {
    const { house, plot } = this.store;
    const level = siteLevel(house, plot);
    const fp = house.footprint(0);
    if (fp.ok && pointInPolygon(new Vec2(x, y), fp.value)) return level + FLOOR_SLAB_HEIGHT;
    return shapedGround(house, plot)(x, y);
  }

  /** Let the sun run through the day on its own, or stop it. */
  togglePlayingDay(): void {
    this.playingDay = !this.playingDay;
    this.lastTick = this.now();
    this.onModeChange();
    this.requestRender();
  }
  private lastTick = 0;

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

  private shadowCaster: THREE.Group | null = null;

  private syncHouse(): void {
    if (!this.houseDirty) return;
    this.houseDirty = false;
    if (this.houseGroup) disposeHouse(this.houseGroup);
    if (this.shadowCaster) disposeHouse(this.shadowCaster);
    const { house, showRoof, hiddenLevels, showFurniture } = this.store;
    const options = { roof: showRoof, hidden: hiddenLevels, furniture: showFurniture, plot: this.store.plot };
    this.houseGroup = buildHouse(house, options);
    this.scene.add(this.houseGroup);
    // The roof and storeys hidden from view still cast their shadows.
    this.shadowCaster = buildShadowCaster(house, options);
    if (this.shadowCaster) this.scene.add(this.shadowCaster);
  }

  /** The sun where the store says, and windows lit at dusk. */
  private updateSun(): void {
    const pos = sunPosition(this.store.sunHour, SEASON_DAY[this.store.season]);
    this.world.setSun(pos);
    setDusk(1 - THREE.MathUtils.smoothstep(pos.elevation, -3, 6));
  }

  private requestRender(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      if (this.canvas.clientWidth === 0) return; // hidden in plan-only layout
      this.syncHouse();
      const t = this.now();
      const dt = Math.min(0.1, t - this.lastTick);
      this.lastTick = t;
      if (this.playingDay) {
        // Two hours a second; round again after dusk.
        const next = this.store.sunHour + dt * 2;
        this.store.setSun(next > 22 ? 4 : next);
      }
      this.world.guides.visible = this.store.showGuides && !this.walker;
      this.updateSun();
      if (this.motion) this.world.update(t);
      if (this.tween && !stepTween(this.orbit, this.tween, t)) this.tween = null;
      if (this.walker) {
        const k = this.walkKeys;
        const speed = 3.5 * dt;
        const fwd = (k.has("ArrowUp") || k.has("KeyW") ? 1 : 0) - (k.has("ArrowDown") || k.has("KeyS") ? 1 : 0);
        const turn = (k.has("ArrowLeft") ? 1 : 0) - (k.has("ArrowRight") ? 1 : 0);
        const side = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
        this.walker.yaw += turn * dt * 1.6;
        if (fwd || side) this.walkStep(fwd * speed, side * speed);
        placeWalker(this.camera, this.walker, this.floorAt(this.walker.at.x, this.walker.at.y));
      } else placeCamera(this.camera, this.orbit, this.ground);
      this.toon.render(this.scene, this.camera);
      // Keep going while anything moves.
      if (this.motion || this.tween || this.playingDay || this.walkKeys.size) this.requestRender();
    });
  }

  /** Re-render after the canvas becomes visible again. */
  refresh(): void {
    this.resize();
  }
}
