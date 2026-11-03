import { describe, expect, it } from "vitest";
import { money } from "./hud";

describe("money", () => {
  it("formats with thousands separators", () => {
    expect(money(0)).toBe("0");
    expect(money(999.4)).toBe("999");
    expect(money(42_150)).toBe("42,150");
    expect(money(-1_234_567)).toBe("-1,234,567");
  });
});
