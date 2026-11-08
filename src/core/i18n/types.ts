/**
 * The shape of a language catalog. Every language implements `Messages` in full, so the
 * compiler reports any text a translation is missing.
 */

import type { Requirement } from "../brief";
import type { CostGroup } from "../cost";
import type { Difficulty } from "../difficulty";
import type { Setting } from "../plot";
import type { Branch, TechniqueId, Tier } from "../progression";
import type { FurnitureKind } from "../furniture";
import type { FloorFinish, FootprintError, OpeningKind, PaintColor, RoofMaterial, RoofStyle, RoomType, WallMaterial, FrameColor, WindowStyle, FenceStyle, PathSurface, Foundation } from "../model";
import type { Issue } from "../validate";

export const LANGS = ["en", "sv"] as const;
export type Lang = (typeof LANGS)[number];

/** A piece of text in every language. */
export type Localized = Record<Lang, string>;

export type ToolName = "select" | "room" | "wall" | "boundary" | "window" | "door" | "stairs" | "path" | "move";

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
  floorFinish: Record<FloorFinish, string>;
  paintColor: Record<PaintColor, string>;
  furnitureName: Record<FurnitureKind, string>;
  /** A finish as a kind of floor: "a wooden floor" / "wooden floors". */
  floorPhrase: Record<FloorFinish, { one: string; many: string }>;

  /** Building techniques: a name and what they let you do. */
  technique: Record<TechniqueId, { name: string; text: string }>;
  branch: Record<Branch, string>;
  /** What surrounds a plot, as a heading. */
  settingName: Record<Setting, string>;
  /** The kinds of client each tier brings. */
  tierName: Record<Tier, string>;
  /** How tight budgets are. */
  difficulty: Record<Difficulty, { name: string; text: string }>;

  /** The campaign: welcome, studio, clients to choose from, the Workshop. */
  progress: {
    welcomeTitle: string;
    welcomeText: string;
    campaign: string;
    campaignText: string;
    /** Under "Campaign" when there is a career to continue. */
    continueCampaign(houses: number, stars: number, money: string): string;
    startOver: string;
    startOverTitle: string;
    startOverText: string;
    freePlay: string;
    freePlayText: string;
    choosePlot: string;
    chooseDifficulty: string;
    /** On the welcome screen, opened from the game: "Now playing: Campaign · Moderate". */
    nowPlaying(what: string): string;
    version(v: string): string;
    /** Between commissions in the campaign. */
    noClient: string;
    career: string;
    careerButtonTitle: string;
    careerTitle(name: string): string;
    careerEmpty: string;
    statHouses: string;
    statEarned: string;
    avgStars(stars: string): string;
    statTier: string;
    /** "Tier 2" */
    tierShort(tier: Tier): string;
    statTechniques: string;
    ofTotal(total: number): string;
    chartEarnings: string;
    chartStars: string;
    houseN(n: number): string;
    earnedSoFar: string;
    housesTitle: string;
    techniquesTitle: string;
    noTechniques: string;
    defaultPlayer: string;
    players: string;
    playingAs(name: string): string;
    changePlayer: string;
    whoIsPlaying: string;
    newPlayer: string;
    playerName: string;
    pickAvatar: string;
    create: string;
    edit: string;
    play: string;
    playingNow: string;
    deletePlayer: string;
    deletePlayerText(name: string): string;
    playerSummary(houses: number, stars: number): string;
    notStarted: string;
    /** Under Save and Open: progress needs no saving by hand. */
    autoSaved: string;
    chooseClient: string;
    difficultyText: string;
    back: string;

    money: string;
    reputation: string;
    /** "Tier 2 · Family homes" */
    tier(tier: Tier, name: string): string;
    toNextTier(stars: number, name: string): string;
    topTier: string;
    workshop: string;
    workshopTitle: string;
    clients: string;
    clientsTitle: string;
    menu: string;
    menuTitle: string;
    plot: string;

    offersTitle: string;
    offersText: string;
    /** On a client card: what the fee could be. */
    feeUpTo(amount: string): string;
    needs: string;
    choose: string;
    learnFirst: string;
    otherClients: string;
    story: string;
    /** A card for the tier not reached yet. */
    nextTierTeaser(name: string, stars: number): string;
    /** Switching clients puts the current design aside. */
    designSetAside(name: string): string;

    workshopText: string;
    learned: string;
    buy(price: string): string;
    needsFirst(name: string): string;
    saveMore(amount: string): string;
    boughtToast(name: string): string;
    /** Tooltip of a locked choice. */
    locked(name: string, price: string): string;

    starsEarned(n: number, total: number): string;
    tierUp(tier: Tier, name: string): string;
    canAfford(n: number): string;
  };

  /** "Ground floor", "Floor 2", ... */
  levelName(level: number): string;
  footprint(e: FootprintError): string;
  issue(i: Issue): string;
  requirement(r: Requirement): string;

  /** Evaluating a brief and the client's verdict. */
  brief: {
    countOf(n: number, total: number): string;
    hoursOfSun(hours: number): string;
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
    newClientButton: string;
    newClientTitle: string;
    turnDownTitle: string;
    turnDownText(client: string): string;
    turnDown: string;
    floor: string;
    floorNeedsUse: string;
    depth: string;
    addFurniture: string;
    refurnish: string;
    clearFurniture: string;
    noFurniture: string;
    remove: string;
    thisWall: string;
    allOuterWalls: string;
    clickToEdit: string;
    roofTitle: string;
    save: string;
    saveTitle: string;
    open: string;
    openTitle: string;
    saveDesign: string;
    designName: string;
    saveAsNew: string;
    saved(name: string): string;
    savedDesigns: string;
    noSavedDesigns: string;
    openDesign: string;
    soldTag: string;
    storageFull: string;
    cancel: string;
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
    floors: string;
    addFloor: string;
    addFloorTitle: string;
    removeFloor: string;
    removeFloorTitle: string;
    stairs: string;
    rotate: string;
    stairsRoute(from: string, to: string): string;
    needFloorAbove: string;
    up: string;
    down: string;
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
      floors: string;
      finishes: string;
      stairs: string;
      extras: string;
      groundworks: string;
      total: string;
      budgetLeft: string;
      overBudget: string;
    };
    /** The chart of where the money goes. */
    costChart: {
      /** The button that opens it. */
      open: string;
      title: string;
      hint: string;
      groups: Record<CostGroup, string>;
      /** A flat roof over the part of a storey that has no storey above. */
      terrace: string;
      balcony: string;
      deck: string;
      fireplace: string;
      chimney: string;
      dormer: string;
      skylight: string;
      steps: string;
      ramp: string;
      earthworks: string;
      basementDig: string;
      basementWalls: string;
      retainingWalls: string;
      exposedFoundation: string;
      driveway: string;
      gravelDriveway: string;
      footpath: string;
      fence(style: string): string;
      gate: string;
      altan: string;
      columns: string;
      lightWells: string;
      paint(color: string): string;
      empty: string;
      /** "3 ×" in front of a count of windows or doors. */
      count(n: number): string;
    };
    voidNote: string;
    doubleHeight: string;
    doubleHeightTitle: string;
    closeDoubleHeight: string;
    closeDoubleHeightTitle: string;
    addBasement: string;
    addBasementTitle: string;
    removeBasement: string;
    removeBasementTitle: string;
    /** The whole house: moving and turning it. */
    moveAndTurn: string;
    wholeHouse: string;
    turnLeft: string;
    turnRight: string;
    turnLittle: string;
    platformHeight: string;
    platformHint: string;
    foundation: string;
    foundations: Record<Foundation, string>;
    foundationHint: string;
    foundationBasement: string;
    altan: string;
    addAltan: string;
    removeAltan: string;
    altanDepth: string;
    altanHint: string;
    altanAlongWall: string;
    altanNotAlongWall: string;
    moveHint: string;
    /** The sun in the 3D view. */
    sun: string;
    sunTitle: string;
    playDay: string;
    playDayTitle: string;
    walk: string;
    walkTitle: string;
    seasons: Record<"spring" | "summer" | "autumn" | "winter", string>;
    /** "☀ 7.5 h of sun in spring · evening sun in summer" */
    terraceSun(hours: string, sunset: boolean): string;
    north: string;
    /** On sloping ground: the platform's height and the earth moved. */
    platform(height: string, dug: string, filled: string): string;
    /** The room menu's paint swatches, the Garden menu, balconies. */
    wallColour: string;
    garden: string;
    gardenTitle: string;
    gardenNote: string;
    gardenThingsTitle: string;
    pathKind: string;
    pathKinds: { path: string; drive: string };
    pathSurface: string;
    pathSurfaces: Record<PathSurface, string>;
    pathNote: string;
    fence: string;
    noFence: string;
    fenceStyles: Record<FenceStyle, string>;
    fenceNote: string;
    addPlant(name: string): string;
    balcony: string;
    addBalcony: string;
    balconyNote: string;
    terrace: string;
    addTerrace: string;
    terraceNote: string;
    dormer: string;
    addDormer: string;
    skylight: string;
    addSkylight: string;
    skylightNote: string;
    windowStyle: string;
    windowStyles: Record<WindowStyle, string>;
    frameColor: string;
    frameColors: Record<FrameColor, string>;
    approach: string;
    steps: string;
    ramp: string;
    noApproach: string;
    approachNote(steps: number, rise: string): string;
    dormerNote: string;
    dormerNeedsRoof: string;
    dormerHint: string;
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
    /** Names written on the roads in the plan. */
    roadName: Record<"main" | "street" | "lane", string>;
    /** Label of a room whose use is not set. */
    room: string;

    layout: string;
    layoutPlan: string;
    layoutSplit: string;
    layout3d: string;
    roofToggle: string;
    show: string;
    furniture: string;
    roofToggleTitle: string;
    /** HTML: may contain <kbd>. */
    viewHint: string;
    appraisalViews: string;
    close: string;
    download(file: string): string;
  };
}
