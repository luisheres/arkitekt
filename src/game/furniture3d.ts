/**
 * Simple 3D furniture: each piece is a few boxes and cylinders, recognizable from a
 * distance. Built in a local frame where x runs across the front, y up, and +z points
 * out of the front; the caller rotates it to face the room.
 */

import * as THREE from "three";
import type { Furniture } from "../core";
import { floorTexture, toon, worldMaterial } from "./textures";

const srgb = (hex: string) => new THREE.Color(hex);
const mat = (hex: string, _roughness = 0.8, _metalness = 0) => toon({ color: srgb(hex) });

const M = {
  wood: worldMaterial(floorTexture("Wood"), { roughness: 0.6 }),
  lightWood: mat("#c9a77c", 0.7),
  white: mat("#f2f1ec", 0.5),
  porcelain: mat("#fafafa", 0.25),
  linen: mat("#f4f1ea", 0.9),
  duvet: mat("#9fb7cf", 0.9),
  fabric: mat("#62707d", 0.95),
  cushion: mat("#7d8a96", 0.95),
  dark: mat("#2b2d31", 0.4),
  steel: mat("#b8bdc2", 0.35, 0.6),
  water: toon({ color: srgb("#9ccfe0"), roughness: 0.1, transparent: true, opacity: 0.8 }),
  glass: toon({ color: srgb("#cfe6ef"), roughness: 0.05, transparent: true, opacity: 0.3 }),
  books: ["#8c3b2e", "#2f5d7c", "#c49a3a", "#4f7a4a", "#6b4a7a"].map((c) => mat(c, 0.8)),
  cars: ["#a32c2c", "#2c4f8c", "#d8d8d8", "#2f2f33", "#3f6b4f"].map((c) => mat(c, 0.35, 0.5)),
  tyre: mat("#1b1b1d", 0.9),
  pot: mat("#c7643a"),
  stone: mat("#b9b2a6"),
  logs: mat("#7a4d2c"),
  fire: toon({ color: srgb("#ffb03b"), emissive: srgb("#ff7a1a"), emissiveIntensity: 0.9 }),
  soil: mat("#5a3d2b"),
  bark: mat("#8a5a3a"),
  leaves: ["#4caf50", "#5cbf3f", "#3f9f4a"].map((c) => mat(c)),
  hedge: mat("#3f8f45"),
  flowers: ["#ff6f91", "#ffd23f", "#ffffff", "#b388ff", "#ff8a3d"].map((c) => mat(c)),
};

// Shared by every piece; disposing a house leaves them alone.
const unit = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
const sphere = new THREE.IcosahedronGeometry(1, 2);
unit.userData.shared = cylinder.userData.shared = sphere.userData.shared = true;

/** Add a ball (a clump of leaves), squashed to sx × sy × sz radii. */
function ball(g: THREE.Group, m: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx): void {
  const mesh = new THREE.Mesh(sphere, m);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
}

/** Add a box spanning x0..x1, y0..y1, z0..z1. */
function box(g: THREE.Group, m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
  const mesh = new THREE.Mesh(unit, m);
  mesh.scale.set(x1 - x0, y1 - y0, z1 - z0);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
}

/** Add an upright cylinder, or one lying along x when `alongX`. */
function cyl(g: THREE.Group, m: THREE.Material, x: number, y: number, z: number, radius: number, length: number, alongX = false): void {
  const mesh = new THREE.Mesh(cylinder, m);
  mesh.scale.set(radius * 2, length, radius * 2);
  if (alongX) mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
}

/** Four legs under a top of w × d at height h. */
function legs(g: THREE.Group, m: THREE.Material, w: number, d: number, h: number, t = 0.05): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, m, sx * (w / 2 - t) - t / 2, sx * (w / 2 - t) + t / 2, 0, h, sz * (d / 2 - t) - t / 2, sz * (d / 2 - t) + t / 2);
}

