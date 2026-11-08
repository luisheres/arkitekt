/**
 * Simple 3D furniture: each piece is a few boxes and cylinders, recognizable from a
 * distance. Built in a local frame where x runs across the front, y up, and +z points
 * out of the front; the caller rotates it to face the room.
 */

import * as THREE from "three";
import type { Furniture } from "../core";
import { floorTexture, seasonal, snowy, toon, worldMaterial } from "./textures";

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
  // Garden trees and shrubs: dark and snow-covered in winter rather than gone.
  leaves: ["#4caf50", "#5cbf3f", "#3f9f4a"].map((c, i) => snowy(seasonal(mat(c), { spring: "#86d65a", autumn: ["#d9822b", "#e0a030", "#c9541f"][i], winter: "#4f6f45" }))),
  hedge: snowy(seasonal(mat("#3f8f45"), { autumn: "#5f8a3a", winter: "#3f5f3a" })),
  /** Plants indoors (and in the greenhouse) stay green all year. */
  potLeaves: ["#4caf50", "#5cbf3f", "#3f9f4a"].map((c) => mat(c)),
  flowers: ["#ff6f91", "#ffd23f", "#ffffff", "#b388ff", "#ff8a3d"].map((c) => mat(c)),
  falu: mat("#9c3a2e"),
  roofing: snowy(mat("#3b3b40")),
  pond: seasonal(toon({ color: srgb("#3f9fd0"), transparent: true, opacity: 0.85 }), { winter: "#dcecf4" }),
  lily: mat("#5fae4a"),
  crops: ["#6fbf4a", "#a6d94a", "#e0573c", "#f0a030"].map((c) => mat(c)),
  rope: mat("#d8c79e"),
  frameBlue: mat("#3a5a8a"),
  frameYellow: mat("#e7b94a"),
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
      const leaf = M.potLeaves[Math.abs(Math.round(f.at.x * 5 + f.at.y * 3)) % M.potLeaves.length];
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
    case "Shed": {
      // Falu red boards, white corners and door frame, a dark felt roof sloping to the back.
      const wallH = h - 0.5;
      box(g, M.falu, x0 + 0.05, x1 - 0.05, 0, wallH, z0 + 0.05, z1 - 0.05);
      for (const x of [x0 + 0.05, x1 - 0.05]) for (const z of [z0 + 0.05, z1 - 0.05]) box(g, M.white, x - 0.05, x + 0.05, 0, wallH, z - 0.05, z + 0.05);
      box(g, M.white, -0.45, 0.45, 0, 1.9, z1 - 0.06, z1 - 0.02);
      box(g, M.falu, -0.38, 0.38, 0.02, 1.84, z1 - 0.04, z1);
      box(g, M.white, x1 - 0.7, x1 - 0.2, 1.1, 1.6, z1 - 0.06, z1 - 0.02);
      box(g, M.glass, x1 - 0.65, x1 - 0.25, 1.15, 1.55, z1 - 0.04, z1);
      const roof = new THREE.Mesh(unit, M.roofing);
      roof.scale.set(w + 0.3, 0.08, Math.hypot(d + 0.3, 0.5));
      roof.position.set(0, wallH + 0.25, 0);
      roof.rotation.x = Math.atan2(0.5, d + 0.3);
      roof.castShadow = true;
      g.add(roof);
      break;
    }
    case "Greenhouse": {
      // Glass on a white frame, with a pitched glass roof and tomatoes inside.
      const wallH = h - 0.7;
      box(g, M.stone, x0, x1, 0, 0.3, z0, z1);
      box(g, M.glass, x0 + 0.03, x1 - 0.03, 0.3, wallH, z0 + 0.03, z1 - 0.03);
      for (const x of [x0, 0, x1]) for (const z of [z0, z1]) box(g, M.white, x - 0.03, x + 0.03, 0.3, wallH, z - 0.03, z + 0.03);
      for (let z = z0 + 0.75; z < z1 - 0.1; z += 0.75) for (const x of [x0, x1]) box(g, M.white, x - 0.03, x + 0.03, 0.3, wallH, z - 0.02, z + 0.02);
      for (const s of [-1, 1]) {
        const pane = new THREE.Mesh(unit, M.glass);
        pane.scale.set(Math.hypot(w / 2, 0.7), 0.03, d);
        pane.position.set((s * w) / 4, wallH + 0.35, 0);
        pane.rotation.z = -s * Math.atan2(0.7, w / 2);
        g.add(pane);
      }
      box(g, M.white, -0.03, 0.03, wallH + 0.66, wallH + 0.72, z0, z1);
      for (const x of [x0 + 0.5, x1 - 0.5])
        for (let z = z0 + 0.5; z < z1 - 0.3; z += 0.6) {
          cyl(g, M.potLeaves[1], x, 0.7, z, 0.12, 0.8);
          ball(g, M.crops[2], x + 0.1, 0.9, z, 0.07);
        }
      break;
    }
    case "Pond": {
      // Stones round the edge, water a little below the grass, and lily pads.
      const water = new THREE.Mesh(cylinder, M.pond);
      water.scale.set(w * 0.92, 0.04, d * 0.92);
      water.position.set(0, 0.0, 0);
      water.receiveShadow = true;
      g.add(water);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        ball(g, M.stone, (Math.cos(a) * w) / 2, 0.04, (Math.sin(a) * d) / 2, 0.22, 0.12, 0.18);
      }
      for (const [x, z] of [[-0.4, 0.2], [0.5, -0.3], [0.1, 0.45]]) {
        const pad = new THREE.Mesh(cylinder, M.lily);
        pad.scale.set(0.35, 0.01, 0.35);
        pad.position.set(x, 0.03, z);
        g.add(pad);
      }
      ball(g, M.flowers[0], -0.4, 0.06, 0.2, 0.06);
      break;
    }
    case "VegetablePatch": {
      box(g, M.soil, x0, x1, 0, 0.12, z0, z1);
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) box(g, M.lightWood, x - 0.04, x + 0.04, 0, 0.22, z - 0.04, z + 0.04);
      box(g, M.lightWood, x0, x1, 0, 0.2, z0, z0 + 0.04);
      box(g, M.lightWood, x0, x1, 0, 0.2, z1 - 0.04, z1);
      // Rows of lettuce, carrots, tomatoes and pumpkins.
      let row = 0;
      for (let z = z0 + 0.25; z < z1 - 0.1; z += 0.35, row++)
        for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.3) ball(g, M.crops[row % M.crops.length], x, 0.18, z, 0.11, row % 2 ? 0.14 : 0.08, 0.11);
      break;
    }
    case "Swing": {
      // An A-frame each end, a beam across, two seats on ropes.
      for (const x of [x0 + 0.1, x1 - 0.1])
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(cylinder, M.frameYellow);
          leg.scale.set(0.08, Math.hypot(h, d / 2 - 0.1), 0.08);
          leg.position.set(x, h / 2, (s * (d / 2 - 0.1)) / 2);
          leg.rotation.x = s * Math.atan2(d / 2 - 0.1, h);
          leg.castShadow = true;
          g.add(leg);
        }
      cyl(g, M.frameYellow, 0, h, 0, 0.06, w, true);
      for (const x of [-0.55, 0.55]) {
        for (const dx of [-0.2, 0.2]) cyl(g, M.rope, x + dx, (h + 0.45) / 2, 0, 0.012, h - 0.45);
        box(g, M.frameBlue, x - 0.25, x + 0.25, 0.42, 0.47, -0.12, 0.12);
      }
      break;
    }
    case "Trampoline": {
      const r = Math.min(w, d) / 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.1, 0.1, 6, 32), M.frameBlue);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = h - 0.05;
      ring.castShadow = true;
      g.add(ring);
      const matMesh = new THREE.Mesh(cylinder, M.dark);
      matMesh.scale.set((r - 0.2) * 2, 0.02, (r - 0.2) * 2);
      matMesh.position.y = h - 0.08;
      g.add(matMesh);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cyl(g, M.steel, Math.cos(a) * (r - 0.1), (h - 0.05) / 2, Math.sin(a) * (r - 0.1), 0.03, h - 0.05);
      }
      break;
    }
  }
  g.rotation.y = Math.atan2(f.facing.x, f.facing.y);
  g.position.set(f.at.x, 0, f.at.y);
  return g;
}
