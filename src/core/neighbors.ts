/**
 * The neighbours' houses as real houses of the game: walls, windows and a door, a roof of
 * the game's styles and coverings, now and then a fireplace (so a chimney), and a few of
 * them in town turned into shops and a café. Also a helper for things that move along a
 * road (cars, people walking).
 */

import { addStoreyAbove, placeStair, setRoomType } from "./edit";
import { FURNITURE_SIZE } from "./furniture";
import { Vec2 } from "./geometry";
import { type FrameColor, House, ROOF_MATERIALS, type WindowStyle } from "./model";
import type { Plot } from "./plot";
import { type Neighbor, type Scenery, sceneryFor } from "./scenery";

export const SHOP_KINDS = ["cafe", "bakery", "grocer", "icecream"] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];

/** A number in 0..1 that depends only on a neighbour (where it stands). */
const hashOf = (n: Neighbor, k = 0) => {
  const s = Math.sin(n.at.x * 12.9898 + n.at.y * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * A neighbour's house, centred on the origin with its front (and front door) towards -y.
 * The same neighbour always gives the same house.
 */
export function neighborHouse(n: Neighbor, shop: ShopKind | null = null): House {
  const h = new House();
  const [w, d] = [n.width, n.depth];
  const ids = h.addWallLoop([new Vec2(-w / 2, -d / 2), new Vec2(w / 2, -d / 2), new Vec2(w / 2, d / 2), new Vec2(-w / 2, d / 2)], 2.7, n.facade);
  const [front, right, back, left] = ids;
  const wooden = n.facade === "Wood" || n.facade === "FaluRed";
  const smooth = n.facade === "Plaster" || n.facade === "Concrete";
  const style: WindowStyle | undefined = wooden && hashOf(n, 1) < 0.5 ? "Cottage" : smooth && hashOf(n, 1) < 0.4 ? "Modern" : undefined;
  const colours: FrameColor[] = ["White", "White", "Green", "Blue", "Black"];
  const color = colours[Math.floor(hashOf(n, 2) * colours.length)];
  const dress = (id: number) => {
    const o = h.opening(id)!;
    if (style) o.style = style;
    if (color !== "White") o.color = color;
  };
  h.addDoor(front, w / 2, 1, 2.1);
  if (shop) {
    // A shop window each side of the door.
    for (const u of [w / 4 - 0.3, (3 * w) / 4 + 0.3]) dress(h.addWindow(front, u, Math.min(2.6, w / 2 - 1.6), 1.9, 0.35));
  } else for (const u of [w / 6 + 0.3, (5 * w) / 6 - 0.3]) dress(h.addWindow(front, u, 1.3, 1.2, 0.9));
  dress(h.addWindow(right, d / 2, 1.2, 1.2, 0.9));
  dress(h.addWindow(left, d / 2, 1.2, 1.2, 0.9));
  h.addGlassDoor(back, w / 3, 1.8, 2.1);
  dress(h.addWindow(back, (2 * w) / 3 + 0.4, 1.3, 1.2, 0.9));
  setRoomType(h, new Vec2(0, 0), "Living", 0);
  if (n.storeys === 2) {
    addStoreyAbove(h);
    for (const wall of h.wallsOn(1)) {
      const along = wall.length();
      const facesFront = Math.abs(wall.start.y - wall.end.y) < 1e-6;
      for (const u of facesFront ? [along / 4, (3 * along) / 4] : [along / 2]) dress(h.addWindow(wall.id, u, 1.2, 1.2, 0.9));
    }
    setRoomType(h, new Vec2(0, 0), "Bedroom", 1);
    // Stairs up, along the left wall (from the front, inside).
    placeStair(h, 0, new Vec2(-w / 2 + 0.75, 0), 0);
  }
  h.roof =
    n.roofStyle === "flat"
      ? { style: "Flat", pitchDeg: 0, overhang: 0, material: "Metal" }
      : { style: n.roofStyle === "hip" ? "Hip" : "Gable", pitchDeg: 28 + Math.round(hashOf(n, 3) * 14), overhang: 0.4, material: ROOF_MATERIALS[n.roof % ROOF_MATERIALS.length] };
  // A fireplace (and so a chimney) in some of them, against the back wall.
  if (hashOf(n, 4) < 0.4) h.addFurniture({ kind: "Fireplace", level: 0, at: new Vec2(w / 4, d / 2 - 0.45), facing: new Vec2(0, -1), ...FURNITURE_SIZE.Fireplace });
  return h;
}

/** Which neighbours in town are shops: the ones nearest the plot that face a street. */
export function shopsFor(s: Scenery, plot: Plot): Map<Neighbor, ShopKind> {
  const shops = new Map<Neighbor, ShopKind>();
  if (s.setting !== "town") return shops;
  const centre = new Vec2(plot.width / 2, plot.depth / 2);
  const byDistance = [...s.neighbors].sort((a, b) => a.at.distance(centre) - b.at.distance(centre));
  for (const n of byDistance) {
    if (shops.size >= SHOP_KINDS.length) break;
    if (n.at.distance(centre) > 90) break;
    shops.set(n, SHOP_KINDS[shops.size]);
  }
  return shops;
}

const shopCache = new WeakMap<Plot, Map<Neighbor, ShopKind>>();
export function townShops(plot: Plot): Map<Neighbor, ShopKind> {
  let m = shopCache.get(plot);
  if (!m) shopCache.set(plot, (m = shopsFor(sceneryFor(plot), plot)));
  return m;
}

/** The point `distance` metres along a polyline (clamped to its ends), and the direction there. */
export function pointAlong(points: readonly Vec2[], distance: number): { at: Vec2; dir: Vec2 } {
  let left = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const len = a.distance(b);
    if (len < 1e-9) continue;
    const dir = b.sub(a).scale(1 / len);
    if (left <= len || i === points.length - 1) return { at: a.add(dir.scale(Math.min(left, len))), dir };
    left -= len;
  }
  return { at: points[0], dir: new Vec2(1, 0) };
}

/** A polyline's length. */
export const polylineLength = (points: readonly Vec2[]): number => points.slice(1).reduce((s, p, i) => s + p.distance(points[i]), 0);
