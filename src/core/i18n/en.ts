/** English. */

import type { RoomType } from "../model";
import * as R from "../rules";
import { area, m2, meters, money, num, percent } from "./format";
import type { Messages } from "./types";

const s = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export const en: Messages = {
  lang: "en",
  locale: "en-US",
  languageName: "English",

  rooms: {
    Living: { name: "Living room", short: "Living", one: "a living room", many: "living rooms", the: "the living room" },
    Kitchen: { name: "Kitchen", short: "Kitchen", one: "a kitchen", many: "kitchens", the: "the kitchen" },
    Bedroom: { name: "Bedroom", short: "Bed", one: "a bedroom", many: "bedrooms", the: "the bedroom" },
    Bathroom: { name: "Bathroom", short: "Bath", one: "a bathroom", many: "bathrooms", the: "the bathroom" },
    WC: { name: "WC", short: "WC", one: "a WC", many: "WCs", the: "the WC" },
    Hall: { name: "Hall", short: "Hall", one: "a hall", many: "halls", the: "the hall" },
    Office: { name: "Office", short: "Office", one: "an office", many: "offices", the: "the office" },
    Utility: { name: "Utility room", short: "Utility", one: "a utility room", many: "utility rooms", the: "the utility room" },
    Garage: { name: "Garage", short: "Garage", one: "a garage", many: "garages", the: "the garage" },
    Storage: { name: "Storage", short: "Store", one: "a storage room", many: "storage rooms", the: "the storage room" },
  },
  wallMaterial: { Wood: "Wood", Brick: "Brick", Plaster: "Plaster" },
  roofStyle: { Flat: "Flat", Gable: "Gable", Hip: "Hip" },
  roofMaterial: { Shingles: "Shingles", Metal: "Metal", Tiles: "Tiles" },
  opening: { Window: "Window", Door: "Door", GarageDoor: "Garage door" },

  footprint(e) {
    switch (e.kind) {
      case "NoWalls":
        return "there are no walls";
      case "Open":
        return "the walls are not closed";
      case "Crossing":
        return "two walls cross; walls may only meet end to end or end on another wall";
      case "Overlap":
        return "two walls run on top of each other";
      case "MultipleLoops":
        return "the walls form more than one separate building";
      case "SelfIntersecting":
        return "the outer walls cross each other";
      case "Degenerate":
        return "the enclosed area is zero";
    }
  },

  issue(i) {
    const room = (r: { type: RoomType | null; area: number }) => `${r.type ? this.rooms[r.type].name : "A room"} (${area(this, r.area)})`;
    switch (i.kind) {
      case "WallTooShort":
        return `A wall is shorter than ${meters(this, R.MIN_WALL_LENGTH)}`;
      case "WallHeightOutOfRange":
        return `Walls must be between ${num(this, R.MIN_WALL_HEIGHT)} and ${meters(this, R.MAX_WALL_HEIGHT)} tall`;
      case "WallOutsidePlot":
        return "A wall is outside the buildable area of the plot";
      case "LooseWallEnd":
        return "A wall has a loose end; connect it to another wall";
      case "OpeningWithoutWall":
        return "An opening refers to a wall that does not exist";
      case "OpeningTooSmall":
        return `A window or door is smaller than ${meters(this, R.MIN_OPENING_SIZE)}`;
      case "OpeningTooCloseToEnd":
        return "A window or door is too close to the end of its wall";
      case "OpeningTooTall":
        return `A window or door needs at least ${meters(this, R.MIN_LINTEL)} of wall above it`;
      case "OpeningsOverlap":
        return "Two windows or doors overlap or are too close together";
      case "OpeningAcrossJunction":
        return "A window or door is blocked by a wall joining it";
      case "WindowInInteriorWall":
        return "A window is in an interior wall; windows go in exterior walls";
      case "BadDoorSize":
        return `Doors must be ${num(this, R.DOOR_WIDTH[0])}–${meters(this, R.DOOR_WIDTH[1])} wide and at least ${meters(this, R.DOOR_MIN_HEIGHT)} tall`;
      case "BadGarageDoorSize":
        return `Garage doors must be ${num(this, R.GARAGE_DOOR_WIDTH[0])}–${meters(this, R.GARAGE_DOOR_WIDTH[1])} wide and at least ${meters(this, R.GARAGE_DOOR_MIN_HEIGHT)} tall`;
      case "GarageDoorNotToGarage":
        return "A garage door must lead from outside into a garage";
      case "Footprint":
        return `The walls do not form a house: ${this.footprint(i.error)}`;
      case "TooSmall":
        return `The floor area is below the minimum of ${m2(this, R.MIN_FLOOR_AREA)}`;
      case "NoDoor":
        return "The house needs a front door";
      case "NoRoof":
        return "The house needs a roof";
      case "RoomTooSmall":
        return `${room(i.room)} is smaller than ${m2(this, i.min)}`;
      case "RoomNeedsWindow":
        return `${room(i.room)} needs a window`;
      case "RoomUnreachable":
        return `${room(i.room)} cannot be reached; add a door`;
      case "RoomHasTwoLabels":
        return `${room(i.room)} has more than one label`;
      case "GarageNeedsGarageDoor":
        return `${room(i.room)} needs a garage door`;
      case "LabelOutsideRooms":
        return "A room label is outside the house";
      case "RoofNeedsRectangle": {
        const style = this.roofStyle[i.style].toLowerCase();
        return `${cap(/^[aeiou]/.test(style) ? "an" : "a")} ${style} roof needs a rectangular house; use a flat roof for other shapes`;
      }
      case "RoofPitchOutOfRange":
        return `Roof pitch must be between ${R.PITCH_RANGE[0]}° and ${R.PITCH_RANGE[1]}°`;
      case "RoofOverhangOutOfRange":
        return `Roof overhang must be between 0 and ${meters(this, R.MAX_OVERHANG)}`;
      case "OverBudget":
        return `Construction costs ${money(this, i.cost)}, over the budget of ${money(this, i.budget)}`;
    }
  },

  requirement(r) {
    switch (r.kind) {
      case "rooms": {
        const words = this.rooms[r.room];
        const what = r.count === 1 ? cap(words.one) : `${r.count} ${words.many}`;
        return r.minArea ? `${what} of at least ${m2(this, r.minArea)}` : what;
      }
      case "floorArea":
        if (r.min !== undefined && r.max !== undefined) return `Floor area between ${m2(this, r.min)} and ${m2(this, r.max)}`;
        return r.min !== undefined ? `Floor area of at least ${m2(this, r.min)}` : `Floor area of at most ${m2(this, r.max ?? 0)}`;
      case "wallMaterial":
        return `${this.wallMaterial[r.material]} exterior walls`;
      case "roofStyle":
        return `A ${r.styles.map((st) => this.roofStyle[st].toLowerCase()).join(" or ")} roof`;
      case "roofMaterial":
        return `A roof covered in ${this.roofMaterial[r.material].toLowerCase()}`;
      case "doorWidth":
        return `Every door at least ${meters(this, r.min)} wide`;
      case "connected":
        return `A door between ${this.rooms[r.a].the} and ${this.rooms[r.b].the}`;
      case "windowArea":
        return `At least ${m2(this, r.min)} of windows in ${this.rooms[r.room].the}`;
      case "underBudget":
        return `Costs at most ${percent(this, r.share)} of the budget`;
    }
  },

  brief: {
    countOf: (n, total) => `${n} of ${total}`,
    yes: "yes",
    no: "no",
    noRoof: "no roof",
    noDoors: "no doors",
    doorsTooNarrow: (n) => `${s(n, "door", "doors")} too narrow`,
    wallsNotMaterial: (n, material) => `${s(n, "wall", "walls")} not ${en.wallMaterial[material].toLowerCase()}`,
    missing: (req, detail) => `Missing: ${req.charAt(0).toLowerCase()}${req.slice(1)} (${detail})`,
    quoteRejected: "We like where this is going, but we can't sign off on it yet.",
    quoteThreeStars: "It's everything we hoped for. When can they start building?",
    quoteTwoStars: "This will make a lovely home. Thank you!",
    quoteOneStar: "It does what we asked. We'll take it.",
  },

  ui: {
    title: "Architect",
    language: "Language",
    career: (earned, sold) => `Earned ${earned} · ${s(sold, "house", "houses")} sold`,
    client: "Client",
    clientPlot: (plot, size, budget) => `${plot} (${size}) · budget ${budget}`,
    brief: "Brief",
    briefTitle: "Read the client's brief again",
    present: "Present to client",
    presentTitle: "Show the design to the client",
    tools: { select: "Select", room: "Room", wall: "Wall", window: "Window", door: "Door" },
    undo: "Undo",
    undoTitle: "Undo (Ctrl+Z)",
    redo: "Redo",
    redoTitle: "Redo (Ctrl+Shift+Z)",
    clearPlot: "Clear plot",
    clearPlotTitle: "Remove everything from the plot",
    capture: "Capture",
    captureTitle: "Render the four appraisal views (C)",

    selectHint: "Click a room, wall, window or door in the plan to edit it.",
    delete: "Delete",
    deleteTitle: "Delete (Del)",
    usedAs: "Used as",
    notSet: "Not set",
    area: "Area",
    openings: "Openings",
    openingsSummary: (doors, outside, windows) => `${s(doors, "door", "doors")}${outside ? " (one outside)" : ""}, ${s(windows, "window", "windows")}`,
    roomNeeds: (room, minArea, window) => `${cap(en.rooms[room].one)} needs at least ${minArea}${window ? " and a window" : ""}.`,
    chooseRoomUse: "Choose what this room is for.",
    length: "Length",
    material: "Material",
    add: (kind) => `Add ${en.opening[kind].toLowerCase()}`,
    exteriorWall: "Exterior wall",
    interiorWall: "Interior wall",
    type: "Type",
    width: "Width",
    height: "Height",
    sill: "Sill",
    position: "Position",

    house: "House",
    wallHeight: "Wall height",
    facade: "Facade",
    roof: "Roof",
    noRoof: "None",
    pitch: "Pitch",
    overhang: "Overhang",
    covering: "Covering",

    cost: "Cost",
    mustHave: "Must have",
    wouldLove: "Would love",
    floorArea: (a) => `Floor area ${a}`,
    costRows: {
      walls: "Exterior walls",
      interiorWalls: "Interior walls",
      windows: "Windows",
      doors: "Doors",
      roof: "Roof",
      foundation: "Foundation",
      total: "Total",
      budgetLeft: "Budget left",
      overBudget: "Over budget",
    },
    buildingProblems: "Building problems",
    noBuildingProblems: "No building problems",

    newClient: "A new client",
    theBrief: "The brief",
    plot: "Plot",
    budget: "Budget",
    briefFooter: "Meet every must-have, stay within budget and fix all building problems to make the sale. Each wish you grant raises your fee.",
    takeJob: "Take the job",
    backToDrawingBoard: "Back to the drawing board",
    notYet: "Not quite yet",
    andMore: (n) => `…and ${n} more`,
    keepWorking: "Keep working",
    sold: "Sold!",
    stars: (n) => `${n} of 3 stars`,
    wishesGranted: "Wishes granted",
    yourFee: "Your fee",
    nextClient: "Next client",

    hints: {
      select: "Click a room to say what it is. Drag corners to reshape, walls to push them, windows and doors to slide them, room names to move them. Drag empty space to pan.",
      wall: "Click to place corners; start or end on a wall to divide a room. Click the first corner to close a loop. Enter or double-click finishes, Esc cancels.",
      room: "Drag to draw a rectangular room. Sides along existing walls are shared.",
      window: "Click an exterior wall to add a window.",
      door: "Click a wall to add a door.",
    },
    street: "STREET",
    room: "Room",

    layout: "Layout",
    layoutPlan: "Plan",
    layoutSplit: "Split",
    layout3d: "3D",
    roofToggle: "Roof",
    roofToggleTitle: "Show or hide the roof to look inside (H)",
    viewHint: "Drag to orbit · right-drag to pan · wheel to zoom · <kbd>1</kbd>–<kbd>4</kbd> preset views · <kbd>G</kbd> plot guides",
    appraisalViews: "Appraisal views",
    close: "Close",
    download: (file) => `Download ${file}`,
  },
};
