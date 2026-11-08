/**
 * What stands along the roads round a plot: street lamps, parked cars, signs, a bus stop,
 * the neighbours' letterboxes, zebra crossings, rounded corners where roads meet, and a
 * gate across a gravel track. Worked out from the scenery, so it is the same every time.
 */

import { Vec2, projectOntoSegment } from "./geometry";
import type { Plot } from "./plot";
import { type Road, type Scenery, sceneryFor } from "./scenery";

export interface StreetThing {
  at: Vec2;
  /** Along the road, in the direction it runs. */
  dir: Vec2;
}

export interface ParkedCar extends StreetThing {
  colour: number;
}

export interface Sign extends StreetThing {
  kind: "giveWay" | "speed30" | "busStop";
  /** The way the sign's face looks. */
  facing: Vec2;
}

export interface Crossing extends StreetThing {
  /** Across the road, kerb to kerb. */
  width: number;
}

export interface Junction {
  at: Vec2;
  /** The rounded corner's radius, and the joining road's kind (for kerbs). */
  radius: number;
  kerb: boolean;
}

export interface Street {
  lamps: (StreetThing & { side: Vec2 })[];
  cars: ParkedCar[];
  signs: Sign[];
  busStop: (StreetThing & { side: Vec2 }) | null;
  letterboxes: (StreetThing & { side: Vec2 })[];
  crossings: Crossing[];
  junctions: Junction[];
  gates: (StreetThing & { width: number })[];
}

/** How far from the plot's middle things are put (beyond, nobody sees them). */
const REACH = 150;

/** Walk along a road, calling `visit` every `every` metres with the point and direction. */
function along(road: Road, every: number, start: number, visit: (p: Vec2, dir: Vec2, i: number) => void): void {
  let next = start;
  let walked = 0;
  let i = 0;
  for (let k = 1; k < road.points.length; k++) {
    const [a, b] = [road.points[k - 1], road.points[k]];
    const len = a.distance(b);
    if (len < 1e-9) continue;
    const dir = b.sub(a).scale(1 / len);
    while (next <= walked + len) {
      visit(a.add(dir.scale(next - walked)), dir, i++);
      next += every;
    }
    walked += len;
  }
}

/** The nearest point on a road to `p`, the road's direction there and the distance. */
function nearestOn(road: Road, p: Vec2): { at: Vec2; dir: Vec2; distance: number } {
  let best = { at: road.points[0], dir: new Vec2(1, 0), distance: Infinity };
  for (let k = 1; k < road.points.length; k++) {
    const [a, b] = [road.points[k - 1], road.points[k]];
    if (a.distance(b) < 1e-9) continue;
    const dir = b.sub(a).normalize();
    const at = a.add(dir.scale(projectOntoSegment(p, a, b)));
    const distance = at.distance(p);
    if (distance < best.distance) best = { at, dir, distance };
  }
  return best;
}

const cache = new WeakMap<Plot, Street>();

export function streetFor(plot: Plot): Street {
  let s = cache.get(plot);
  if (!s) cache.set(plot, (s = buildStreet(sceneryFor(plot), plot)));
  return s;
}

