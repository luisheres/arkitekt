import { describe, expect, it } from "vitest";
import { placeTerrace } from "./edit";
import { balconySun } from "./features";
import { Vec2 } from "./geometry";
import { House } from "./model";
import { SEASON_DAY, daylight, sunPosition } from "./sun";

const v = (x: number, y: number) => new Vec2(x, y);

describe("the sun", () => {
  it("is due south at noon, highest at midsummer, and rises in the east", () => {
    const noon = sunPosition(12, SEASON_DAY.summer);
    expect(noon.azimuth).toBeCloseTo(180, 0);
    expect(noon.elevation).toBeCloseTo(90 - 59 + 23.44, 0);
    // South is the street side: plan -y.
    expect(noon.dir.y).toBeLessThan(-0.3);
    expect(sunPosition(12, SEASON_DAY.winter).elevation).toBeLessThan(10);
    const morning = sunPosition(7, SEASON_DAY.spring);
    expect(morning.azimuth).toBeGreaterThan(60);
    expect(morning.azimuth).toBeLessThan(120);
    expect(morning.dir.x).toBeLessThan(0); // east is -x
  });

  it("gives long days in summer and short ones in winter", () => {
    const summer = daylight(SEASON_DAY.summer);
    const winter = daylight(SEASON_DAY.winter);
    expect(summer.set - summer.rise).toBeGreaterThan(17);
    expect(winter.set - winter.rise).toBeLessThan(7);
  });
});

describe("sun on terraces", () => {
  /** A 10 x 8 house, 2 storeys high, with a terrace on the side asked for. */
  const make = (wall: 0 | 1 | 2 | 3) => {
    const h = new House();
    const ids = h.addWallLoop([v(5, 8), v(15, 8), v(15, 16), v(5, 16)], 5.4, "Plaster");
    placeTerrace(h, ids[wall]);
    return h;
  };

  it("a south terrace gets far more sun than a north one; a west one gets the sunset", () => {
    const south = balconySun(make(0), make(0).balconies[0]);
    const north = balconySun(make(2), make(2).balconies[0]);
    expect(south.hours).toBeGreaterThan(8);
    expect(north.hours).toBeLessThan(south.hours / 3);
    // Wall 1 runs along x = 15: the +x side, west.
    expect(balconySun(make(1), make(1).balconies[0]).sunset).toBe(true);
    // Wall 3 is on the east side: no evening sun.
    expect(balconySun(make(3), make(3).balconies[0]).sunset).toBe(false);
  });
});
