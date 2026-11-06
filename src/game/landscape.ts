/**
 * The world around the plot, in a bright cartoon style: rolling terrain shaded by
 * height, a lake with a foamy rim, a street, chunky trees and rocks, the neighbours'
 * houses, a gradient sky with puffy clouds, and soft haze in the distance.
 */

import * as THREE from "three";
import { type Plot, STREET, type Scenery, type Surface, type Tree, sceneryFor, treeLook } from "../core";
import { groundTexture, toon, wallTexture, worldMaterial } from "./textures";

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
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), material);
  mesh.renderOrder = -1;
  mesh.userData.followCamera = true;
  return mesh;
}

function clouds(center: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const white = toon({ color: "#ffffff", emissive: "#dfefff", emissiveIntensity: 0.35, fog: false });
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
  const rockC = new THREE.Color("#a7a29a");
  const covers: Record<Exclude<Surface, "grass">, THREE.Color> = {
    sand: new THREE.Color("#f0d9a0"),
    field1: new THREE.Color("#e8cf5f"), // ripe wheat
    field2: new THREE.Color("#86c43c"), // young crops
    field3: new THREE.Color("#a57a52"), // ploughed earth
    snow: new THREE.Color("#f7fbff"),
  };
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
    // Beaches, fields and snow.
    const cover = s.surface(x, y);
    if (cover !== "grass") c.copy(covers[cover]);
    if (cover === "field1" || cover === "field2" || cover === "field3") c.multiplyScalar(0.94 + 0.06 * Math.sin(x * 1.7 + y * 0.4)); // furrows
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
  // A white rim of foam where the water meets the shore: about a metre wide (for a lake,
  // as it always was; a river or the sea would get a band many metres wide otherwise).
  const [outer, inner, water] = l.kind === "lake" ? [1.03, 0.985, 1.02] : [1 + 0.5 / Math.min(l.rx, l.ry), 1 - 0.5 / Math.min(l.rx, l.ry), 1 + 0.3 / Math.min(l.rx, l.ry)];
  g.add(flat(ellipse(water), toon({ color: l.kind === "sea" ? "#2f9fe0" : "#3fb3e8", transparent: true, opacity: 0.88 }), l.level));
  const rim = ellipse(outer);
  rim.holes.push(new THREE.Path().absellipse(0, 0, l.rx * inner, l.ry * inner, 0, Math.PI * 2, true, 0));
  g.add(flat(rim, toon({ color: "#ffffff" }), l.level + 0.01));
  // Reeds along a lake's shore.
  const reed = toon({ color: "#5f9e3f" });
  for (let i = 0; i < (l.kind === "lake" ? 40 : 0); i++) {
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

/**
 * A soft, slightly lumpy ball for canopies and bushes, shaded darker underneath and
 * lighter on top (vertex colours multiply the material colour).
 */
function lumpyBall(detail: number, lumps: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const bump = 1 + lumps * (Math.sin(v.x * 5.1) * Math.sin(v.y * 4.3) * Math.sin(v.z * 4.7));
    v.multiplyScalar(bump);
    pos.setXYZ(i, v.x, v.y, v.z);
    const shade = 0.62 + 0.38 * ((v.y + 1) / 2);
    colors.set([shade, shade, shade], i * 3);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const blob = lumpyBall(1, 0.05);
const canopy = lumpyBall(3, 0.07);

/** A cone shaded darker at its base, for pine tiers. */
const pineTier = (() => {
  const g = new THREE.ConeGeometry(1, 1, 10, 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // Droop the rim a little between the branch tips.
    if (y < -0.45) pos.setY(i, y - 0.08 * (1 + Math.sin(Math.atan2(pos.getZ(i), pos.getX(i)) * 5)));
    const shade = 0.7 + 0.3 * (y + 0.5);
    colors.set([shade, shade, shade], i * 3);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
})();

const leaf = (c: string) => toon({ color: c, vertexColors: true });
const LEAVES = ["#4caf50", "#5cbf3f", "#43a84f", "#6fc94a"].map(leaf);
const LEAVES_LIGHT = ["#7fd65c", "#8fdc5a", "#79cf62", "#97e06a"].map(leaf);
const BLOSSOM = leaf("#ff9ec7");
const BLOSSOM_LIGHT = leaf("#ffc7de");
const PINE = leaf("#2f8a52");
const PINE_LIGHT = leaf("#4aa865");
const BIRCH_LEAVES = leaf("#a6dc52");
const APPLE = toon({ color: "#e8332e" });
const TRUNK = toon({ color: "#8a5a3a" });
const BIRCH_TRUNK = toon({ color: "#f6f2ea" });
const BIRCH_MARK = toon({ color: "#2d2a2a" });
const FLOWERS = ["#ff6f91", "#ffd23f", "#ffffff", "#b388ff"].map((c) => toon({ color: c }));
const trunkGeo = new THREE.CylinderGeometry(0.62, 1, 1, 8);
const ball = new THREE.SphereGeometry(1, 8, 6);

function tree(s: Scenery, t: Tree): THREE.Group {
  const g = new THREE.Group();
  const k = t.size;
  const variant = Math.abs(Math.round(t.at.x * 3 + t.at.y * 5));
  const rnd = (i: number) => (Math.sin(variant * 12.9898 + i * 78.233) * 43758.5453) % 1;
  const r = (i: number) => Math.abs(rnd(i));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, rotZ = 0, rotX = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(rotX, 0, rotZ);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  switch (t.kind) {
    case "round": {
      const look = treeLook(t);
      const [dark, light] = look === "blossom" ? [BLOSSOM, BLOSSOM_LIGHT] : [LEAVES[variant % 4], LEAVES_LIGHT[variant % 4]];
      // A tapered trunk with two branches reaching into the crown.
      add(trunkGeo, TRUNK, 0, 1.25 * k, 0, 0.32 * k, 2.5 * k, 0.32 * k);
      add(trunkGeo, TRUNK, 0.45 * k, 2.4 * k, 0, 0.12 * k, 1.3 * k, 0.12 * k, -0.7);
      add(trunkGeo, TRUNK, -0.4 * k, 2.5 * k, 0.15 * k, 0.11 * k, 1.2 * k, 0.11 * k, 0.75);
      // The crown: a big ball with smaller ones around it, lighter on top.
      add(canopy, dark, 0, 3.4 * k, 0, 1.75 * k, 1.5 * k, 1.75 * k);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + r(i);
        add(canopy, dark, Math.cos(a) * 1.25 * k, (2.9 + r(i + 9) * 0.7) * k, Math.sin(a) * 1.25 * k, (0.95 + r(i + 3) * 0.35) * k);
      }
      add(canopy, light, 0.2 * k, 4.45 * k, -0.1 * k, 1.15 * k, 0.95 * k, 1.15 * k);
      add(canopy, light, -0.7 * k, 4.0 * k, 0.6 * k, 0.8 * k);
      if (look === "apple") {
        for (let i = 0; i < 9; i++) {
          const a = i * 2.39996;
          const y = 2.8 + r(i + 20) * 1.6;
          const rr = 1.75 - Math.abs(y - 3.4) * 0.35;
          add(ball, APPLE, Math.cos(a) * rr * k, y * k, Math.sin(a) * rr * k, 0.13 * k);
        }
      }
      break;
    }
    case "birch": {
      add(trunkGeo, BIRCH_TRUNK, 0, 2.2 * k, 0, 0.17 * k, 4.4 * k, 0.17 * k);
      // The birch's black markings.
      for (let i = 0; i < 7; i++) {
        const a = r(i) * Math.PI * 2;
        const y = (0.5 + i * 0.5) * k;
        const m = add(ball, BIRCH_MARK, Math.cos(a) * 0.15 * k, y, Math.sin(a) * 0.15 * k, 0.07 * k, 0.025 * k, 0.07 * k);
        m.castShadow = false;
      }
      add(canopy, BIRCH_LEAVES, 0, 4.2 * k, 0, 1.05 * k, 1.6 * k, 1.05 * k);
      add(canopy, BIRCH_LEAVES, 0.55 * k, 3.6 * k, 0.2 * k, 0.75 * k, 1.1 * k, 0.75 * k);
      add(canopy, BIRCH_LEAVES, -0.5 * k, 3.4 * k, -0.25 * k, 0.7 * k, 1.0 * k, 0.7 * k);
      add(canopy, BIRCH_LEAVES, 0.1 * k, 5.2 * k, 0, 0.7 * k, 0.9 * k, 0.7 * k);
      break;
    }
    case "pine": {
      add(trunkGeo, TRUNK, 0, 0.7 * k, 0, 0.22 * k, 1.4 * k, 0.22 * k);
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const w = (1.85 - i * 0.38) * k;
        add(pineTier, i === tiers - 1 ? PINE_LIGHT : PINE, 0, (1.6 + i * 1.05) * k, 0, w, 1.7 * k, w);
      }
      add(pineTier, PINE_LIGHT, 0, (1.6 + tiers * 1.05) * k, 0, 0.45 * k, 0.9 * k, 0.45 * k);
      break;
    }
    case "bush": {
      const [dark, light] = [LEAVES[variant % 4], LEAVES_LIGHT[variant % 4]];
      add(blob, dark, 0, 0.5 * k, 0, 0.9 * k, 0.7 * k, 0.9 * k);
      add(blob, dark, 0.6 * k, 0.4 * k, 0.3 * k, 0.6 * k, 0.5 * k, 0.6 * k);
      add(blob, light, -0.4 * k, 0.55 * k, -0.35 * k, 0.6 * k, 0.55 * k, 0.6 * k);
      add(blob, light, 0.1 * k, 0.85 * k, 0.05 * k, 0.55 * k, 0.45 * k, 0.55 * k);
      for (let i = 0; i < 7; i++) {
        const a = i * 2.39996 + r(i);
        add(ball, FLOWERS[(variant + i) % FLOWERS.length], Math.cos(a) * 0.8 * k, (0.55 + r(i + 5) * 0.35) * k, Math.sin(a) * 0.8 * k, 0.09 * k);
      }
      break;
    }
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
  const glass = toon({ color: "#8fd3ff" });
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