export function buildFurniture(f: Furniture): THREE.Group {
  const g = new THREE.Group();
  const [w, d, h] = [f.width, f.depth, f.height];
  const [x0, x1, z0, z1] = [-w / 2, w / 2, -d / 2, d / 2]; // z0 is the back, against the wall
  switch (f.kind) {
    case "Bed":
    case "SingleBed": {
      box(g, M.wood, x0, x1, 0, 0.3, z0, z1);
      box(g, M.wood, x0, x1, 0, 0.95, z0, z0 + 0.08); // headboard
      box(g, M.linen, x0 + 0.03, x1 - 0.03, 0.3, 0.5, z0 + 0.08, z1 - 0.03);
      box(g, M.duvet, x0 + 0.02, x1 - 0.02, 0.48, 0.56, z0 + 0.65, z1 - 0.02);
      const pillows = f.kind === "Bed" ? 2 : 1;
      for (let i = 0; i < pillows; i++) {
        const pw = (w - 0.2) / pillows;
        const px = x0 + 0.1 + i * pw;
        box(g, M.linen, px + 0.04, px + pw - 0.04, 0.5, 0.62, z0 + 0.15, z0 + 0.5);
      }
      break;
    }
    case "Nightstand":
      box(g, M.lightWood, x0, x1, 0, h, z0, z1);
      cyl(g, M.linen, 0, h + 0.15, 0, 0.09, 0.22);
      break;
    case "Wardrobe":
      box(g, M.lightWood, x0, x1, 0, h, z0, z1);
      for (let x = x0 + w / Math.round(w / 0.6); x < x1 - 0.1; x += w / Math.round(w / 0.6)) box(g, M.dark, x - 0.005, x + 0.005, 0.05, h - 0.05, z1, z1 + 0.005);
      break;
    case "Sofa":
    case "Armchair":
      box(g, M.fabric, x0, x1, 0.1, 0.42, z0, z1); // base
      box(g, M.fabric, x0, x1, 0.1, h, z0, z0 + 0.22); // back
      box(g, M.fabric, x0, x0 + 0.18, 0.1, 0.62, z0, z1); // arms
      box(g, M.fabric, x1 - 0.18, x1, 0.1, 0.62, z0, z1);
      box(g, M.cushion, x0 + 0.2, x1 - 0.2, 0.42, 0.52, z0 + 0.22, z1 - 0.03);
      box(g, M.dark, x0 + 0.05, x1 - 0.05, 0, 0.1, z0 + 0.05, z1 - 0.05);
      break;
    case "CoffeeTable":
    case "DiningTable":
    case "Desk":
      box(g, f.kind === "Desk" ? M.white : M.lightWood, x0, x1, h - 0.04, h, z0, z1);
      legs(g, M.dark, w, d, h - 0.04, 0.04);
      if (f.kind === "Desk") box(g, M.dark, -0.25, 0.25, h, h + 0.32, z0 + 0.05, z0 + 0.08); // a screen
      break;
    case "TvUnit":
      box(g, M.lightWood, x0, x1, 0, h, z0, z1);
      box(g, M.dark, x0 + 0.1, x1 - 0.1, h + 0.05, h + 0.05 + (w - 0.2) * 0.56, z0 + 0.1, z0 + 0.15);
      break;
    case "Counter":
      box(g, M.white, x0, x1, 0.1, 0.86, z0, z1 - 0.02);
      box(g, M.dark, x0, x1, 0.86, 0.9, z0, z1);
      box(g, M.steel, x0 + 0.2, x0 + 0.7, 0.89, 0.905, z0 + 0.1, z1 - 0.12); // sink
      box(g, M.dark, x1 - 0.7, x1 - 0.15, 0.9, 0.91, z0 + 0.08, z1 - 0.1); // hob
      for (let x = x0 + 0.6; x < x1 - 0.05; x += 0.6) box(g, M.dark, x - 0.004, x + 0.004, 0.15, 0.82, z1 - 0.02, z1 - 0.015);
      break;
    case "Fridge":
      box(g, M.steel, x0, x1, 0, h, z0, z1);
      box(g, M.dark, x0 + 0.02, x1 - 0.02, h * 0.62, h * 0.62 + 0.01, z1, z1 + 0.005);
      break;
    case "Chair":
      box(g, M.lightWood, x0, x1, 0.43, 0.47, z0, z1);
      box(g, M.lightWood, x0, x1, 0.47, h, z0, z0 + 0.04);
      legs(g, M.lightWood, w, d, 0.43, 0.035);
      break;
    case "OfficeChair":
      box(g, M.dark, x0, x1, 0.45, 0.52, z0, z1);
      box(g, M.dark, x0 + 0.03, x1 - 0.03, 0.52, h, z1 - 0.06, z1);
      cyl(g, M.steel, 0, 0.22, 0, 0.03, 0.45);
      cyl(g, M.dark, 0, 0.03, 0, 0.28, 0.04);
      break;
    case "Bathtub":
      box(g, M.porcelain, x0, x1, 0, h, z0, z1);
      box(g, M.water, x0 + 0.08, x1 - 0.08, h - 0.08, h - 0.02, z0 + 0.08, z1 - 0.08);
      break;
    case "Shower":
      box(g, M.porcelain, x0, x1, 0, 0.06, z0, z1);
      box(g, M.glass, x0, x1, 0.06, h, z1 - 0.02, z1);
      box(g, M.glass, x1 - 0.02, x1, 0.06, h, z0, z1);
      cyl(g, M.steel, 0, h - 0.1, z0 + 0.15, 0.08, 0.02);
      break;
    case "Toilet":
      cyl(g, M.porcelain, 0, 0.2, z0 + 0.4, w / 2, 0.4);
      box(g, M.porcelain, x0, x1, 0.4, 0.75, z0, z0 + 0.18);
      break;
    case "Sink":
      box(g, M.white, x0 + 0.05, x1 - 0.05, 0.2, 0.78, z0, z1 - 0.05);
      box(g, M.porcelain, x0, x1, 0.78, 0.86, z0, z1);
      box(g, M.dark, x0 + 0.1, x1 - 0.1, 1.1, 1.6, z0, z0 + 0.02); // mirror
      break;
    case "Bookshelf":
    case "Shelf": {
      box(g, f.kind === "Shelf" ? M.steel : M.lightWood, x0, x1, 0, h, z0, z0 + 0.03);
      box(g, f.kind === "Shelf" ? M.steel : M.lightWood, x0, x0 + 0.03, 0, h, z0, z1);
      box(g, f.kind === "Shelf" ? M.steel : M.lightWood, x1 - 0.03, x1, 0, h, z0, z1);
      for (let y = 0; y < h - 0.1; y += 0.38) {
        box(g, f.kind === "Shelf" ? M.steel : M.lightWood, x0, x1, y, y + 0.03, z0, z1);
        let x = x0 + 0.05;
        let i = Math.floor(y * 13);
        while (x < x1 - 0.12) {
          const bw = 0.05 + ((i * 37) % 7) * 0.012;
          box(g, M.books[i % M.books.length], x, x + bw, y + 0.03, y + 0.25 + ((i * 13) % 5) * 0.015, z0 + 0.04, z1 - 0.06);
          x += bw + 0.01;
          i++;
        }
      }
      break;
    }
    case "Bench":
      box(g, M.lightWood, x0, x1, 0.4, h, z0, z1);
      legs(g, M.dark, w, d, 0.4, 0.04);
      break;
    case "Washer":
      box(g, M.white, x0, x1, 0, h, z0, z1);
      cyl(g, M.dark, 0, h * 0.5, z1, 0.2, 0.02);
      g.children[g.children.length - 1].rotation.x = Math.PI / 2;
      break;
    case "Car": {
      // A car lies along its depth (z); it faces out of the garage door end.
      const paint = M.cars[Math.abs(Math.round(f.at.x * 7 + f.at.y * 13)) % M.cars.length];
      box(g, paint, x0, x1, 0.25, 0.8, z0 + 0.05, z1 - 0.05);
      box(g, M.glass, x0 + 0.12, x1 - 0.12, 0.8, 1.35, z0 + d * 0.3, z1 - d * 0.3);
      box(g, paint, x0 + 0.1, x1 - 0.1, 1.33, h, z0 + d * 0.32, z1 - d * 0.32);
      for (const z of [z0 + 0.75, z1 - 0.75]) {
        cyl(g, M.tyre, x0 + 0.08, 0.32, z, 0.32, 0.22, true);
        cyl(g, M.tyre, x1 - 0.08, 0.32, z, 0.32, 0.22, true);
      }
      break;
    }
    case "Workbench":
      box(g, M.lightWood, x0, x1, h - 0.06, h, z0, z1);
      legs(g, M.dark, w, d, h - 0.06, 0.06);
      box(g, M.lightWood, x0, x1, h, h + 0.8, z0, z0 + 0.02);
      break;
    case "Fireplace": {
      // A stone surround with a dark firebox, logs and a glowing fire, and a mantel shelf.
      box(g, M.stone, x0, x1, 0, h, z0, z0 + 0.45);
      box(g, M.dark, x0 + 0.35, x1 - 0.35, 0.15, 0.75, z0 + 0.3, z0 + 0.46);
      box(g, M.lightWood, x0 - 0.05, x1 + 0.05, h, h + 0.08, z0, z0 + 0.55);
      box(g, M.stone, x0 - 0.1, x1 + 0.1, 0, 0.12, z0 + 0.45, z1);
      cyl(g, M.logs, -0.15, 0.25, z0 + 0.4, 0.07, 0.5, true);
      cyl(g, M.logs, 0.12, 0.3, z0 + 0.38, 0.07, 0.45, true);
      box(g, M.fire, -0.18, 0.18, 0.3, 0.55, z0 + 0.42, z0 + 0.44);
      break;
    }
    case "Plant":
    case "TallPlant": {
      const r = Math.min(w, d) / 2;
      const potH = f.kind === "Plant" ? 0.3 : 0.45;
      cyl(g, M.pot, 0, potH / 2, 0, r * 0.7, potH);
      cyl(g, M.soil, 0, potH, 0, r * 0.62, 0.02);
      const leaf = M.leaves[Math.abs(Math.round(f.at.x * 5 + f.at.y * 3)) % M.leaves.length];
      if (f.kind === "Plant") {
        ball(g, leaf, 0, potH + (h - potH) * 0.45, 0, r, (h - potH) * 0.5, r);
      } else {
        cyl(g, M.bark, 0, (potH + h * 0.6) / 2, 0, 0.03, h * 0.6 - potH);
        ball(g, leaf, 0, h * 0.72, 0, r * 0.9, h * 0.22, r * 0.9);
        ball(g, leaf, r * 0.35, h * 0.55, 0, r * 0.55, h * 0.14, r * 0.55);
      }
      break;
    }
    case "GardenTree": {
      const r = Math.min(w, d) / 2;
      cyl(g, M.bark, 0, h * 0.25, 0, 0.14, h * 0.5);
      const leaf = M.leaves[Math.abs(Math.round(f.at.x * 5 + f.at.y * 3)) % M.leaves.length];
      ball(g, leaf, 0, h * 0.62, 0, r * 0.8, h * 0.24, r * 0.8);
      ball(g, leaf, r * 0.35, h * 0.78, -r * 0.2, r * 0.55, h * 0.18, r * 0.55);
      ball(g, leaf, -r * 0.35, h * 0.55, r * 0.25, r * 0.5, h * 0.16, r * 0.5);
      break;
    }
    case "Shrub": {
      const leaf = M.leaves[Math.abs(Math.round(f.at.x * 5 + f.at.y * 3)) % M.leaves.length];
      ball(g, leaf, 0, h * 0.5, 0, w * 0.45, h * 0.5, d * 0.45);
      ball(g, leaf, w * 0.2, h * 0.7, d * 0.1, w * 0.28, h * 0.35, d * 0.28);
      break;
    }
    case "FlowerBed": {
      box(g, M.soil, x0, x1, 0, 0.12, z0, z1);
      box(g, M.lightWood, x0, x1, 0, 0.18, z0, z0 + 0.05);
      box(g, M.lightWood, x0, x1, 0, 0.18, z1 - 0.05, z1);
      box(g, M.lightWood, x0, x0 + 0.05, 0, 0.18, z0, z1);
      box(g, M.lightWood, x1 - 0.05, x1, 0, 0.18, z0, z1);
      let i = 0;
      for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.3)
        for (let z = z0 + 0.2; z < z1 - 0.1; z += 0.3) {
          cyl(g, M.leaves[0], x, 0.2, z, 0.02, 0.18);
          ball(g, M.flowers[(i++ + Math.round(x * 7)) % M.flowers.length], x, 0.32, z, 0.08);
        }
      break;
    }
    case "Hedge": {
      box(g, M.hedge, x0 + 0.1, x1 - 0.1, 0, h - 0.15, z0 + 0.05, z1 - 0.05);
      for (let x = x0 + 0.3; x < x1 - 0.1; x += 0.5) ball(g, M.hedge, x, h - 0.25, 0, 0.32, 0.25, d * 0.45);
      break;
    }
  }
  g.rotation.y = Math.atan2(f.facing.x, f.facing.y);
  g.position.set(f.at.x, 0, f.at.y);
  return g;
}
