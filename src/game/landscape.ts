/**
 * The world around the plot, in a bright cartoon style: rolling terrain shaded by
 * height, a lake with a foamy rim, a street, chunky trees and rocks, the neighbours'
 * houses, a gradient sky with puffy clouds, and soft haze in the distance.
 */

import * as THREE from "three";
import { type Plot, STREET, type Scenery, type Tree, sceneryFor } from "../core";
import { groundTexture, noOutline, toon, wallTexture, worldMaterial } from "./textures";

const SKY_TOP = new THREE.Color("#3f8fe0");
const SKY_HORIZON = new THREE.Color("#cfeeff");
export const HAZE = new THREE.Color("#bfe3f7");

const ROOF_COLORS = ["#d9534a", "#3f7fbf", "#4f9a5a", "#e08a2e"];

export interface World {
  /** Ground, scenery, sky and lights. */
  root: THREE.Group;
  /** Plot boundary and setback lines. */
  guides: THREE.Object3D;
}

/** Plan point at ground height to world space. */
const at = (s: Scenery, x: number, y: number, lift = 0) => new THREE.Vector3(x, s.height(x, y) + lift, y);

export function buildWorld(plot: Plot): World {
  const root = new THREE.Group();
  const scenery = sceneryFor(plot);
  const center = new THREE.Vector3(plot.width / 2, 0, plot.depth / 2);

  root.add(sky(), clouds(center), ...lights(center, plot));
  root.add(terrain(scenery, center));
  root.add(lawn(plot), street(plot));
  if (scenery.lake) root.add(lake(scenery));
  if (scenery.jetty) root.add(jetty(scenery));
  for (const t of scenery.trees) root.add(tree(scenery, t));
  for (const r of scenery.rocks) root.add(rock(scenery, r.at.x, r.at.y, r.size));
  for (const n of scenery.neighbors) root.add(neighborHouse(scenery, n));
  root.add(hedges(plot));

  const guides = plotGuides(plot);
  root.add(guides);
  return { root, guides };
}

// --- Sky -------------------------------------------------------------------------------

function sky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
    vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader:
      "uniform vec3 top;\nuniform vec3 horizon;\nvarying vec3 vDir;\nvoid main() {\n  float t = pow(clamp(vDir.y, 0.0, 1.0), 0.6);\n  gl_FragColor = vec4(mix(horizon, top, t), 1.0);\n  #include <colorspace_fragment>\n}",
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), noOutline(material));
  mesh.renderOrder = -1;
  mesh.userData.followCamera = true;
  return mesh;
}

function clouds(center: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const white = noOutline(toon({ color: "#ffffff", emissive: "#dfefff", emissiveIntensity: 0.35, fog: false }));
  const puff = new THREE.IcosahedronGeometry(1, 2);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    const a = (i / 14) * Math.PI * 2 + rnd();
    const r = 160 + rnd() * 140;
    cloud.position.set(center.x + Math.cos(a) * r, 55 + rnd() * 40, center.z + Math.sin(a) * r);
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(puff, white);
      const s = 7 + rnd() * 7;
      m.scale.set(s * 1.3, s * 0.8, s);
      m.position.set((k - 2) * 8 + rnd() * 4, rnd() * 3, rnd() * 6);
      cloud.add(m);
    }
    g.add(cloud);
  }
  return g;
}

function lights(center: THREE.Vector3, plot: Plot): THREE.Object3D[] {
  const hemi = new THREE.HemisphereLight("#ffffff", "#8fbf6a", 1.4);
  const sun = new THREE.DirectionalLight("#fff4dd", 2.4);
  sun.position.set(center.x - 35, 60, center.z - 30);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const extent = Math.max(plot.width, plot.depth) + 6;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 200 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  return [hemi, sun, sun.target];
}

// --- Ground ----------------------------------------------------------------------------

