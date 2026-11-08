/**
 * The world around the plot, in a bright cartoon style: rolling terrain shaded by
 * height, a lake with a foamy rim, a street, chunky trees and rocks, the neighbours'
 * houses, a gradient sky with puffy clouds, and soft haze in the distance.
 */

import * as THREE from "three";
import { type Landmark, type Plot, type SunPosition, type Scenery, type Tree, Vec2, groundHeight, sceneryFor, treeLook } from "../core";
import { currentSeason, groundTexture, seasonal, snowy, toon, wallTexture, worldMaterial } from "./textures";

const SKY_TOP = new THREE.Color("#3f8fe0");
export const HAZE = new THREE.Color("#c4e6f8");
/** The sky meets the land in the same haze, so the far land fades into it. */
const SKY_HORIZON = HAZE;
const ICE = new THREE.Color("#dcecf4");

const ROOF_COLORS = ["#d9534a", "#3f7fbf", "#4f9a5a", "#e08a2e"];

export interface World {
  /** Ground, scenery, sky and lights. */
  root: THREE.Group;
  /** Plot boundary and setback lines. */
  guides: THREE.Object3D;
  /** Put the sun where it is at a time of day and season. */
  setSun(sun: SunPosition): void;
  /** Move what moves (trees in the wind, clouds, ripples) to time `t` seconds. */
  update(t: number): void;
}

/** Plan point at ground height to world space. */
const at = (s: Scenery, x: number, y: number, lift = 0) => new THREE.Vector3(x, s.height(x, y) + lift, y);

export function buildWorld(plot: Plot): World {
  const root = new THREE.Group();
  const scenery = sceneryFor(plot);
  const center = new THREE.Vector3(plot.width / 2, 0, plot.depth / 2);

  const [hemi, sun, target] = lights(center, plot);
  const baseExtent = Math.max(plot.width, plot.depth) * 0.8 + 10;
  const skyMesh = sky();
  const cloudGroup = clouds(center);
  root.add(skyMesh, cloudGroup, hemi, sun, target);
  root.add(terrain(scenery, center, plot));
  root.add(roads(scenery));
  const waterGroup = scenery.water ? water(scenery) : null;
  if (waterGroup) root.add(waterGroup);
  const waterColour = waterGroup ? (waterGroup.userData.surface as THREE.MeshToonMaterial).color.clone() : new THREE.Color();
  if (scenery.jetty) root.add(jetty(scenery));
  // Trees sway in the wind, each a little differently; the further, the less (unseen).
  const swaying: { g: THREE.Object3D; phase: number; amount: number }[] = [];
  for (const t of scenery.trees) {
    const g = tree(scenery, t);
    root.add(g);
    const far = Math.hypot(t.at.x - center.x, t.at.y - center.z);
    if (far < 140 && t.kind !== "stump") swaying.push({ g, phase: t.at.x * 0.37 + t.at.y * 0.21, amount: (t.kind === "birch" || t.kind === "willow" ? 0.035 : t.kind === "bush" ? 0.012 : t.kind === "oak" ? 0.012 : 0.022) / Math.max(1, t.size) });
  }
  for (const r of scenery.rocks) root.add(rock(scenery, r.at.x, r.at.y, r.size));
  root.add(groundCover(scenery, plot));
  for (const n of scenery.neighbors) root.add(neighborHouse(scenery, n));
  for (const l of scenery.landmarks) root.add(landmark(scenery, l));
  for (const wall of scenery.walls) root.add(stoneWall(scenery, wall));

  const guides = plotGuides(plot);
  root.add(guides);
  const setSun = (pos: SunPosition) => {
    // Shadows from a sun at least 7° up (lower, they would run off for hundreds of metres).
    const up = Math.max(pos.dir.up, Math.sin((7 * Math.PI) / 180));
    const flat = Math.hypot(pos.dir.x, pos.dir.y) || 1;
    const dir = new THREE.Vector3(pos.dir.x / flat, up / Math.cos(Math.asin(up)), pos.dir.y / flat).normalize();
    sun.position.copy(center).addScaledVector(dir, 150);
    sun.target.position.copy(center);
    // The shadowed area grows as the sun sinks, so long shadows stay inside it.
    const reach = baseExtent + Math.min(90, 7 / Math.tan(Math.asin(dir.y)) * 2.2);
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, far: 400 });
    sun.shadow.camera.updateProjectionMatrix();
    // Low sun: weaker, warmer, golden; after sunset, only the blue of the sky.
    const day = THREE.MathUtils.smoothstep(pos.elevation, -4, 12);
    const golden = 1 - THREE.MathUtils.smoothstep(pos.elevation, 2, 25);
    sun.intensity = 2.6 * day;
    sun.color.set("#fff4dd").lerp(new THREE.Color("#ffb066"), golden * 0.8);
    hemi.intensity = 0.55 + 0.85 * day;
    hemi.color.set("#ffffff").lerp(new THREE.Color("#9aa6d8"), 1 - day);
    const u = (skyMesh.material as THREE.ShaderMaterial).uniforms;
    u.top.value.copy(SKY_TOP).lerp(new THREE.Color("#22306b"), (1 - day) * 0.8);
    u.horizon.value.copy(HAZE).lerp(new THREE.Color("#ffb38a"), golden * 0.55);
    // Lakes and rivers freeze in winter; the sea doesn't.
    if (waterGroup && scenery.water?.kind !== "sea") {
      const frozen = currentSeason() === "winter";
      (waterGroup.userData.surface as THREE.MeshToonMaterial).color.copy(frozen ? ICE : waterColour);
      if (waterGroup.userData.deep) (waterGroup.userData.deep as THREE.Mesh).visible = !frozen;
    }
  };
  const cloudStart = cloudGroup.children.map((c) => c.position.clone());
  const reeds = waterGroup?.userData.reeds as THREE.Object3D[] | undefined;
  const ripples = waterGroup?.userData.ripples as THREE.Mesh[] | undefined;
  const update = (t: number) => {
    // Gusts: a slow swell, with a quicker flutter on top.
    const gust = 0.6 + 0.4 * Math.sin(t * 0.31);
    for (const s of swaying) {
      s.g.rotation.x = Math.sin(t * 1.3 + s.phase) * s.amount * gust;
      s.g.rotation.z = Math.cos(t * 1.1 + s.phase * 1.7) * s.amount * gust * 0.7;
    }
    for (const r of reeds ?? []) r.rotation.x = Math.sin(t * 2 + r.position.x) * 0.12 * gust;
    // Clouds drift slowly across, and come round again.
    cloudGroup.children.forEach((c, i) => {
      const x = cloudStart[i].x + ((t * 1.6 + i * 40) % 600) - 300;
      c.position.x = center.x + ((x - center.x + 900) % 600) - 300;
    });
    // Ripples on the water grow and fade, and start again somewhere else (not on ice).
    const frozen = currentSeason() === "winter" && scenery.water?.kind !== "sea";
    ripples?.forEach((r, i) => {
      const life = ((t * 0.35 + i * 0.37) % 1 + 1) % 1;
      r.scale.setScalar(0.4 + life * 1.6);
      (r.material as THREE.MeshBasicMaterial).opacity = frozen ? 0 : 0.55 * Math.sin(life * Math.PI);
    });
  };
  return { root, guides, setSun, update };
}

