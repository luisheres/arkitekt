/**
 * Turns the core house model into Three.js objects and draws the plot around it.
 */

import * as THREE from "three";
import {
  type House,
  type Plot,
  type RoofMaterial,
  type TriMesh,
  type WallMaterial,
  buildFloor,
  buildRoof,
  wallPieces,
} from "../core";

const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

function matte(r: number, g: number, b: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: srgb(r, g, b), roughness, metalness: 0 });
}

/** Roofs and gables are thin single-layer surfaces, so they render both sides. */
function roofMat(r: number, g: number, b: number, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: srgb(r, g, b), roughness, metalness, side: THREE.DoubleSide });
}

/** Shared materials, one per building material. */
const palette = {
  wall: {
    Wood: matte(0.58, 0.4, 0.26, 0.85),
    Brick: matte(0.6, 0.27, 0.2, 0.95),
    Plaster: matte(0.93, 0.89, 0.8, 0.9),
  } satisfies Record<WallMaterial, THREE.Material>,
  // Gables and fascia reuse the wall colours but must render from both sides.
  gable: {
    Wood: roofMat(0.58, 0.4, 0.26, 0.85, 0),
    Brick: roofMat(0.6, 0.27, 0.2, 0.95, 0),
    Plaster: roofMat(0.93, 0.89, 0.8, 0.9, 0),
  } satisfies Record<WallMaterial, THREE.Material>,
  roof: {
    Shingles: roofMat(0.22, 0.22, 0.25, 0.9, 0),
    Metal: roofMat(0.42, 0.47, 0.52, 0.45, 0.6),
    Tiles: roofMat(0.56, 0.23, 0.15, 0.8, 0),
  } satisfies Record<RoofMaterial, THREE.Material>,
  glass: new THREE.MeshStandardMaterial({
    color: srgb(0.45, 0.62, 0.78),
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.55,
  }),
  frame: matte(0.96, 0.96, 0.94, 0.6),
  door: matte(0.3, 0.18, 0.11, 0.7),
  floor: matte(0.55, 0.55, 0.53, 0.95),
};

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const FRAME_WIDTH = 0.07;
export const SKY_COLOR = srgb(0.62, 0.78, 0.93);

/** The static world: ground, plot, street and lights. Returns the plot guide lines. */
export function buildWorld(scene: THREE.Scene, plot: Plot): THREE.Object3D {
  scene.background = SKY_COLOR;
  const center = new THREE.Vector3(plot.width * 0.5, 0, plot.depth * 0.5);

  const flat = (w: number, d: number, color: THREE.Color, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  // Surrounding land, the plot's lawn, and a street along the front (low-z) edge.
  flat(400, 400, srgb(0.42, 0.55, 0.3), center.x, -0.01, center.z);
  flat(plot.width, plot.depth, srgb(0.38, 0.62, 0.28), center.x, 0, center.z);
  flat(400, 7, srgb(0.32, 0.32, 0.34), center.x, 0.002, -4.5);

  scene.add(new THREE.HemisphereLight(srgb(0.85, 0.9, 1.0), srgb(0.42, 0.55, 0.3), 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.position.set(-30, 50, -20);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const extent = Math.max(plot.width, plot.depth);
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 150 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // Plot boundary (white) and setback (yellow).
  const guides = new THREE.Group();
  const outline = (inset: number, color: number) => {
    const h = 0.03;
    const pts = [
      new THREE.Vector3(inset, h, inset),
      new THREE.Vector3(plot.width - inset, h, inset),
      new THREE.Vector3(plot.width - inset, h, plot.depth - inset),
      new THREE.Vector3(inset, h, plot.depth - inset),
    ];
    guides.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })));
  };
  outline(0, 0xffffff);
  outline(plot.setback, 0xffd94d);
  scene.add(guides);
  return guides;
}

function toGeometry(t: TriMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(t.positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(t.normals, 3));
  return g;
}

function solid(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Build all objects for a house. Dispose the result with {@link disposeHouse}. */
export function buildHouse(house: House): THREE.Group {
  const group = new THREE.Group();

  const box = (u: number, v: number, at: (u: number, v: number) => THREE.Vector3, size: THREE.Vector3, rotY: number, mat: THREE.Material) => {
    const mesh = solid(unitBox, mat);
    mesh.position.copy(at(u, v));
    mesh.scale.copy(size);
    mesh.rotation.y = rotY;
    group.add(mesh);
  };

  for (const wall of house.walls) {
    const openings = house.openingsIn(wall.id);
    const d = wall.direction();
    const rotY = Math.atan2(-d.y, d.x);
    // Wall-local (u along the wall, v up) to world space.
    const at = (u: number, v: number) => {
      const p = wall.start.add(d.scale(u));
      return new THREE.Vector3(p.x, v, p.y);
    };
    const t = wall.thickness;
    const size = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    for (const p of wallPieces(wall, openings)) {
      box((p.u0 + p.u1) * 0.5, (p.v0 + p.v1) * 0.5, at, size(p.u1 - p.u0, p.v1 - p.v0, t), rotY, palette.wall[wall.material]);
    }

    for (const o of openings) {
      const [w, h, fw] = [o.width, o.height, FRAME_WIDTH];
      const midV = o.sill + h * 0.5;
      const frameDepth = t + 0.04;
      // Frame: top, left and right bars (plus a sill bar for windows).
      box(o.offset, o.top() - fw * 0.5, at, size(w, fw, frameDepth), rotY, palette.frame);
      for (const side of [o.left() + fw * 0.5, o.right() - fw * 0.5]) {
        box(side, midV, at, size(fw, h, frameDepth), rotY, palette.frame);
      }
      if (o.kind === "Window") {
        box(o.offset, o.sill + fw * 0.5, at, size(w, fw, frameDepth + 0.04), rotY, palette.frame);
        if (w >= 1.6) {
          // Split wide windows with mullions roughly every metre.
          const panes = Math.round(w);
          for (let i = 1; i < panes; i++) {
            box(o.left() + (w * i) / panes, midV, at, size(fw * 0.8, h, frameDepth * 0.6), rotY, palette.frame);
          }
        }
        const glass = solid(unitBox, palette.glass);
        glass.castShadow = false;
        glass.position.copy(at(o.offset, midV));
        glass.scale.set(w - fw, h - fw, 0.02);
        glass.rotation.y = rotY;
        group.add(glass);
      } else {
        box(o.offset, midV - fw * 0.5, at, size(w - fw * 2, h - fw, 0.06), rotY, palette.door);
      }
    }
  }

  const floor = buildFloor(house);
  if (floor.ok) group.add(solid(toGeometry(floor.value), palette.floor));

  const roof = buildRoof(house);
  if (house.roof && roof.ok) {
    group.add(solid(toGeometry(roof.value.surface), palette.roof[house.roof.material]));
    if (!roof.value.gables.isEmpty()) {
      const material = house.walls[0]?.material ?? "Plaster";
      group.add(solid(toGeometry(roof.value.gables), palette.gable[material]));
    }
  }
  return group;
}

/** Free the per-house geometry (the shared unit box and materials are kept). */
export function disposeHouse(group: THREE.Group): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.geometry !== unitBox) o.geometry.dispose();
  });
  group.removeFromParent();
}
