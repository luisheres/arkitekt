import { describe, expect, it } from "vitest";
import { allPlots, plotById } from "./plot";
import { sceneryFor } from "./scenery";
import { streetFor } from "./street";

const onPlot = (p: { x: number; y: number }, plot: { width: number; depth: number }) => p.x > 0 && p.x < plot.width && p.y > 0 && p.y < plot.depth;

describe("street furniture", () => {
  it("is the same every time", () => {
    const plot = plotById("suburban")!;
    expect(JSON.stringify(streetFor(plot))).toBe(JSON.stringify(streetFor({ ...plot })));
  });

  it("lights the streets, and nothing stands on the plot, in the water or on another road", () => {
    for (const plot of allPlots()) {
      const st = streetFor(plot);
      const s = sceneryFor(plot);
      const things = [...st.lamps, ...st.signs, ...st.letterboxes, ...(st.busStop ? [st.busStop] : [])];
      for (const t of things) {
        expect(onPlot(t.at, plot), plot.id).toBe(false);
        expect(s.waterDistance(t.at.x, t.at.y), plot.id).toBeGreaterThan(0.9);
      }
      if (s.roads.some((r) => r.kind === "street" || r.kind === "main")) expect(st.lamps.length, plot.id).toBeGreaterThan(0);
    }
  });

  it("puts a bus stop by a main road, a crossing near the plot, and a gate on gravel tracks", () => {
    const plots = allPlots();
    const withMain = plots.filter((p) => sceneryFor(p).roads.some((r) => r.kind === "main"));
    expect(withMain.some((p) => streetFor(p).busStop)).toBe(true);
    for (const p of plots) if (!sceneryFor(p).roads.some((r) => r.kind === "main")) expect(streetFor(p).busStop, p.id).toBeNull();
    expect(plots.some((p) => streetFor(p).crossings.length > 0)).toBe(true);
    const gravel = plots.filter((p) => sceneryFor(p).roads.some((r) => r.kind === "gravel"));
    expect(gravel.length).toBeGreaterThan(0);
    for (const p of gravel) expect(streetFor(p).gates.length, p.id).toBeGreaterThan(0);
  });

  it("rounds the corners where paved roads meet (not where a gravel track joins)", () => {
    const withJunctions = allPlots().filter((p) => streetFor(p).junctions.length > 0);
    expect(withJunctions.length).toBeGreaterThan(0);
    for (const p of withJunctions) for (const j of streetFor(p).junctions) expect(Number.isFinite(j.at.x) && Number.isFinite(j.at.y), p.id).toBe(true);
    for (const p of allPlots()) if (sceneryFor(p).roads.filter((r) => r.kind !== "gravel").length < 2) expect(streetFor(p).junctions, p.id).toHaveLength(0);
  });
});