// --- Sky -------------------------------------------------------------------------------

function sky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: SKY_TOP.clone() }, horizon: { value: SKY_HORIZON.clone() } },
    vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader:
      "uniform vec3 top;\nuniform vec3 horizon;\nvarying vec3 vDir;\nvoid main() {\n  float t = pow(clamp(vDir.y, 0.0, 1.0), 0.6);\n  gl_FragColor = vec4(mix(horizon, top, t), 1.0);\n  #include <colorspace_fragment>\n}",
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), material);
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

function lights(center: THREE.Vector3, plot: Plot): [THREE.HemisphereLight, THREE.DirectionalLight, THREE.Object3D] {
  const hemi = new THREE.HemisphereLight("#ffffff", "#8fbf6a", 1.4);
  const sun = new THREE.DirectionalLight("#fff4dd", 2.4);
  sun.position.set(center.x - 35, 60, center.z - 30);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  // Covering the plot even when the low sun throws long shadows.
  const extent = Math.max(plot.width, plot.depth) * 0.8 + 10;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 260 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  return [hemi, sun, sun.target];
}

// --- Ground ----------------------------------------------------------------------------

/** How far the land reaches (m from the plot): well past where the haze hides everything. */
const LAND_REACH = 1800;
/** Beyond this the land eases into the distant hills of the horizon. */
const NEAR_LAND = 320;

/** Distant rolling hills (mountains, in mountain country) round the horizon, by direction. */
function farHills(setting: Scenery["setting"], angle: number): number {
  const big = setting === "mountain" ? 3 : setting === "hillside" ? 1.8 : setting === "seaside" ? 0.4 : 1;
  return big * (34 + 20 * Math.sin(3 * angle + 1.1) + 12 * Math.sin(7 * angle + 2.3) + 6 * Math.sin(13 * angle + 0.4) + 3 * Math.sin(29 * angle));
}

/** The near ground's colours are painted into a texture this far round the plot's centre (m), this fine. */
const PAINT_REACH = 170;
const PAINT_RES = 0.6;

/** Colours of what covers the ground. */
const GROUND = {
  grass: new THREE.Color("#6cc24a"),
  meadow: new THREE.Color("#9ad25a"),
  forest: new THREE.Color("#3f9a4a"),
  rock: new THREE.Color("#a7a29a"),
  snow: new THREE.Color("#f7fbff"),
  sand: new THREE.Color("#f0d9a0"),
  field1: new THREE.Color("#e8cf5f"), // ripe wheat
  field2: new THREE.Color("#86c43c"), // young crops
  field3: new THREE.Color("#a57a52"), // ploughed earth
};

/** The colour of the near ground at a point. */
function groundColour(s: Scenery, x: number, y: number, h: number, slope: number, c: THREE.Color): THREE.Color {
  const cover = s.surface(x, y);
  if (cover === "grass") {
    c.copy(GROUND.grass).lerp(GROUND.meadow, 0.5 + 0.5 * Math.sin(x * 0.13) * Math.cos(y * 0.11));
    if (h > 4) c.lerp(GROUND.forest, Math.min((h - 4) / 8, 1));
  } else {
    c.copy(GROUND[cover]);
    // Furrows across the fields.
    if (cover === "field1" || cover === "field2" || cover === "field3") c.multiplyScalar(0.92 + 0.08 * Math.sin(x * 2.2 + y * 0.7));
  }
  if (slope > 0.55 && cover !== "sand") c.lerp(GROUND.rock, Math.min((slope - 0.55) * 2, 0.8));
  return c;
}

/**
 * The near ground painted into a texture, so fields, beaches and snow have crisp edges
 * however coarse the land's mesh is. Its border is white, so beyond it (where the texture
 * is clamped) the land's own vertex colours show unchanged.
 */
function groundPainting(s: Scenery, center: THREE.Vector3): THREE.Texture {
  const n = Math.round((PAINT_REACH * 2) / PAINT_RES);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(n, n);
  const x0 = center.x - PAINT_REACH;
  const y0 = center.z - PAINT_REACH;
  // Heights once (one pixel wider) for the slopes.
  const heights = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) heights[j * (n + 1) + i] = s.height(x0 + i * PAINT_RES, y0 + j * PAINT_RES);
  const c = new THREE.Color();
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 4;
      if (i < 2 || j < 2 || i >= n - 2 || j >= n - 2) {
        img.data.set([255, 255, 255, 255], o);
        continue;
      }
      const h = heights[j * (n + 1) + i];
      const slope = Math.hypot(heights[j * (n + 1) + i + 1] - h, heights[(j + 1) * (n + 1) + i] - h) / PAINT_RES;
      groundColour(s, x0 + i * PAINT_RES, y0 + j * PAINT_RES, h, slope, c);
      // (Vertex colours are linear; the canvas holds sRGB.)
      const srgb = c.clone().convertLinearToSRGB();
      img.data.set([srgb.r * 255, srgb.g * 255, srgb.b * 255, 255], o);
    }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * The land: a disc round the plot, fine near it and coarser further out, reaching far beyond
 * the camera so its edge is never seen. Close by it follows the scenery; further out it rolls
 * into hills along the horizon that fade into the haze. Under the plot it drops out of
 * sight: the lawn, built with the house, covers it.
 */
