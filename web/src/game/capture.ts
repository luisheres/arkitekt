/**
 * Render the current house from the four preset views into PNG images. This is the image
 * set the AI appraiser will receive, so it uses a fixed size and camera, without guides
 * or HUD, regardless of where the player has moved the camera.
 */

import * as THREE from "three";
import { type Orbit, PRESET_VIEWS, applyPreset, placeCamera } from "./camera";

/** Size of the captured images. */
export const CAPTURE_SIZE = { width: 1280, height: 800 } as const;

export interface CapturedView {
  name: string;
  /** `data:image/png;base64,...` */
  dataUrl: string;
}

export function captureViews(renderer: THREE.WebGLRenderer, scene: THREE.Scene, home: Orbit, hide: THREE.Object3D[]): CapturedView[] {
  const { width, height } = CAPTURE_SIZE;
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  const orbit: Orbit = { ...home, target: home.target.clone() };

  const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const pixels = new Uint8Array(width * height * 4);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);

  const wasVisible = hide.map((o) => o.visible);
  hide.forEach((o) => (o.visible = false));
  try {
    return PRESET_VIEWS.map((view, i) => {
      applyPreset(orbit, i);
      placeCamera(camera, orbit);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      // WebGL rows run bottom-up; images run top-down.
      for (let y = 0; y < height; y++) {
        const src = (height - 1 - y) * width * 4;
        image.data.set(pixels.subarray(src, src + width * 4), y * width * 4);
      }
      ctx.putImageData(image, 0, 0);
      return { name: `view${i + 1}-${view.name}`, dataUrl: canvas.toDataURL("image/png") };
    });
  } finally {
    renderer.setRenderTarget(null);
    hide.forEach((o, i) => (o.visible = wasVisible[i]));
    target.dispose();
  }
}
