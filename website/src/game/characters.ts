// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Persistent CHARACTERS — the Diablo-style save model that replaces the old
// device-wide, level-token progression. A character is a NAMED, evolving hero
// that lives on across every difficulty and level: its build (the engine
// `Loadout` — level, stats, gear, inventory, coins, abilities, companions) is
// carried whole into everything it plays, so higher difficulties are met with
// the gear earned on the lower ones. Nothing here is keyed per level: the
// character owns ONE loadout, updated on each victory.
//
// A character also remembers which difficulties it has BEATEN and which levels
// it has CLEARED — pure progress bookmarks that never touch the build. They
// gate two things:
//   1. the difficulty ladder — a difficulty is playable once the one before it
//      on `DIFFICULTY_ORDER` is beaten (easy is always open);
//   2. the level picker — a difficulty runs as a linear campaign until it is
//      beaten, after which any of its levels can be replayed freely (the
//      grind-for-gear endgame).
//
// HARDCORE is chosen at creation and is per-character: a hardcore hero that
// dies is retired for good (`dead`), kept in the roster's fallen list but never
// played again. Softcore death costs no progress — the run's build is banked on
// death (see `bankLoadout`) exactly as it is on victory, so the levels, stats
// and items earned this run are kept; only the level clear/beaten bookmarks
// wait for an actual victory.
//
// Persisted to localStorage (same best-effort policy as settings.ts): the
// roster under one key, the active-character id under another.

import {
  adoptEquipment,
  DIFFICULTY_ORDER,
  equipmentLevelReq,
  LEVEL_ORDER,
  type Difficulty,
  type Equipment,
  type Loadout,
} from "@game/core";

import { storageKey } from "../identity.ts";

/** A named, persistent hero. */
export type Character = {
  /** Stable unique id (roster key; also tags the character's parked run). */
  id: string;
  /** The player-given name, shown in the roster and HUD. */
  name: string;
  /** Chosen at creation: permadeath if true (see `dead`). Immutable after. */
  hardcore: boolean;
  /** Creation timestamp (ms) — roster sort + flavor. */
  createdAt: number;
  /** Hardcore permadeath latch: a dead hero is retired, never played again. */
  dead: boolean;
  /**
   * The evolving build — the engine snapshot the next level starts from. Null
   * for a brand-new hero: their first level starts from the authored fresh
   * start (level 1, the difficulty's wall weapon), and clearing it banks the
   * first snapshot.
   */
  loadout: Loadout | null;
  /** Levels cleared, as `${difficulty}:${levelId}` — drives the linear
   * campaign before a difficulty is beaten. */
  clears: string[];
  /** Difficulties whose whole campaign is beaten — unlocks the level picker
   * there AND the next rung of the ladder. */
  beaten: Difficulty[];
};

const ROSTER_KEY = storageKey("characters");
const ACTIVE_KEY = storageKey("active-character");

const clearKey = (levelId: string, difficulty: Difficulty): string =>
  `${difficulty}:${levelId}`;

/** A fresh unique id — `crypto.randomUUID` where present, else a timestamped
 * random fallback (older webviews). */
