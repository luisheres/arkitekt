/**
 * The shape of a language catalog. Every language implements `Messages` in full, so the
 * compiler reports any text a translation is missing.
 */

import type { Requirement } from "../brief";
import type { FootprintError, OpeningKind, RoofMaterial, RoofStyle, RoomType, WallMaterial } from "../model";
import type { Issue } from "../validate";

export const LANGS = ["en", "sv"] as const;
export type Lang = (typeof LANGS)[number];

/** A piece of text in every language. */
export type Localized = Record<Lang, string>;

export type ToolName = "select" | "room" | "wall" | "boundary" | "window" | "door";

/** The forms of a room type's name that sentences need. */
export interface RoomWords {
  /** Display name, capitalized: "Living room". */
  name: string;
  /** For labels in small rooms: "Living". */
  short: string;
  /** Lower case with an indefinite article: "a living room". */
  one: string;
  /** Lower-case plural: "living rooms". */
  many: string;
  /** Lower case with a definite article: "the living room". */
  the: string;
}

export interface Messages {
  lang: Lang;
  /** BCP 47 locale for formatting numbers. */
  locale: string;
  /** The language's name in itself, for the language menu. */
  languageName: string;

  rooms: Record<RoomType, RoomWords>;
  wallMaterial: Record<WallMaterial, string>;
  roofStyle: Record<RoofStyle, string>;
  roofMaterial: Record<RoofMaterial, string>;
  opening: Record<OpeningKind, string>;

  footprint(e: FootprintError): string;
  issue(i: Issue): string;
  requirement(r: Requirement): string;

  /** Evaluating a brief and the client's verdict. */
  brief: {
    countOf(n: number, total: number): string;
    yes: string;
    no: string;
    noRoof: string;
    noDoors: string;
    doorsTooNarrow(n: number): string;
    wallsNotMaterial(n: number, material: WallMaterial): string;
    missing(requirement: string, detail: string): string;
    quoteRejected: string;
    quoteThreeStars: string;
    quoteTwoStars: string;
    quoteOneStar: string;
  };

  ui: {
    title: string;
    language: string;
    career(earned: string, sold: number): string;
    client: string;
    /** "Lakeside lot (28 × 32 m) · budget 65,000" */
    clientPlot(plot: string, size: string, budget: string): string;
    brief: string;
    briefTitle: string;
    present: string;
    presentTitle: string;
    tools: Record<ToolName, string>;
    undo: string;
    undoTitle: string;
    redo: string;
    redoTitle: string;
    clearPlot: string;
    clearPlotTitle: string;
    capture: string;
    captureTitle: string;

    selectHint: string;
    delete: string;
    deleteTitle: string;
    usedAs: string;
    notSet: string;
    area: string;
    openings: string;
    openingsSummary(doors: number, outside: boolean, windows: number): string;
    roomNeeds(room: RoomType, minArea: string, window: boolean): string;
    chooseRoomUse: string;
    length: string;
    material: string;
    add(kind: OpeningKind): string;
    exteriorWall: string;
    interiorWall: string;
    boundary: string;
    boundaryNote: string;
    makeBoundary: string;
    makeWall: string;
    type: string;
    width: string;
    height: string;
    sill: string;
    position: string;

    house: string;
    wallHeight: string;
    facade: string;
    roof: string;
    noRoof: string;
    pitch: string;
    overhang: string;
    covering: string;

    cost: string;
    mustHave: string;
    wouldLove: string;
    floorArea(area: string): string;
    costRows: {
      walls: string;
      interiorWalls: string;
      windows: string;
      doors: string;
      roof: string;
      foundation: string;
      total: string;
      budgetLeft: string;
      overBudget: string;
    };
    buildingProblems: string;
    noBuildingProblems: string;

    newClient: string;
    theBrief: string;
    plot: string;
    budget: string;
    briefFooter: string;
    takeJob: string;
    backToDrawingBoard: string;
    notYet: string;
    andMore(n: number): string;
    keepWorking: string;
    sold: string;
    stars(n: number): string;
    wishesGranted: string;
    yourFee: string;
    nextClient: string;

    hints: Record<ToolName, string>;
    street: string;
    /** Label of a room whose use is not set. */
    room: string;

    layout: string;
    layoutPlan: string;
    layoutSplit: string;
    layout3d: string;
    roofToggle: string;
    roofToggleTitle: string;
    /** HTML: may contain <kbd>. */
    viewHint: string;
    appraisalViews: string;
    close: string;
    download(file: string): string;
  };
}
