import { describe, expect, it } from "vitest";
import { type SavedDesign, designToFile, parseDesignFile } from "./designfile";
import { House } from "./model";
import { starterPlots } from "./plot";
import { cottage } from "./samples";

function design(): SavedDesign {
  return { id: "a", name: "Cottage for the Lindgrens", clientId: "lindgren", savedAt: 1_700_000_000_000, house: cottage(starterPlots()[1]).toJSON(), thumbnail: "data:image/jpeg;base64,AAAA" };
}

describe("design files", () => {
  it("round-trip through a file, getting a new id", () => {
    const d = design();
    const back = parseDesignFile(designToFile(d), "b")!;
    expect(back).toEqual({ ...d, id: "b" });
    expect(House.fromJSON(back.house).floorArea()).toBeCloseTo(70);
  });

  it("works for generated clients", () => {
    const d = { ...design(), clientId: "gen-1234" };
    expect(parseDesignFile(designToFile(d), "b")?.clientId).toBe("gen-1234");
  });

  it("rejects anything that is not a design", () => {
    expect(parseDesignFile("not json", "x")).toBeNull();
    expect(parseDesignFile("[]", "x")).toBeNull();
    expect(parseDesignFile(JSON.stringify({ format: "something-else" }), "x")).toBeNull();
    const file = JSON.parse(designToFile(design()));
    expect(parseDesignFile(JSON.stringify({ ...file, clientId: "nobody" }), "x")).toBeNull();
    expect(parseDesignFile(JSON.stringify({ ...file, version: 99 }), "x")).toBeNull();
    expect(parseDesignFile(JSON.stringify({ ...file, house: { walls: "no" } }), "x")).toBeNull();
    // Thumbnails must be images.
    expect(parseDesignFile(JSON.stringify({ ...file, thumbnail: "javascript:alert(1)" }), "x")?.thumbnail).toBeUndefined();
  });
});