function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the manual id
  }
  return `char-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// ---- Loadout durability across catalog edits ---------------------------------
// A stored build outlives the run economy, so — like the old keepsake stash —
// every carried piece is ADOPTED onto its frozen def snapshot on load: a base
// the catalog later rebalanced or retired can neither nerf the hero's gear nor
// crash the apply. The equipped weapon can never resolve to nothing (it falls
// back to the engine's unbreakable sidearm); an unresolvable bag/worn piece is
// dropped.

function fallbackWeapon(): Equipment {
  return {
    id: 0,
    defId: "blaster",
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
}

function migrateLoadout(loadout: Loadout): Loadout {
  const fix = (piece: Equipment | null): Equipment | null => {
    if (!piece) return null;
    // A retired-tier piece (the pre-Diablo "epic") reads as rare; a missing
    // ilvl backfills from the base's requirement.
    const tier =
      (piece.tier as string) === "epic" ? ("rare" as const) : piece.tier;
    const adopted = adoptEquipment({ ...piece, tier });
    if (!adopted) return null;
    return {
      ...adopted,
      ilvl: adopted.ilvl ?? equipmentLevelReq(adopted.defId),
    };
  };
  const weapon = fix(loadout.equipment.weapon) ?? fallbackWeapon();
  return {
    ...loadout,
    equipment: {
      weapon,
      head: fix(loadout.equipment.head ?? null),
      chest: fix(loadout.equipment.chest ?? null),
      legs: fix(loadout.equipment.legs ?? null),
      feet: fix(loadout.equipment.feet ?? null),
      charm: fix(loadout.equipment.charm),
      bag: fix(loadout.equipment.bag ?? null),
    },
    inventory: loadout.inventory.map(fix),
    companions: (loadout.companions ?? []).map((companion) => ({
      ...companion,
      equipment: {
        weapon: fix(companion.equipment.weapon) as Equipment,
        head: fix(companion.equipment.head),
        chest: fix(companion.equipment.chest),
      },
    })),
  };
}

// ---- Roster persistence -------------------------------------------------------

/** The whole roster, oldest first. Loadouts are adopted on load so a stale
 * build never crashes the apply. Bad JSON / private mode yields an empty
 * roster (the create screen then opens). */
export function loadCharacters(): Character[] {
  try {
    const raw = window.localStorage.getItem(ROSTER_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return (parsed as Character[]).map((c) => ({
      ...c,
      dead: c.dead ?? false,
      clears: Array.isArray(c.clears) ? c.clears : [],
      beaten: Array.isArray(c.beaten) ? c.beaten : [],
      loadout: c.loadout ? migrateLoadout(c.loadout) : null,
    }));
  } catch {
    return [];
  }
}

function saveCharacters(characters: Character[]): void {
  try {
    window.localStorage.setItem(ROSTER_KEY, JSON.stringify(characters));
  } catch {
    // Storage unavailable (private mode / full) — the roster stays in-memory.
  }
}

/** The active-character id, or null if none is selected yet. */
export function getActiveCharacterId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/** Select the active character (null clears the selection). */
export function setActiveCharacterId(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(ACTIVE_KEY);
    else window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // Best effort — the roster screen still works from memory this session.
  }
}

/** The active character, or null if none is selected / it was deleted. */
export function getActiveCharacter(): Character | null {
  const id = getActiveCharacterId();
  if (!id) return null;
  return loadCharacters().find((c) => c.id === id) ?? null;
}

/**
 * Mint a new character and make it active. Name is trimmed; hardcore is fixed
 * for the life of the hero. The build starts empty (the first level opens from
 * the authored fresh start).
 */
export function createCharacter(name: string, hardcore: boolean): Character {
  const character: Character = {
    id: newId(),
    name: name.trim() || "HERO",
    hardcore,
    createdAt: Date.now(),
    dead: false,
    loadout: null,
    clears: [],
    beaten: [],
  };
  const roster = loadCharacters();
  roster.push(character);
  saveCharacters(roster);
  setActiveCharacterId(character.id);
  return character;
}

/** Delete a character from the roster (roster screen). Clears the active
 * selection if it was the one removed. */
export function deleteCharacter(id: string): void {
  saveCharacters(loadCharacters().filter((c) => c.id !== id));
  if (getActiveCharacterId() === id) setActiveCharacterId(null);
}

/** Persist a mutated character back into the roster (matched by id). */
function persist(character: Character): void {
  const roster = loadCharacters();
  const index = roster.findIndex((c) => c.id === character.id);
  if (index < 0) return;
  roster[index] = character;
  saveCharacters(roster);
}

// ---- Progression queries (pure over a character) ------------------------------

/** Has this character cleared `levelId` at `difficulty`? */
export function hasClearedLevel(
  character: Character,
  levelId: string,
  difficulty: Difficulty,
): boolean {
  return character.clears.includes(clearKey(levelId, difficulty));
}

/** Has this character beaten the whole campaign at `difficulty`? */
export function isDifficultyBeaten(
  character: Character,
  difficulty: Difficulty,
): boolean {
  return character.beaten.includes(difficulty);
}

/**
 * Is `difficulty` playable by this character? The first rung (easy) is always
 * open; every harder rung unlocks once the rung before it on `DIFFICULTY_ORDER`
 * is beaten. Locked rungs are shown greyed out on the select screen.
 */
export function isDifficultyUnlocked(
  character: Character,
  difficulty: Difficulty,
): boolean {
  const index = DIFFICULTY_ORDER.indexOf(difficulty);
  if (index <= 0) return true;
  const previous = DIFFICULTY_ORDER[index - 1] as Difficulty;
  return isDifficultyBeaten(character, previous);
}

/**
 * Is `levelId` reachable at `difficulty` for this character? Once the
 * difficulty is beaten the picker is open — any level goes. Before that it is
 * the linear campaign: the opener is always open, and each later level unlocks
 * when the one before it on `LEVEL_ORDER` has been cleared here.
 */
export function isLevelUnlocked(
  character: Character,
  levelId: string,
  difficulty: Difficulty,
): boolean {
  if (isDifficultyBeaten(character, difficulty)) return true;
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index <= 0) return true;
  const previous = LEVEL_ORDER[index - 1] as string;
  return hasClearedLevel(character, previous, difficulty);
}

/**
 * The level to drop this character into at `difficulty` when the picker is
 * still locked: the first level along `LEVEL_ORDER` they have not cleared here
 * (falling back to the opener once all are done — replays start at the top).
 */
export function firstUnclearedLevel(
  character: Character,
  difficulty: Difficulty,
): string {
  const opener = LEVEL_ORDER[0] as string;
  return (
    LEVEL_ORDER.find((id) => !hasClearedLevel(character, id, difficulty)) ??
    opener
  );
}

/** The next level along `LEVEL_ORDER`, or null if this is the last (or an
 * unknown id) — the campaign's "advance" step behind the NEXT LEVEL button. */
export function nextLevelId(levelId: string): string | null {
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index < 0 || index + 1 >= LEVEL_ORDER.length) return null;
  return LEVEL_ORDER[index + 1] as string;
}

// ---- Progression mutations ----------------------------------------------------

/**
 * Bank a level victory onto the character: adopt the end-of-level build as the
 * new persistent loadout, record the clear, and — if it was the difficulty's
 * LAST level — mark the difficulty beaten (which opens its level picker and the
 * next rung of the ladder). Persists and returns the updated character.
 */
export function recordVictory(
  character: Character,
  levelId: string,
  difficulty: Difficulty,
  loadout: Loadout,
): Character {
  const key = clearKey(levelId, difficulty);
  const clears = character.clears.includes(key)
    ? character.clears
    : [...character.clears, key];
  const last = LEVEL_ORDER[LEVEL_ORDER.length - 1];
  const beaten =
    levelId === last && !character.beaten.includes(difficulty)
      ? [...character.beaten, difficulty]
      : character.beaten;
  const updated: Character = { ...character, loadout, clears, beaten };
  persist(updated);
  return updated;
}

/**
 * The hardcore reckoning: on DEATH, a hardcore hero is retired for good
 * (`dead`), so the roster keeps them as fallen but they can never be played
 * again. Softcore never dies here — a softcore death banks the run's build via
 * `bankLoadout` instead, so the hero keeps everything and plays on.
 */
export function recordDeath(character: Character): Character {
  if (!character.hardcore) return character;
  const updated: Character = { ...character, dead: true };
  persist(updated);
  return updated;
}

/**
 * Bank the run's end-of-run build onto a SOFTCORE hero after a death, so the
 * levels, stats and items earned this run are kept — softcore death costs no
 * progress. Unlike `recordVictory` it records no clear and marks no difficulty
 * beaten (the level was NOT cleared); only the persistent loadout advances.
 * Persists and returns the updated character.
 */
export function bankLoadout(character: Character, loadout: Loadout): Character {
  const updated: Character = { ...character, loadout };
  persist(updated);
  return updated;
}
