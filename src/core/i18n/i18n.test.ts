import { describe, expect, it } from "vitest";
import { type Requirement, presentDesign } from "../brief";
import { CLIENTS } from "../clients";
import { defaultPrices } from "../cost";
import { House, ROOM_TYPES } from "../model";
import { starterPlots } from "../plot";
import type { Issue } from "../validate";
import { Vec2 } from "../geometry";
import { area, en, money, pickLang, sv } from "./index";
import { LANGS, type Messages, messages } from "./index";

const CATALOGS = LANGS.map(messages);

/** One of every requirement and issue kind, to render in every language. */
const REQUIREMENTS: Requirement[] = [
  { kind: "rooms", room: "Bedroom", count: 3, minArea: 9 },
  { kind: "rooms", room: "Office", count: 1 },
  { kind: "floorArea", min: 80, max: 120 },
  { kind: "floorArea", min: 80 },
  { kind: "floorArea", max: 95 },
  { kind: "wallMaterial", material: "Wood" },
  { kind: "roofStyle", styles: ["Flat", "Hip"] },
  { kind: "roofMaterial", material: "Metal" },
  { kind: "doorWidth", min: 0.9 },
  { kind: "connected", a: "Kitchen", b: "Living" },
  { kind: "windowArea", room: "Living", min: 4 },
  { kind: "underBudget", share: 0.85 },
  { kind: "rooms", room: "Bedroom", count: 3, minArea: 9, floor: "upper" },
  { kind: "storeys", max: 1 },
  { kind: "storeys", min: 2 },
  { kind: "everyFloor", room: "Bathroom" },
];

const room = { at: new Vec2(0, 0), level: 0, area: 6.25, type: "Bedroom" as const };
const ISSUES: Issue[] = [
  { kind: "WallTooShort", wall: 1 },
  { kind: "WallHeightOutOfRange", wall: 1 },
  { kind: "WallOutsidePlot", wall: 1 },
  { kind: "LooseWallEnd", wall: 1, x: 0, y: 0 },
  { kind: "OpeningWithoutWall", opening: 1 },
  { kind: "OpeningTooSmall", opening: 1 },
  { kind: "OpeningTooCloseToEnd", opening: 1 },
  { kind: "OpeningTooTall", opening: 1 },
  { kind: "OpeningsOverlap", a: 1, b: 2 },
  { kind: "OpeningAcrossJunction", opening: 1 },
  { kind: "WindowInInteriorWall", opening: 1 },
  { kind: "OpeningInBoundary", opening: 1 },
  { kind: "BoundaryOnOutside", wall: 1 },
  { kind: "BadDoorSize", opening: 1 },
  { kind: "BadGarageDoorSize", opening: 1 },
  { kind: "GarageDoorNotToGarage", opening: 1 },
  { kind: "Footprint", error: { kind: "Crossing", x: 0, y: 0 }, level: 0 },
  { kind: "Footprint", error: { kind: "Open", x: 0, y: 0 }, level: 1 },
  { kind: "EmptyLevel", level: 1 },
  { kind: "FloorNotSupported", level: 1 },
  { kind: "NoStairs", level: 1 },
  { kind: "StairBlocked", stair: 1 },
  { kind: "StairsToNowhere", stair: 1 },
  { kind: "TooSmall" },
  { kind: "NoDoor" },
  { kind: "NoRoof" },
  { kind: "RoomTooSmall", room, min: 7 },
  { kind: "RoomNeedsWindow", room },
  { kind: "RoomUnreachable", room: { ...room, type: null } },
  { kind: "RoomHasTwoLabels", room },
  { kind: "GarageNeedsGarageDoor", room: { ...room, type: "Garage" } },
  { kind: "LabelOutsideRooms", label: 1, at: new Vec2(0, 0), type: "Bedroom", level: 0 },
  { kind: "RoofNeedsRectangle", style: "Gable" },
  { kind: "RoofPitchOutOfRange" },
  { kind: "RoofOverhangOutOfRange" },
  { kind: "OverBudget", cost: 70_500, budget: 65_000 },
];