function buildStreet(s: Scenery, plot: Plot): Street {
  const centre = new Vec2(plot.width / 2, plot.depth / 2);
  const near = (p: Vec2, r = REACH) => p.distance(centre) < r;
  const onPlot = (p: Vec2, margin: number) => p.x > -margin && p.x < plot.width + margin && p.y > -margin && p.y < plot.depth + margin;
  const out: Street = { lamps: [], cars: [], signs: [], busStop: null, letterboxes: [], crossings: [], junctions: [], gates: [] };
  const left = (d: Vec2) => new Vec2(-d.y, d.x);
  const paved = s.roads.filter((r) => r.kind !== "gravel");
  /** Free of the other roads' tarmac (and of the plot). */
  const clear = (p: Vec2, self: Road) => !onPlot(p, 0.5) && s.waterDistance(p.x, p.y) > 1 && s.roads.every((r) => r === self || nearestOn(r, p).distance > r.width / 2 + 0.8);

  // Street lamps: along paved roads, every 28 m on main and residential streets, 40 m on lanes,
  // on alternating sides of a main road.
  for (const road of paved) {
    const every = road.kind === "lane" ? 40 : 28;
    along(road, every, 6, (p, dir, i) => {
      if (!near(p)) return;
      const side = left(dir).scale(road.kind === "main" && i % 2 ? -1 : 1);
      const at = p.add(side.scale(road.width / 2 + (road.kind === "lane" ? 0.8 : 1.6)));
      if (clear(at, road)) out.lamps.push({ at, dir, side });
    });
  }

  // Parked cars: by the kerb on residential streets and lanes, near houses.
  for (const road of paved.filter((r) => r.kind === "street" || r.kind === "lane")) {
    along(road, 17, 9, (p, dir, i) => {
      if (!near(p, 110)) return;
      const hash = Math.abs(Math.sin(p.x * 12.9898 + p.y * 78.233) * 43758.5453) % 1;
      if (hash > 0.35) return;
      const side = left(dir).scale(i % 2 ? -1 : 1);
      const at = p.add(side.scale(road.width / 2 - 1.05));
      // Not in front of the plot (the drive comes out there).
      if (onPlot(at, 4)) return;
      if (s.roads.every((r) => r === road || nearestOn(r, at).distance > r.width / 2 + 4)) out.cars.push({ at, dir: i % 2 ? dir.scale(-1) : dir, colour: Math.floor(hash * 100) % 5 });
    });
  }

  // Where one road ends on another: a rounded corner, and a give-way sign.
  for (const road of s.roads) {
    for (const end of [0, road.points.length - 1]) {
      const p = road.points[end];
      for (const other of s.roads) {
        if (other === road) continue;
        const hit = nearestOn(other, p);
        if (hit.distance > other.width / 2 + 1.5) continue;
        const inward = road.points[end === 0 ? 1 : end - 1].sub(p).normalize();
        // Where the joining road leaves the other's edge.
        const mouth = hit.at.add(inward.scale(other.width / 2));
        const corner = mouth.add(inward.scale(0.2 + road.width / 2));
        // (A gravel track just runs into the road: no tarmac corners.)
        if (road.kind !== "gravel") out.junctions.push({ at: mouth, radius: road.width / 2 + 2.2, kerb: road.kind === "main" || road.kind === "street" || other.kind === "main" || other.kind === "street" });
        if (road.kind !== "gravel" && near(p)) {
          const at = corner.add(left(inward).scale(-(road.width / 2 + 1.2)));
          if (clear(at, road)) out.signs.push({ kind: "giveWay", at, dir: inward, facing: inward.scale(-1) });
        }
        // A gate across a gravel track, a little way in from the road.
        if (road.kind === "gravel") out.gates.push({ at: p.add(inward.scale(other.width / 2 + 6)), dir: inward, width: road.width + 0.6 });
        break;
      }
    }
  }

  // The road nearest the plot: a 30 sign on a residential street, a zebra crossing on a
  // main or residential street, and a bus stop on the main road.
  const byDistance = paved.map((r) => ({ r, n: nearestOn(r, centre) })).sort((a, b) => a.n.distance - b.n.distance);
  const street = byDistance.find((x) => x.r.kind === "street" || x.r.kind === "main");
  if (street && street.n.distance < 70) {
    const { r, n } = street;
    // The crossing a little way along from the plot, so it is not across its drive.
    const at = n.at.add(n.dir.scale(Math.max(plot.width, plot.depth) / 2 + 6));
    if (nearestOn(r, at).distance < 0.5) out.crossings.push({ at, dir: n.dir, width: r.width });
    if (r.kind === "street") {
      const side = left(n.dir).scale(left(n.dir).dot(centre.sub(n.at)) > 0 ? 1 : -1);
      const signAt = n.at.sub(n.dir.scale(Math.max(plot.width, plot.depth) / 2 + 4)).add(side.scale(r.width / 2 + 1.0));
      if (clear(signAt, r)) out.signs.push({ kind: "speed30", at: signAt, dir: n.dir, facing: n.dir.scale(-1) });
    }
  }
  const main = byDistance.find((x) => x.r.kind === "main");
  if (main && main.n.distance < 120) {
    const { r, n } = main;
    const side = left(n.dir).scale(left(n.dir).dot(centre.sub(n.at)) > 0 ? 1 : -1);
    for (const shift of [-14, 14, -26, 26]) {
      const p = n.at.add(n.dir.scale(shift));
      const at = p.add(side.scale(r.width / 2 + 2.2));
      if (nearestOn(r, p).distance < 0.5 && clear(at, r)) {
        out.busStop = { at, dir: n.dir, side };
        out.signs.push({ kind: "busStop", at: at.add(n.dir.scale(2.2)).sub(side.scale(1.1)), dir: n.dir, facing: side.scale(-1) });
        break;
      }
    }
  }

  // A letterbox at the end of each neighbour's way to the road.
  for (const nb of s.neighbors) {
    if (!near(nb.at, 120)) continue;
    const road = paved.map((r) => ({ r, n: nearestOn(r, nb.at) })).sort((a, b) => a.n.distance - b.n.distance)[0];
    if (!road || road.n.distance > 30) continue;
    const towards = nb.at.sub(road.n.at).normalize();
    const at = road.n.at.add(towards.scale(road.r.width / 2 + 0.9)).add(road.n.dir.scale(1.5));
    if (clear(at, road.r)) out.letterboxes.push({ at, dir: road.n.dir, side: towards });
  }
  return out;
}
