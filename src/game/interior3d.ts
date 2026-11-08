/**
 * The finishing touches inside: ceiling lamps (lit at dusk, with a pool of light on the
 * floor), rugs, pictures on the walls, kitchen wall cabinets and stair railings. Where
 * they go is worked out in the core (`decorate`); this draws them.
 */

import * as THREE from "three";
import { type Decor, FLOOR_SLAB_HEIGHT, type House, type Picture, type Rug, type StairRail, type Vec2 } from "../core";
import { toon } from "./textures";

const unitBox = new THREE.BoxGeometry(1, 1, 1);
unitBox.userData.shared = true;
const unitPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
unitPlane.userData.shared = true;
const cord = new THREE.CylinderGeometry(0.008, 0.008, 1, 6);
cord.userData.shared = true;
const shade = new THREE.CylinderGeometry(0.07, 0.24, 0.22, 20, 1, true);
shade.userData.shared = true;
const bulb = new THREE.IcosahedronGeometry(0.06, 1);
bulb.userData.shared = true;

const M = {
  cord: toon({ color: "#2f2f33" }),
  shade: toon({ color: "#f3e7cf", side: THREE.DoubleSide }),
  bulb: toon({ color: "#fff4d8", emissive: "#ffc860", emissiveIntensity: 0 }),
  frame: toon({ color: "#3b3027" }),
  rail: toon({ color: "#f4f1ea" }),
  wood: toon({ color: "#b98b5e" }),
  cabinet: toon({ color: "#f2efe8" }),
  gap: toon({ color: "#9a958c" }),
};