function terrain(s: Scenery, center: THREE.Vector3, plot: Plot): THREE.Mesh {
  const radii: number[] = [];
  for (let r = 0.5; r < 160; r += 2) radii.push(r);
  for (let k = 0; k <= 44; k++) radii.push(160 * (LAND_REACH / 160) ** (k / 44));
  const around = 320;
  const positions = new Float32Array(radii.length * around * 3);
  const colors = new Float32Array(radii.length * around * 3);
  const uvs = new Float32Array(radii.length * around * 2);
  const grass = GROUND.grass;
  const forest = GROUND.forest;
  const snow = GROUND.snow;
const c = new THREE.Color();
  radii.forEach((r, ring) => {
    for (let k = 0; k < around; k++) {
      const a = (k / around) * Math.PI * 2;
      const [dx, dy] = [Math.cos(a), Math.sin(a)];
      const [x, y] = [center.x + dx * r, center.z + dy * r];
      // Near: the scenery. Far: the land where the scenery ends, easing into the far hills.
      const near = Math.min(r, NEAR_LAND);
      const [nx, ny] = [center.x + dx * near, center.z + dy * near];
      const hNear = s.height(nx, ny);
      const far = THREE.MathUtils.smoothstep(r, NEAR_LAND, NEAR_LAND * 3);
      const hills = farHills(s.setting, a) * THREE.MathUtils.smoothstep(r, NEAR_LAND * 1.5, LAND_REACH * 0.6);
      const h = hNear * (1 - far * 0.6) + hills;
      // Well inside the plot, out of sight under the lawn.
      const inside = x > 3.5 && x < plot.width - 3.5 && y > 3.5 && y < plot.depth - 3.5;
      const o = (ring * around + k) * 3;
      positions.set([x, inside ? h - 9 : h - 0.02, y], o);
      // Colour: near by, from the painted texture (white here); further out, by height and
      // slope; the far hills in woodland green.
      const [u, v] = [(x - center.x + PAINT_REACH) / (PAINT_REACH * 2), (y - center.z + PAINT_REACH) / (PAINT_REACH * 2)];
      uvs.set([u, 1 - v], (ring * around + k) * 2);
      const painted = Math.abs(x - center.x) < PAINT_REACH - 2 && Math.abs(y - center.z) < PAINT_REACH - 2;
      if (painted) c.setRGB(1, 1, 1);
      else if (r <= NEAR_LAND) {
        const slope = Math.hypot(s.height(x + 1, y) - hNear, s.height(x, y + 1) - hNear);
        groundColour(s, x, y, hNear, slope, c);
      } else {
        c.copy(grass).lerp(forest, 0.6);
        if (s.setting === "mountain" && h > 70) c.copy(snow);
      }
      colors.set([c.r, c.g, c.b], o);
    }
  });
  const index: number[] = [];
  for (let ring = 0; ring < radii.length - 1; ring++)
    for (let k = 0; k < around; k++) {
      const [a, b] = [ring * around + k, ring * around + ((k + 1) % around)];
      const [c2, d2] = [a + around, b + around];
      index.push(a, b, c2, b, d2, c2);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, snowy(toon({ vertexColors: true, map: groundPainting(s, center) })));
  mesh.receiveShadow = true;
  return mesh;
}

/** A strip along a polyline, `half` wide each side, lying on the ground (`lift` above it). */
function ribbon(s: Scenery, points: readonly Vec2[], half: number | readonly number[], lift: number, material: THREE.Material, flatAt?: number): THREE.Mesh {
  const positions: number[] = [];
  const index: number[] = [];
  points.forEach((p, i) => {
    const prev = points[Math.max(i - 1, 0)];
    const next = points[Math.min(i + 1, points.length - 1)];
    const dir = next.sub(prev).normalize();
    const n = new Vec2(-dir.y, dir.x).scale(typeof half === "number" ? half : half[i]);
    // Level across, at the height of the centreline (the ground round a road is shaped to it).
    const y = (flatAt ?? s.height(p.x, p.y)) + lift;
    for (const q of [p.add(n), p.sub(n)]) positions.push(q.x, y, q.y);
    if (i) {
      const k = (i - 1) * 2;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  return mesh;
}

const asphalt = worldMaterial(groundTexture("asphalt"), { side: THREE.DoubleSide });
const gravelMat = toon({ color: "#d9c79e", side: THREE.DoubleSide });
const kerbMat = toon({ color: "#e9e4da", side: THREE.DoubleSide });
const verge = toon({ color: "#8fc45a", side: THREE.DoubleSide });
const paint = toon({ color: "#ffffff" });

/** A polyline with extra points so no stretch is longer than `step` (so it follows the ground). */
function densify(points: readonly Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  points.forEach((p, i) => {
    if (!i) return out.push(p);
    const a = points[i - 1];
    const n = Math.max(1, Math.ceil(a.distance(p) / step));
    for (let k = 1; k <= n; k++) out.push(a.add(p.sub(a).scale(k / n)));
  });
  return out;
}

/** The roads: asphalt with pavements in town, narrow lanes, gravel tracks with grass down the middle. */
function roads(s: Scenery): THREE.Group {
  const g = new THREE.Group();
  for (const road of s.roads) {
    const r = { ...road, points: densify(road.points, 1.5) };
    const tarmac = r.kind !== "gravel";
    if (r.kind === "main" || r.kind === "street") g.add(ribbon(s, r.points, r.width / 2 + 1.2, 0.1, kerbMat));
    g.add(ribbon(s, r.points, r.width / 2, 0.14, tarmac ? asphalt : gravelMat));
    if (r.kind === "gravel") g.add(ribbon(s, r.points, 0.25, 0.17, verge));
    if (r.turning) {
      const h = s.height(r.turning.at.x, r.turning.at.y);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r.turning.radius, 48), asphalt);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(r.turning.at.x, h + 0.15, r.turning.at.y);
      const island = new THREE.Mesh(new THREE.CylinderGeometry(r.turning.radius * 0.35, r.turning.radius * 0.35, 0.2, 32), verge);
      island.position.set(r.turning.at.x, h + 0.2, r.turning.at.y);
      g.add(disc, island);
    }
    // A dashed centre line on main roads.
    if (r.kind === "main")
      for (let i = 1; i < r.points.length; i += 1) {
        const [a, b] = [r.points[i - 1], r.points[i]];
        if (i % 2) continue;
        const mid = a.add(b).scale(0.5);
        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, Math.min(a.distance(b) * 0.6, 4)), paint);
        dash.position.set(mid.x, s.height(mid.x, mid.y) + 0.16, mid.y);
        dash.rotation.y = Math.atan2(b.x - a.x, b.y - a.y);
        g.add(dash);
      }
  }
  return g;
}