const looksBroken = (t: string) => t.length === 0 || /undefined|NaN|\[object/.test(t);

describe("languages", () => {
  it("formats numbers the local way", () => {
    expect(money(en, 42_150)).toBe("42,150");
    expect(money(en, 999.4)).toBe("999");
    expect(money(en, -1_234_567)).toBe("-1,234,567");
    expect(money(sv, 42_150).replace(/\s/g, " ")).toBe("42 150");
    expect(area(en, 12.5)).toBe("12.5 m²");
    expect(area(sv, 12.5)).toBe("12,5 m²");
  });

  it("renders every requirement and issue in every language", () => {
    for (const m of CATALOGS) {
      for (const r of REQUIREMENTS) expect(looksBroken(m.requirement(r)), `${m.lang} ${r.kind}`).toBe(false);
      for (const i of ISSUES) expect(looksBroken(m.issue(i)), `${m.lang} ${i.kind}`).toBe(false);
      for (const t of ROOM_TYPES) expect(Object.values(m.rooms[t]).every((w) => !looksBroken(w)), `${m.lang} ${t}`).toBe(true);
    }
  });

  it("speaks Swedish", () => {
    expect(sv.requirement(REQUIREMENTS[0])).toBe("3 sovrum på minst 9 m²");
    expect(sv.requirement(REQUIREMENTS[1])).toBe("Ett arbetsrum");
    expect(sv.requirement(REQUIREMENTS[6])).toBe("Ett platt tak eller ett valmat tak");
    expect(sv.requirement(REQUIREMENTS[9])).toBe("En dörr eller öppen planlösning mellan köket och vardagsrummet");
    expect(sv.requirement(REQUIREMENTS[10])).toBe("Minst 4 m² fönster i vardagsrummet");
    const issue = (kind: Issue["kind"]) => sv.issue(ISSUES.find((i) => i.kind === kind)!);
    expect(issue("RoomTooSmall")).toBe("Sovrum (6,3 m²) är mindre än 7 m²");
    expect(issue("RoofNeedsRectangle")).toBe("Ett sadeltak kräver ett rektangulärt hus; välj platt tak för andra former");
  });

  it("the client's verdict comes in the player's language", () => {
    const client = CLIENTS[0];
    const verdict = presentDesign(new House(), client, defaultPrices(), sv);
    expect(verdict.quote).toBe(sv.brief.quoteRejected);
    expect(verdict.problems).toContain("Huset behöver en entrédörr");
    expect(verdict.problems).toContain("Saknas: ett kök (0 av 1)");
  });

  it("every client and plot has text in every language", () => {
    for (const c of CLIENTS) {
      for (const lang of LANGS) {
        const t = c.text[lang];
        expect([t.name, t.who, t.story].every((x) => x.trim().length > 0), `${c.id} ${lang}`).toBe(true);
      }
      expect(c.text.sv.story).not.toBe(c.text.en.story);
    }
    for (const p of starterPlots()) expect(p.name.sv).not.toBe(p.name.en);
  });

  it("no Swedish UI text is left in English by mistake", () => {
    // Words that really are the same in both languages.
    const same = new Set(["Plan", "3D", "Budget", "Material", "Garage", "WC", "Hall"]);
    const strings = (o: unknown, path = ""): [string, string][] =>
      typeof o === "string" ? [[path, o]] : o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => strings(v, `${path}.${k}`)) : [];
    const english = new Map(strings(en));
    const untranslated = strings(sv as Messages).filter(([path, text]) => english.get(path) === text && !same.has(text) && !/^(lang|locale)/.test(path.slice(1)));
    expect(untranslated).toEqual([]);
  });

  it("picks a supported language from the browser's preferences", () => {
    expect(pickLang(["sv-SE", "en-US"])).toBe("sv");
    expect(pickLang(["de-DE", "en-GB"])).toBe("en");
    expect(pickLang(["fi"])).toBe("en");
  });
});
