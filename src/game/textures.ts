/**
 * Procedural textures, drawn on canvases at start-up (no image files), and materials
 * that map them in world space: a texture covers a fixed number of meters wherever it
 * is used, so bricks are brick-sized on every wall, however the wall's box is scaled.
 */

import * as THREE from "three";
import type { FloorFinish, FrameColor, PaintColor, RoofMaterial, Season, WallMaterial } from "../core";

const PX = 512;

/** Seeded random numbers, so textures look the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `hsl()` with lightness jittered by up to `spread` percent. */
const jitter = (rnd: () => number, h: number, s: number, l: number, spread: number) => `hsl(${h} ${s}% ${l + (rnd() - 0.5) * 2 * spread}%)`;

interface Painter {
  ctx: CanvasRenderingContext2D;
  rnd: () => number;
  /** Meters to pixels. */
  px: (m: number) => number;
}

/** A tiling texture covering `meters` × `meters`. */
function paint(meters: number, seed: number, draw: (p: Painter) => void): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext("2d")!;
  draw({ ctx, rnd: rng(seed), px: (m) => (m / meters) * PX });
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.userData.meters = meters;
  return tex;
}

/** Fine speckle over the whole canvas, for plaster, concrete, carpet, grass. */
function speckle({ ctx, rnd }: Painter, count: number, color: () => string, size = 2): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = color();
    ctx.fillRect(rnd() * PX, rnd() * PX, size, size);
  }
}

/** Thin streaks along x, for wood grain. */
function grain({ ctx, rnd }: Painter, y0: number, h: number, alpha: number): void {
  for (let i = 0; i < h / 2; i++) {
    ctx.strokeStyle = `rgba(60, 35, 15, ${alpha * rnd()})`;
    ctx.lineWidth = 0.5 + rnd();
    const y = y0 + rnd() * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(PX * 0.3, y + (rnd() - 0.5) * 4, PX * 0.6, y + (rnd() - 0.5) * 4, PX, y);
    ctx.stroke();
  }
}

/** Rows of planks along x with staggered joints (floors), or full-width boards (siding). */
function planks(p: Painter, width: number, length: number, hue: number, sat: number, light: number, joints: boolean): void {
  const { ctx, rnd, px } = p;
  const rows = Math.round(PX / px(width));
  const h = PX / rows;
  for (let r = 0; r < rows; r++) {
    const pieces = joints ? Math.max(1, Math.round(PX / px(length))) : 1;
    const w = PX / pieces;
    const shift = joints ? (r % 3) * (w / 3) : 0;
    for (let k = -1; k < pieces; k++) {
      ctx.fillStyle = jitter(rnd, hue + (rnd() - 0.5) * 4, sat, light, 4);
      ctx.fillRect(k * w + shift, r * h, w, h);
      ctx.fillStyle = "rgba(40, 25, 10, 0.55)";
      if (joints) ctx.fillRect(k * w + shift, r * h, 1.5, h);
    }
    grain(p, r * h, h, 0.12);
    ctx.fillStyle = "rgba(60, 30, 10, 0.75)";
    ctx.fillRect(0, r * h, PX, 2.5);
  }
}

/** Courses of rectangular units in running bond, with mortar joints. */
function bond(p: Painter, unitW: number, unitH: number, joint: number, mortar: string, unit: () => string): void {
  const { ctx, px } = p;
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, PX, PX);
  const [w, h, j] = [px(unitW + joint), px(unitH + joint), px(joint)];
  const rows = Math.round(PX / h);
  const cols = Math.round(PX / w);
  const [cw, ch] = [PX / cols, PX / rows];
  for (let r = 0; r < rows; r++) {
    for (let c = -1; c < cols; c++) {
      ctx.fillStyle = unit();
      ctx.fillRect(c * cw + (r % 2) * (cw / 2) + j / 2, r * ch + j / 2, cw - j, ch - j);
    }
  }
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