/** The water: a lake or the sea as its outline (with island holes), a river as a winding band; foam along shores, reeds in clumps. */
function water(s: Scenery): THREE.Group {
  const w = s.water!;
  const g = new THREE.Group();
  const colour = w.kind === "sea" ? "#2f9fe0" : w.kind === "river" ? "#4fb6e0" : "#3fb3e8";
  const surface = toon({ color: colour, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
  g.userData.surface = surface;
  const foam = toon({ color: "#ffffff", side: THREE.DoubleSide });
  // Ripples: rings that grow and fade on the water near the plot.
  const ripples: THREE.Mesh[] = [];
  const ring = new THREE.RingGeometry(0.85, 1, 24);
  ring.rotateX(-Math.PI / 2);
  for (let i = 0, tries = 0; i < 26 && tries < 2000; tries++) {
    const k = tries * 2.399;
    const p = new Vec2(Math.cos(k) * (6 + tries * 0.4), Math.sin(k) * (6 + tries * 0.4)).add(new Vec2(0, 0));
    const at = (w.river ? w.river.points[Math.floor((tries * 7) % w.river.points.length)] : w.outline[Math.floor((tries * 5) % w.outline.length)]).add(p.scale(0.15));
    if (s.waterDistance(at.x, at.y) > -1.5) continue;
    const r = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }));
    r.position.set(at.x, w.level + 0.03, at.y);
    g.add(r);
    ripples.push(r);
    i++;
  }
  g.userData.ripples = ripples;
  g.userData.reeds = [];
  if (w.river) {
    g.add(ribbon(s, w.river.points, w.river.widths.map((x) => x / 2 + 0.8), 0, surface, w.level));
    return g;
  }
  // A little larger than the water's edge, so it meets the sloping shore.
  const grow = (pts: readonly Vec2[], by: number) => {
    const c = pts.reduce((a, b) => a.add(b), new Vec2(0, 0)).scale(1 / pts.length);
    return pts.map((p) => p.add(p.sub(c).normalize().scale(by)));
  };
  const outline = w.kind === "sea" ? w.outline : grow(w.outline, 0.6);
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.y)));
  for (const isle of w.islands) shape.holes.push(new THREE.Path(grow(isle, -0.6).map((p) => new THREE.Vector2(p.x, -p.y))));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 4), surface);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = w.level;
  g.add(mesh);
  // Deeper water further out: a darker area a few metres in from the shore.
  if (w.kind === "lake") {
    const deepShape = new THREE.Shape(grow(w.outline, -4).map((p) => new THREE.Vector2(p.x, -p.y)));
    const deep = new THREE.Mesh(new THREE.ShapeGeometry(deepShape, 4), toon({ color: "#2a8fce", transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    deep.rotation.x = -Math.PI / 2;
    deep.position.y = w.level + 0.01;
    g.userData.deep = deep;
    g.add(deep);
  }
  // Foam along the shore (the coast only, for the sea).
  const shore = w.kind === "sea" ? w.outline.slice(0, -2) : [...w.outline, w.outline[0]];
  if (!w.cliff) g.add(ribbon(s, shore, 0.35, 0.02, foam, w.level));
  for (const isle of w.islands) g.add(ribbon(s, [...isle, isle[0]], 0.3, 0.02, foam, w.level));
  // Reeds, in clumps along the shore.
  if (w.reeds) {
    const reed = toon({ color: "#5f9e3f" });
    const stem = new THREE.ConeGeometry(0.06, 1.3, 5);
    w.outline.forEach((p, i) => {
      if (Math.sin(i * 0.9) + Math.sin(i * 0.37 + 1) < 0.6) return;
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Mesh(stem, reed);
        m.position.set(p.x + Math.sin(i * 7 + k) * 0.6, w.level + 0.6, p.y + Math.cos(i * 5 + k) * 0.6);
        m.rotation.z = Math.sin(i + k) * 0.15;
        g.add(m);
        (g.userData.reeds as THREE.Object3D[]).push(m);
      }
    });
  }
  return g;
}

function jetty(s: Scenery): THREE.Group {
  const j = s.jetty!;
  const g = new THREE.Group();
  const wood = worldMaterial(groundTexture("wood"), { color: "#e7c79a" });
  const len = j.from.distance(j.to);
  const dir = j.to.sub(j.from).normalize();
  const deckY = Math.max((s.water?.level ?? 0) + 0.5, s.height(j.from.x, j.from.y) + 0.15);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(j.width, 0.15, len), wood);
  const mid = j.from.add(j.to).scale(0.5);
  deck.position.set(mid.x, deckY, mid.y);
  deck.rotation.y = Math.atan2(dir.x, dir.y);
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  const across = new Vec2(-dir.y, dir.x).scale(j.width / 2);
  for (let t = 1; t <= len; t += 2.5)
    for (const side of [-1, 1]) {
      const p = j.from.add(dir.scale(t)).add(across.scale(side));
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 8), wood);
      post.position.set(p.x, deckY - 1.1, p.y);
      g.add(post);
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
/** Leaves that turn in autumn and fall in winter: spring, autumn colours. */
const turning = (c: string, spring: string, autumn: string) => seasonal(leaf(c), { spring, autumn, winter: null });
const AUTUMN = ["#d9822b", "#e0a030", "#c9541f", "#e6b43a"];
const LEAVES = ["#4caf50", "#5cbf3f", "#43a84f", "#6fc94a"].map((c, i) => turning(c, "#86d65a", AUTUMN[i]));
const LEAVES_LIGHT = ["#7fd65c", "#8fdc5a", "#79cf62", "#97e06a"].map((c, i) => turning(c, "#b3ec7a", AUTUMN[(i + 1) % 4]));
// Fruit trees blossom in spring and are green in summer.
const BLOSSOM = seasonal(leaf("#ff9ec7"), { summer: "#5cbf3f", autumn: "#e0a030", winter: null });
const BLOSSOM_LIGHT = seasonal(leaf("#ffc7de"), { summer: "#8fdc5a", autumn: "#e6b43a", winter: null });
// Pines keep their needles, and hold the snow.
const PINE = snowy(leaf("#2f8a52"));
const PINE_LIGHT = snowy(leaf("#4aa865"));
const BIRCH_LEAVES = turning("#a6dc52", "#c3ec6a", "#f2c230");
const OAK_LEAVES = turning("#3f8f3a", "#7cc94a", "#b07a2e");
const OAK_LIGHT = turning("#5aa84a", "#9adb5e", "#c98f35");
const MAPLE_LEAVES = turning("#5cb848", "#8fdc5a", "#d8432e");
const MAPLE_LIGHT = turning("#7ccf58", "#a8e66a", "#e8742e");
const WILLOW_LEAVES = turning("#9cc84a", "#c2e36a", "#d6c04a");
const APPLE = seasonal(toon({ color: "#e8332e" }), { spring: null, winter: null });
const STUMP_TOP = toon({ color: "#d9b27c" });
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
    case "oak": {
      // A thick short trunk, spreading boughs and a broad, low crown.
      add(trunkGeo, TRUNK, 0, 1.1 * k, 0, 0.5 * k, 2.2 * k, 0.5 * k);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + r(i);
        const bough = add(trunkGeo, TRUNK, Math.cos(a) * 0.7 * k, 2.4 * k, Math.sin(a) * 0.7 * k, 0.16 * k, 1.8 * k, 0.16 * k);
        bough.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
      }
      add(canopy, OAK_LEAVES, 0, 3.4 * k, 0, 2.6 * k, 1.4 * k, 2.6 * k);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + r(i + 4);
        add(canopy, i % 2 ? OAK_LIGHT : OAK_LEAVES, Math.cos(a) * 2.1 * k, (3.0 + r(i + 11) * 0.6) * k, Math.sin(a) * 2.1 * k, 1.2 * k, 0.9 * k, 1.2 * k);
      }
      add(canopy, OAK_LIGHT, 0.3 * k, 4.3 * k, 0.2 * k, 1.5 * k, 0.8 * k, 1.5 * k);
      break;
    }
    case "maple": {
      // A straight trunk and a tall, dense, rounded crown: red in autumn.
      add(trunkGeo, TRUNK, 0, 1.4 * k, 0, 0.28 * k, 2.8 * k, 0.28 * k);
      add(canopy, MAPLE_LEAVES, 0, 4.0 * k, 0, 1.8 * k, 2.0 * k, 1.8 * k);
      add(canopy, MAPLE_LIGHT, 0.5 * k, 4.9 * k, -0.3 * k, 1.1 * k, 1.1 * k, 1.1 * k);
      add(canopy, MAPLE_LEAVES, -0.8 * k, 3.4 * k, 0.6 * k, 1.0 * k);
      break;
    }
    case "willow": {
      // A leaning trunk, and curtains of leaves hanging down all round.
      const lean = add(trunkGeo, TRUNK, 0.2 * k, 1.5 * k, 0, 0.3 * k, 3.1 * k, 0.3 * k, -0.12);
      lean.castShadow = true;
      add(canopy, WILLOW_LEAVES, 0.35 * k, 4.0 * k, 0, 1.6 * k, 1.0 * k, 1.6 * k);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + r(i) * 0.3;
        add(canopy, WILLOW_LEAVES, 0.35 * k + Math.cos(a) * 1.6 * k, (2.6 + r(i + 7) * 0.4) * k, Math.sin(a) * 1.6 * k, 0.55 * k, 1.6 * k, 0.55 * k);
      }
      break;
    }
    case "stump": {
      add(trunkGeo, TRUNK, 0, 0.2 * k, 0, 0.45 * k, 0.4 * k, 0.45 * k);
      const top = add(trunkGeo, STUMP_TOP, 0, 0.41 * k, 0, 0.36 * k, 0.02 * k, 0.36 * k);
      top.castShadow = false;
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
const rockMat = snowy(toon({ color: "#b4b0aa", flatShading: true }));

function rock(s: Scenery, x: number, y: number, size: number): THREE.Mesh {
  const m = new THREE.Mesh(rockGeo, rockMat);
  m.scale.set(size * 1.2, size * 0.7, size);
  m.position.copy(at(s, x, y, size * 0.2));
  m.rotation.set(x, y, 0);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// --- Buildings round about -------------------------------------------------------------

/**
 * A group for something standing at `at`, turned so that its local -z (its front) faces
 * `facing` (plan radians), on the lowest ground under a footprint of `w` × `d`.
 */
function placed(s: Scenery, at: Vec2, facing: number, w: number, d: number): { g: THREE.Group; plinth: number } {
  const f = new Vec2(Math.cos(facing), Math.sin(facing));
  const side = new Vec2(-f.y, f.x);
  const corners = [-1, 1].flatMap((u) => [-1, 1].map((v) => at.add(side.scale((u * w) / 2)).add(f.scale((v * d) / 2))));
  const heights = corners.map((p) => s.height(p.x, p.y));
  const base = Math.min(...heights);
  const g = new THREE.Group();
  g.position.set(at.x, base, at.y);
  g.rotation.y = Math.atan2(-f.x, -f.y);
  return { g, plinth: Math.max(...heights) - base };
}

const mats = {
  white: toon({ color: "#f6f4ee" }),
  red: toon({ color: "#b5382c" }),
  darkRoof: snowy(toon({ color: "#4a4f57" })),
  steel: toon({ color: "#b8bdc2" }),
  glass: toon({ color: "#8fd3ff" }),
  wood: toon({ color: "#9a6a42" }),
  hay: toon({ color: "#e8cf5f" }),
  sand: toon({ color: "#ead9a8" }),
  yellow: toon({ color: "#ffd23f" }),
  blue: toon({ color: "#3f7fbf" }),
  water: toon({ color: "#6cc8f0" }),
  stone: snowy(worldMaterial(wallTexture("Stone"))),
  plaster: worldMaterial(wallTexture("Plaster")),
  falu: worldMaterial(wallTexture("FaluRed")),
  logs: worldMaterial(wallTexture("Wood")),
};

/** Add a box spanning x0..x1, y0..y1, z0..z1 (local). */
function part(g: THREE.Group, m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** A gable roof over a w × d box (ridge across the width), starting at height y. */
function gable(g: THREE.Group, m: THREE.Material, w: number, d: number, y: number, pitch = 0.38, over = 0.4): void {
  const h = d * pitch;
  const shape = new THREE.Shape([new THREE.Vector2(-d / 2 - over, 0), new THREE.Vector2(d / 2 + over, 0), new THREE.Vector2(0, h)]);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: w + over * 2, bevelEnabled: false }), m);
  roof.rotation.y = Math.PI / 2;
  roof.position.set(-w / 2 - over, y, 0);
  roof.castShadow = true;
  g.add(roof);
}

