/** The clients who commission houses, easiest first, and the architect's career. */

import type { Client } from "./brief";
import { starterPlots } from "./plot";

const [suburban, lakeside, hillside] = starterPlots();

export const CLIENTS: Client[] = [
  {
    id: "lindgren",
    text: {
      en: {
        name: "Margit & Sven Lindgren",
        who: "A retired couple selling the family home",
        story:
          "The children have moved out and the stairs in our old house are getting too much. We'd like something small and easy to keep, all on one level, with doors wide enough for a wheelchair one day. Room for the grandchildren to stay over would be lovely.",
      },
      sv: {
        name: "Margit och Sven Lindgren",
        who: "Ett pensionärspar som säljer familjehuset",
        story:
          "Barnen har flyttat ut och trapporna i vårt gamla hus börjar bli för mycket. Vi vill ha något litet och lättskött, allt på ett plan, med dörrar som är breda nog för en rullstol en dag. Plats för barnbarnen att sova över vore underbart.",
      },
    },
    plot: lakeside,
    budget: 65_000,
    items: [
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 1, minArea: 12 } },
      { must: true, req: { kind: "rooms", room: "Bathroom", count: 1, minArea: 5 } },
      { must: true, req: { kind: "rooms", room: "Kitchen", count: 1 } },
      { must: true, req: { kind: "rooms", room: "Living", count: 1, minArea: 20 } },
      { must: true, req: { kind: "doorWidth", min: 0.9 } },
      { must: true, req: { kind: "floorArea", max: 95 } },
      { must: true, req: { kind: "storeys", max: 1 } },
      { must: false, req: { kind: "rooms", room: "Bedroom", count: 2, minArea: 8 } },
      { must: false, req: { kind: "connected", a: "Kitchen", b: "Living" } },
      { must: false, req: { kind: "roofStyle", styles: ["Hip"] } },
      { must: false, req: { kind: "windowArea", room: "Living", min: 4 } },
    ],
  },
  {
    id: "haddad",
    text: {
      en: {
        name: "Noor Haddad",
        who: "A software developer who works from home",
        story:
          "I spend most days at my desk, so the office matters more than anything: quiet, with plenty of daylight. Otherwise I don't need much. I like clean, modern lines, and I'd rather not spend everything I have.",
      },
      sv: {
        name: "Noor Haddad",
        who: "En systemutvecklare som jobbar hemifrån",
        story:
          "Jag sitter vid skrivbordet största delen av dagarna, så arbetsrummet betyder mer än allt annat: tyst och med mycket dagsljus. I övrigt behöver jag inte mycket. Jag gillar rena, moderna linjer, och jag vill helst inte göra av med allt jag har.",
      },
    },
    plot: suburban,
    budget: 50_000,
    items: [
      { must: true, req: { kind: "rooms", room: "Office", count: 1, minArea: 8 } },
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 1, minArea: 9 } },
      { must: true, req: { kind: "rooms", room: "Bathroom", count: 1 } },
      { must: true, req: { kind: "rooms", room: "Kitchen", count: 1 } },
      { must: true, req: { kind: "rooms", room: "Living", count: 1, minArea: 16 } },
      { must: false, req: { kind: "roofStyle", styles: ["Flat"] } },
      { must: false, req: { kind: "windowArea", room: "Office", min: 2.5 } },
      { must: false, req: { kind: "connected", a: "Kitchen", b: "Living" } },
      { must: false, req: { kind: "underBudget", share: 0.85 } },
    ],
  },
  {
    id: "andersson",
    text: {
      en: {
        name: "The Andersson family",
        who: "Two parents, two kids and a dog",
        story:
          "Our flat is bursting at the seams. Each of the kids needs their own room, we need a decent bedroom for ourselves, and the kitchen is where we all end up, so it should open onto the living room. A garage for the car and the bikes would be a dream, and so would having the bedrooms upstairs.",
      },
      sv: {
        name: "Familjen Andersson",
        who: "Två föräldrar, två barn och en hund",
        story:
          "Vår lägenhet håller på att spricka i sömmarna. Båda barnen behöver ett eget rum, vi behöver ett ordentligt sovrum för oss själva, och köket är där vi alla hamnar, så det ska ha en dörr rakt in till vardagsrummet. Ett garage för bilen och cyklarna vore en dröm, och likaså att ha sovrummen på övervåningen.",
      },
    },
    plot: suburban,
    budget: 85_000,
    items: [
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 3, minArea: 9 } },
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 1, minArea: 12 } },
      { must: true, req: { kind: "rooms", room: "Bathroom", count: 1, minArea: 4 } },
      { must: true, req: { kind: "rooms", room: "Kitchen", count: 1, minArea: 8 } },
      { must: true, req: { kind: "rooms", room: "Living", count: 1, minArea: 20 } },
      { must: true, req: { kind: "connected", a: "Kitchen", b: "Living" } },
      { must: false, req: { kind: "rooms", room: "Garage", count: 1 } },
      { must: false, req: { kind: "rooms", room: "WC", count: 1 } },
      { must: false, req: { kind: "rooms", room: "Utility", count: 1 } },
      { must: false, req: { kind: "wallMaterial", material: "Wood" } },
      { must: false, req: { kind: "rooms", room: "Bedroom", count: 3, minArea: 9, floor: "upper" } },
    ],
  },
  {
    id: "berg",
    text: {
      en: {
        name: "Lars Berg",
        who: "A retired carpenter with a lifetime of tools",
        story:
          "I need a proper workshop: a big garage I can fit the van and the workbench in. The house itself can be modest, but it has to be timber. I've built with wood all my life and I'm not living in anything else.",
      },
      sv: {
        name: "Lars Berg",
        who: "En pensionerad snickare med ett helt livs verktyg",
        story:
          "Jag behöver en riktig verkstad: ett stort garage där både bussen och hyvelbänken får plats. Själva huset kan vara enkelt, men det ska vara av trä. Jag har byggt i trä i hela mitt liv och tänker inte bo i något annat.",
      },
    },
    plot: lakeside,
    budget: 52_000,
    items: [
      { must: true, req: { kind: "rooms", room: "Garage", count: 1, minArea: 30 } },
      { must: true, req: { kind: "wallMaterial", material: "Wood" } },
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 1, minArea: 10 } },
      { must: true, req: { kind: "rooms", room: "Bathroom", count: 1 } },
      { must: true, req: { kind: "rooms", room: "Kitchen", count: 1 } },
      { must: true, req: { kind: "rooms", room: "Living", count: 1, minArea: 15 } },
      { must: false, req: { kind: "rooms", room: "Storage", count: 1, minArea: 3 } },
      { must: false, req: { kind: "roofMaterial", material: "Metal" } },
      { must: false, req: { kind: "roofStyle", styles: ["Gable"] } },
    ],
  },
  {
    id: "okafor",
    text: {
      en: {
        name: "The Okafor family",
        who: "Parents, four children and a grandmother",
        story:
          "We are a big household and we want everyone under one roof, including Grandma, who needs her own room and a bathroom close by. Mornings are chaos, so two bathrooms at least. Grandma can't manage stairs, so her room has to be on the ground floor. We have a big plot on the hill, so don't hold back.",
      },
      sv: {
        name: "Familjen Okafor",
        who: "Föräldrar, fyra barn och en mormor",
        story:
          "Vi är ett stort hushåll och vill ha alla under samma tak, också mormor, som behöver ett eget rum och ett badrum i närheten. Morgnarna är kaos, så minst två badrum. Mormor klarar inte trappor, så hennes rum måste ligga på bottenvåningen. Vi har en stor tomt i sluttningen, så håll inte igen.",
      },
    },
    plot: hillside,
    budget: 105_000,
    items: [
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 5, minArea: 9 } },
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 1, minArea: 14 } },
      { must: true, req: { kind: "rooms", room: "Bathroom", count: 2, minArea: 4 } },
      { must: true, req: { kind: "rooms", room: "Kitchen", count: 1, minArea: 12 } },
      { must: true, req: { kind: "rooms", room: "Living", count: 1, minArea: 30 } },
      { must: true, req: { kind: "doorWidth", min: 0.9 } },
      { must: true, req: { kind: "rooms", room: "Bedroom", count: 1, minArea: 9, floor: "ground" } },
      { must: false, req: { kind: "everyFloor", room: "Bathroom" } },
      { must: false, req: { kind: "rooms", room: "Garage", count: 1, minArea: 20 } },
      { must: false, req: { kind: "rooms", room: "Utility", count: 1 } },
      { must: false, req: { kind: "rooms", room: "Office", count: 1 } },
      { must: false, req: { kind: "wallMaterial", material: "Brick" } },
      { must: false, req: { kind: "windowArea", room: "Living", min: 6 } },
    ],
  },
];

export interface Commission {
  clientId: string;
  fee: number;
  stars: number;
}

export interface Career {
  earnings: number;
  completed: Commission[];
}

export function newCareer(): Career {
  return { earnings: 0, completed: [] };
}

export function clientById(id: string): Client | undefined {
  return CLIENTS.find((c) => c.id === id);
}

/** The next client to call: the first one not served yet, then round again. */
export function nextClient(career: Career): Client {
  const done = new Set(career.completed.map((c) => c.clientId));
  return CLIENTS.find((c) => !done.has(c.id)) ?? CLIENTS[career.completed.length % CLIENTS.length];
}

/** Record a sold design. */
export function completeCommission(career: Career, clientId: string, fee: number, stars: number): Career {
  return { earnings: career.earnings + fee, completed: [...career.completed, { clientId, fee, stars }] };
}
