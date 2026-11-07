/**
 * Turns the core house model into Three.js objects and draws the plot around it.
 */

import * as THREE from "three";
import { buildFurniture } from "./furniture3d";
import { PAINT_HEX, floorTexture, groundTexture, interiorTexture, roofTexture, toon, wallTexture, worldMaterial } from "./textures";
import {
  type House,
  type TriMesh,
  FLOOR_FINISHES,
  FLOOR_SLAB_HEIGHT,
  ROOF_MATERIALS,
  WALL_MATERIALS,
  PAINT_COLORS,
  type Plot,
  shapedGround,
  siteLevel,
  standingOutline,
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
  glass: toon({ color: "#a8dcff", transparent: true, opacity: 0.6 }),
  frame: matte(0.96, 0.96, 0.94, 0.6),
  // A cheerfully painted front door.
  door: toon({ color: "#e0584a" }),
  garageDoor: matte(0.82, 0.83, 0.84, 0.5),
  /** Room floors by finish. */
  floor: each(FLOOR_FINISHES, (f) => worldMaterial(floorTexture(f), { roughness: f === "Tiles" || f === "Stone" ? 0.5 : 0.8 })),
  slab: worldMaterial(floorTexture("Concrete")),
  stairs: worldMaterial(floorTexture("Wood"), { roughness: 0.7 }),
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

/** The garden's lawn, shared by every build. */
const lawnMaterial = worldMaterial(groundTexture("lawn"));

/**
 * The plot's lawn as built: following the ground, level around the house. Open over the
 * house when it has a basement, so the basement shows when the storeys above are hidden.
 */
function buildLawn(plot: Plot, ground: (x: number, y: number) => number, hole: readonly Vec2[] | null): THREE.Mesh {
  const step = 0.5;
  const nx = Math.round(plot.width / step);
  const ny = Math.round(plot.depth / step);
  const positions: number[] = [];
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const [x, y] = [(i / nx) * plot.width, (j / ny) * plot.depth];
      positions.push(x, ground(x, y) + 0.01, y);
    }
  const index: number[] = [];
  const at = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (hole && pointInPolygon(new Vec2Class(((i + 0.5) / nx) * plot.width, ((j + 0.5) / ny) * plot.depth), hole)) continue;
      index.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(((nx + 1) * (ny + 1)) * 2), 2));
  g.setIndex(index);
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

  if (house.roof && roof.ok && options.roof) {
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
  // The house on its platform; the lawn and the garden around it, on the ground.
  group.position.y = platform;
  const site = new THREE.Group();
  site.add(group, ...outside);
  if (options.plot) site.add(buildLawn(options.plot, ground, house.basement ? standingOutline(house) : null));
  return site;
}

/** Free the per-house geometry (shared geometry and materials are kept). */
export function disposeHouse(group: THREE.Group): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.geometry.userData.shared) o.geometry.dispose();
  });
  group.removeFromParent();
}