export function wallTexture(m: WallMaterial): THREE.Texture {
  return cached(`wall:${m}`, () => {
    switch (m) {
      case "Wood": // horizontal weatherboards, natural
        return paint(2.4, 1, (p) => planks(p, 0.2, 6, 32, 62, 55, false));
      case "FaluRed": // vertical board-and-batten in Falu red
        return paint(2.4, 2, (p) => {
          const { ctx, rnd, px } = p;
          const boards = Math.round(PX / px(0.2));
          const w = PX / boards;
          for (let i = 0; i < boards; i++) {
            ctx.fillStyle = jitter(rnd, 4, 70, 40, 2);
            ctx.fillRect(i * w, 0, w, PX);
          }
          ctx.save();
          ctx.translate(PX, 0);
          ctx.rotate(Math.PI / 2);
          grain(p, 0, PX, 0.12);
          ctx.restore();
          for (let i = 0; i < boards; i++) {
            ctx.fillStyle = "rgba(40, 8, 4, 0.55)";
            ctx.fillRect(i * w - 2, 0, 3, PX);
            ctx.fillStyle = jitter(rnd, 4, 66, 35, 1);
            ctx.fillRect(i * w - px(0.025), 0, px(0.05), PX); // batten
            ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
            ctx.fillRect(i * w - px(0.025), 0, 2, PX);
          }
        });
      case "Brick":
        return paint(1.6, 3, (p) => bond(p, 0.3, 0.1, 0.02, "#f1e6d2", () => jitter(p.rnd, 10, 62, 47, 5)));
      case "Plaster":
        return paint(2, 4, (p) => {
          p.ctx.fillStyle = "#fbefd2";
          p.ctx.fillRect(0, 0, PX, PX);
          speckle(p, 1500, () => "rgba(200,170,120,0.12)", 3);
        });
      case "Concrete": // smooth board-formed concrete with tie holes
        return paint(2.4, 7, (p) => {
          const { ctx, rnd, px } = p;
          ctx.fillStyle = "#b9bcc1";
          ctx.fillRect(0, 0, PX, PX);
          speckle(p, 2200, () => (rnd() < 0.5 ? "rgba(90,95,105,0.10)" : "rgba(255,255,255,0.12)"), 3);
          const panel = PX / 2;
          for (let i = 0; i <= 2; i++) {
            ctx.fillStyle = "rgba(70,74,82,0.35)";
            ctx.fillRect(0, i * panel - 1, PX, 2);
            ctx.fillRect(i * panel - 1, 0, 2, PX);
          }
          for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++) {
              ctx.fillStyle = "rgba(60,64,72,0.55)";
              ctx.beginPath();
              ctx.arc(panel * 0.25 + (c * panel) / 2, panel * 0.25 + (r * panel) / 2, px(0.012) + 1, 0, Math.PI * 2);
              ctx.fill();
            }
        });
      case "Stone":
        return paint(2.4, 5, (p) => {
          const { ctx, rnd, px } = p;
          ctx.fillStyle = "#6f7480";
          ctx.fillRect(0, 0, PX, PX);
          let y = 0;
          while (y < PX) {
            const h = px(0.18 + rnd() * 0.16);
            let x = -rnd() * px(0.3);
            while (x < PX) {
              const w = px(0.28 + rnd() * 0.35);
              ctx.fillStyle = jitter(rnd, 30 + rnd() * 190, 14, 74, 6);
              ctx.beginPath();
              ctx.roundRect(x + 3, y + 3, w - 6, Math.min(h, PX - y) - 6, 8);
              ctx.fill();
              x += w;
            }
            y += h;
          }
        });
    }
  });
}

/** What each wall paint looks like (multiplies the white interior finish). */
/** Window and door frame colours, as painted. */
export const FRAME_HEX: Record<FrameColor, string> = { White: "#f4f1ea", Black: "#2b2b2e", Green: "#3f6b4a", Blue: "#3d5f8c", Red: "#9c3a2e" };

