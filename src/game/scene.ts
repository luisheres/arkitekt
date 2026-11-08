/**
 * Turns the core house model into Three.js objects and draws the plot around it.
 */

import * as THREE from "three";
import { buildFurniture } from "./furniture3d";
import { PAINT_HEX, floorTexture, groundTexture, interiorTexture, roofTexture, toon, wallTexture, worldMaterial } from "./textures";
import {
  type House,
  FLOOR_FINISHES,
  FLOOR_SLAB_HEIGHT,
  ROOF_MATERIALS,
  WALL_MATERIALS,
  PAINT_COLORS,
  type Plot,
  shapedGround,
  siteLevel,
  retainingWalls,
  chimneys,
  CHIMNEY_SIZE,
  dormerShape,
  TriMesh,
  Vec3,
  accessRoutes,
  exposedBase,
  siteOf,
  type Site,
  isGardenPlant,
  FLOOR_STRUCTURE,
  roomAt,
  STAIR_LENGTH,
  STAIR_WIDTH,
  type Vec2,
  interiorNormal,
  leftNormal,
  balconyOutline,
  outwardNormal,
  Vec2 as Vec2Class,
  pointInPolygon,
  slabOutline,
  offsetPolygon,
  stairDirection,
  stairOutline,
  analyzeRooms,
  buildFloor,
  buildRoof,
  wallPieces,
  wallThickness,
} from "../core";

const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

function matte(r: number, g: number, b: number, _roughness: number): THREE.MeshToonMaterial {
  return toon({ color: srgb(r, g, b) });
}


/** One material per entry of an enum, built by `make`. */
function each<K extends string>(keys: readonly K[], make: (k: K) => THREE.Material): Record<K, THREE.Material> {
  const out = {} as Record<K, THREE.Material>;
  for (const k of keys) out[k] = make(k);
  return out;
}

/** Shared materials, one per building material, textured in world space. */
const palette = {
  wall: each(WALL_MATERIALS, (m) => worldMaterial(wallTexture(m), { roughness: m === "Stone" ? 0.95 : 0.85 })),
  interior: each(PAINT_COLORS, (c) => worldMaterial(interiorTexture(), { roughness: 0.9, color: PAINT_HEX[c] })),
  // Gables and fascia use the facade material but must render from both sides.
  gable: each(WALL_MATERIALS, (m) => worldMaterial(wallTexture(m), { roughness: 0.85, side: THREE.DoubleSide })),
  roof: each(ROOF_MATERIALS, (m) =>
    worldMaterial(roofTexture(m), { roughness: m === "Metal" ? 0.45 : 0.85, metalness: m === "Metal" ? 0.5 : 0, side: THREE.DoubleSide }),
  ),
  glass: toon({ color: "#a8dcff", transparent: true, opacity: 0.6, emissive: "#ffcf70", emissiveIntensity: 0 }),
  frame: matte(0.96, 0.96, 0.94, 0.6),
  // A cheerfully painted front door.
  door: toon({ color: "#e0584a" }),
  garageDoor: matte(0.82, 0.83, 0.84, 0.5),
  /** Room floors by finish. */
  floor: each(FLOOR_FINISHES, (f) => worldMaterial(floorTexture(f), { roughness: f === "Tiles" || f === "Stone" ? 0.5 : 0.8 })),
  slab: worldMaterial(floorTexture("Concrete")),
  stairs: worldMaterial(floorTexture("Wood"), { roughness: 0.7 }),
  deck: worldMaterial(groundTexture("wood"), { color: "#e7c79a" }),
  brick: worldMaterial(wallTexture("Brick")),
};

const unitBox = new THREE.BoxGeometry(1, 1, 1);
unitBox.userData.shared = true;
const FRAME_WIDTH = 0.07;
export { type World, buildWorld } from "./landscape";
import type { World } from "./landscape";

/** Free a world's geometry and per-world materials. */
export function disposeWorld(world: World): void {
  world.root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  world.root.removeFromParent();
}

/** A plan polygon (with holes) as a Three.js shape in the plane that `flat` lays down. */
function shapeOf(poly: readonly Vec2[], holes: readonly (readonly Vec2[])[]): THREE.Shape {
  // Shape y = -plan y, so rotating the shape onto the ground maps it back to plan y = world z.
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, -p.y))));
  return shape;
}

/** A horizontal surface at height `y`, facing up. */
function flat(poly: readonly Vec2[], holes: readonly (readonly Vec2[])[], y: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(poly, holes)), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function toGeometry(t: TriMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(t.positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(t.normals, 3));
  // Textures are mapped in world space; the attribute only has to exist.
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((t.positions.length / 3) * 2), 2));
  return g;
}

