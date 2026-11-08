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
    Void: { name: "Öppet ner", short: "Öppet", one: "en öppning ner till våningen under", many: "öppningar ner till våningen under", the: "öppningen" },
  },
  wallMaterial: { Wood: "Trä", FaluRed: "Faluröd", Brick: "Tegel", Plaster: "Puts", Stone: "Natursten", Concrete: "Betong" },
  paintColor: { White: "Vit", Cream: "Gräddvit", Sky: "Himmelsblå", Mint: "Mintgrön", Blush: "Rosa", Sunny: "Solgul", Lavender: "Lavendel", Sage: "Salviagrön" },
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
    Fireplace: "Öppen spis",
    Plant: "Krukväxt",
    TallPlant: "Hög krukväxt",
    GardenTree: "Träd",
    Shrub: "Buske",
    FlowerBed: "Rabatt",
    Hedge: "Häck",
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
  opening: { Window: "Fönster", Door: "Dörr", GlassDoor: "Glasdörr", GarageDoor: "Garageport", Passage: "Öppning" },

  technique: {
    faluRed: { name: "Falu rödfärg", text: "Träfasader i klassisk falu röd." },
    brick: { name: "Murverk", text: "Gedigna tegelfasader som håller i generationer." },
    stone: { name: "Stenhuggeri", text: "Fasader av natursten, det finaste som finns." },
    hipRoof: { name: "Valmade tak", text: "Tak som lutar åt alla fyra håll." },
    metalRoof: { name: "Plåttak", text: "Falsade plåttak." },
    flatRoof: { name: "Platta tak", text: "Platta tak för moderna hus i alla former." },
    tileRoof: { name: "Takpannor", text: "Tak av lertegelpannor." },
    concrete: { name: "Betong", text: "Släta, moderna betongfasader." },
    paint: { name: "Målarfärger", text: "Måla rummen i åtta färger i stället för vitt." },
    houseplants: { name: "Krukväxter", text: "Växter i kruka som gör rummen mysiga." },
    landscaping: { name: "Trädgårdsdesign", text: "Plantera träd, buskar, rabatter och häckar i trädgården." },
    doubleHeight: { name: "Dubbel takhöjd", text: "Öppna upp en del av en övre våning, så att rummet under blir två våningar högt, med ett galleri runt." },
    glassDoors: { name: "Glasdörrar", text: "Breda glasdörrar ut mot trädgården eller en terrass; de släpper in dagsljus som fönster." },
    fireplace: { name: "Öppna spisar", text: "En öppen spis i ett rum, med en tegelskorsten upp genom taket." },
    terraces: { name: "Terrasser", text: "Ett trädäck på marken, utanför en dörr." },
    skylights: { name: "Takfönster", text: "Fönster som ligger i takfallet: dagsljus uppifrån, billigare än en takkupa." },
    dormers: { name: "Takkupor", text: "Fönster med egna små tak i ett lutande tak: ljus åt rummen under." },
    basement: { name: "Källare", text: "Gräv ut en våning under huset, för förråd, tvättstuga eller verkstad." },
    balconies: { name: "Balkonger", text: "Balkonger på övervåningarna, med en dörr ut." },
    woodFloor: { name: "Trägolv", text: "Varma golv av trä." },
    stoneFloor: { name: "Stengolv", text: "Golv av polerad sten." },
    openPlan: { name: "Öppen planlösning", text: "Rum utan väggar emellan: verktyget ✂️ Öppen och öppna väggar." },
    garage: { name: "Garage", text: "Garageportar, så att kunderna kan få ett garage." },
    twoStoreys: { name: "Två våningar", text: "En andra våning, med trappa upp." },
    threeStoreys: { name: "Tre våningar", text: "En tredje våning överst." },
    prefab: { name: "Prefabricerade väggar", text: "Väggar byggda i fabrik: 10 % billigare väggar." },
    carpenters: { name: "Egna snickare", text: "Ditt eget lag lägger golven: 10 % billigare grund och golv." },
    marketing: { name: "Marknadsföring", text: "Folk känner till dig: 2 % mer av varje budget i arvode." },
    bulkBuying: { name: "Storinköp", text: "Köp material i lastbilsvis: 5 % billigare allt." },
  },
  branch: { facades: "Fasader", roofs: "Tak", floors: "Golv", interiors: "Inredning", garden: "Trädgård", structure: "Stomme", business: "Företaget" },
  settingName: { suburban: "Villaområde", town: "Stad", lakeside: "Vid en sjö", riverside: "Vid en å", forest: "Skog", farmland: "Landsbygd", seaside: "Vid havet", hillside: "Sluttning", mountain: "Fjäll" },
  tierName: { 1: "Små hus", 2: "Familjehus", 3: "Villor", 4: "Drömhus" },
  difficulty: {
    easy: { name: "Lätt", text: "Rymliga budgetar, med gott om pengar över till fina saker." },
    moderate: { name: "Medel", text: "Budgetar som riktiga kunder har: det räcker om du planerar väl." },
    hard: { name: "Svår", text: "Snäva budgetar: varje krona räknas. Det räcker ändå alltid till ett enkelt hus." },
  },

  progress: {
    welcomeTitle: "Välkommen till Arkitekt!",
    welcomeText: "Rita hus på riktiga tomter, se dem i 3D och gör dina kunder glada.",
    campaign: "Kampanj",
    campaignText: "Rita hus åt kunder och tjäna pengar. Köp nya byggtekniker i verkstaden, och när ditt rykte växer ringer större kunder: från små hus till drömhus.",
    continueCampaign: (houses, stars, money) => `Fortsätt: ${houses} sålda hus · ⭐ ${stars} · 💰 ${money}`,
    startOver: "Börja om",
    startOverTitle: "Börja om kampanjen?",
    startOverText: "Dina pengar, ditt rykte och dina tekniker börjar om från början. Sparade ritningar finns kvar.",
    freePlay: "Fritt byggande",
    freePlayText: "Bygg vad du vill på vilken tomt som helst, med alla tekniker och utan budget.",
    choosePlot: "Välj en tomt",
    chooseDifficulty: "Hur snäva ska budgetarna vara?",
    nowPlaying: (what) => `Du spelar nu: ${what}`,
    version: (v) => `Arkitekt, version ${v}`,
    noClient: "Ingen kund än: välj vem du ska bygga åt härnäst.",
    career: "Karriär",
    careerButtonTitle: "Se tillbaka på din karriär",
    careerTitle: (name) => `${name}s karriär`,
    careerEmpty: "Sälj ditt första hus, så börjar din karriär här.",
    statHouses: "Sålda hus",
    statEarned: "Intjänat totalt",
    avgStars: (stars) => `${stars} ⭐ per hus`,
    statTier: "Kunder",
    tierShort: (tier) => `Nivå ${tier}`,
    statTechniques: "Tekniker",
    ofTotal: (total) => `av ${total}`,
    chartEarnings: "Intjänade pengar, hus för hus",
    chartStars: "Stjärnor för varje hus",
    houseN: (n) => `Hus ${n}`,
    earnedSoFar: "Intjänat hittills",
    housesTitle: "Dina hus",
    techniquesTitle: "Inlärda tekniker",
    noTechniques: "Inga än: köp dem i verkstaden.",
    defaultPlayer: "Spelare 1",
    players: "Spelare",
    playingAs: (name) => `Du spelar som ${name}`,
    changePlayer: "Byt spelare",
    whoIsPlaying: "Vem spelar?",
    newPlayer: "Ny spelare",
    playerName: "Namn",
    pickAvatar: "Välj en bild",
    create: "Skapa",
    edit: "Ändra",
    play: "Spela",
    playingNow: "Spelar nu",
    deletePlayer: "Ta bort",
    deletePlayerText: (name) => `Ta bort ${name} och allt som är sparat? Det går inte att ångra.`,
    playerSummary: (houses, stars) => `${houses} sålda hus · ⭐ ${stars}`,
    notStarted: "Inte börjat än",
    autoSaved: "💾 Dina framsteg och huset du arbetar på sparas automatiskt i den här webbläsaren.",
    chooseClient: "Välj en kund",
    difficultyText: "Ditt arvode är detsamma på alla nivåer; bara pengarna till bygget ändras.",
    back: "Tillbaka",

    money: "Pengar",
    reputation: "Rykte",
    tier: (tier, name) => `Nivå ${tier} · ${name}`,
    toNextTier: (stars, name) => `${stars} ⭐ till ${name}`,
    topTier: "Du är en av landets bästa arkitekter!",
    workshop: "Verkstad",
    workshopTitle: "Köp nya byggtekniker",
    clients: "Kunder",
    clientsTitle: "Välj din nästa kund",
    menu: "Meny",
    menuTitle: "Tillbaka till startskärmen: kampanj eller fritt byggande",
    plot: "Tomt",

    offersTitle: "Vem vill du bygga åt?",
    offersText: "De här kunderna vill att du ritar deras hus. Välj en.",
    feeUpTo: (amount) => `Arvode upp till ${amount}`,
    needs: "Kräver",
    choose: "Läs uppdraget",
    learnFirst: "Lär dig teknikerna först",
    otherClients: "↻ Andra kunder",
    story: "Berättelse",
    nextTierTeaser: (name, stars) => `${name} ringer när du har ${stars} ⭐ till`,
    designSetAside: (name) => `Din ritning sparades som ”${name}”; du hittar den under Öppna.`,

    workshopText: "Lägg pengarna du tjänar på nya tekniker. Vissa bygger på andra.",
    learned: "Inlärd",
    buy: (price) => `Köp · ${price}`,
    needsFirst: (name) => `Kräver ${name} först`,
    saveMore: (amount) => `Spara ${amount} till`,
    boughtToast: (name) => `Du har lärt dig ${name}!`,
    locked: (name, price) => `🔒 ${name}: lär dig det i verkstaden (${price})`,

    starsEarned: (n, total) => `+${n} ⭐ · ditt rykte är nu ${total} ⭐`,
    tierUp: (tier, name) => `Nivå ${tier}! Nu ringer ${name.toLowerCase()}.`,
    canAfford: (n) => (n === 1 ? "Du har råd med en ny teknik i verkstaden." : `Du har råd med ${n} nya tekniker i verkstaden.`),
  },

  levelName: (level) => (level < 0 ? "Källare" : level === 0 ? "Bottenvåning" : `Våning ${level + 1}`),

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
      case "BadGlassDoorSize":
        return `Glasdörrar måste vara ${num(this, R.GLASS_DOOR_WIDTH[0])}–${meters(this, R.GLASS_DOOR_WIDTH[1])} breda och minst ${meters(this, R.DOOR_MIN_HEIGHT)} höga`;
      case "BadPassageSize":
        return `Öppningar mellan rum måste vara ${num(this, R.PASSAGE_WIDTH[0])}–${meters(this, R.PASSAGE_WIDTH[1])} breda och minst ${meters(this, R.DOOR_MIN_HEIGHT)} höga`;
      case "PassageInOuterWall":
        return "En öppning utan dörr sitter i en yttervägg; använd en dörr eller glasdörr där";
      case "DormerNotOnSlope":
        return "En takkupa behöver ett lutande tak som stiger från väggen (inte en gavel), på översta våningen";
      case "BadDormerSize":
        return "Takkupor måste vara 1–3,5 m breda";
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
      case "GarageDoorUnreachable":
        return "Ingen uppfart kan nå den här garageporten från vägen; vänd den mot vägen eller ge den plats framför";
      case "VoidOnGroundFloor":
        return "En öppning ner ligger på bottenvåningen; det finns ingenting under att öppna ner till";
      case "BasementOutsideHouse":
        return "Källaren sträcker sig utanför bottenvåningen; den måste rymmas under huset";
      case "NoStairsToBasement":
        return "Ingen trappa leder ner till källaren; placera en trappa i källaren";
      case "OpeningBelowGround":
        return "En dörr eller ett fönster i källarens yttervägg skulle hamna under marken; ta bort den";
      case "BalconyOnGroundFloor":
        return "En balkong eller terrass sitter i källaren; den hör hemma på bottenvåningen eller högre upp";
      case "BalconyNotOnOuterWall":
        return "En balkong sitter på en innervägg; sätt den på en yttervägg";
      case "BalconyNeedsDoor":
        return "En balkong eller terrass saknar dörr ut; lägg till en dörr eller glasdörr i väggen bakom";
      case "BalconyOutsidePlot":
        return "En balkong sticker ut utanför tomten";
      case "NotLearned":
        return `${this.technique[i.technique].name} är inte inlärt än: köp det i verkstaden, eller ändra ritningen`;
      case "LabelOutsideRooms":
        return `Etiketten "${this.rooms[i.type].name}" ligger inte längre i något rum (rummet har flyttats eller tagits bort); dra in den i ett rum eller ta bort den`;
      case "RoofNeedsRectangle":
        return `${cap(ROOF_NOUN[i.style])} kräver ett hus med räta hörn; välj platt tak där väggarna möts i andra vinklar`;
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
          Concrete: "Ytterväggar av betong",
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
      case "balcony":
        return "En balkong";
      case "terrace":
        return "En terrass";
      case "sunnyTerrace":
        return `En terrass eller balkong med minst ${r.minHours} timmars sol`;
      case "sunsetView":
        return "En balkong eller terrass med kvällssol";
      case "fireplace":
        return "En öppen spis";
      case "gardenPlants":
        return `Minst ${r.min} träd, buskar eller rabatter i trädgården`;
      case "indoorPlants":
        return `Minst ${r.min} krukväxter inomhus`;
      case "doubleHeight":
        return `${cap(this.rooms[r.room].one)} med dubbel takhöjd`;
      case "paint":
        return `${cap(this.rooms[r.room].one)} målat i ${this.paintColor[r.color].toLowerCase()}`;
    }
  },

  brief: {
    hoursOfSun: (hours) => `${num(sv, hours, 1)} h sol`,
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
    save: "Spara",
    saveTitle: "Spara ritningen för att fortsätta senare (Ctrl+S)",
    open: "Öppna…",
    openTitle: "Dina sparade ritningar",
    saveDesign: "Spara ritning",
    designName: "Namn",
    saveAsNew: "Spara som ny ritning",
    saved: (name) => `Sparade ”${name}”`,
    savedDesigns: "Sparade ritningar",
    noSavedDesigns: "Inga sparade ritningar än. Använd Spara för att behålla en ritning och fortsätta senare.",
    openDesign: "Öppna",
    soldTag: "Såld",
    storageFull: "Webbläsaren har inte plats för fler sparade ritningar. Ta bort en gammal, eller exportera den till en fil först.",
    cancel: "Avbryt",
    clickToEdit: "Klicka på ett rum, en vägg, ett fönster, en dörr eller en möbel, i planen eller i 3D, för att ändra det. Högerklick fungerar också.",
    tools: { select: "Markera", room: "Rum", wall: "Vägg", boundary: "Öppen", window: "Fönster", door: "Dörr", stairs: "Trappa", move: "Flytta huset" },
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
      extras: "Balkonger och växter",
      groundworks: "Markarbeten",
      total: "Totalt",
      budgetLeft: "Kvar av budgeten",
      overBudget: "Över budget",
    },
    costChart: {
      open: "Vart går pengarna?",
      title: "Vart pengarna går",
      hint: "Ju större ruta, desto mer kostar det. Peka på en ruta för att se detaljerna.",
      groups: { facade: "Fasad", interiorWalls: "Innerväggar", openings: "Fönster och dörrar", roof: "Tak", floors: "Golv och bjälklag", stairs: "Trappor", extras: "Balkonger och växter", groundworks: "Markarbeten", access: "Uppfart och gångar" },
      terrace: "Terrasstak",
      earthworks: "Schaktning och fyllning",
      basementDig: "Källarschakt",
      basementWalls: "Källarväggar",
      retainingWalls: "Stödmurar",
      driveway: "Uppfart",
      gravelDriveway: "Grusad uppfart",
      footpath: "Gång till ytterdörren",
      exposedFoundation: "Synlig grundmur",
      lightWells: "Ljusgårdar",
      deck: "Terrass",
      fireplace: "Öppen spis",
      chimney: "Skorsten",
      dormer: "Takkupa",
      skylight: "Takfönster",
      steps: "Trappsteg",
      ramp: "Ramp",
      balcony: "Balkong",
      paint: (color) => `Färg: ${color.toLowerCase()}`,
      empty: "Inget är byggt än, så inget kostar något.",
      count: (n) => `${n} st`,
    },
    voidNote: "Öppet ner till våningen under: här finns inget golv, så rummet under får dubbel takhöjd. De öppna kanterna får ett räcke.",
    doubleHeight: "Dubbel takhöjd",
    doubleHeightTitle: "Öppna golvet ovanför rummet, så att det blir två våningar högt (med ett räcke på övervåningen)",
    closeDoubleHeight: "Stäng golvet ovanför",
    closeDoubleHeightTitle: "Lägg tillbaka golvet ovanför rummet",
    addBasement: "Källare",
    addBasementTitle: "Gräv en källare under huset: ytterväggarna följer bottenvåningens",
    removeBasement: "Ta bort källaren",
    removeBasementTitle: "Fyll igen källaren, med allt i den",
    moveAndTurn: "Flytta och vrid",
    wholeHouse: "Hela huset",
    turnLeft: "⟲ Vrid åt vänster",
    turnRight: "⟳ Vrid åt höger",
    turnLittle: "Vrid lite (väggarna lämnar rutnätet; taket passar ändå)",
    platformHeight: "Grundens höjd",
    platformHint: "Upp från markens medelhöjd: högre fyller mer jord, lägre schaktar mer. Djupa schakt och fyllningar får stödmurar.",
    moveHint: "Vrid det ett kvarts varv i taget, eller välj verktyget ✋ Flytta (M) och dra det i planen. I en slänt ändrar flytten hur mycket jord som schaktas.",
    sun: "Sol",
    playDay: "Dag",
    playDayTitle: "Spela upp dagen: solen rör sig av sig själv",
    walk: "Gå",
    walkTitle: "Gå runt i ögonhöjd: piltangenter eller WASD för att gå, dra för att titta, Esc för att sluta",
    sunTitle: "Var solen står: dra genom dagen för att se hur ljuset faller in i huset",
    seasons: { spring: "Vår", summer: "Sommar", autumn: "Höst", winter: "Vinter" },
    terraceSun: (hours, sunset) => `☀ ${hours} sol på våren${sunset ? " · kvällssol på sommaren" : ""}`,
    north: "N",
    platform: (height, dug, filled) => `Står på en plan yta på +${height} m · ${dug} m³ bortschaktat, ${filled} m³ utfyllt`,
    wallColour: "Väggfärg",
    garden: "Trädgård",
    gardenTitle: "Plantera träd, buskar, rabatter och häckar",
    gardenNote: "Nya växter hamnar på en ledig plats i trädgården; dra dem dit du vill, eller klicka på en för att vrida eller ta bort den.",
    addPlant: (name) => `+ ${name}`,
    balcony: "Balkong",
    addBalcony: "+ Balkong",
    balconyNote: "En balkong behöver en dörr ut i väggen bakom.",
    terrace: "Terrass",
    addTerrace: "+ Terrass",
    terraceNote: "En terrass behöver en dörr eller glasdörr ut i väggen bakom.",
    dormer: "Takkupa",
    skylight: "Takfönster",
    addSkylight: "+ Takfönster",
    skylightNote: "Ett takfönster ligger i takfallet ovanför väggen och släpper in dagsljus uppifrån.",
    windowStyle: "Stil",
    windowStyles: { Standard: "Vanlig", Cottage: "Stuga", Modern: "Modern" },
    frameColor: "Karm",
    frameColors: { White: "Vit", Black: "Svart", Green: "Grön", Blue: "Blå", Red: "Röd" },
    approach: "Upp till dörren",
    steps: "Trappsteg",
    ramp: "Ramp",
    approachNote: (steps, rise) => `Golvet ligger ${rise} över marken här: ${steps} trappsteg, eller en ramp för rullstol och barnvagn.`,
    addDormer: "+ Takkupa",
    dormerNeedsRoof: "Takkupor behöver ett lutande tak (sadeltak eller valmat): välj ett i takmenyn först",
    dormerHint: "Takkupor står i taket ovanför en yttervägg på översta våningen; lägg till fler från en väggs meny och dra dem längs väggen.",
    dormerNote: "En takkupa står i takfallet ovanför väggen och ger ljus åt rummet under.",
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
      move: "Dra i huset för att flytta hela, med rum, trappor och möbler. Vrid det under Flytta och vrid i sidopanelen.",
    },
    street: "GATA",
    roadName: { main: "STORGATAN", street: "GATA", lane: "LANDSVÄG" },
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