export const PAINT_HEX: Record<PaintColor, string> = {
  White: "#ffffff",
  Cream: "#fbe6bd",
  Sky: "#a9d4f5",
  Mint: "#b2ead0",
  Blush: "#f7c2cc",
  Sunny: "#ffe07f",
  Lavender: "#d5c6f2",
  Sage: "#c6d8ae",
};

/** Interior wall finish: smooth white paint. */
export function interiorTexture(): THREE.Texture {
  return cached("interior", () =>
    paint(2, 6, (p) => {
      p.ctx.fillStyle = "#fff8ec";
      p.ctx.fillRect(0, 0, PX, PX);
    }),
  );
}

export function floorTexture(f: FloorFinish): THREE.Texture {
  return cached(`floor:${f}`, () => {
    switch (f) {
      case "Wood":
        return paint(2.4, 11, (p) => planks(p, 0.2, 1.2, 30, 65, 58, true));
      case "Laminate":
        return paint(2.4, 12, (p) => planks(p, 0.22, 1.4, 38, 45, 75, true));
      case "Tiles":
        return paint(1.6, 13, (p) => bond(p, 0.38, 0.38, 0.025, "#8fb3c9", () => jitter(p.rnd, 195, 40, 92, 2)));
      case "Stone":
        return paint(2.4, 14, (p) => {
          bond(p, 0.6, 0.6, 0.02, "#7d7a74", () => jitter(p.rnd, 30, 12, 72, 6));
          for (let i = 0; i < 40; i++) {
            p.ctx.strokeStyle = "rgba(255,255,255,0.12)";
            p.ctx.beginPath();
            p.ctx.moveTo(p.rnd() * PX, p.rnd() * PX);
            p.ctx.lineTo(p.rnd() * PX, p.rnd() * PX);
            p.ctx.stroke();
          }
        });
      case "Carpet":
        return paint(1, 15, (p) => {
          p.ctx.fillStyle = "#e8a46f";
          p.ctx.fillRect(0, 0, PX, PX);
          speckle(p, 6000, () => jitter(p.rnd, 22, 70, 62, 6), 3);
        });
      case "Concrete":
        return paint(3, 16, (p) => {
          p.ctx.fillStyle = "#c2c4c8";
          p.ctx.fillRect(0, 0, PX, PX);
          for (let i = 0; i < 60; i++) {
            p.ctx.fillStyle = `rgba(${p.rnd() < 0.5 ? "60,58,55" : "230,228,222"}, 0.05)`;
            p.ctx.beginPath();
            p.ctx.arc(p.rnd() * PX, p.rnd() * PX, 20 + p.rnd() * 60, 0, Math.PI * 2);
            p.ctx.fill();
          }
          speckle(p, 1500, () => "rgba(80,80,90,0.15)", 3);
        });
    }
  });
}