function solid(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Build all objects for a house. Dispose the result with {@link disposeHouse}. */
/** What a mesh shows, so a click in the 3D view can select it. Stored as `userData.pick`. */
export type Pick =
  | { kind: "wall"; id: number }
  | { kind: "opening"; id: number }
  | { kind: "stair"; id: number }
  | { kind: "furniture"; id: number }
  | { kind: "balcony"; id: number }
  | { kind: "dormer"; id: number }
  | { kind: "room"; level: number; at: Vec2 }
  | { kind: "roof" };

export interface HouseViewOptions {
  /** Show the roof. */
  roof: boolean;
  /** Storeys to leave out, to look into the ones below or around. */
  hidden?: ReadonlySet<number>;
  /** Show furniture in rooms that have a use. */
  furniture?: boolean;
  /**
   * The plot it stands on: the house goes on its level platform, the lawn is shaped around
   * it (dug out and filled), and garden plants stand on the ground.
   */
  plot?: Plot;
}

/** A glass railing with a handrail and posts, from a to b, standing at height y. */
function railing(group: THREE.Group, a: Vec2, b: Vec2, y: number): void {
  const length = a.distance(b);
  if (length < 0.05) return;
  const g = new THREE.Group();
  g.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
  const d = b.sub(a);
  g.rotation.y = Math.atan2(-d.y, d.x);
  const part = (mat: THREE.Material, x: number, py: number, sx: number, sy: number, sz: number) => {
    const mesh = solid(unitBox, mat);
    mesh.position.set(x, py, 0);
    mesh.scale.set(sx, sy, sz);
    g.add(mesh);
  };
  const h = 1.0;
  part(palette.frame, 0, h, length, 0.05, 0.07);
  part(palette.glass, 0, h / 2, length - 0.04, h * 0.8, 0.02);
  const posts = Math.max(1, Math.round(length / 1.2));
  for (let i = 0; i <= posts; i++) part(palette.frame, -length / 2 + (length * i) / posts, h / 2, 0.05, h, 0.05);
  group.add(g);
}

/** Stone for retaining walls, and dark metal for light-well gratings. */
const retainingMaterial = worldMaterial(wallTexture("Stone"), { side: THREE.DoubleSide });
const gratingMaterial = toon({ color: "#3a3d42" });
/** Driveways and paths. */
const routeMaterials = {
  asphalt: worldMaterial(groundTexture("asphalt"), { side: THREE.DoubleSide }),
  gravel: toon({ color: "#d9c79e", side: THREE.DoubleSide }),
  paving: worldMaterial(floorTexture("Stone"), { side: THREE.DoubleSide, color: "#efe6d6" }),
};
/** Concrete for a foundation showing above the ground. */
const baseMaterial = worldMaterial(wallTexture("Concrete"), { side: THREE.DoubleSide });

/** The garden's lawn, shared by every build. */
const lawnMaterial = worldMaterial(groundTexture("lawn"));

/**
 * The plot's lawn as built, following the shaped ground. It stops at the house's outer
 * face (so no grass shows inside the walls or a basement), and where it meets the house
 * or a retaining wall its cells are split finely, each piece taking the height of its own
 * side, so the grass never slants up a wall.
 */
function buildLawn(plot: Plot, site: Site | null, ground: (x: number, y: number) => number): THREE.Mesh {
  const step = 0.5;
  const nx = Math.round(plot.width / step);
  const ny = Math.round(plot.depth / step);
  const positions: number[] = [];
  const square = (x0: number, y0: number, size: number, height: (x: number, y: number) => number) => {
    const c = [
      [x0, y0],
      [x0 + size, y0],
      [x0 + size, y0 + size],
      [x0, y0 + size],
    ].map(([x, y]) => [x, height(x, y) + 0.01, y]);
    positions.push(...c[0], ...c[3], ...c[1], ...c[1], ...c[3], ...c[2]);
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const [x0, y0] = [(i / nx) * plot.width, (j / ny) * plot.depth];
      if (!site) {
        square(x0, y0, step, ground);
        continue;
      }
      const regions = [
        [x0, y0],
        [x0 + step, y0],
        [x0, y0 + step],
        [x0 + step, y0 + step],
        [x0 + step / 2, y0 + step / 2],
      ].map(([x, y]) => site.region(new Vec2Class(x, y)));
      if (regions.every((r) => r === regions[0])) {
        if (regions[0] !== "house") square(x0, y0, step, ground);
        continue;
      }
      // Along an edge: small pieces, each on its own side.
      const n = 6;
      const sub = step / n;
      for (let b = 0; b < n; b++)
        for (let a = 0; a < n; a++) {
          const [sx, sy] = [x0 + a * sub, y0 + b * sub];
          const r = site.region(new Vec2Class(sx + sub / 2, sy + sub / 2));
          if (r !== "house") square(sx, sy, sub, (x, y) => site.heightIn(new Vec2Class(x, y), r));
        }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, lawnMaterial);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildHouse(house: House, options: HouseViewOptions = { roof: true }): THREE.Group {
  const group = new THREE.Group();
  const platform = options.plot ? siteLevel(house, options.plot) : 0;
  const ground = options.plot ? shapedGround(house, options.plot) : () => 0;
  /** What stands on the ground rather than on the platform. */
  const outside: THREE.Object3D[] = [];
  const top = house.topLevel();
  const visible = (level: number) => level >= house.lowestLevel() && level < house.levels && !options.hidden?.has(level);
  const analyses = new Map(house.levelList().map((k) => [k, analyzeRooms(house, k)]));
  const layoutOf = (level: number) => {
    const a = analyses.get(level);
    return a?.ok ? a.value.layout : null;
  };
  const base = (level: number) => house.levelBase(level);

  /** What the boxes being added belong to. */
  let pick: Pick | null = null;
  const box = (u: number, v: number, at: (u: number, v: number) => THREE.Vector3, size: THREE.Vector3, rotY: number, mat: THREE.Material | THREE.Material[]) => {
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.userData.pick = pick;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.copy(at(u, v));
    mesh.scale.copy(size);
    mesh.rotation.y = rotY;
    group.add(mesh);
  };

  for (const wall of house.walls) {
    if (wall.boundary || !visible(wall.level)) continue; // room boundaries are not built
    const layout = layoutOf(wall.level);
    const y0 = base(wall.level);
    const openings = house.openingsIn(wall.id);
    const d = wall.direction();
    const rotY = Math.atan2(-d.y, d.x);
    // Wall-local (u along the wall, v up from its storey's floor) to world space.
    const at = (u: number, v: number) => {
      const p = wall.start.add(d.scale(u));
      return new THREE.Vector3(p.x, y0 + v, p.y);
    };
    const t = wallThickness(layout, wall);
    const exterior = !layout || layout.exterior.has(wall.id);
    const size = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // Box faces: +x, -x, +y, -y, +z, -z. Local +z is the wall's left side; an exterior
    // wall shows its facade outside, and each side facing a room shows that room's paint.
    const facade = palette.wall[wall.material];
    const analysis = analyses.get(wall.level);
    const rooms = analysis?.ok ? analysis.value.rooms : [];
    const left = leftNormal(wall);
    const leftIsInside = exterior && interiorNormal(house, wall).dot(left) > 0;
    const paintAt = (u: number, side: 1 | -1) => {
      const p = wall.start.add(d.scale(u)).add(left.scale(side * (t / 2 + 0.05)));
      return palette.interior[roomAt(rooms, p)?.paint ?? "White"];
    };
    const facesAt = (u: number): THREE.Material[] => {
      const [l, r] = [paintAt(u, 1), paintAt(u, -1)];
      if (!exterior) return [l, l, l, l, l, r];
      return [facade, facade, facade, facade, leftIsInside ? l : facade, leftIsInside ? facade : r];
    };
    const faces = facesAt(wall.length() / 2);
    pick = { kind: "wall", id: wall.id };
    for (const p of wallPieces(wall, openings, t)) {
      box((p.u0 + p.u1) * 0.5, (p.v0 + p.v1) * 0.5, at, size(p.u1 - p.u0, p.v1 - p.v0, t), rotY, facesAt((p.u0 + p.u1) * 0.5));
    }
    // With a storey above, the outer walls carry on in front of the floor structure,
    // so the facade is continuous.
    if (exterior && wall.level < top && visible(wall.level + 1)) {
      const [v0, v1] = [wall.height, house.storeyHeight(wall.level) + FLOOR_STRUCTURE];
      const len = wall.length();
      box(len / 2, (v0 + v1) / 2, at, size(len + t, v1 - v0, t), rotY, faces);
    }

    for (const o of openings) {
      pick = { kind: "opening", id: o.id };
      const [w, h, fw] = [o.width, o.height, FRAME_WIDTH];
      const midV = o.sill + h * 0.5;
      const frameDepth = t + 0.1; // a chunky lip, so it outlines as a solid line
      // Frame: top, left and right bars (plus a sill bar for windows).
      box(o.offset, o.top() - fw * 0.5, at, size(w, fw, frameDepth), rotY, palette.frame);
      for (const side of [o.left() + fw * 0.5, o.right() - fw * 0.5]) {
        box(side, midV, at, size(fw, h, frameDepth), rotY, palette.frame);
      }
      if (o.kind === "Window") {
        box(o.offset, o.sill + fw * 0.5, at, size(w, fw, frameDepth + 0.06), rotY, palette.frame);
        if (w >= 1.6) {
          // Split wide windows with mullions roughly every metre.
          const panes = Math.round(w);
          for (let i = 1; i < panes; i++) {
            box(o.left() + (w * i) / panes, midV, at, size(fw * 0.8, h, frameDepth * 0.6), rotY, palette.frame);
          }
        }
        const glass = solid(unitBox, palette.glass);
        glass.userData.pick = pick;
        glass.castShadow = false;
        glass.position.copy(at(o.offset, midV));
        glass.scale.set(w - fw, h - fw, 0.02);
        glass.rotation.y = rotY;
        group.add(glass);
      } else if (o.kind === "GlassDoor") {
        // Two tall glass panels in a frame, with a bar between them.
        box(o.offset, midV, at, size(fw, h, frameDepth * 0.6), rotY, palette.frame);
        box(o.offset, o.sill + 0.04, at, size(w, 0.08, frameDepth), rotY, palette.frame);
        const glass = solid(unitBox, palette.glass);
        glass.userData.pick = pick;
        glass.castShadow = false;
        glass.position.copy(at(o.offset, midV));
        glass.scale.set(w - fw, h - fw, 0.02);
        glass.rotation.y = rotY;
        group.add(glass);
      } else if (o.kind === "Passage") {
        // Nothing to fill it: just the trim round the opening.
      } else if (o.kind === "GarageDoor") {
        // Sectional door: a pale panel with horizontal grooves.
        box(o.offset, midV - fw * 0.5, at, size(w - fw * 2, h - fw, 0.05), rotY, palette.garageDoor);
        for (let v = 0.5; v < h - 0.2; v += 0.5) box(o.offset, v, at, size(w - fw * 2, 0.03, 0.07), rotY, palette.frame);
      } else {
        box(o.offset, midV - fw * 0.5, at, size(w - fw * 2, h - fw, 0.06), rotY, palette.door);
      }
    }
  }

  // Floors: one per room, tinted by its use, with stairwells cut out upstairs; the
  // whole footprint when the ground floor's rooms are unknown.
  analyses.forEach((analysis, level) => {
    if (!visible(level)) return;
    if (!analysis.ok) {
      const floor = level === 0 ? buildFloor(house) : null;
      if (floor?.ok) group.add(solid(toGeometry(floor.value), palette.slab));
      return;
    }
    const wells = house.stairs.filter((s) => s.level + 1 === level).map(stairOutline);
    for (const room of analysis.value.rooms) {
      if (room.type === "Void") continue; // open to the storey below: no floor
      const holes = wells.filter((w) => pointInPolygon(w[0].add(w[2]).scale(0.5), room.polygon));
      const y = level === 0 ? FLOOR_SLAB_HEIGHT : base(level) + 0.01;
      const floor = flat(room.polygon, holes, y, palette.floor[room.floor]);
      floor.userData.pick = { kind: "room", level, at: room.anchor } satisfies Pick;
      group.add(floor);
    }
  });

  // Railings round openings to below, along their open edges.
  for (const [level, analysis] of analyses) {
    if (level < 1 || !visible(level) || !analysis.ok) continue;
    const voids = analysis.value.rooms.filter((r) => r.type === "Void");
    if (!voids.length) continue;
    pick = null;
    for (const w of house.wallsOn(level)) {
      if (!w.boundary) continue;
      const mid = w.start.add(w.end).scale(0.5);
      const n = leftNormal(w).scale(0.1);
      if (!voids.some((r) => pointInPolygon(mid.add(n), r.polygon) || pointInPolygon(mid.sub(n), r.polygon))) continue;
      railing(group, w.start, w.end, base(level) + FLOOR_SLAB_HEIGHT);
    }
  }

  // Floor structure between storeys (above the basement too); where the storey above is
  // smaller it is a terrace.
  for (let level = house.lowestLevel(); level < top; level++) {
    if (!visible(level + 1)) continue; // the slab is the floor of the storey above
    const outline = slabOutline(house, level);
    if (!outline) continue;
    const wells = house.stairs.filter((s) => s.level === level).map(stairOutline);
    // Openings in the floor above (double-height rooms below) go right through it.
    const above = analyses.get(level + 1);
    // (Shrunk by half a wall so each hole lies inside the slab: holes touching its edge are ignored.)
    const inset = house.wallsOn(level).reduce((m, w) => (w.boundary ? m : Math.max(m, w.thickness)), 0) / 2 + 0.02;
    const voids = above?.ok ? above.value.rooms.filter((r) => r.type === "Void").map((r) => offsetPolygon(r.polygon, -inset)) : [];
    const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeOf(outline, [...wells, ...voids]), { depth: FLOOR_STRUCTURE, bevelEnabled: false }), palette.slab);
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = base(level) + house.storeyHeight(level);
    slab.castShadow = slab.receiveShadow = true;
    group.add(slab);
  }

  // Stairs: a solid flight of steps from one storey's floor to the next.
  for (const s of house.stairs) {
    if (!visible(s.level) || s.level + 1 >= house.levels) continue;
    const d = stairDirection(s);
    const rotY = Math.atan2(-d.y, d.x);
    const [from, to] = [base(s.level), base(s.level + 1)];
    const steps = Math.max(2, Math.round((to - from) / 0.18));
    const going = STAIR_LENGTH / steps;
    const start = s.at.sub(d.scale(STAIR_LENGTH / 2));
    for (let i = 0; i < steps; i++) {
      const h = ((to - from) * (i + 1)) / steps;
      const c = start.add(d.scale(going * (i + 0.5)));
      const step = solid(unitBox, palette.stairs);
      step.userData.pick = { kind: "stair", id: s.id } satisfies Pick;
      step.position.set(c.x, from + h / 2, c.y);
      step.scale.set(going, h, STAIR_WIDTH);
      step.rotation.y = rotY;
      group.add(step);
    }
  }

  // Balconies: a slab sticking out from the wall at the storey's floor, with a railing
  // of posts, a handrail and glass panels.
  for (const b of house.balconies) {
    const wall = house.wall(b.wall);
    if (!wall || !visible(wall.level)) continue;
    const outline = balconyOutline(house, b);
    if (!outline) continue;
    const d = wall.direction();
    const g = new THREE.Group();
    const centre = outline.reduce((s, p) => s.add(p), new Vec2Class(0, 0)).scale(1 / 4);
    g.position.set(centre.x, base(wall.level), centre.y);
    g.rotation.y = Math.atan2(-d.y, d.x);
    // Local x runs along the wall; local z points away from it when `out` is 1.
    const out = outwardNormal(house, wall).dot(leftNormal(wall)) > 0 ? 1 : -1;
    const part = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const mesh = solid(unitBox, mat);
      mesh.position.set(x, y, z * out);
      mesh.scale.set(sx, sy, sz);
      mesh.userData.pick = { kind: "balcony", id: b.id } satisfies Pick;
      g.add(mesh);
    };
    const [hw, hd] = [b.width / 2, b.depth / 2];
    if (wall.level === 0) {
      // A terrace: a wooden deck at the ground floor's level, on posts down to the ground.
      part(palette.deck, 0, FLOOR_SLAB_HEIGHT - 0.06, 0, b.width, 0.12, b.depth);
      for (const x of [-hw + 0.15, hw - 0.15]) for (const z of [-hd + 0.3, hd - 0.15]) part(palette.stairs, x, -1.5, z, 0.14, 3, 0.14);
      // A step down along the front.
      part(palette.deck, 0, -0.12, hd + 0.2, b.width, 0.1, 0.4);
      group.add(g);
      continue;
    }
    part(palette.slab, 0, -0.1, 0, b.width, 0.2, b.depth);
    const railH = 1.05;
    const posts: [number, number][] = [];
    const along = Math.max(1, Math.round(b.width / 1.2));
    for (let i = 0; i <= along; i++) posts.push([-hw + (b.width * i) / along, hd - 0.04]);
    const across = Math.max(1, Math.round(b.depth / 1.2));
    for (let i = 0; i < across; i++) {
      const z = -hd + 0.04 + ((b.depth - 0.08) * i) / across;
      posts.push([-hw + 0.04, z], [hw - 0.04, z]);
    }
    for (const [x, z] of posts) part(palette.frame, x, railH / 2, z, 0.06, railH, 0.06);
    // Handrail and glass, along the front and both ends.
    part(palette.frame, 0, railH, hd - 0.04, b.width, 0.06, 0.08);
    part(palette.frame, -hw + 0.04, railH, 0, 0.08, 0.06, b.depth);
    part(palette.frame, hw - 0.04, railH, 0, 0.08, 0.06, b.depth);
    part(palette.glass, 0, railH * 0.5, hd - 0.04, b.width - 0.1, railH * 0.75, 0.02);
    part(palette.glass, -hw + 0.04, railH * 0.5, 0, 0.02, railH * 0.75, b.depth - 0.1);
    part(palette.glass, hw - 0.04, railH * 0.5, 0, 0.02, railH * 0.75, b.depth - 0.1);
    group.add(g);
  }

  const roof = buildRoof(house);
  if (options.furniture) {
    for (const f of house.furniture) {
      if (!visible(f.level)) continue;
      const piece = buildFurniture(f);
      piece.traverse((o) => (o.userData.pick = { kind: "furniture", id: f.id! } satisfies Pick));
      // Garden plants stand on the ground (outside the platform); everything else on the floor.
      if (isGardenPlant(f.kind)) {
        piece.position.y = ground(f.at.x, f.at.y);
        outside.push(piece);
        continue;
      }
      piece.position.y = f.level === 0 ? FLOOR_SLAB_HEIGHT : base(f.level) + 0.01;
      group.add(piece);
    }
  }

  // Chimneys: from each fireplace up through the storeys above and out through the roof.
  for (const c of chimneys(house, roof.ok ? roof.value : null)) {
      const f = house.furniturePiece(c.fireplace);
      if (!f || !visible(f.level)) continue;
      // Only above the roof when the roof is hidden, it would hang in the air: stop at the top storey then.
      const end = options.roof ? c.top : Math.min(c.top, house.levelBase(top) + house.storeyHeight(top));
      const stack = solid(unitBox, palette.brick);
      stack.position.set(c.at.x, (c.base + end) / 2, c.at.y);
      stack.scale.set(CHIMNEY_SIZE.width, end - c.base, CHIMNEY_SIZE.depth);
      stack.rotation.y = Math.atan2(c.facing.x, c.facing.y);
      stack.userData.pick = { kind: "furniture", id: c.fireplace } satisfies Pick;
      group.add(stack);
      if (options.roof) {
        const cap = solid(unitBox, palette.slab);
        cap.position.set(c.at.x, end + 0.05, c.at.y);
        cap.scale.set(CHIMNEY_SIZE.width + 0.12, 0.1, CHIMNEY_SIZE.depth + 0.12);
        cap.rotation.y = stack.rotation.y;
        group.add(cap);
      }
    }

  if (house.roof && roof.ok && options.roof) {
    // Dormers: a front wall with a window, cheeks down to the roof, and a little gable roof.
    for (const d of house.dormers) {
      const shape = dormerShape(house, d, roof.value);
      const wall = house.wall(d.wall);
      if (!shape || !wall) continue;
      const pickD = { kind: "dormer", id: d.id } satisfies Pick;
      const facade = palette.gable[wall.material];
      const covering = palette.roof[house.roof.material];
      const { front, along, inward, width: w, sill, eave, ridge, depth } = shape;
      const P = (u: number, v: number, h: number) => {
        const q = front.add(along.scale(u)).add(inward.scale(v));
        return new Vec3(q.x, h, q.y);
      };
      const walls = new TriMesh();
      const roofMesh = new TriMesh();
      const hw = w / 2;
      const out = new Vec3(-inward.x, 0, -inward.y);
      // Front wall, from a little below the roof surface up to the eaves, and its gable.
      walls.pushQuadFacing(P(-hw, 0, sill - 0.25), P(hw, 0, sill - 0.25), P(hw, 0, eave), P(-hw, 0, eave), out);
      walls.pushTriFacing(P(-hw, 0, eave), P(hw, 0, eave), P(0, 0, ridge), out);
      // Cheeks: triangles from the roof surface up to the eaves.
      for (const s of [-1, 1]) {
        const side = new Vec3(along.x * s, 0, along.y * s);
        walls.pushTriFacing(P(s * hw, 0, sill - 0.25), P(s * hw, 0, eave), P(s * hw, depth, eave), side);
      }
      // Its roof: two slopes, overhanging a little at the front and the sides.
      for (const s of [-1, 1]) {
        const up = new Vec3(along.x * s, 1, along.y * s);
        roofMesh.pushQuadFacing(P(s * (hw + 0.15), -0.25, eave - 0.08), P(s * (hw + 0.15), depth, eave - 0.08), P(0, depth, ridge), P(0, -0.25, ridge), up);
      }
      const wallsMesh = solid(toGeometry(walls), facade);
      const roofTop = solid(toGeometry(roofMesh), covering);
      wallsMesh.userData.pick = roofTop.userData.pick = pickD;
      group.add(wallsMesh, roofTop);
      // The window.
      const winH = Math.min(1.05, eave - sill - 0.3);
      const winMid = P(0, -0.04, sill + 0.15 + winH / 2);
      const frame = solid(unitBox, palette.frame);
      frame.position.set(winMid.x, winMid.y, winMid.z);
      frame.scale.set(Math.min(w - 0.4, 1.4), winH + 0.1, 0.1);
      frame.rotation.y = Math.atan2(-along.y, along.x);
      const glass = solid(unitBox, palette.glass);
      glass.position.copy(frame.position).add(new THREE.Vector3(out.x * 0.04, 0, out.z * 0.04));
      glass.scale.set(Math.min(w - 0.4, 1.4) - 0.12, winH - 0.04, 0.04);
      glass.rotation.y = frame.rotation.y;
      frame.userData.pick = glass.userData.pick = pickD;
      group.add(frame, glass);
    }
    const surface = solid(toGeometry(roof.value.surface), palette.roof[house.roof.material]);
    surface.userData.pick = { kind: "roof" } satisfies Pick;
    group.add(surface);
    if (!roof.value.gables.isEmpty()) {
      const topLayout = layoutOf(top);
      const exteriorWall = house.wallsOn(top).find((w) => !w.boundary && (!topLayout || topLayout.exterior.has(w.id)));
      const gables = solid(toGeometry(roof.value.gables), palette.gable[exteriorWall?.material ?? "Plaster"]);
      gables.userData.pick = { kind: "roof" } satisfies Pick;
      group.add(gables);
    }
  }
  if (options.plot) {
    // Retaining walls where the ground is cut deep: from the platform up to the ground behind.
    const walls = retainingWalls(house, options.plot);
    if (walls.length) {
      const positions: number[] = [];
      for (const w of walls) {
        const [a, b] = [w.a, w.b];
        const quad = [
          [a.x, platform, a.y],
          [b.x, platform, b.y],
          [b.x, w.topB + 0.03, b.y],
          [a.x, w.topA + 0.03, a.y],
        ];
        positions.push(...quad[0], ...quad[1], ...quad[2], ...quad[0], ...quad[2], ...quad[3]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, retainingMaterial);
      mesh.castShadow = mesh.receiveShadow = true;
      outside.push(mesh);
    }
    // The driveways and the path to the front door, on the ground.
    for (const r of accessRoutes(house, options.plot).routes) {
      const positions: number[] = [];
      const index: number[] = [];
      // Every half metre along the route, so it follows the ground.
      const pts: Vec2[] = [];
      r.points.forEach((p, i) => {
        if (!i) return pts.push(p);
        const a = r.points[i - 1];
        const n = Math.max(1, Math.ceil(a.distance(p) / 0.5));
        for (let k = 1; k <= n; k++) pts.push(a.add(p.sub(a).scale(k / n)));
      });
      pts.forEach((p, i) => {
        const dir = pts[Math.min(i + 1, pts.length - 1)].sub(pts[Math.max(i - 1, 0)]).normalize();
        const n = new Vec2Class(-dir.y, dir.x).scale(r.width / 2);
        for (const q of [p.add(n), p.sub(n)]) positions.push(q.x, ground(q.x, q.y) + 0.03, q.y);
        if (i) index.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
      g.setIndex(index);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, routeMaterials[r.surface]);
      mesh.receiveShadow = true;
      outside.push(mesh);
    }
    // Downhill, the house's base shows above the ground: concrete, flush with the facade,
    // from the ground up to the platform (below the basement, if there is one).
    const exposed = exposedBase(house, options.plot);
    if (exposed.length) {
      const top = platform - (house.basement ? house.basementDepth() : 0);
      const positions: number[] = [];
      for (const e of exposed) {
        const [ga, gb] = [Math.min(e.groundA, top) - 0.05, Math.min(e.groundB, top) - 0.05];
        if (ga >= top - 0.06 && gb >= top - 0.06) continue;
        const q = [
          [e.a.x, ga, e.a.y],
          [e.b.x, gb, e.b.y],
          [e.b.x, top, e.b.y],
          [e.a.x, top, e.a.y],
        ];
        positions.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
      }
      if (positions.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
        g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, baseMaterial);
        mesh.castShadow = mesh.receiveShadow = true;
        outside.push(mesh);
      }
    }
    // A light well outside each basement window: a grating at ground level.
    const basement = analyses.get(-1);
    for (const o of house.openings) {
      const wall = house.wall(o.wall);
      if (o.kind !== "Window" || !wall || wall.level !== -1 || !basement?.ok || !basement.value.layout.exterior.has(wall.id)) continue;
      const d = wall.direction();
      const out = outwardNormal(house, wall);
      const c = wall.start.add(d.scale(o.offset)).add(out.scale(wall.thickness / 2 + 0.5));
      const grate = new THREE.Group();
      grate.position.set(c.x, ground(c.x, c.y) + 0.03, c.y);
      grate.rotation.y = Math.atan2(-d.y, d.x);
      const bar = (x: number, z: number, sx: number, sz: number, mat: THREE.Material) => {
        const mesh = solid(unitBox, mat);
        mesh.position.set(x, 0, z);
        mesh.scale.set(sx, 0.06, sz);
        grate.add(mesh);
      };
      const [gw, gd] = [o.width + 0.3, 0.9];
      bar(0, 0, gw + 0.12, gd + 0.12, palette.slab);
      for (let x = -gw / 2 + 0.06; x < gw / 2; x += 0.12) bar(x, 0, 0.03, gd, gratingMaterial);
      outside.push(grate);
    }
  }

  // The house on its platform; the lawn and the garden around it, on the ground.
  group.position.y = platform;
  const site = new THREE.Group();
  site.add(group, ...outside);
  if (options.plot) site.add(buildLawn(options.plot, siteOf(house, options.plot), ground));
  // A soft shade on the ground round the foot of the house, where little sky light reaches.
  const foot = standingOutlineOf(house);
  if (options.plot && foot) site.add(contactShade(foot, ground));
  return site;
}

