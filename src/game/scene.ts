/**
 * Turns the core house model into Three.js objects and draws the plot around it.
 */

import * as THREE from "three";
import {
  type House,
  type Plot,
  type RoofMaterial,
  type RoomType,
  type TriMesh,
  type WallMaterial,
  FLOOR_SLAB_HEIGHT,
  FLOOR_STRUCTURE,
  STAIR_LENGTH,
  STAIR_WIDTH,
  type Vec2,
  pointInPolygon,
  slabOutline,
  stairDirection,
  stairOutline,
  ROOM_INFO,
  ROOM_TYPES,
  analyzeRooms,
  buildFloor,
  buildRoof,
  wallPieces,
  wallThickness,
} from "../core";

const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

function matte(r: number, g: number, b: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: srgb(r, g, b), roughness, metalness: 0 });
}

/** Roofs and gables are thin single-layer surfaces, so they render both sides. */
function roofMat(r: number, g: number, b: number, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: srgb(r, g, b), roughness, metalness, side: THREE.DoubleSide });
}

function roomMaterials(): Record<RoomType, THREE.Material> {
  const out = {} as Record<RoomType, THREE.Material>;
  for (const t of ROOM_TYPES) out[t] = new THREE.MeshStandardMaterial({ color: new THREE.Color(ROOM_INFO[t].color), roughness: 0.9 });
  return out;
}

/** Shared materials, one per building material. */
const palette = {
  wall: {
    Wood: matte(0.58, 0.4, 0.26, 0.85),
    Brick: matte(0.6, 0.27, 0.2, 0.95),
    Plaster: matte(0.93, 0.89, 0.8, 0.9),
  } satisfies Record<WallMaterial, THREE.Material>,
  interior: matte(0.95, 0.94, 0.91, 0.9),
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
  garageDoor: matte(0.82, 0.83, 0.84, 0.5),
  floor: matte(0.55, 0.55, 0.53, 0.95),
  /** Room floors, tinted by what the room is for. */
  room: roomMaterials(),
  untypedRoom: matte(0.86, 0.84, 0.8, 0.95),
  slab: matte(0.72, 0.71, 0.68, 0.95),
  stairs: matte(0.66, 0.5, 0.34, 0.8),
};

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const FRAME_WIDTH = 0.07;
export const SKY_COLOR = srgb(0.62, 0.78, 0.93);

export interface World {
  /** Ground, plot, street and lights. */
  root: THREE.Group;
  /** Plot boundary and setback lines. */
  guides: THREE.Object3D;
}

/** The static surroundings of a plot. */
export function buildWorld(plot: Plot): World {
  const root = new THREE.Group();
  const center = new THREE.Vector3(plot.width * 0.5, 0, plot.depth * 0.5);

  const flat = (w: number, d: number, color: THREE.Color, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  // Surrounding land, the plot's lawn, and a street along the front (low-z) edge.
  flat(400, 400, srgb(0.42, 0.55, 0.3), center.x, -0.01, center.z);
  flat(plot.width, plot.depth, srgb(0.38, 0.62, 0.28), center.x, 0, center.z);
  flat(400, 7, srgb(0.32, 0.32, 0.34), center.x, 0.002, -4.5);

  root.add(new THREE.HemisphereLight(srgb(0.85, 0.9, 1.0), srgb(0.42, 0.55, 0.3), 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.position.set(center.x - 30, 50, center.z - 30);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const extent = Math.max(plot.width, plot.depth);
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 200 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  root.add(sun, sun.target);

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
  root.add(guides);
  return { root, guides };
}

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
  return g;
}

function solid(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Build all objects for a house. Dispose the result with {@link disposeHouse}. */
export interface HouseViewOptions {
  /** Show the roof. */
  roof: boolean;
  /** Show storeys up to this level only (a cutaway); the roof needs every storey shown. */
  upTo?: number;
}

export function buildHouse(house: House, options: HouseViewOptions = { roof: true }): THREE.Group {
  const group = new THREE.Group();
  const top = house.topLevel();
  const upTo = Math.min(options.upTo ?? top, top);
  const analyses = Array.from({ length: house.levels }, (_, k) => analyzeRooms(house, k));
  const layoutOf = (level: number) => {
    const a = analyses[level];
    return a?.ok ? a.value.layout : null;
  };
  const base = (level: number) => house.levelBase(level);

  const box = (u: number, v: number, at: (u: number, v: number) => THREE.Vector3, size: THREE.Vector3, rotY: number, mat: THREE.Material) => {
    const mesh = solid(unitBox, mat);
    mesh.position.copy(at(u, v));
    mesh.scale.copy(size);
    mesh.rotation.y = rotY;
    group.add(mesh);
  };

  for (const wall of house.walls) {
    if (wall.boundary || wall.level > upTo) continue; // room boundaries are not built
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

    for (const p of wallPieces(wall, openings, t)) {
      box((p.u0 + p.u1) * 0.5, (p.v0 + p.v1) * 0.5, at, size(p.u1 - p.u0, p.v1 - p.v0, t), rotY, exterior ? palette.wall[wall.material] : palette.interior);
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
    if (level > upTo) return;
    if (!analysis.ok) {
      const floor = level === 0 ? buildFloor(house) : null;
      if (floor?.ok) group.add(solid(toGeometry(floor.value), palette.floor));
      return;
    }
    const wells = house.stairs.filter((s) => s.level + 1 === level).map(stairOutline);
    for (const room of analysis.value.rooms) {
      const holes = wells.filter((w) => pointInPolygon(w[0].add(w[2]).scale(0.5), room.polygon));
      const y = level === 0 ? FLOOR_SLAB_HEIGHT : base(level) + 0.01;
      group.add(flat(room.polygon, holes, y, room.type ? palette.room[room.type] : palette.untypedRoom));
    }
  });

  // Floor structure between storeys; where the storey above is smaller it is a terrace.
  for (let level = 0; level < top && level < upTo; level++) {
    const outline = slabOutline(house, level);
    if (!outline) continue;
    const wells = house.stairs.filter((s) => s.level === level).map(stairOutline);
    const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeOf(outline, wells), { depth: FLOOR_STRUCTURE, bevelEnabled: false }), palette.slab);
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = base(level) + house.storeyHeight(level);
    slab.castShadow = slab.receiveShadow = true;
    group.add(slab);
  }

  // Stairs: a solid flight of steps from one storey's floor to the next.
  for (const s of house.stairs) {
    if (s.level > upTo || s.level + 1 >= house.levels) continue;
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
      step.position.set(c.x, from + h / 2, c.y);
      step.scale.set(going, h, STAIR_WIDTH);
      step.rotation.y = rotY;
      group.add(step);
    }
  }

  const roof = buildRoof(house);
  if (house.roof && roof.ok && options.roof && upTo === top) {
    group.add(solid(toGeometry(roof.value.surface), palette.roof[house.roof.material]));
    if (!roof.value.gables.isEmpty()) {
      const topLayout = layoutOf(top);
      const exteriorWall = house.wallsOn(top).find((w) => !w.boundary && (!topLayout || topLayout.exterior.has(w.id)));
      group.add(solid(toGeometry(roof.value.gables), palette.gable[exteriorWall?.material ?? "Plaster"]));
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
