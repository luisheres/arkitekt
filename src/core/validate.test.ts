import { describe, expect, it } from "vitest";
import { defaultPrices } from "./cost";
import { Vec2 } from "./geometry";
import { House } from "./model";
import { starterPlots } from "./plot";
import { allSamples, cottage, lShapedModern } from "./samples";
import { validate } from "./validate";

const plot = () => starterPlots()[0];
const prices = defaultPrices();

describe("validation", () => {
  it("all samples are valid", () => {
    const p = plot();
    for (const { name, house } of allSamples(p)) {
      expect(validate(house, p, 1e9, prices), name).toEqual([]);
    }
  });

  it("an empty house reports missing parts", () => {
    const issues = validate(new House(), plot(), 1e9, prices);
    expect(issues).toContainEqual({ kind: "NoDoor" });
    expect(issues).toContainEqual({ kind: "Footprint", error: { kind: "NoWalls" }, level: 0 });
  });

  it("reports going over budget", () => {
    const p = plot();
    const issues = validate(cottage(p), p, 1000, prices);
    expect(issues.map((i) => i.kind)).toEqual(["OverBudget"]);
  });

  it("reports overlapping openings", () => {
    const p = plot();
    const house = cottage(p);
    const wall = house.walls[0].id;
    const existing = house.openingsIn(wall)[0].offset;
    house.addWindow(wall, existing + 0.3, 1, 1, 1);
    const issues = validate(house, p, 1e9, prices);
    expect(issues.some((i) => i.kind === "OpeningsOverlap")).toBe(true);
  });

  it("reports a house outside the setback", () => {
    const p = plot();
    const house = cottage(p);
    for (const w of house.walls) {
      w.start = w.start.sub(new Vec2(10, 0));
      w.end = w.end.sub(new Vec2(10, 0));
    }
    const issues = validate(house, p, 1e9, prices);
    expect(issues.some((i) => i.kind === "WallOutsidePlot")).toBe(true);
  });

  it("accepts a gable on an L-shape", () => {
    const p = plot();
    const house = lShapedModern(p);
    house.roof = { ...house.roof!, style: "Gable", pitchDeg: 30 };
    const issues = validate(house, p, 1e9, prices);
    expect(issues.map((i) => i.kind)).not.toContain("RoofNeedsRectangle");
  });
});