/** A hipped roof: a four-sided pyramid stretched over the box. */
function hipRoof(g: THREE.Group, m: THREE.Material, w: number, d: number, y: number): void {
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), m);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(w + 0.8, d * 0.38, d + 0.8);
  roof.position.set(0, y + (d * 0.38) / 2, 0);
  roof.castShadow = true;
  g.add(roof);
}

/** Windows (and a door) on the front, -z face, of a w-wide box. */
function frontage(g: THREE.Group, w: number, d: number, y0: number, storeys: number, door: THREE.Material | null): void {
  const frame = mats.white;
  if (door) part(g, door, -0.5, 0.5, y0, y0 + 2.1, -d / 2 - 0.06, -d / 2 + 0.02);
  for (let s = 0; s < storeys; s++)
    for (const x of [-w / 3, w / 3]) {
      const y = y0 + 1.1 + s * 2.8;
      part(g, frame, x - 0.65, x + 0.65, y, y + 1.2, -d / 2 - 0.05, -d / 2 + 0.02);
      part(g, mats.glass, x - 0.55, x + 0.55, y + 0.1, y + 1.1, -d / 2 - 0.08, -d / 2 + 0.02);
    }
}

function neighborHouse(s: Scenery, n: Scenery["neighbors"][number]): THREE.Group {
  const { g, plinth } = placed(s, n.at, n.facing, n.width, n.depth);
  const wallH = 2.7 * n.storeys + 0.2;
  const facade = worldMaterial(wallTexture(n.facade));
  part(g, facade, -n.width / 2, n.width / 2, 0, wallH + plinth + 0.3, -n.depth / 2, n.depth / 2);
  const top = wallH + plinth + 0.3;
  const roofMat = snowy(toon({ color: ROOF_COLORS[n.roof % ROOF_COLORS.length] }));
  if (n.roofStyle === "gable") gable(g, roofMat, n.width, n.depth, top);
  else if (n.roofStyle === "hip") hipRoof(g, roofMat, n.width, n.depth, top);
  else part(g, roofMat, -n.width / 2 - 0.3, n.width / 2 + 0.3, top, top + 0.25, -n.depth / 2 - 0.3, n.depth / 2 + 0.3);
  frontage(g, n.width, n.depth, plinth + 0.3, n.storeys, toon({ color: ROOF_COLORS[(n.roof + 1) % ROOF_COLORS.length] }));
  return g;
}

