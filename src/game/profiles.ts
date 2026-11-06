/**
 * Players sharing one browser. Each player has their own campaign, free play house and
 * saved designs, stored under their own keys; the language and the cost panel's place
 * are shared. Saves from before there were players become the first player's.
 */

export interface Profile {
  id: string;
  name: string;
  /** An emoji to recognise them by. */
  avatar: string;
  createdAt: number;
}

interface Profiles {
  list: Profile[];
  current: string;
}

const KEY = "architect.profiles.v1";

/** What each player keeps (a player's key is `architect.<id>.<name>`). */
const PER_PLAYER = ["game.v2", "free.v1", "designs.v1"] as const;
export type PlayerData = (typeof PER_PLAYER)[number];

export const AVATARS = ["🦊", "🐻", "🐼", "🐸", "🐙", "🦉", "🐝", "🦄", "🐢", "🐧", "🦁", "🐰"];

function read(): Profiles | null {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Profiles) : null;
    return p && Array.isArray(p.list) && p.list.length ? p : null;
  } catch {
    return null;
  }
}

function write(p: Profiles): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Without storage there is only ever the one player, for this visit.
  }
}

/** The players, creating the first one (with any saves from before players) when needed. */
function load(defaultName: string): Profiles {
  const existing = read();
  if (existing) {
    if (!existing.list.some((p) => p.id === existing.current)) existing.current = existing.list[0].id;
    return existing;
  }
  const first: Profile = { id: "p1", name: defaultName, avatar: AVATARS[0], createdAt: Date.now() };
  try {
    for (const name of PER_PLAYER) {
      const old = localStorage.getItem(`architect.${name}`);
      if (old !== null && localStorage.getItem(dataKey(first.id, name)) === null) {
        localStorage.setItem(dataKey(first.id, name), old);
        localStorage.removeItem(`architect.${name}`);
      }
    }
  } catch {
    // Nothing to carry over.
  }
  const p = { list: [first], current: first.id };
  write(p);
  return p;
}

const dataKey = (id: string, name: PlayerData) => `architect.${id}.${name}`;

let state: Profiles | null = null;

/** Set up the players (call once, before anything reads a player's data). */
export function initProfiles(defaultName: string): void {
  state = load(defaultName);
}

const profilesState = (): Profiles => (state ??= load("Player 1"));

export const listProfiles = (): Profile[] => profilesState().list;

export const currentProfile = (): Profile => {
  const s = profilesState();
  return s.list.find((p) => p.id === s.current) ?? s.list[0];
};

/** The storage key of some of the current player's data. */
export const playerKey = (name: PlayerData): string => dataKey(currentProfile().id, name);

/** Some of another player's data, parsed (for showing their progress). */
export function readPlayerData<T>(id: string, name: PlayerData): T | null {
  try {
    const raw = localStorage.getItem(dataKey(id, name));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function addProfile(name: string, avatar: string): Profile {
  const s = profilesState();
  const p: Profile = { id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, name, avatar, createdAt: Date.now() };
  s.list.push(p);
  write(s);
  return p;
}

export function switchProfile(id: string): void {
  const s = profilesState();
  if (!s.list.some((p) => p.id === id)) return;
  s.current = id;
  write(s);
}

export function renameProfile(id: string, name: string, avatar: string): void {
  const s = profilesState();
  const p = s.list.find((x) => x.id === id);
  if (!p) return;
  p.name = name;
  p.avatar = avatar;
  write(s);
}

/** Remove a player and everything they saved (not the current player). */
export function deleteProfile(id: string): void {
  const s = profilesState();
  if (id === s.current || s.list.length < 2) return;
  s.list = s.list.filter((p) => p.id !== id);
  write(s);
  try {
    for (const name of PER_PLAYER) localStorage.removeItem(dataKey(id, name));
  } catch {
    // Already gone.
  }
}