/** Roof coverings. Texture rows run along u; v runs down the slope. */
export function roofTexture(r: RoofMaterial): THREE.Texture {
  return cached(`roof:${r}`, () => {
    switch (r) {
      case "Shingles":
        return paint(1.8, 21, (p) => {
          const { ctx, rnd, px } = p;
          const rows = Math.round(PX / px(0.14));
          const h = PX / rows;
          const tab = PX / Math.round(PX / px(0.33));
          for (let r2 = 0; r2 < rows; r2++) {
            for (let x = -tab; x < PX; x += tab) {
              ctx.fillStyle = jitter(rnd, 215, 38, 42, 4);
              ctx.fillRect(x + (r2 % 2) * (tab / 2), r2 * h, tab - 2, h);
            }
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.fillRect(0, r2 * h + h - 3, PX, 3);
          }

        });
      case "Metal":
        return paint(2, 22, (p) => {
          const { ctx, px } = p;
          const seams = Math.round(PX / px(0.5));
          const w = PX / seams;
          for (let i = 0; i < seams; i++) {
            const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
            g.addColorStop(0, "#2f8f86");
            g.addColorStop(0.5, "#3fb3a6");
            g.addColorStop(1, "#2c8a80");
            ctx.fillStyle = g;
            ctx.fillRect(i * w, 0, w, PX);
            ctx.fillStyle = "#9fe3d9";
            ctx.fillRect(i * w, 0, 3, PX);
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.fillRect(i * w + 3, 0, 2, PX);
          }
        });
      case "Tiles":
        return paint(1.5, 23, (p) => {
          const { ctx, rnd, px } = p;
          const rows = Math.round(PX / px(0.32));
          const cols = Math.round(PX / px(0.25));
          const [w, h] = [PX / cols, PX / rows];
          for (let r2 = 0; r2 < rows; r2++) {
            for (let c = 0; c < cols; c++) {
              const g = ctx.createLinearGradient(c * w, 0, (c + 1) * w, 0);
              const base = 18 + (rnd() - 0.5) * 6;
              g.addColorStop(0, `hsl(${base} 72% 40%)`);
              g.addColorStop(0.45, `hsl(${base} 80% 56%)`);
              g.addColorStop(1, `hsl(${base} 72% 38%)`);
              ctx.fillStyle = g;
              ctx.fillRect(c * w, r2 * h, w, h);
            }
            ctx.fillStyle = "rgba(30,8,0,0.5)";
            ctx.fillRect(0, r2 * h + h - 4, PX, 4);
          }
        });
    }
  });
}

export function groundTexture(kind: "grass" | "lawn" | "asphalt" | "wood"): THREE.Texture {
  return cached(`ground:${kind}`, () => {
    if (kind === "wood") return paint(2.4, 31, (p) => planks(p, 0.2, 1.2, 30, 45, 45, true));
    if (kind === "asphalt")
      return paint(4, 32, (p) => {
        p.ctx.fillStyle = "#6a7180";
        p.ctx.fillRect(0, 0, PX, PX);
        speckle(p, 4000, () => jitter(p.rnd, 220, 10, 46, 8), 3);
      });
    if (kind === "lawn")
      // A mowed lawn: light and dark stripes.
      return paint(4, 33, (p) => {
        for (let i = 0; i < 8; i++) {
          p.ctx.fillStyle = i % 2 ? "hsl(100 55% 50%)" : "hsl(99 56% 47%)";
          p.ctx.fillRect(0, (i * PX) / 8, PX, PX / 8);
        }
        speckle(p, 2500, () => jitter(p.rnd, 95, 60, 40, 6), 3);
      });
    return paint(6, 34, (p) => {
      p.ctx.fillStyle = "hsl(98 52% 46%)";
      p.ctx.fillRect(0, 0, PX, PX);
      // Soft tufts.
      for (let i = 0; i < 160; i++) {
        p.ctx.fillStyle = `hsla(${88 + p.rnd() * 20} 60% ${38 + p.rnd() * 14}% / 0.5)`;
        p.ctx.beginPath();
        p.ctx.ellipse(p.rnd() * PX, p.rnd() * PX, 6 + p.rnd() * 10, 3 + p.rnd() * 5, 0, 0, Math.PI * 2);
        p.ctx.fill();
      }
    });
  });
}

/**
 * Cel shading: light falls off in three flat bands instead of a smooth gradient, which,
 * with outlines and saturated colours, gives the game its cartoon look.
 */
