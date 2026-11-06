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
  wallMaterial: { Wood: "Wood", FaluRed: "Falu red", Brick: "Brick", Plaster: "Plaster", Stone: "Stone" },
  floorFinish: { Wood: "Wood", Laminate: "Laminate", Tiles: "Tiles", Stone: "Stone", Carpet: "Carpet", Concrete: "Concrete" },
  furnitureName: {
    Bed: "Double bed",
    SingleBed: "Single bed",
    Nightstand: "Nightstand",
    Wardrobe: "Wardrobe",
    Sofa: "Sofa",
    Armchair: "Armchair",
    CoffeeTable: "Coffee table",
    TvUnit: "TV unit",
    Counter: "Kitchen counter",
    Fridge: "Fridge",
    DiningTable: "Dining table",
    Chair: "Chair",
    Bathtub: "Bathtub",
    Shower: "Shower",
    Toilet: "Toilet",
    Sink: "Washbasin",
    Desk: "Desk",
    OfficeChair: "Office chair",
    Bookshelf: "Bookshelf",
    Bench: "Bench",
    Washer: "Washing machine",
    Car: "Car",
    Workbench: "Workbench",
    Shelf: "Shelves",
  },
  floorPhrase: {
    Wood: { one: "a wooden floor", many: "wooden floors" },
    Laminate: { one: "a laminate floor", many: "laminate floors" },
    Tiles: { one: "a tiled floor", many: "tiled floors" },
    Stone: { one: "a stone floor", many: "stone floors" },
    Carpet: { one: "carpet", many: "carpets" },
    Concrete: { one: "a concrete floor", many: "concrete floors" },
  },
  roofStyle: { Flat: "Flat", Gable: "Gable", Hip: "Hip" },
  roofMaterial: { Shingles: "Shingles", Metal: "Metal", Tiles: "Tiles" },
  opening: { Window: "Window", Door: "Door", GarageDoor: "Garage door" },

  technique: {
    faluRed: { name: "Falu red panels", text: "Wooden facades painted the classic Swedish red." },
    brick: { name: "Brickwork", text: "Solid brick facades that last for generations." },
    stone: { name: "Stonemasonry", text: "Facades of natural stone, the finest there is." },
    hipRoof: { name: "Hip roofs", text: "Roofs that slope on all four sides." },
    metalRoof: { name: "Metal roofing", text: "Standing-seam metal roofs." },
    flatRoof: { name: "Flat roofs", text: "Flat roofs for modern houses of any shape." },
    tileRoof: { name: "Roof tiles", text: "Clay tile roofs." },
    woodFloor: { name: "Wooden floors", text: "Warm wooden floorboards." },
    stoneFloor: { name: "Stone floors", text: "Floors of polished stone." },
    openPlan: { name: "Open plan", text: "Rooms without walls between them: the ✂️ Open tool and open walls." },
    garage: { name: "Garages", text: "Garage doors, so clients can have a garage." },
    twoStoreys: { name: "Two storeys", text: "A second floor, with stairs up to it." },
    threeStoreys: { name: "Three storeys", text: "A third floor on top." },
    prefab: { name: "Prefab walls", text: "Walls made in a factory: 10% off every wall." },
    carpenters: { name: "Own carpenters", text: "Your own team lays the floors: 10% off foundations and floors." },
    marketing: { name: "Marketing", text: "People know your name: 2% more of every budget as your fee." },
    bulkBuying: { name: "Bulk buying", text: "Buy materials by the truckload: 5% off everything." },
  },
  branch: { facades: "Facades", roofs: "Roofs", floors: "Floors", structure: "Structure", business: "Business" },
  tierName: { 1: "Starter homes", 2: "Family homes", 3: "Villas", 4: "Signature houses" },
  difficulty: {
    easy: { name: "Easy", text: "Roomy budgets, with plenty to spare for nice things." },
    moderate: { name: "Moderate", text: "Budgets like real clients have: enough, if you plan well." },
    hard: { name: "Hard", text: "Tight budgets: every krona counts. Still always enough for a plain house." },
  },

  progress: {
    welcomeTitle: "Welcome to Architect!",
    welcomeText: "Design houses on real plots, see them in 3D, and make your clients happy.",
    campaign: "Campaign",
    campaignText: "Design houses for clients and earn money. Buy new building techniques in the Workshop, and as your reputation grows, bigger clients call: from starter homes to signature houses.",
    continueCampaign: (houses, stars, money) => `Continue: ${houses} ${houses === 1 ? "house" : "houses"} sold · ⭐ ${stars} · 💰 ${money}`,
    startOver: "Start over",
    startOverTitle: "Start the campaign over?",
    startOverText: "Your money, reputation and techniques go back to the start. Saved designs are kept.",
    freePlay: "Free play",
    freePlayText: "Build anything you like on any plot, with every technique and no budget.",
    choosePlot: "Choose a plot",
    chooseDifficulty: "How tight should budgets be?",
    nowPlaying: (what) => `Now playing: ${what}`,
    version: (v) => `Architect, version ${v}`,
    noClient: "No client yet: choose who to build for next.",
    defaultPlayer: "Player 1",
    players: "Players",
    playingAs: (name) => `Playing as ${name}`,
    changePlayer: "Change player",
    whoIsPlaying: "Who is playing?",
    newPlayer: "New player",
    playerName: "Name",
    pickAvatar: "Pick a picture",
    create: "Create",
    edit: "Edit",
    play: "Play",
    playingNow: "Playing now",
    deletePlayer: "Delete",
    deletePlayerText: (name) => `Delete ${name} and everything they have saved? This cannot be undone.`,
    playerSummary: (houses, stars) => `${houses} ${houses === 1 ? "house" : "houses"} sold · ⭐ ${stars}`,
    notStarted: "Not started yet",
    autoSaved: "💾 Your progress and the house you are working on are saved in this browser automatically.",
    chooseClient: "Choose a client",
    difficultyText: "Your fee is the same at every level; only the money for building changes.",
    back: "Back",

    money: "Money",
    reputation: "Reputation",
    tier: (tier, name) => `Tier ${tier} · ${name}`,
    toNextTier: (stars, name) => `${stars} more ⭐ to ${name}`,
    topTier: "You are among the best architects in the land!",
    workshop: "Workshop",
    workshopTitle: "Buy new building techniques",
    clients: "Clients",
    clientsTitle: "Choose your next client",
    menu: "Menu",
    menuTitle: "Back to the welcome screen: campaign or free play",
    plot: "Plot",

    offersTitle: "Who do you want to build for?",
    offersText: "These clients would like you to design their house. Pick one.",
    feeUpTo: (amount) => `Fee up to ${amount}`,
    needs: "Needs",
    choose: "Read the brief",
    learnFirst: "Learn the techniques first",
    otherClients: "↻ Other clients",
    story: "Story",
    nextTierTeaser: (name, stars) => `${name} call when you have ${stars} more ⭐`,
    designSetAside: (name) => `Your design was saved as “${name}”; find it under Open.`,

    workshopText: "Spend the money you earn on new techniques. Some build on others.",
    learned: "Learned",
    buy: (price) => `Buy · ${price}`,
    needsFirst: (name) => `Needs ${name} first`,
    saveMore: (amount) => `Save ${amount} more`,
    boughtToast: (name) => `You learned ${name}!`,
    locked: (name, price) => `🔒 ${name}: learn it in the Workshop (${price})`,

    starsEarned: (n, total) => `+${n} ⭐ · your reputation is now ${total} ⭐`,
    tierUp: (tier, name) => `Tier ${tier}! ${name} now call you.`,
    canAfford: (n) => (n === 1 ? "You can afford a new technique in the Workshop." : `You can afford ${n} new techniques in the Workshop.`),
  },

  levelName: (level) => (level === 0 ? "Ground floor" : `Floor ${level + 1}`),

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
    const room = (r: { type: RoomType | null; area: number; level: number }) =>
      `${r.type ? this.rooms[r.type].name : "A room"} (${area(this, r.area)}${r.level > 0 ? `, ${this.levelName(r.level).toLowerCase()}` : ""})`;
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
      case "OpeningInBoundary":
        return "A window or door is on a room boundary, where there is no wall";
      case "BoundaryOnOutside":
        return "A room boundary is on the outside of the house; the outside needs real walls";
      case "BadDoorSize":
        return `Doors must be ${num(this, R.DOOR_WIDTH[0])}–${meters(this, R.DOOR_WIDTH[1])} wide and at least ${meters(this, R.DOOR_MIN_HEIGHT)} tall`;
      case "BadGarageDoorSize":
        return `Garage doors must be ${num(this, R.GARAGE_DOOR_WIDTH[0])}–${meters(this, R.GARAGE_DOOR_WIDTH[1])} wide and at least ${meters(this, R.GARAGE_DOOR_MIN_HEIGHT)} tall`;
      case "GarageDoorNotToGarage":
        return "A garage door must lead from outside into a garage";
      case "Footprint":
        return i.level > 0
          ? `The walls on ${this.levelName(i.level).toLowerCase()} do not form a storey: ${this.footprint(i.error)}`
          : `The walls do not form a house: ${this.footprint(i.error)}`;
      case "EmptyLevel":
        return `${this.levelName(i.level)} has no walls yet`;
      case "FloorNotSupported":
        return `${this.levelName(i.level)} is not fully supported by the floor below; keep it within the outline below`;
      case "NoStairs":
        return `No stairs lead up to ${this.levelName(i.level).toLowerCase()}`;
      case "StairBlocked":
        return "A staircase is blocked: it must stand inside rooms on both floors, clear of walls";
      case "StairsToNowhere":
        return "A staircase leads to a floor that does not exist";

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
      case "UnsuitableFloor": {
        const names = i.allowed.map((f) => this.floorFinish[f].toLowerCase());
        const list = `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
        return `${room(i.room)}: ${this.floorFinish[i.floor].toLowerCase()} is not a suitable floor here; choose ${list}`;
      }
      case "GarageNeedsGarageDoor":
        return `${room(i.room)} needs a garage door`;
      case "NotLearned":
        return `${this.technique[i.technique].name} is not learned yet: buy it in the Workshop, or change the design`;
      case "LabelOutsideRooms":
        return `The label "${this.rooms[i.type].name}" is no longer inside a room (its room was moved or removed); drag it into a room or delete it`;
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
        const where = r.floor === "ground" ? " on the ground floor" : r.floor === "upper" ? " upstairs" : "";
        return `${what}${r.minArea ? ` of at least ${m2(this, r.minArea)}` : ""}${where}`;
      }
      case "storeys":
        if (r.max === 1) return "All on one level";
        if (r.min !== undefined && r.min === r.max) return `${r.min} storeys`;
        return r.min !== undefined ? `At least ${r.min} storeys` : `At most ${r.max} storeys`;
      case "everyFloor":
        return `${cap(this.rooms[r.room].one)} on every floor`;
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
        return `A door or open plan between ${this.rooms[r.a].the} and ${this.rooms[r.b].the}`;
      case "windowArea":
        return `At least ${m2(this, r.min)} of windows in ${this.rooms[r.room].the}`;
      case "floorFinish":
        return r.room ? `${cap(this.floorPhrase[r.finish].one)} in ${this.rooms[r.room].the}` : `${cap(this.floorPhrase[r.finish].many)} throughout`;
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
    newClientButton: "New client",
    newClientTitle: "Turn down this request and hear from another client",
    turnDownTitle: "Turn down this job?",
    turnDownText: (client) => `Your design for ${client} will be discarded and you will not be paid for it. Another client is waiting.`,
    turnDown: "Turn it down",
    floor: "Floor",
    floorNeedsUse: "Choose what the room is for to pick its floor.",
    depth: "Depth",
    addFurniture: "Add furniture…",
    refurnish: "Furnish automatically",
    clearFurniture: "Remove all",
    noFurniture: "No furniture yet.",
    remove: "Remove",
    thisWall: "This wall",
    allOuterWalls: "All outer walls",
    save: "Save",
    saveTitle: "Save this design to continue it later (Ctrl+S)",
    open: "Open…",
    openTitle: "Your saved designs",
    saveDesign: "Save design",
    designName: "Name",
    saveAsNew: "Save as a new design",
    saved: (name) => `Saved “${name}”`,
    savedDesigns: "Saved designs",
    noSavedDesigns: "No saved designs yet. Use Save to keep a design and continue it later.",
    openDesign: "Open",
    soldTag: "Sold",
    storageFull: "This browser has no room left for saved designs. Delete an old one, or export it to a file first.",
    cancel: "Cancel",
    clickToEdit: "Click a room, wall, window, door or piece of furniture, in the plan or in 3D, to edit it. Right-click works too.",
    tools: { select: "Select", room: "Room", wall: "Wall", boundary: "Open", window: "Window", door: "Door", stairs: "Stairs" },
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
    boundary: "Room boundary",
    boundaryNote: "Divides open-plan space into rooms. Nothing is built here: the rooms on either side are open to each other and share daylight.",
    makeBoundary: "Make it open",
    makeWall: "Make it a wall",
    floors: "Floors",
    addFloor: "Add floor",
    addFloorTitle: "Add a storey on top, starting from the outline of the floor below",
    removeFloor: "Remove floor",
    removeFloorTitle: "Remove the top storey and everything on it",
    stairs: "Stairs",
    rotate: "Rotate",
    stairsRoute: (from, to) => `From ${from.toLowerCase()} to ${to.toLowerCase()}`,
    needFloorAbove: "Add a floor above first: stairs lead up to it.",
    up: "Up",
    down: "Down",
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
      floors: "Upper floors",
      finishes: "Floor finishes",
      stairs: "Stairs",
      total: "Total",
      budgetLeft: "Budget left",
      overBudget: "Over budget",
    },
    costChart: {
      open: "Where does the money go?",
      title: "Where the money goes",
      hint: "The bigger the box, the more it costs. Point at a box for the details.",
      groups: { facade: "Facade", interiorWalls: "Interior walls", openings: "Windows and doors", roof: "Roof", floors: "Floors", stairs: "Stairs" },
      terrace: "Terrace roof",
      empty: "Nothing is built yet, so nothing costs anything.",
      count: (n) => `${n} ×`,
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
      select: "Click anything to edit it (right-click works with every tool). Drag corners to reshape, walls to push them, windows, doors and furniture to move them. Drag empty space to pan.",
      wall: "Click to place corners; start or end on a wall to divide a room. Click the first corner to close a loop. Enter or double-click finishes, Esc cancels.",
      room: "Drag to draw a rectangular room. Sides along existing walls are shared.",
      boundary: "Draw an open room boundary, like a wall: click corners, start and end on walls. It divides open-plan space into rooms without building anything.",
      window: "Click an exterior wall to add a window.",
      door: "Click a wall to add a door.",
      stairs: "Click inside a room to place stairs up to the floor above; rotate them in the sidebar.",
    },
    street: "STREET",
    room: "Room",

    layout: "Layout",
    layoutPlan: "Plan",
    layoutSplit: "Split",
    layout3d: "3D",
    roofToggle: "Roof",
    show: "Show",
    furniture: "Furniture",
    roofToggleTitle: "Show or hide the roof to look inside (H)",
    viewHint: "Drag to orbit · right-drag to pan · wheel to zoom · <kbd>1</kbd>–<kbd>4</kbd> preset views · <kbd>G</kbd> plot guides",
    appraisalViews: "Appraisal views",
    close: "Close",
    download: (file) => `Download ${file}`,
  },
};