/** A landmark: churches, windmills, barns, boathouses, a lighthouse, a ski lift and more. */
function landmark(s: Scenery, l: Landmark): THREE.Group {
  if (l.kind === "footbridge") return footbridge(s, l);
  if (l.kind === "skiLift") return skiLift(s, l);
  const size = { church: [9, 16], barn: [16, 10], boathouse: [4.5, 7], cabin: [6, 5], sauna: [3, 3], millRuin: [8, 7] }[l.kind as string] ?? [l.size, l.size];
  const { g, plinth } = placed(s, l.at, l.facing, size[0], size[1]);
  const y = plinth;
  switch (l.kind) {
    case "church": {
      part(g, mats.plaster, -4, 4, 0, y + 7, -5, 8);
      gable(g, mats.darkRoof, 8, 13, y + 7, 0.55, 0.3);
      g.children[g.children.length - 1].position.z = 1.5;
      part(g, mats.plaster, -1.8, 1.8, 0, y + 14, -8.5, -5);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(2.4, 7, 4), mats.darkRoof);
      spire.rotation.y = Math.PI / 4;
      spire.position.set(0, y + 17.5, -6.75);
      g.add(spire);
      part(g, mats.wood, -0.8, 0.8, y, y + 2.8, -8.56, -8.4);
      break;
    }
    case "windmill": {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.3, 9, 8), mats.white);
      body.position.y = y + 4.5;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.2, 8), mats.red);
      cap.position.y = y + 10.1;
      g.add(body, cap);
      for (let k = 0; k < 4; k++) {
        const sail = part(g, mats.wood, -0.4, 0.4, 0, 6.5, -0.1, 0.1);
        sail.geometry.translate(0, 3.25, 0);
        sail.position.set(0, y + 8.5, -2.2);
        sail.rotation.z = (k * Math.PI) / 2 + 0.4;
      }
      break;
    }
    case "barn":
      part(g, mats.falu, -8, 8, 0, y + 6, -5, 5);
      gable(g, mats.darkRoof, 16, 10, y + 6, 0.45);
      part(g, mats.white, -2, 2, y, y + 4.2, -5.06, -4.98);
      part(g, mats.falu, -1.8, 1.8, y, y + 4, -5.1, -5.02);
      break;
    case "silo": {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 11, 16), mats.steel);
      body.position.y = y + 5.5;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.steel);
      dome.position.y = y + 11;
      g.add(body, dome);
      break;
    }
    case "boathouse":
    case "sauna":
    case "cabin": {
      const [w, d] = size;
      const h = l.kind === "boathouse" ? 3 : 2.6;
      // A boathouse stands on posts over the water's edge.
      const floor = Math.max(y, (s.water?.level ?? -9) + 0.6 - g.position.y);
      for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) part(g, mats.wood, px - 0.12, px + 0.12, floor - 2, floor, pz - 0.12, pz + 0.12);
      part(g, l.kind === "cabin" ? mats.logs : mats.falu, -w / 2, w / 2, floor, floor + h, -d / 2, d / 2);
      gable(g, mats.darkRoof, w, d, floor + h, 0.5, 0.3);
      part(g, mats.white, -0.5, 0.5, floor, floor + 2, -d / 2 - 0.05, -d / 2 + 0.02);
      if (l.kind !== "boathouse") part(g, mats.stone, w / 4, w / 4 + 0.5, floor + h, floor + h + 1.6, 0, 0.5); // chimney
      break;
    }
    case "lighthouse": {
      for (let k = 0; k < 5; k++) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(1.9 - (k + 1) * 0.12, 1.9 - k * 0.12, 2.8, 16), k % 2 ? mats.red : mats.white);
        band.position.y = y + 1.4 + k * 2.8;
        g.add(band);
      }
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 12), mats.glass);
      lantern.position.y = y + 14.8;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.4, 12), mats.red);
      roof.position.y = y + 16.3;
      g.add(lantern, roof);
      break;
    }
    case "millRuin":
      part(g, mats.stone, -4, 4, 0, y + 4.5, 3, 3.7);
      part(g, mats.stone, -4, -3.3, 0, y + 3.2, -3.5, 3.7);
      part(g, mats.stone, 3.3, 4, 0, y + 5.5, -1, 3.7);
      part(g, mats.stone, -4, 0, 0, y + 1.8, -3.5, -2.8);
      {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(2, 0.25, 6, 16), mats.wood);
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(4.6, y + 1.5, 0.5);
        g.add(wheel);
      }
      break;
    case "playground": {
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.1, 24), mats.sand);
      sand.position.y = y + 0.05;
      g.add(sand);
      part(g, mats.red, -2.5, -1.3, y, y + 2, -1, 0.2); // slide tower
      const slide = part(g, mats.yellow, -1.3, 1.6, y + 1, y + 1.12, -0.8, 0);
      slide.rotation.z = -0.55;
      for (const x of [1.5, 3.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), mats.blue);
        post.position.set(x, y + 1.2, 2);
        g.add(post);
      }
      part(g, mats.blue, 1.5, 3.5, y + 2.35, y + 2.45, 1.95, 2.05);
      part(g, mats.wood, 2.2, 2.8, y + 0.5, y + 0.58, 1.8, 2.2); // swing seat
      break;
    }
    case "haybales":
      for (const [x, z] of [[-1.5, 0], [0, 0.6], [1.5, -0.2]]) {
        const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 14), mats.hay);
        bale.rotation.z = Math.PI / 2;
        bale.position.set(x, y + 0.75, z);
        bale.castShadow = true;
        g.add(bale);
      }
      break;
    case "fountain": {
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.7, 0.7, 24), mats.stone);
      basin.position.y = y + 0.35;
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.1, 24), mats.water);
      pool.position.y = y + 0.66;
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.8, 10), mats.stone);
      column.position.y = y + 1.2;
      g.add(basin, pool, column);
      break;
    }
  }
  return g;
}