const GRADIENT = (() => {
  const tex = new THREE.DataTexture(new Uint8Array([90, 175, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

/**
 * A cel-shaded material. Takes standard-material parameters so callers need not care;
 * roughness and metalness have no meaning in a cartoon and are ignored.
 */
export function toon(params: THREE.MeshStandardMaterialParameters = {}): THREE.MeshToonMaterial {
  const { roughness: _r, metalness: _m, envMapIntensity: _e, flatShading: _f, ...rest } = params;
  return new THREE.MeshToonMaterial({ ...(rest as THREE.MeshToonMaterialParameters), gradientMap: GRADIENT });
}

/**
 * A cel-shaded material drawing `texture` in world space: walls by their horizontal
 * position and height, floors from above, and roof slopes along the slope (v runs
 * down the slope, u along the eaves).
 */
export function worldMaterial(texture: THREE.Texture, params: THREE.MeshStandardMaterialParameters = {}): THREE.MeshToonMaterial {
  const meters = (texture.userData.meters as number) ?? 1;
  const mat = toon({ ...params, map: texture });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.texMeters = { value: meters };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\nuniform float texMeters;")
      .replace(
        "#include <map_fragment>",
        `vec3 an = abs(vWNormal);
        vec2 hz = vWNormal.xz;
        float hl = length(hz);
        vec2 wuv;
        if (an.y > 0.97) {
          wuv = vWPos.xz;                       // floors and flat roofs
        } else if (an.y > 0.2 && hl > 0.01) {
          vec2 down = hz / hl;                  // sloped roofs: along the eave, down the slope
          wuv = vec2(dot(vWPos.xz, vec2(-down.y, down.x)), dot(vWPos.xz, down) / max(an.y, 0.3));
        } else {
          wuv = an.x > an.z ? vec2(vWPos.z, vWPos.y) : vec2(vWPos.x, vWPos.y);   // walls
        }
        vec4 sampledDiffuseColor = texture2D(map, wuv / texMeters);
        diffuseColor *= sampledDiffuseColor;`,
      );
  };
  mat.customProgramCacheKey = () => `world-mapped:${meters}`;
  return mat;
}

const swatches = new Map<THREE.Texture, string>();

/** A small image of a texture, for material buttons in the menus. */
export function swatchUrl(texture: THREE.Texture): string {
  let url = swatches.get(texture);
  if (!url) {
    const src = texture.image as HTMLCanvasElement;
    const c = document.createElement("canvas");
    c.width = c.height = 48;
    // Show about a meter's worth, so brick and tiles read at their size.
    const part = Math.min(src.width, src.width / ((texture.userData.meters as number) ?? 1));
    c.getContext("2d")!.drawImage(src, 0, 0, part, part, 0, 0, 48, 48);
    url = c.toDataURL();
    swatches.set(texture, url);
  }
  return url;
}

// --- Seasons ----------------------------------------------------------------------------

/** How much snow lies on everything that faces up and was made `snowy` (0 to 1). */
const SNOW = { value: 0 };

/**
 * Let snow settle on a material: in winter, surfaces facing up turn white, less so the
 * steeper they are. Only for things outdoors (indoor floors face up too).
 */
export function snowy<T extends THREE.Material>(mat: T): T {
  const before = mat.onBeforeCompile.bind(mat);
  const key = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms.snowAmount = SNOW;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vSnowUp;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvSnowUp = normalize(mat3(modelMatrix) * objectNormal).y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vSnowUp;\nuniform float snowAmount;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.97, 1.0), snowAmount * smoothstep(0.45, 0.8, vSnowUp));");
  };
  mat.customProgramCacheKey = () => `${key()}|snowy`;
  return mat;
}

type Colored = THREE.Material & { color: THREE.Color };
/** A colour per season; null hides the material (bare branches in winter); missing keeps its own. */
type SeasonColors = Partial<Record<Season, string | null>>;
const seasonalMaterials: { mat: Colored; base: THREE.Color; colors: SeasonColors }[] = [];

/** Make a material change colour with the seasons (leaves turning, bare in winter). */
export function seasonal<T extends Colored>(mat: T, colors: SeasonColors): T {
  seasonalMaterials.push({ mat, base: mat.color.clone(), colors });
  return mat;
}

let season: Season = "summer";
export const currentSeason = (): Season => season;

/** Dress everything for a season: leaf colours, bare trees and snow. */
export function applySeason(s: Season): void {
  season = s;
  SNOW.value = s === "winter" ? 1 : 0;
  for (const { mat, base, colors } of seasonalMaterials) {
    const c = colors[s];
    mat.visible = c !== null;
    mat.color.copy(c ? new THREE.Color(c) : base);
  }
}