/** Free the per-house geometry (shared geometry and materials are kept). */
export function disposeHouse(group: THREE.Group): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.geometry.userData.shared) o.geometry.dispose();
  });
  group.removeFromParent();
}

/** Windows glow warm when it gets dark (0: daylight, 1: night). */
export function setDusk(amount: number): void {
  const glass = palette.glass as THREE.MeshToonMaterial;
  glass.emissiveIntensity = amount * 0.9;
  glass.opacity = 0.6 + amount * 0.35;
}

/** Casts shadows but is never seen: the roof or storeys hidden from view still shade the house. */
const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });

/**
 * What is hidden from view (the roof, hidden storeys), built only to cast its shadows, so
 * looking into the house shows the light as it really comes in.
 */
export function buildShadowCaster(house: House, options: HouseViewOptions): THREE.Group | null {
  const all = new Set(house.levelList());
  const shown = [...all].filter((k) => !options.hidden?.has(k));
  if (options.roof && shown.length === all.size) return null;
  const ghost = buildHouse(house, { roof: !options.roof || shown.length < all.size, hidden: new Set(shown), furniture: false, plot: options.plot });
  // Only the house itself (the first child): not the lawn, paths or garden around it.
  for (const extra of ghost.children.slice(1)) extra.removeFromParent();
  ghost.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = SHADOW_ONLY;
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  ghost.userData.shadowOnly = true;
  return ghost;
}