/** A footbridge over the river: a gently arched deck with railings. */
function footbridge(s: Scenery, l: Landmark): THREE.Group {
  const g = new THREE.Group();
  const [a, b] = [l.at, l.to!];
  const ends = [s.height(a.x, a.y), s.height(b.x, b.y)];
  const top = Math.max(...ends, (s.water?.level ?? 0) + 1.2);
  const n = 10;
  const dir = b.sub(a);
  const across = new Vec2(-dir.y, dir.x).normalize().scale(0.9);
  for (let i = 0; i < n; i++) {
    const [t0, t1] = [i / n, (i + 1) / n];
    const h = (t: number) => ends[0] + (ends[1] - ends[0]) * t + (top - Math.max(...ends) + 0.6) * Math.sin(Math.PI * t);
    const p = a.add(dir.scale((t0 + t1) / 2));
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, dir.length() / n + 0.05), mats.wood);
    plank.position.set(p.x, (h(t0) + h(t1)) / 2 + 0.1, p.y);
    plank.rotation.order = "YXZ";
    plank.rotation.y = Math.atan2(dir.x, dir.y);
    plank.rotation.x = -Math.atan2(h(t1) - h(t0), dir.length() / n);
    plank.castShadow = true;
    g.add(plank);
    for (const side of [-1, 1]) {
      const q = p.add(across.scale(side));
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), mats.wood);
      post.position.set(q.x, (h(t0) + h(t1)) / 2 + 0.6, q.y);
      g.add(post);
    }
  }
  return g;
}

/** A chairlift up the slope: pylons with a cable, and a station at each end. */
function skiLift(s: Scenery, l: Landmark): THREE.Group {
  const g = new THREE.Group();
  const [a, b] = [l.at, l.to!];
  const n = Math.max(2, Math.round(a.distance(b) / 25));
  const tops: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const p = a.add(b.sub(a).scale(i / n));
    const h = s.height(p.x, p.y);
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 8, 6), mats.steel);
    pylon.position.set(p.x, h + 4, p.y);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.2), mats.steel);
    arm.position.set(p.x, h + 8, p.y);
    arm.rotation.y = Math.atan2(b.x - a.x, b.y - a.y) + Math.PI / 2;
    pylon.castShadow = true;
    g.add(pylon, arm);
    tops.push(new THREE.Vector3(p.x, h + 7.9, p.y));
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tops), new THREE.LineBasicMaterial({ color: 0x2a2433 })));
  for (const [p, facing] of [
    [a, Math.atan2(b.y - a.y, b.x - a.x)],
    [b, Math.atan2(a.y - b.y, a.x - b.x)],
  ] as const) {
    const station = placed(s, p, facing, 5, 4);
    part(station.g, mats.logs, -2.5, 2.5, 0, station.plinth + 3, -2, 2);
    gable(station.g, mats.red, 5, 4, station.plinth + 3, 0.5, 0.4);
    g.add(station.g);
  }
  return g;
}

/** A dry-stone wall along a polyline. */
function stoneWall(s: Scenery, points: readonly Vec2[]): THREE.Group {
  const g = new THREE.Group();
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const mid = a.add(b).scale(0.5);
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, a.distance(b) + 0.3), mats.stone);
    block.position.set(mid.x, s.height(mid.x, mid.y) + 0.3, mid.y);
    block.rotation.y = Math.atan2(b.x - a.x, b.y - a.y);
    block.castShadow = block.receiveShadow = true;
    g.add(block);
  }
  return g;
}

