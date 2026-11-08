/**
 * Orbit camera: left-drag to rotate, right-drag to pan, wheel to zoom.
 * Number keys 1-4 jump to the fixed views that the appraiser will also use.
 */

import * as THREE from "three";

export interface Orbit {
  target: THREE.Vector3;
  /** Rotation around the vertical axis. 0 looks from +Z towards the target; PI looks from -Z (the street). */
  yaw: number;
  /** Angle above the horizon. */
  pitch: number;
  distance: number;
  /** Turns the fixed views, so "front" is the side the road comes from. */
  baseYaw?: number;
}

/** The fixed viewpoints used for screenshots: front, front-right ¾, back, front-left ¾. */
export const PRESET_VIEWS = [
  { name: "front", yaw: Math.PI, pitch: 0.18 },
  { name: "front-right", yaw: Math.PI * 0.75, pitch: 0.3 },
  { name: "back", yaw: 0, pitch: 0.18 },
  { name: "front-left", yaw: -Math.PI * 0.75, pitch: 0.3 },
] as const;

export function applyPreset(orbit: Orbit, index: number): void {
  const view = PRESET_VIEWS[index % PRESET_VIEWS.length];
  orbit.yaw = view.yaw + (orbit.baseYaw ?? 0);
  orbit.pitch = view.pitch;
}

/** Place `camera` according to the orbit parameters. */
/**
 * Put the camera on its orbit, looking at the target. With `ground` (the height of the
 * land at a point), the camera never sinks into a hillside, and rises until the land
 * between it and the house no longer blocks the view.
 */
export function placeCamera(camera: THREE.Camera, orbit: Orbit, ground?: (x: number, z: number) => number): void {
  const { distance: d, yaw, pitch } = orbit;
  const offset = new THREE.Vector3(d * Math.cos(pitch) * Math.sin(yaw), d * Math.sin(pitch), d * Math.cos(pitch) * Math.cos(yaw));
  camera.position.copy(orbit.target).add(offset);
  if (ground) {
    const pos = camera.position;
    pos.y = Math.max(pos.y, ground(pos.x, pos.z) + 2.5);
    // Look along the line of sight; where the land rises above it, lift the camera so the
    // line clears it (a point a share t of the way to the target moves up by 1 - t).
    for (let t = 0.05; t < 0.95; t += 0.05) {
      const x = pos.x + (orbit.target.x - pos.x) * t;
      const z = pos.z + (orbit.target.z - pos.z) * t;
      const y = pos.y + (orbit.target.y - pos.y) * t;
      const above = ground(x, z) + 1.5 - y;
      if (above > 0) pos.y += above / (1 - t);
    }
  }
  camera.up.set(0, 1, 0);
  camera.lookAt(orbit.target);
}

/** Wire mouse input on `el` to `orbit`. `onChange` runs after every change. */
export function attachOrbitControls(el: HTMLElement, orbit: Orbit, onChange: () => void): void {
  let dragButton: number | null = null;

  el.addEventListener("contextmenu", (e) => e.preventDefault());
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    dragButton = e.button;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointerup", (e) => {
    if (e.button === dragButton) dragButton = null;
  });
  el.addEventListener("pointercancel", () => (dragButton = null));
  el.addEventListener("pointermove", (e) => {
    if (dragButton === null) return;
    const [dx, dy] = [e.movementX, e.movementY];
    if (dx === 0 && dy === 0) return;
    if (dragButton === 0) {
      orbit.yaw -= dx * 0.006;
      orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * 0.006, 0.02, Math.PI / 2 - 0.05);
    } else {
      // Pan in the ground plane, relative to where the camera is looking.
      const right = new THREE.Vector3(Math.cos(orbit.yaw), 0, -Math.sin(orbit.yaw));
      const forward = new THREE.Vector3(-Math.sin(orbit.yaw), 0, -Math.cos(orbit.yaw));
      const speed = orbit.distance * 0.0015;
      orbit.target.addScaledVector(right, -dx * speed).addScaledVector(forward, dy * speed);
    }
    onChange();
  });
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      // Positive `notches` zooms in, like scrolling up. Browsers report one wheel notch
      // as ~100 px or 3 lines; each notch zooms by 10%.
      const notches = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? -e.deltaY / 3 : -e.deltaY / 100;
      const factor = THREE.MathUtils.clamp(1 - notches * 0.1, 0.5, 1.5);
      orbit.distance = THREE.MathUtils.clamp(orbit.distance * factor, 5, 120);
      onChange();
    },
    { passive: false },
  );
}