function terrain(s: Scenery, center: THREE.Vector3): THREE.Mesh {
  const size = 320;
  const seg = 160;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color("#6cc24a");
  const meadow = new THREE.Color("#9ad25a");
  const forest = new THREE.Color("#3f9a4a");
  const sand = new THREE.Color("#f0d9a0");
  const rockC = new THREE.Color("#a7a29a");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + center.x;
    const y = pos.getZ(i) + center.z;
    const h = s.height(x, y);
    // Slight dip below the plot and street so the lawn and road sit on top cleanly.
    pos.setXYZ(i, x, h - 0.02, y);
    const slope = Math.hypot(s.height(x + 1, y) - h, s.height(x, y + 1) - h);
    c.copy(grass).lerp(meadow, 0.5 + 0.5 * Math.sin(x * 0.13) * Math.cos(y * 0.11));
    if (h > 4) c.lerp(forest, Math.min((h - 4) / 8, 1));
    if (slope > 0.55) c.lerp(rockC, Math.min((slope - 0.55) * 2, 0.8));
    // Sand only on the lake's shore.
    if (s.lake && h < s.lake.level + 0.45 && ((x - s.lake.center.x) / s.lake.rx) ** 2 + ((y - s.lake.center.y) / s.lake.ry) ** 2 < 1.6) c.copy(sand);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, toon({ vertexColors: true }));
  mesh.receiveShadow = true;
  return mesh;
}

/** The plot's garden: a mowed lawn. */
function lawn(plot: Plot): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(plot.width, plot.depth), worldMaterial(groundTexture("lawn")));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(plot.width / 2, 0.01, plot.depth / 2);
  mesh.receiveShadow = true;
  return mesh;
}

/** The street in front of the plot: road, pavements, and a dashed centre line. */
function street(plot: Plot): THREE.Group {
  const g = new THREE.Group();
  const length = 220;
  const cx = plot.width / 2;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(length, STREET.to - STREET.from - 2), worldMaterial(groundTexture("asphalt")));
  road.rotation.x = -Math.PI / 2;
  road.position.set(cx, 0.015, STREET.center);
  road.receiveShadow = true;
  g.add(road);
  const kerb = toon({ color: "#e9e4da" });
  for (const y of [STREET.from + 0.5, STREET.to - 0.5]) {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(length, 0.14, 1), kerb);
    walk.position.set(cx, 0.07, y);
    walk.receiveShadow = true;
    g.add(walk);
  }
  const paint = toon({ color: "#ffffff" });
  for (let x = cx - length / 2; x < cx + length / 2; x += 4) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(2, 0.02, 0.18), paint);
    dash.position.set(x, 0.03, STREET.center);
    g.add(dash);
  }
  return g;
}

function lake(s: Scenery): THREE.Group {
  const l = s.lake!;
  const g = new THREE.Group();
  const ellipse = (scale: number) => {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, l.rx * scale, l.ry * scale, 0, Math.PI * 2, false, 0);
    return shape;
  };
  const flat = (shape: THREE.Shape, material: THREE.Material, y: number) => {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 64), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(l.center.x, y, l.center.y);
    return m;
  };
  g.add(flat(ellipse(1.02), noOutline(toon({ color: "#3fb3e8", transparent: true, opacity: 0.88 })), l.level));
  // A white rim of foam where the water meets the shore.
  const rim = ellipse(1.03);
  rim.holes.push(new THREE.Path().absellipse(0, 0, l.rx * 0.985, l.ry * 0.985, 0, Math.PI * 2, true, 0));
  g.add(flat(rim, noOutline(toon({ color: "#ffffff" })), l.level + 0.01));
  // Reeds along the shore.
  const reed = toon({ color: "#5f9e3f" });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + Math.sin(i * 7.3) * 0.08;
    if (Math.abs(Math.sin(a)) > 0.9 && Math.sin(a) < 0) continue; // keep the jetty's end clear
    const r = 1.0 + 0.03 * Math.sin(i * 3.1);
    const x = l.center.x + Math.cos(a) * l.rx * r;
    const y = l.center.y + Math.sin(a) * l.ry * r;
    for (let k = 0; k < 3; k++) {
      const stem = new THREE.Mesh(new THREE.ConeGeometry(0.06, 1.2 + k * 0.2, 5), reed);
      stem.position.set(x + (k - 1) * 0.25, l.level + 0.6, y + Math.sin(k + i) * 0.2);
      stem.rotation.z = (k - 1) * 0.12;
      g.add(stem);
    }
  }
  return g;
}