/** The outline the house stands on, grown to its outer faces. */
function standingOutlineOf(house: House): Vec2[] | null {
  const fp = house.footprint(0);
  if (!fp.ok) return null;
  const half = house.wallsOn(0).reduce((m, w) => (w.boundary ? m : Math.max(m, w.thickness)), 0) / 2;
  return offsetPolygon(fp.value, half);
}

const shadeMaterial = new THREE.MeshBasicMaterial({ color: "#1e2a14", transparent: true, depthWrite: false, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2 });

/** A band round the house's foot fading from a soft shade at the wall to nothing 1.4 m out. */
function contactShade(outline: readonly Vec2[], ground: (x: number, y: number) => number): THREE.Mesh {
  const outer = offsetPolygon(outline, 1.4);
  const positions: number[] = [];
  const colors: number[] = [];
  const n = outline.length;
  const push = (p: Vec2, alpha: number) => {
    positions.push(p.x, ground(p.x, p.y) + 0.025, p.y);
    colors.push(alpha, alpha, alpha, alpha);
  };
  for (let i = 0; i < n; i++) {
    const [a, b, c, d] = [outline[i], outline[(i + 1) % n], outer[(i + 1) % n], outer[i]];
    // Two triangles per side, split along the side so the fade follows it.
    const steps = Math.max(1, Math.ceil(a.distance(b) / 0.5));
    for (let k = 0; k < steps; k++) {
      const [t0, t1] = [k / steps, (k + 1) / steps];
      const [p0, p1] = [a.add(b.sub(a).scale(t0)), a.add(b.sub(a).scale(t1))];
      const [q0, q1] = [d.add(c.sub(d).scale(t0)), d.add(c.sub(d).scale(t1))];
      push(p0, 0.32), push(q0, 0), push(p1, 0.32);
      push(p1, 0.32), push(q0, 0), push(q1, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  const mesh = new THREE.Mesh(g, shadeMaterial);
  mesh.renderOrder = 1;
  return mesh;
}