// --- Guides ----------------------------------------------------------------------------

function plotGuides(plot: Plot): THREE.Group {
  const guides = new THREE.Group();
  const outline = (inset: number, color: number) => {
    // Along the ground, a metre at a time, so the lines follow slopes.
    const corners = [
      [inset, inset],
      [plot.width - inset, inset],
      [plot.width - inset, plot.depth - inset],
      [inset, plot.depth - inset],
    ];
    const pts: THREE.Vector3[] = [];
    corners.forEach(([x0, y0], k) => {
      const [x1, y1] = corners[(k + 1) % 4];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let i = 0; i < n; i++) {
        const [x, y] = [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n];
        pts.push(new THREE.Vector3(x, groundHeight(plot, x, y) + 0.06, y));
      }
    });
    guides.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })));
  };
  outline(0, 0xffffff);
  outline(plot.setback, 0xffd94d);
  return guides;
}

// --- Ground cover ----------------------------------------------------------------------

const tuftGeo = (() => {
  // Three thin blades leaning out from a point.
  const blades = [0, 2.1, 4.2].map((a) => {
    const b = new THREE.ConeGeometry(0.05, 0.38, 3);
    b.translate(0, 0.19, 0);
    b.rotateZ(0.25);
    b.rotateY(a);
    return b;
  });
  const merged = new THREE.BufferGeometry();
  const pos: number[] = [];
  for (const b of blades) {
    const nb = b.toNonIndexed();
    pos.push(...(nb.getAttribute("position").array as Float32Array));
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  merged.computeVertexNormals();
  return merged;
})();
const flowerGeo = new THREE.IcosahedronGeometry(0.07, 0);
const fernGeo = (() => {
  const g = new THREE.ConeGeometry(0.45, 0.35, 6, 1, true);
  g.translate(0, 0.17, 0);
  return g;
})();
const TUFT = seasonal(toon({ color: "#5aa83f" }), { spring: "#7cc94a", autumn: "#a7a24a", winter: null });
const FERN = seasonal(toon({ color: "#3f8a3f", side: THREE.DoubleSide }), { autumn: "#a8742e", winter: null });
const WILDFLOWER = seasonal(toon({ color: "#ffffff" }), { autumn: null, winter: null });

/**
 * Tufts of long grass, wildflowers, and ferns under the trees, on the land round the plot
 * (not on the lawn, the roads or the water). Instanced: thousands cost one draw each.
 */
function groundCover(s: Scenery, plot: Plot): THREE.Group {
  const g = new THREE.Group();
  const centre = new Vec2(plot.width / 2, plot.depth / 2);
  const roadSegs = s.roads.flatMap((r) => r.points.slice(1).map((b, i) => ({ a: r.points[i], b, half: r.width / 2 + 1.2 })));
  const nearRoad = (p: Vec2) =>
    roadSegs.some(({ a, b, half }) => {
      const ab = b.sub(a);
      const t = Math.max(0, Math.min(1, p.sub(a).dot(ab) / Math.max(ab.dot(ab), 1e-9)));
      return a.add(ab.scale(t)).distance(p) < half;
    });
  const nearTrees = s.trees.filter((t) => t.at.distance(centre) < 80 && t.kind !== "bush");
  const tufts: THREE.Matrix4[] = [];
  const flowers: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const ferns: THREE.Matrix4[] = [];
  const FLOWER_COLOURS = ["#ffffff", "#ffd23f", "#ff9ec7", "#b388ff"].map((c) => new THREE.Color(c));
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const step = 1.5;
  for (let y = -55; y < plot.depth + 55; y += step)
    for (let x = -55; x < plot.width + 55; x += step) {
      const h1 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const r1 = h1 - Math.floor(h1);
      const h2 = Math.sin(x * 39.346 + y * 11.135) * 24634.6345;
      const r2 = h2 - Math.floor(h2);
      const p = new Vec2(x + (r1 - 0.5) * step, y + (r2 - 0.5) * step);
      const far = p.distance(centre);
      if (far > 70 || r1 > 0.25 + 0.6 * (1 - far / 70)) continue;
      if (p.x > -0.6 && p.x < plot.width + 0.6 && p.y > -0.6 && p.y < plot.depth + 0.6) continue;
      if (s.surface(p.x, p.y) !== "grass" || s.waterDistance(p.x, p.y) < 1.5 || nearRoad(p)) continue;
      const at = new THREE.Vector3(p.x, s.height(p.x, p.y) - 0.02, p.y);
      q.setFromAxisAngle(up, r2 * Math.PI * 2);
      const size = 0.7 + r2 * 0.8;
      const underTree = nearTrees.some((t) => t.at.distance(p) < 3.2 * t.size);
      if (underTree && r2 < 0.6) ferns.push(new THREE.Matrix4().compose(at, q, new THREE.Vector3(size, size * 0.8, size)));
      else tufts.push(new THREE.Matrix4().compose(at, q, new THREE.Vector3(size, size, size)));
      if (!underTree && r2 > 0.82) {
        for (let k = 0; k < 3; k++) {
          const off = new THREE.Vector3(Math.cos(k * 2.1 + r1 * 6) * 0.25, 0.3 + k * 0.05, Math.sin(k * 2.1 + r1 * 6) * 0.25);
          flowers.push({ m: new THREE.Matrix4().compose(at.clone().add(off), q, new THREE.Vector3(1, 1, 1)), c: FLOWER_COLOURS[Math.floor(r1 * 97 + k) % FLOWER_COLOURS.length] });
        }
      }
    }
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.receiveShadow = true;
    m.userData.noOutline = true;
    g.add(m);
    return m;
  };
  if (tufts.length) {
    const m = instanced(tuftGeo, TUFT, tufts.length);
    tufts.forEach((x, i) => m.setMatrixAt(i, x));
  }
  if (ferns.length) {
    const m = instanced(fernGeo, FERN, ferns.length);
    ferns.forEach((x, i) => m.setMatrixAt(i, x));
  }
  if (flowers.length) {
    const m = instanced(flowerGeo, WILDFLOWER, flowers.length);
    flowers.forEach((f, i) => {
      m.setMatrixAt(i, f.m);
      m.setColorAt(i, f.c);
    });
  }
  return g;
}