function jetty(s: Scenery): THREE.Group {
  const j = s.jetty!;
  const g = new THREE.Group();
  const wood = worldMaterial(groundTexture("wood"), { color: "#e7c79a" });
  const len = j.from.distance(j.to);
  const deckY = (s.lake?.level ?? 0) + 0.5;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(j.width, 0.15, len), wood);
  deck.position.set((j.from.x + j.to.x) / 2, deckY, (j.from.y + j.to.y) / 2);
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  for (let t = 0; t <= len; t += 2.5) {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2, 8), wood);
      post.position.set(j.from.x + (side * j.width) / 2, deckY - 0.9, j.from.y + t);
      g.add(post);
    }
  }
  return g;
}

// --- Trees, rocks, hedges ---------------------------------------------------------

const blob = new THREE.IcosahedronGeometry(1, 1);
const leafColors = ["#4caf50", "#5cbf3f", "#3f9f4a", "#7ccf4a"].map((c) => toon({ color: c, flatShading: true }));
const pineColor = toon({ color: "#2f8a52", flatShading: true });
const birchLeaves = toon({ color: "#9ad84f", flatShading: true });
const trunk = toon({ color: "#8a5a3a" });
const birchTrunk = toon({ color: "#f4efe6" });

function tree(s: Scenery, t: Tree): THREE.Group {
  const g = new THREE.Group();
  const k = t.size;
  const variant = Math.abs(Math.round(t.at.x * 3 + t.at.y * 5));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    g.add(m);
  };
  const cyl = new THREE.CylinderGeometry(0.5, 0.65, 1, 7);
  switch (t.kind) {
    case "round":
      add(cyl, trunk, 0, 1.2 * k, 0, 0.45 * k, 2.4 * k, 0.45 * k);
      add(blob, leafColors[variant % leafColors.length], 0, 3.2 * k, 0, 1.9 * k);
      add(blob, leafColors[(variant + 1) % leafColors.length], 0.9 * k, 2.6 * k, 0.4 * k, 1.3 * k);
      add(blob, leafColors[(variant + 2) % leafColors.length], -0.8 * k, 2.8 * k, -0.5 * k, 1.2 * k);
      break;
    case "birch":
      add(cyl, birchTrunk, 0, 1.8 * k, 0, 0.28 * k, 3.6 * k, 0.28 * k);
      add(blob, birchLeaves, 0, 4.1 * k, 0, 1.3 * k, 2.0 * k, 1.3 * k);
      break;
    case "pine": {
      add(cyl, trunk, 0, 0.6 * k, 0, 0.4 * k, 1.2 * k, 0.4 * k);
      const cone = new THREE.ConeGeometry(1, 1, 7);
      for (let i = 0; i < 3; i++) add(cone, pineColor, 0, (1.6 + i * 1.2) * k, 0, (1.9 - i * 0.5) * k, 2.2 * k, (1.9 - i * 0.5) * k);
      break;
    }
    case "bush":
      add(blob, leafColors[variant % leafColors.length], 0, 0.55 * k, 0, 0.9 * k, 0.7 * k, 0.9 * k);
      add(blob, leafColors[(variant + 2) % leafColors.length], 0.5 * k, 0.45 * k, 0.3 * k, 0.6 * k, 0.5 * k, 0.6 * k);
      // A few flowers.
      for (let i = 0; i < 4; i++) {
        const flower = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), toon({ color: ["#ff6f91", "#ffd23f", "#ffffff", "#b388ff"][(variant + i) % 4] }));
        flower.position.set(Math.cos(i * 1.7) * 0.75 * k, 0.75 * k + (i % 2) * 0.15, Math.sin(i * 1.7) * 0.75 * k);
        g.add(flower);
      }
      break;
  }
  g.position.copy(at(s, t.at.x, t.at.y));
  g.rotation.y = variant;
  return g;
}