/** The floor round a lamp, lit at dusk: a soft warm disc added on top. */
const pool = new THREE.MeshBasicMaterial({ map: radialTexture(), color: "#ffc977", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

/** Lamps light up as it gets dark. */
export function setLampsDusk(amount: number): void {
  M.bulb.emissiveIntensity = amount * 1.4;
  pool.opacity = amount * 0.45;
}

function radialTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- Rugs and pictures: small drawings on canvases, made once ---------------------------

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  const c = document.createElement("canvas");
  [c.width, c.height] = [w, h];
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const RUG_COLORS: [string, string, string][] = [
  ["#b8463c", "#f0e2c8", "#2f4a6b"],
  ["#3e5f8a", "#e9e4d6", "#c99a3b"],
  ["#5d7f4a", "#f3ecd8", "#8a4b3a"],
  ["#d8c7a5", "#8a6a4a", "#f7f1e3"],
];

let rugMaterials: THREE.Material[] | null = null;
function rugMaterial(pattern: number): THREE.Material {
  rugMaterials ??= RUG_COLORS.map(([base, light, accent], i) =>
    toon({
      map: canvasTexture(128, 96, (g) => {
        g.fillStyle = base;
        g.fillRect(0, 0, 128, 96);
        g.strokeStyle = light;
        g.lineWidth = 5;
        g.strokeRect(8, 8, 112, 80);
        g.strokeStyle = accent;
        g.lineWidth = 3;
        g.strokeRect(15, 15, 98, 66);
        g.fillStyle = light;
        if (i === 0) {
          // A diamond in the middle.
          g.beginPath();
          g.moveTo(64, 26);
          g.lineTo(92, 48);
          g.lineTo(64, 70);
          g.lineTo(36, 48);
          g.closePath();
          g.fill();
        } else if (i === 1) {
          for (let x = 24; x < 110; x += 14) g.fillRect(x, 24, 5, 48);
        } else if (i === 2) {
          for (const r of [24, 15, 6]) {
            g.fillStyle = r === 15 ? base : light;
            g.beginPath();
            g.ellipse(64, 48, r * 1.6, r, 0, 0, Math.PI * 2);
            g.fill();
          }
        } else {
          g.fillStyle = accent;
          for (let y = 24; y < 74; y += 10) g.fillRect(22, y, 84, 3);
        }
      }),
    }),
  );
  return rugMaterials[pattern % rugMaterials.length];
}

/** Five little paintings: hills and a sun, the sea, circles, flowers, a red cottage. */
const ART: ((g: CanvasRenderingContext2D, w: number, h: number) => void)[] = [
  (g, w, h) => {
    g.fillStyle = "#9fd3f0";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#ffd25a";
    g.beginPath();
    g.arc(w * 0.75, h * 0.3, h * 0.13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#5fae5a";
    g.beginPath();
    g.ellipse(w * 0.3, h, w * 0.5, h * 0.45, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#3f8a4a";
    g.beginPath();
    g.ellipse(w * 0.85, h, w * 0.45, h * 0.32, 0, 0, Math.PI * 2);
    g.fill();
  },
  (g, w, h) => {
    g.fillStyle = "#f6d9b8";
    g.fillRect(0, 0, w, h * 0.55);
    g.fillStyle = "#2f6f9f";
    g.fillRect(0, h * 0.55, w, h * 0.45);
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(w * 0.45, h * 0.2);
    g.lineTo(w * 0.45, h * 0.55);
    g.lineTo(w * 0.62, h * 0.55);
    g.closePath();
    g.fill();
    g.fillStyle = "#8a4b3a";
    g.fillRect(w * 0.36, h * 0.55, w * 0.3, h * 0.06);
  },
  (g, w, h) => {
    g.fillStyle = "#f4efe4";
    g.fillRect(0, 0, w, h);
    for (const [x, y, r, c] of [
      [0.3, 0.45, 0.28, "#e2574c"],
      [0.62, 0.55, 0.22, "#4fb0e6"],
      [0.5, 0.3, 0.12, "#e7b94a"],
    ] as const) {
      g.fillStyle = c;
      g.globalAlpha = 0.85;
      g.beginPath();
      g.arc(x * w, y * h, r * h, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  },
  (g, w, h) => {
    g.fillStyle = "#fbf3e6";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#4f8a3f";
    g.fillRect(w * 0.48, h * 0.45, w * 0.04, h * 0.5);
    for (const [x, y, c] of [
      [0.5, 0.35, "#d94f7a"],
      [0.3, 0.5, "#f0a030"],
      [0.7, 0.55, "#7a5fd0"],
    ] as const) {
      g.fillStyle = c;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.beginPath();
        g.arc(x * w + Math.cos(a) * h * 0.07, y * h + Math.sin(a) * h * 0.07, h * 0.06, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#ffe066";
      g.beginPath();
      g.arc(x * w, y * h, h * 0.05, 0, Math.PI * 2);
      g.fill();
    }
  },
  (g, w, h) => {
    g.fillStyle = "#cfe8f5";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#7cc06a";
    g.fillRect(0, h * 0.72, w, h * 0.28);
    g.fillStyle = "#b8352b";
    g.fillRect(w * 0.3, h * 0.42, w * 0.4, h * 0.32);
    g.fillStyle = "#3b3b40";
    g.beginPath();
    g.moveTo(w * 0.26, h * 0.43);
    g.lineTo(w * 0.5, h * 0.22);
    g.lineTo(w * 0.74, h * 0.43);
    g.closePath();
    g.fill();
    g.fillStyle = "#ffffff";
    g.fillRect(w * 0.37, h * 0.5, w * 0.08, h * 0.1);
    g.fillRect(w * 0.55, h * 0.5, w * 0.08, h * 0.1);
  },
];

let artMaterials: THREE.Material[] | null = null;
function artMaterial(art: number): THREE.Material {
  artMaterials ??= ART.map((draw) => toon({ map: canvasTexture(120, 90, (g) => draw(g, 120, 90)) }));
  return artMaterials[art % artMaterials.length];
}

// --- Building it ---------------------------------------------------------------------

export interface InteriorOptions {
  /** Lamps, rugs, pictures and cabinets (they go with the furniture). */
  furnishings: boolean;
  visible: (level: number) => boolean;
}

/** Everything for the decor of a house, in the house group's coordinates (its floor at 0). */
export function buildInterior(house: House, decor: Decor, o: InteriorOptions): THREE.Group {
  const g = new THREE.Group();
  const floorY = (level: number) => (level === 0 ? FLOOR_SLAB_HEIGHT : house.levelBase(level) + 0.01);
  const ceilingY = (level: number) => house.levelBase(level) + house.storeyHeight(level);
  const roomPick = (level: number, at: Vec2) => ({ kind: "room" as const, level, at });
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, pick: unknown, shadow = true) => {
    const m = new THREE.Mesh(geometry, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.userData.pick = pick;
    g.add(m);
    return m;
  };

  if (o.furnishings) {
    for (const l of decor.lamps) {
      if (!o.visible(l.level)) continue;
      const top = ceilingY(l.level);
      const pick = roomPick(l.level, l.at);
      const c = mesh(cord, M.cord, pick, false);
      c.position.set(l.at.x, top - l.drop / 2, l.at.y);
      c.scale.y = l.drop;
      const s = mesh(shade, M.shade, pick);
      s.position.set(l.at.x, top - l.drop - 0.05, l.at.y);
      const b = mesh(bulb, M.bulb, pick, false);
      b.position.set(l.at.x, top - l.drop - 0.12, l.at.y);
      const p = mesh(unitPlane, pool, pick, false);
      p.position.set(l.at.x, floorY(l.level) + 0.02, l.at.y);
      p.scale.set(l.reach * 2, 1, l.reach * 2);
      p.renderOrder = 2;
      p.userData.noOutline = true;
    }
    for (const r of decor.rugs) if (o.visible(r.level)) addRug(r);
    for (const p of decor.pictures) if (o.visible(p.level)) addPicture(p);
    for (const c of decor.cabinets) {
      if (!o.visible(c.level)) continue;
      const base = house.levelBase(c.level);
      const yaw = Math.atan2(-c.along.y, c.along.x);
      const at = (u: number, out: number, y: number) => new THREE.Vector3(c.at.x + c.along.x * u + c.out.x * out, base + y, c.at.y + c.along.y * u + c.out.y * out);
      const pick = roomPick(c.level, c.at.add(c.out.scale(0.6)));
      const body = mesh(unitBox, M.cabinet, pick);
      body.position.copy(at(0, 0.18, 1.8));
      body.rotation.y = yaw;
      body.scale.set(c.width, 0.7, 0.35);
      // Door gaps every 60 cm.
      for (let u = -c.width / 2 + 0.6; u < c.width / 2 - 0.05; u += 0.6) {
        const gap = mesh(unitBox, M.gap, pick, false);
        gap.position.copy(at(u, 0.36, 1.8));
        gap.rotation.y = yaw;
        gap.scale.set(0.008, 0.66, 0.01);
      }
    }
  }
  for (const r of decor.rails) addRail(r);
  return g;

  function addRug(r: Rug) {
    const m = mesh(unitPlane, rugMaterial(r.pattern), roomPick(r.level, r.at), false);
    m.position.set(r.at.x, floorY(r.level) + 0.012, r.at.y);
    m.rotation.y = Math.atan2(-r.along.y, r.along.x);
    m.scale.set(r.width, 1, r.depth);
  }

  function addPicture(p: Picture) {
    const yaw = Math.atan2(-p.along.y, p.along.x);
    // Which way the plane's front (+z, after turning by yaw) faces: it must face into the room.
    const front = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const flip = front.x * p.out.x + front.z * p.out.y < 0 ? Math.PI : 0;
    const y = floorY(p.level) + p.y;
    const pick = roomPick(p.level, p.at.add(p.out.scale(0.5)));
    const frame = mesh(unitBox, M.frame, pick);
    frame.position.set(p.at.x + p.out.x * 0.015, y, p.at.y + p.out.y * 0.015);
    frame.rotation.y = yaw;
    frame.scale.set(p.width + 0.08, p.height + 0.08, 0.03);
    const canvas = mesh(new THREE.PlaneGeometry(p.width, p.height), artMaterial(p.art), pick, false);
    canvas.position.set(p.at.x + p.out.x * 0.032, y, p.at.y + p.out.y * 0.032);
    canvas.rotation.y = yaw + flip;
  }

  function addRail(r: StairRail) {
    if (r.kind === "flight") {
      if (!o.visible(r.level)) return;
      const [y0, y1] = [floorY(r.level), house.levelBase(r.level + 1) + 0.01];
      const at = (t: number, up: number) => new THREE.Vector3(r.a.x + (r.b.x - r.a.x) * t, y0 + (y1 - y0) * t + up, r.a.y + (r.b.y - r.a.y) * t);
      beam(at(0, 0.9), at(1, 0.9), 0.05, 0.05, M.wood);
      const n = Math.max(2, Math.round(r.a.distance(r.b) / 0.3));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        beam(at(t, 0), at(t, 0.9), 0.03, 0.03, M.rail);
      }
      return;
    }
    if (!o.visible(r.level + 1)) return;
    const y = floorY(r.level + 1);
    const p = (q: Vec2, up: number) => new THREE.Vector3(q.x, y + up, q.y);
    beam(p(r.a, 0.95), p(r.b, 0.95), 0.06, 0.05, M.wood);
    const n = Math.max(1, Math.round(r.a.distance(r.b) / 0.3));
    for (let i = 0; i <= n; i++) {
      const q = r.a.add(r.b.sub(r.a).scale(i / n));
      beam(p(q, 0), p(q, 0.95), 0.03, 0.03, M.rail);
    }
  }

  function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, mat: THREE.Material) {
    const m = mesh(unitBox, mat, null);
    m.position.lerpVectors(a, b, 0.5);
    const dir = b.clone().sub(a).normalize();
    if (Math.abs(dir.y) > 0.99) m.up.set(0, 0, 1);
    else m.up.set(0, 1, 0);
    m.lookAt(b);
    m.scale.set(w, h, a.distanceTo(b));
  }
}
