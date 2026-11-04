/** Svenska. */

import type { RoofStyle, RoomType } from "../model";
import * as R from "../rules";
import { area, m2, meters, money, num, percent } from "./format";
import type { Messages } from "./types";

const s = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Roof styles as nouns with an article: "ett sadeltak". */
const ROOF_NOUN: Record<RoofStyle, string> = { Flat: "ett platt tak", Gable: "ett sadeltak", Hip: "ett valmat tak" };

export const sv: Messages = {
  lang: "sv",
  locale: "sv-SE",
  languageName: "Svenska",

  rooms: {
    Living: { name: "Vardagsrum", short: "Vardagsr.", one: "ett vardagsrum", many: "vardagsrum", the: "vardagsrummet" },
    Kitchen: { name: "Kök", short: "Kök", one: "ett kök", many: "kök", the: "köket" },
    Bedroom: { name: "Sovrum", short: "Sovr.", one: "ett sovrum", many: "sovrum", the: "sovrummet" },
    Bathroom: { name: "Badrum", short: "Bad", one: "ett badrum", many: "badrum", the: "badrummet" },
    WC: { name: "WC", short: "WC", one: "ett WC", many: "WC", the: "WC:t" },
    Hall: { name: "Hall", short: "Hall", one: "en hall", many: "hallar", the: "hallen" },
    Office: { name: "Arbetsrum", short: "Arbetsr.", one: "ett arbetsrum", many: "arbetsrum", the: "arbetsrummet" },
    Utility: { name: "Tvättstuga", short: "Tvätt", one: "en tvättstuga", many: "tvättstugor", the: "tvättstugan" },
    Garage: { name: "Garage", short: "Garage", one: "ett garage", many: "garage", the: "garaget" },
    Storage: { name: "Förråd", short: "Förråd", one: "ett förråd", many: "förråd", the: "förrådet" },
  },
  wallMaterial: { Wood: "Trä", FaluRed: "Faluröd", Brick: "Tegel", Plaster: "Puts", Stone: "Natursten" },
  floorFinish: { Wood: "Trä", Laminate: "Laminat", Tiles: "Klinker", Stone: "Sten", Carpet: "Matta", Concrete: "Betong" },
  furnitureName: {
    Bed: "Dubbelsäng",
    SingleBed: "Enkelsäng",
    Nightstand: "Sängbord",
    Wardrobe: "Garderob",
    Sofa: "Soffa",
    Armchair: "Fåtölj",
    CoffeeTable: "Soffbord",
    TvUnit: "TV-bänk",
    Counter: "Köksbänk",
    Fridge: "Kylskåp",
    DiningTable: "Matbord",
    Chair: "Stol",
    Bathtub: "Badkar",
    Shower: "Dusch",
    Toilet: "Toalett",
    Sink: "Handfat",
    Desk: "Skrivbord",
    OfficeChair: "Kontorsstol",
    Bookshelf: "Bokhylla",
    Bench: "Hallbänk",
    Washer: "Tvättmaskin",
    Car: "Bil",
    Workbench: "Arbetsbänk",
    Shelf: "Hyllor",
  },
  floorPhrase: {
    Wood: { one: "trägolv", many: "trägolv" },
    Laminate: { one: "laminatgolv", many: "laminatgolv" },
    Tiles: { one: "klinkergolv", many: "klinkergolv" },
    Stone: { one: "stengolv", many: "stengolv" },
    Carpet: { one: "heltäckningsmatta", many: "heltäckningsmatta" },
    Concrete: { one: "betonggolv", many: "betonggolv" },
  },
  roofStyle: { Flat: "Platt", Gable: "Sadeltak", Hip: "Valmat" },
  roofMaterial: { Shingles: "Shingel", Metal: "Plåt", Tiles: "Takpannor" },
  opening: { Window: "Fönster", Door: "Dörr", GarageDoor: "Garageport" },

  levelName: (level) => (level === 0 ? "Bottenvåning" : `Våning ${level + 1}`),

  footprint(e) {
    switch (e.kind) {
      case "NoWalls":
        return "det finns inga väggar";
      case "Open":
        return "väggarna sluter inte till";
      case "Crossing":
        return "två väggar korsar varandra; väggar får bara mötas ände mot ände eller sluta mot en annan vägg";
      case "Overlap":
        return "två väggar ligger ovanpå varandra";
      case "MultipleLoops":
        return "väggarna bildar mer än en byggnad";
      case "SelfIntersecting":
        return "ytterväggarna korsar varandra";
      case "Degenerate":
        return "den inneslutna ytan är noll";
    }
  },

  issue(i) {
    const room = (r: { type: RoomType | null; area: number; level: number }) =>
      `${r.type ? this.rooms[r.type].name : "Ett rum"} (${area(this, r.area)}${r.level > 0 ? `, ${this.levelName(r.level).toLowerCase()}` : ""})`;
    switch (i.kind) {
      case "WallTooShort":
        return `En vägg är kortare än ${meters(this, R.MIN_WALL_LENGTH)}`;
      case "WallHeightOutOfRange":
        return `Väggarna måste vara mellan ${num(this, R.MIN_WALL_HEIGHT)} och ${meters(this, R.MAX_WALL_HEIGHT)} höga`;
      case "WallOutsidePlot":
        return "En vägg står utanför tomtens byggbara yta";
      case "LooseWallEnd":
        return "En vägg har en lös ände; anslut den till en annan vägg";
      case "OpeningWithoutWall":
        return "En öppning hör till en vägg som inte finns";
      case "OpeningTooSmall":
        return `Ett fönster eller en dörr är mindre än ${meters(this, R.MIN_OPENING_SIZE)}`;
      case "OpeningTooCloseToEnd":
        return "Ett fönster eller en dörr sitter för nära väggens ände";
      case "OpeningTooTall":
        return `Ett fönster eller en dörr behöver minst ${meters(this, R.MIN_LINTEL)} vägg ovanför sig`;
      case "OpeningsOverlap":
        return "Två fönster eller dörrar överlappar eller sitter för tätt";
      case "OpeningAcrossJunction":
        return "Ett fönster eller en dörr blockeras av en vägg som ansluter där";
      case "WindowInInteriorWall":
        return "Ett fönster sitter i en innervägg; fönster ska sitta i ytterväggar";
      case "OpeningInBoundary":
        return "Ett fönster eller en dörr sitter på en rumsgräns, där det inte finns någon vägg";
      case "BoundaryOnOutside":
        return "En rumsgräns ligger i husets ytterkant; utsidan behöver riktiga väggar";
      case "BadDoorSize":
        return `Dörrar måste vara ${num(this, R.DOOR_WIDTH[0])}–${meters(this, R.DOOR_WIDTH[1])} breda och minst ${meters(this, R.DOOR_MIN_HEIGHT)} höga`;
      case "BadGarageDoorSize":
        return `Garageportar måste vara ${num(this, R.GARAGE_DOOR_WIDTH[0])}–${meters(this, R.GARAGE_DOOR_WIDTH[1])} breda och minst ${meters(this, R.GARAGE_DOOR_MIN_HEIGHT)} höga`;
      case "GarageDoorNotToGarage":
        return "En garageport måste leda utifrån in i ett garage";
      case "Footprint":
        return i.level > 0
          ? `Väggarna på ${this.levelName(i.level).toLowerCase()} bildar ingen våning: ${this.footprint(i.error)}`
          : `Väggarna bildar inget hus: ${this.footprint(i.error)}`;
      case "EmptyLevel":
        return `${this.levelName(i.level)} har inga väggar än`;
      case "FloorNotSupported":
        return `${this.levelName(i.level)} vilar inte helt på våningen under; håll den inom konturen nedanför`;
      case "NoStairs":
        return `Ingen trappa leder upp till ${this.levelName(i.level).toLowerCase()}`;
      case "StairBlocked":
        return "En trappa är blockerad: den måste stå inne i rum på båda våningarna, fri från väggar";
      case "StairsToNowhere":
        return "En trappa leder till en våning som inte finns";

      case "TooSmall":
        return `Boytan är mindre än minimikravet ${m2(this, R.MIN_FLOOR_AREA)}`;
      case "NoDoor":
        return "Huset behöver en entrédörr";
      case "NoRoof":
        return "Huset behöver ett tak";
      case "RoomTooSmall":
        return `${room(i.room)} är mindre än ${m2(this, i.min)}`;
      case "RoomNeedsWindow":
        return `${room(i.room)} behöver ett fönster`;
      case "RoomUnreachable":
        return `${room(i.room)} går inte att nå; lägg till en dörr`;
      case "RoomHasTwoLabels":
        return `${room(i.room)} har mer än en etikett`;
      case "UnsuitableFloor": {
        const names = i.allowed.map((f) => this.floorFinish[f].toLowerCase());
        const list = `${names.slice(0, -1).join(", ")} eller ${names[names.length - 1]}`;
        return `${room(i.room)}: ${this.floorFinish[i.floor].toLowerCase()} passar inte som golv här; välj ${list}`;
      }
      case "GarageNeedsGarageDoor":
        return `${room(i.room)} behöver en garageport`;
      case "LabelOutsideRooms":
        return `Etiketten "${this.rooms[i.type].name}" ligger inte längre i något rum (rummet har flyttats eller tagits bort); dra in den i ett rum eller ta bort den`;
      case "RoofNeedsRectangle":
        return `${cap(ROOF_NOUN[i.style])} kräver ett rektangulärt hus; välj platt tak för andra former`;
      case "RoofPitchOutOfRange":
        return `Taklutningen måste vara mellan ${R.PITCH_RANGE[0]}° och ${R.PITCH_RANGE[1]}°`;
      case "RoofOverhangOutOfRange":
        return `Takutsprånget måste vara mellan 0 och ${meters(this, R.MAX_OVERHANG)}`;
      case "OverBudget":
        return `Byggkostnaden är ${money(this, i.cost)}, över budgeten på ${money(this, i.budget)}`;
    }
  },

  requirement(r) {
    switch (r.kind) {
      case "rooms": {
        const words = this.rooms[r.room];
        const what = r.count === 1 ? cap(words.one) : `${r.count} ${words.many}`;
        const where = r.floor === "ground" ? " på bottenvåningen" : r.floor === "upper" ? " på övervåningen" : "";
        return `${what}${r.minArea ? ` på minst ${m2(this, r.minArea)}` : ""}${where}`;
      }
      case "storeys":
        if (r.max === 1) return "Allt på ett plan";
        if (r.min !== undefined && r.min === r.max) return `${r.min} våningar`;
        return r.min !== undefined ? `Minst ${r.min} våningar` : `Högst ${r.max} våningar`;
      case "everyFloor":
        return `${cap(this.rooms[r.room].one)} på varje våning`;
      case "floorArea":
        if (r.min !== undefined && r.max !== undefined) return `Boyta mellan ${m2(this, r.min)} och ${m2(this, r.max)}`;
        return r.min !== undefined ? `Boyta på minst ${m2(this, r.min)}` : `Boyta på högst ${m2(this, r.max ?? 0)}`;
      case "wallMaterial":
        return {
          Wood: "Ytterväggar av trä",
          FaluRed: "Faluröda ytterväggar",
          Brick: "Ytterväggar av tegel",
          Plaster: "Putsade ytterväggar",
          Stone: "Ytterväggar av natursten",
        }[r.material];
      case "roofStyle":
        return cap(r.styles.map((st) => ROOF_NOUN[st]).join(" eller "));
      case "roofMaterial":
        return `Ett tak täckt med ${this.roofMaterial[r.material].toLowerCase()}`;
      case "doorWidth":
        return `Alla dörrar minst ${meters(this, r.min)} breda`;
      case "connected":
        return `En dörr eller öppen planlösning mellan ${this.rooms[r.a].the} och ${this.rooms[r.b].the}`;
      case "windowArea":
        return `Minst ${m2(this, r.min)} fönster i ${this.rooms[r.room].the}`;
      case "floorFinish":
        return r.room ? `${cap(this.floorPhrase[r.finish].one)} i ${this.rooms[r.room].the}` : `${cap(this.floorPhrase[r.finish].many)} i alla rum`;
      case "underBudget":
        return `Kostar högst ${percent(this, r.share)} av budgeten`;
    }
  },

  brief: {
    countOf: (n, total) => `${n} av ${total}`,
    yes: "ja",
    no: "nej",
    noRoof: "inget tak",
    noDoors: "inga dörrar",
    doorsTooNarrow: (n) => (n === 1 ? "1 dörr för smal" : `${n} dörrar för smala`),
    wallsNotMaterial: (n) => `${s(n, "vägg", "väggar")} i annat material`,
    missing: (req, detail) => `Saknas: ${req.charAt(0).toLowerCase()}${req.slice(1)} (${detail})`,
    quoteRejected: "Vi gillar hur det tar form, men vi kan inte godkänna det riktigt än.",
    quoteThreeStars: "Det är precis vad vi drömt om. När kan bygget börja?",
    quoteTwoStars: "Det här blir ett underbart hem. Tack!",
    quoteOneStar: "Det gör det vi bad om. Vi tar det.",
  },

  ui: {
    title: "Arkitekt",
    language: "Språk",
    career: (earned, sold) => `Intjänat ${earned} · ${sold} hus ${sold === 1 ? "sålt" : "sålda"}`,
    client: "Kund",
    clientPlot: (plot, size, budget) => `${plot} (${size}) · budget ${budget}`,
    brief: "Uppdrag",
    briefTitle: "Läs kundens uppdrag igen",
    present: "Presentera för kunden",
    presentTitle: "Visa ritningen för kunden",
    newClientButton: "Ny kund",
    newClientTitle: "Tacka nej till uppdraget och ta emot en annan kund",
    turnDownTitle: "Tacka nej till uppdraget?",
    turnDownText: (client) => `Din ritning åt ${client} kastas och du får inget betalt för den. En annan kund väntar.`,
    turnDown: "Tacka nej",
    floor: "Golv",
    floorNeedsUse: "Välj vad rummet ska användas till för att välja golv.",
    depth: "Djup",
    addFurniture: "Lägg till möbel…",
    refurnish: "Möblera automatiskt",
    clearFurniture: "Ta bort alla",
    noFurniture: "Inga möbler än.",
    remove: "Ta bort",
    thisWall: "Den här väggen",
    allOuterWalls: "Alla ytterväggar",
    clickToEdit: "Klicka på ett rum, en vägg, ett fönster, en dörr eller en möbel, i planen eller i 3D, för att ändra det. Högerklick fungerar också.",
    tools: { select: "Markera", room: "Rum", wall: "Vägg", boundary: "Öppen", window: "Fönster", door: "Dörr", stairs: "Trappa" },
    undo: "Ångra",
    undoTitle: "Ångra (Ctrl+Z)",
    redo: "Gör om",
    redoTitle: "Gör om (Ctrl+Skift+Z)",
    clearPlot: "Töm tomten",
    clearPlotTitle: "Ta bort allt från tomten",
    capture: "Bilder",
    captureTitle: "Rendera de fyra värderingsvyerna (C)",

    selectHint: "Klicka på ett rum, en vägg, ett fönster eller en dörr i planen för att ändra det.",
    delete: "Ta bort",
    deleteTitle: "Ta bort (Del)",
    usedAs: "Används som",
    notSet: "Inte angivet",
    area: "Yta",
    openings: "Öppningar",
    openingsSummary: (doors, outside, windows) => `${s(doors, "dörr", "dörrar")}${outside ? " (varav en ytterdörr)" : ""}, ${windows} fönster`,
    roomNeeds: (room, minArea, window) => `${cap(sv.rooms[room].one)} behöver minst ${minArea}${window ? " och ett fönster" : ""}.`,
    chooseRoomUse: "Välj vad rummet ska användas till.",
    length: "Längd",
    material: "Material",
    add: (kind) => `Lägg till ${sv.opening[kind].toLowerCase()}`,
    exteriorWall: "Yttervägg",
    interiorWall: "Innervägg",
    boundary: "Rumsgräns",
    boundaryNote: "Delar en öppen planlösning i rum. Här byggs ingenting: rummen på var sida är öppna mot varandra och delar dagsljus.",
    makeBoundary: "Gör öppen",
    makeWall: "Gör till vägg",
    floors: "Våningar",
    addFloor: "Lägg till våning",
    addFloorTitle: "Lägg till en våning ovanpå, med samma kontur som våningen under",
    removeFloor: "Ta bort våning",
    removeFloorTitle: "Ta bort översta våningen och allt på den",
    stairs: "Trappa",
    rotate: "Vrid",
    stairsRoute: (from, to) => `Från ${from.toLowerCase()} till ${to.toLowerCase()}`,
    needFloorAbove: "Lägg först till en våning ovanför: trappan leder upp till den.",
    up: "Upp",
    down: "Ner",
    type: "Typ",
    width: "Bredd",
    height: "Höjd",
    sill: "Bröstning",
    position: "Placering",

    house: "Hus",
    wallHeight: "Vägghöjd",
    facade: "Fasad",
    roof: "Tak",
    noRoof: "Inget",
    pitch: "Lutning",
    overhang: "Utsprång",
    covering: "Taktäckning",

    cost: "Kostnad",
    mustHave: "Måste ha",
    wouldLove: "Önskar sig",
    floorArea: (a) => `Boyta ${a}`,
    costRows: {
      walls: "Ytterväggar",
      interiorWalls: "Innerväggar",
      windows: "Fönster",
      doors: "Dörrar",
      roof: "Tak",
      foundation: "Grund",
      floors: "Bjälklag",
      finishes: "Golvbeläggning",
      stairs: "Trappor",
      total: "Totalt",
      budgetLeft: "Kvar av budgeten",
      overBudget: "Över budget",
    },
    buildingProblems: "Byggproblem",
    noBuildingProblems: "Inga byggproblem",

    newClient: "En ny kund",
    theBrief: "Uppdraget",
    plot: "Tomt",
    budget: "Budget",
    briefFooter: "Uppfyll alla krav, håll budgeten och åtgärda alla byggproblem för att få affären. Varje önskemål du uppfyller höjer ditt arvode.",
    takeJob: "Ta uppdraget",
    backToDrawingBoard: "Tillbaka till ritbordet",
    notYet: "Inte riktigt än",
    andMore: (n) => `…och ${n} till`,
    keepWorking: "Fortsätt arbeta",
    sold: "Sålt!",
    stars: (n) => `${n} av 3 stjärnor`,
    wishesGranted: "Uppfyllda önskemål",
    yourFee: "Ditt arvode",
    nextClient: "Nästa kund",

    hints: {
      select: "Klicka på något för att ändra det (högerklick fungerar med alla verktyg). Dra i hörn för att ändra formen, i väggar för att flytta dem och i fönster, dörrar och möbler för att flytta dem. Dra i tom yta för att panorera.",
      wall: "Klicka för att sätta ut hörn; börja eller sluta på en vägg för att dela ett rum. Klicka på första hörnet för att sluta väggen runt. Enter eller dubbelklick avslutar, Esc avbryter.",
      room: "Dra för att rita ett rektangulärt rum. Sidor längs befintliga väggar delas.",
      boundary: "Rita en öppen rumsgräns som en vägg: klicka ut hörn, börja och sluta på väggar. Den delar en öppen planlösning i rum utan att något byggs.",
      window: "Klicka på en yttervägg för att lägga till ett fönster.",
      door: "Klicka på en vägg för att lägga till en dörr.",
      stairs: "Klicka inne i ett rum för att placera en trappa upp till våningen ovanför; vrid den i sidopanelen.",
    },
    street: "GATA",
    room: "Rum",

    layout: "Vy",
    layoutPlan: "Plan",
    layoutSplit: "Delad",
    layout3d: "3D",
    roofToggle: "Tak",
    show: "Visa",
    furniture: "Möbler",
    roofToggleTitle: "Visa eller dölj taket för att se in (H)",
    viewHint: "Dra för att rotera · högerdra för att panorera · hjulet zoomar · <kbd>1</kbd>–<kbd>4</kbd> fasta vyer · <kbd>G</kbd> tomtgränser",
    appraisalViews: "Värderingsvyer",
    close: "Stäng",
    download: (file) => `Ladda ner ${file}`,
  },
};