const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const rockMat = toon({ color: "#b4b0aa", flatShading: true });

function rock(s: Scenery, x: number, y: number, size: number): THREE.Mesh {
  const m = new THREE.Mesh(rockGeo, rockMat);
  m.scale.set(size * 1.2, size * 0.7, size);
  m.position.copy(at(s, x, y, size * 0.2));
  m.rotation.set(x, y, 0);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Low hedges along the sides of the garden. */
function hedges(plot: Plot): THREE.Group {
  const g = new THREE.Group();
  const mat = toon({ color: "#4f9f3f", flatShading: true });
  const side = (x: number) => {
    for (let y = 1; y < plot.depth - 0.5; y += 1.1) {
      const m = new THREE.Mesh(blob, mat);
      m.scale.set(0.55, 0.5, 0.65);
      m.position.set(x, 0.4, y);
      m.castShadow = true;
      g.add(m);
    }
  };
  side(-0.4);
  side(plot.width + 0.4);
  return g;
}

// --- Neighbours ----------------------------------------------------------------------

function neighborHouse(s: Scenery, n: Scenery["neighbors"][number]): THREE.Group {
  const g = new THREE.Group();
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => s.height(n.at.x + (sx * n.width) / 2, n.at.y + (sy * n.depth) / 2));
  const base = Math.min(...corners);
  const plinth = Math.max(...corners) - base + 0.3;
  const wallH = 2.7;
  const facade = worldMaterial(wallTexture(n.facade));
  const body = new THREE.Mesh(new THREE.BoxGeometry(n.width, wallH + plinth, n.depth), facade);
  body.position.set(0, (wallH + plinth) / 2, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // A gable roof along the width.
  const roofH = n.depth * 0.38;
  const shape = new THREE.Shape([new THREE.Vector2(-n.depth / 2 - 0.4, 0), new THREE.Vector2(n.depth / 2 + 0.4, 0), new THREE.Vector2(0, roofH)]);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: n.width + 0.6, bevelEnabled: false }), toon({ color: ROOF_COLORS[n.roof % ROOF_COLORS.length] }));
  roof.rotation.y = Math.PI / 2;
  roof.position.set(-n.width / 2 - 0.3, wallH + plinth, 0);
  roof.castShadow = true;
  g.add(roof);
  // A door and windows on the side facing the plot's street (low y), so neighbours look lived in.
  const frame = toon({ color: "#ffffff" });
  const glass = noOutline(toon({ color: "#8fd3ff" }));
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.1, 0.1), toon({ color: ROOF_COLORS[(n.roof + 1) % ROOF_COLORS.length] }));
  door.position.set(0, plinth + 1.05, -n.depth / 2 - 0.03);
  g.add(door);
  for (const x of [-n.width / 3, n.width / 3]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 0.08), frame);
    w.position.set(x, plinth + 1.6, -n.depth / 2 - 0.03);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.1), glass);
    pane.position.copy(w.position);
    g.add(w, pane);
  }
  // Houses across the street face it: turn them around.
  if (n.at.y < STREET.from) g.rotation.y = Math.PI;
  g.position.set(n.at.x, base, n.at.y);
  return g;
}

// --- Guides ----------------------------------------------------------------------------

function plotGuides(plot: Plot): THREE.Group {
  const guides = new THREE.Group();
  const outline = (inset: number, color: number) => {
    const h = 0.05;
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
  return guides;
}
