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
//   1. the difficulty ladder — the three parallel starting lanes
//      (easy/medium/hard) are always open; a gated rung unlocks once any of its
//      prerequisites is beaten (NIGHTMARE on any starting lane, JESUS on
//      NIGHTMARE — see `DIFFICULTY_UNLOCK_PREREQS`);
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
  DIFFICULTY_UNLOCK_PREREQS,
  equipmentLevelReq,
  LEVEL_ORDER,
  STARTING_DIFFICULTIES,
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
  /**
   * Maps where this hero has MET the wandering merchant, as
   * `${difficulty}:${levelId}`. Once met, the trader is set up at the door on
   * every later entry to that map/difficulty (fed to `createGame` as
   * `merchantDiscovered`), so a death-and-restart can walk straight to the
   * counter and repair. Recorded on the `merchantDiscovered` engine event.
   */
  merchantsMet: string[];
  /** Difficulties whose whole campaign is beaten — unlocks the level picker
   * there AND the next rung of the ladder. */
  beaten: Difficulty[];
  /**
   * Story beats already witnessed, so a replay drops straight into the action
   * instead of replaying them (we die and retry a lot — no need to sit through
   * the same text twice). Two kinds of marker, per difficulty so a fresh rung
   * still tells the story once:
   *   - `${difficulty}:${levelId}` — the level's OPENING (prelude cutscene +
   *     intro monologue) has played on this difficulty.
   *   - `${difficulty}#${thoughtId}` — a pinned inner monologue (the
   *     kill/sight/strike/asteroid thoughts) has played on this difficulty.
   * Thought ids are globally unique, so the difficulty alone keys them.
   */
  storySeen: string[];
  /**
   * COIN STORE credit waiting on a bank: purchased coins land here when the
   * hero has no banked loadout yet to carry a purse (a brand-new character),
   * and fold into the purse the next time a loadout IS banked (victory or
   * softcore death — see `recordVictory`/`bankLoadout`). Optional: absent on
   * every character that has never bought coins.
   */
  pendingCoins?: number;
  /**
   * HARDCORE campaign tally, per difficulty: the running total of foes felled,
   * combat-clock time survived, highest menace stage reached, and levels
   * cleared across the maps beaten this campaign. Accrued on each FIRST clear
   * while the difficulty is unbeaten, and banked to the high-score board (then
   * reset) when the campaign is completed or the hardcore hero falls (see
   * GameScreen). Softcore heroes never score, so this stays empty for them.
   * Optional: a character created before the feature simply starts empty.
   */
  campaigns?: Partial<Record<Difficulty, CampaignTally>>;
};

/** A hardcore character's in-progress campaign totals on one difficulty — the
 * sum of every map cleared so far, awaiting the campaign's end to be banked. */
export type CampaignTally = {
  kills: number;
  combatMs: number;
  peakMenace: number;
  levels: number;
};

const ROSTER_KEY = storageKey("characters");
const ACTIVE_KEY = storageKey("active-character");

const clearKey = (levelId: string, difficulty: Difficulty): string =>
  `${difficulty}:${levelId}`;

// The two `storySeen` marker shapes (see the field's docs): an OPENING is
// pinned to a level, a THOUGHT to a difficulty alone (ids are globally unique).
const openingKey = (levelId: string, difficulty: Difficulty): string =>
  `${difficulty}:${levelId}`;
const thoughtSeenKey = (thoughtId: string, difficulty: Difficulty): string =>
  `${difficulty}#${thoughtId}`;

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
      storySeen: Array.isArray(c.storySeen) ? c.storySeen : [],
      merchantsMet: Array.isArray(c.merchantsMet) ? c.merchantsMet : [],
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
    storySeen: [],
    merchantsMet: [],
  };
  const roster = loadCharacters();
  roster.push(character);
  saveCharacters(roster);
  setActiveCharacterId(character.id);
  return character;
}

/**
 * An ephemeral, throwaway hero for the HOW TO PLAY demo (App). It is NOT added
 * to the roster and is never the active character, so it survives no reload and
 * pollutes no saved progress. Its id matches nothing in the roster, so every
 * `persist()` over it (recordVictory, markStorySeen, …) short-circuits to a
 * no-op — the autopilot can clear the whole level and bank nothing. Softcore
 * with an empty build: BOT VIEW mints the arrival loadout it actually plays, so
 * this hero is only a shell carrying the run.
 */
export function demoCharacter(): Character {
  return {
    id: "__demo__",
    name: "DEMO",
    hardcore: false,
    createdAt: 0,
    dead: false,
    loadout: null,
    clears: [],
    beaten: [],
    storySeen: [],
    merchantsMet: [],
  };
}

/**
 * Mint a DEVELOPER seed character (see seedCharacters.ts): a softcore hero
 * dropped in with a pre-built `loadout` and stamped as having already BEATEN
 * `beaten` (so every listed difficulty's level picker is open and the ladder
 * above them is unlocked). Unlike `createCharacter` it does NOT switch the
 * active hero, and it replaces any existing roster entry of the SAME NAME so
 * re-seeding refreshes the specimen instead of piling up duplicates. Persists
 * and returns the stored character.
 */
export function seedCharacter(opts: {
  name: string;
  loadout: Loadout;
  beaten: Difficulty[];
}): Character {
  const name = opts.name.trim() || "HERO";
  const character: Character = {
    id: newId(),
    name,
    hardcore: false,
    createdAt: Date.now(),
    dead: false,
    loadout: opts.loadout,
    // A beaten difficulty's whole campaign counts as cleared — open every
    // level for free replay/warp.
    clears: opts.beaten.flatMap((d) =>
      LEVEL_ORDER.map((id) => clearKey(id, d)),
    ),
    beaten: [...opts.beaten],
    storySeen: [],
    merchantsMet: [],
  };
  const roster = loadCharacters().filter((c) => c.name !== name);
  roster.push(character);
  saveCharacters(roster);
  return character;
}

// ---- Import / export (see character-transfer.ts) -----------------------------

/** Serialize a character to canonical JSON — the `character.json` an export
 * signs and ships (see character-transfer.ts). */
export function serializeCharacter(character: Character): string {
  return JSON.stringify(character);
}

/**
 * Validate a parsed value as a Character, or throw. Every field is defended
 * (a hand-authored file can carry anything) and the loadout is adopted through
 * `migrateLoadout` so a build from an older catalog can't crash the apply. The
 * id is preserved when present but is not trusted for uniqueness — the roster
 * add (`importCharacter`) mints a fresh one.
 */
export function normalizeCharacter(data: unknown): Character {
  if (!data || typeof data !== "object") {
    throw new Error("not a character");
  }
  const c = data as Partial<Character>;
  if (typeof c.name !== "string") {
    throw new Error("character is missing a name");
  }
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  let loadout: Loadout | null;
  try {
    loadout = c.loadout ? migrateLoadout(c.loadout) : null;
  } catch {
    // A malformed build is dropped rather than crashing the import — the hero
    // still comes across with its progress bookmarks intact.
    loadout = null;
  }
  return {
    id: typeof c.id === "string" ? c.id : newId(),
    name: c.name.trim() || "HERO",
    hardcore: c.hardcore === true,
    createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
    dead: c.dead === true,
    loadout,
    clears: strings(c.clears),
    beaten: strings(c.beaten) as Difficulty[],
    storySeen: strings(c.storySeen),
    merchantsMet: strings(c.merchantsMet),
    // Store-bought coins still waiting on a bank travel with the hero.
    ...(typeof c.pendingCoins === "number" && c.pendingCoins > 0
      ? { pendingCoins: c.pendingCoins }
      : {}),
  };
}

/**
 * Add an imported character to the roster under a FRESH id, so importing a hero
 * onto a device that still has the original makes a copy rather than clobbering
 * it. Returns the stored character.
 */
export function importCharacter(data: unknown): Character {
  const character: Character = { ...normalizeCharacter(data), id: newId() };
  const roster = loadCharacters();
  roster.push(character);
  saveCharacters(roster);
  return character;
}

/**
 * DEVELOPER → GRANT COINS: pour `amount` coins into every rostered
 * character's banked purse. The purse rides the banked `Loadout`, so a fresh
 * character who has never finished a level has nothing to pour into and is
 * skipped (play one level first). A parked/checkpointed run keeps its own
 * frozen purse — the grant lands on the NEXT run built from the bank.
 * Returns how many characters were funded.
 */
export function grantCoins(amount: number): number {
  const roster = loadCharacters();
  let funded = 0;
  for (let i = 0; i < roster.length; i++) {
    const character = roster[i];
    const loadout = character?.loadout;
    if (!character || !loadout) continue;
    roster[i] = {
      ...character,
      loadout: {
        ...loadout,
        coins: Math.max(0, (loadout.coins ?? 0) + amount),
      },
    };
    funded++;
  }
  if (funded > 0) saveCharacters(roster);
  return funded;
}

/**
 * COIN STORE: credit purchased coins onto ONE chosen character. A hero with a
 * banked loadout takes them straight into the purse; a brand-new hero (no bank
 * yet) holds them as `pendingCoins`, folded into the purse when their first
 * loadout is banked — a paid credit is never dropped the way the developer
 * grant skips bankless heroes. Returns false when the character no longer
 * exists (the caller keeps the purchase pending and retries later).
 */
export function creditCoins(characterId: string, amount: number): boolean {
  if (!(amount > 0)) return false;
  const roster = loadCharacters();
  const index = roster.findIndex((c) => c.id === characterId);
  const character = roster[index];
  if (!character) return false;
  roster[index] = character.loadout
    ? {
        ...character,
        loadout: {
          ...character.loadout,
          coins: Math.max(0, character.loadout.coins ?? 0) + amount,
        },
      }
    : { ...character, pendingCoins: (character.pendingCoins ?? 0) + amount };
  saveCharacters(roster);
  return true;
}

/** Everything a hero owns in coins: the banked purse plus any store credit
 * still waiting on a first bank (`pendingCoins`). */
export function characterPurse(character: Character): number {
  return (
    Math.max(0, character.loadout?.coins ?? 0) +
    Math.max(0, character.pendingCoins ?? 0)
  );
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

/**
 * The level ids this character has cleared on `difficulty`, fed to the engine
 * (`createGame`'s `clearedLevels`) so campaign-gated drops know the run's
 * progress — chiefly the bunker key, latent until "eastworld" is cleared.
 */
export function clearedLevelsFor(
  character: Character,
  difficulty: Difficulty,
): string[] {
  const prefix = `${difficulty}:`;
  return character.clears
    .filter((c) => c.startsWith(prefix))
    .map((c) => c.slice(prefix.length));
}

/**
 * Has this character already witnessed `levelId`'s opening (prelude cutscene +
 * intro monologue) on `difficulty`? True means a replay should skip straight
 * into play (see `skipStoryOpening`).
 */
export function hasSeenOpening(
  character: Character,
  levelId: string,
  difficulty: Difficulty,
): boolean {
  return character.storySeen.includes(openingKey(levelId, difficulty));
}

/**
 * The pinned inner-monologue (thought) ids this character has already read on
 * `difficulty`. Fed back into the engine on a rebuild (`markThoughtsSeen`) so
 * a replay skips every beat it has already shown while a not-yet-reached one
 * still plays its one time.
 */
export function seenThoughts(
  character: Character,
  difficulty: Difficulty,
): string[] {
  const prefix = `${difficulty}#`;
  return character.storySeen
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

/**
 * Record that this character has now witnessed `levelId`'s opening and read
 * `thoughts` (the run's accumulated `state.thoughtsSeen`) on `difficulty`, so
 * future replays on this difficulty skip them. Idempotent — a no-op returns the
 * same character untouched; otherwise it persists and returns the update.
 */
export function markStorySeen(
  character: Character,
  levelId: string,
  difficulty: Difficulty,
  thoughts: readonly string[],
): Character {
  const seen = new Set(character.storySeen);
  const before = seen.size;
  seen.add(openingKey(levelId, difficulty));
  for (const thought of thoughts) seen.add(thoughtSeenKey(thought, difficulty));
  if (seen.size === before) return character; // nothing new witnessed
  const updated: Character = { ...character, storySeen: [...seen] };
  persist(updated);
  return updated;
}

/** Has this hero met the wandering merchant on `levelId` at `difficulty`? The
 * app feeds the answer to `createGame` (`merchantDiscovered`) so the trader is
 * set up at the door on re-entry. */
export function hasMetMerchant(
  character: Character,
  levelId: string,
  difficulty: Difficulty,
): boolean {
  return character.merchantsMet.includes(clearKey(levelId, difficulty));
}

/** Record that this hero has now MET the merchant on `levelId`/`difficulty`
 * (called on the `merchantDiscovered` event). Idempotent — a no-op returns the
 * character untouched; otherwise it persists and returns the update. */
export function markMerchantMet(
  character: Character,
  levelId: string,
  difficulty: Difficulty,
): Character {
  const key = clearKey(levelId, difficulty);
  if (character.merchantsMet.includes(key)) return character;
  const updated: Character = {
    ...character,
    merchantsMet: [...character.merchantsMet, key],
  };
  persist(updated);
  return updated;
}

/** Has this character beaten the whole campaign at `difficulty`? */
export function isDifficultyBeaten(
  character: Character,
  difficulty: Difficulty,
): boolean {
  return character.beaten.includes(difficulty);
}

/**
 * Is `difficulty` playable by this character? Reads the unlock graph
 * (`DIFFICULTY_UNLOCK_PREREQS`): the three parallel starting lanes
 * (easy/medium/hard) have no prerequisites and are always open; a gated rung
 * unlocks once ANY difficulty in its prerequisite list is beaten — NIGHTMARE on
 * any starting lane beaten, JESUS on NIGHTMARE beaten. Locked rungs are shown
 * greyed out on the select screen.
 */
export function isDifficultyUnlocked(
  character: Character,
  difficulty: Difficulty,
): boolean {
  const prereqs = DIFFICULTY_UNLOCK_PREREQS[difficulty] ?? [];
  if (prereqs.length === 0) return true;
  return prereqs.some((d) => isDifficultyBeaten(character, d));
}

/**
 * The rung this hero should aim for next — the roster card's "NEXT: …"
 * standing — following the OR-gated unlock graph, NOT a flat five-rung count.
 * The starting lanes (easy/medium/hard) are PARALLEL entry points sharing one
 * tier: beating ANY one clears that tier and opens NIGHTMARE, which in turn
 * opens JESUS. So the target jumps tier-to-tier, not lane-to-lane — beating
 * (say) HARD points at NIGHTMARE, never back down at the medium lane it skipped.
 *
 * Null once every reachable rung is beaten (the top of the ladder is cleared) —
 * the caller reads that as "ALL CLEARED".
 */
export function nextDifficultyFor(character: Character): Difficulty | null {
  // Hardest first: the first UNLOCKED-but-unbeaten GATED rung is the target
  // (NIGHTMARE once a starting lane falls, JESUS once NIGHTMARE falls). Skips
  // the parallel starting lanes — those are a single tier handled below.
  for (let i = DIFFICULTY_ORDER.length - 1; i >= 0; i--) {
    const d = DIFFICULTY_ORDER[i] as Difficulty;
    if (STARTING_DIFFICULTIES.includes(d)) continue;
    if (
      isDifficultyUnlocked(character, d) &&
      !isDifficultyBeaten(character, d)
    ) {
      return d;
    }
  }
  // No gated rung is an open target. If a starting lane has been beaten the
  // whole gated chain above it must be cleared too — the ladder is done.
  if (STARTING_DIFFICULTIES.some((d) => isDifficultyBeaten(character, d))) {
    return null;
  }
  // Still on the starting tier: aim at the gentlest lane not yet beaten.
  return (
    STARTING_DIFFICULTIES.find((d) => !isDifficultyBeaten(character, d)) ??
    (STARTING_DIFFICULTIES[0] as Difficulty)
  );
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

/**
 * Where LOADING this hero drops in: the campaign still IN PROGRESS — the
 * furthest (hardest) difficulty they have begun but not yet beaten — at the
 * beginning of its first uncleared level. A loaded hero is already tied to a
 * difficulty and a current level, so LOAD resumes there straight away with no
 * difficulty picker.
 *
 * Null when no campaign is under way: a brand-new hero who has not started one,
 * or a hero who has beaten every difficulty they have touched. The caller then
 * opens the difficulty ladder instead — the one place a hero picks a starting
 * lane or steps up to a newly-unlocked harder rung.
 */
export function resumeTargetFor(
  character: Character,
): { difficulty: Difficulty; levelId: string } | null {
  // Walk from the hardest rung down so a hero partway up a higher difficulty
  // resumes there rather than on an easier lane they also dipped into.
  for (let i = DIFFICULTY_ORDER.length - 1; i >= 0; i--) {
    const difficulty = DIFFICULTY_ORDER[i] as Difficulty;
    if (isDifficultyBeaten(character, difficulty)) continue;
    if (clearedLevelsFor(character, difficulty).length === 0) continue;
    return { difficulty, levelId: firstUnclearedLevel(character, difficulty) };
  }
  return null;
}

/** The next level along `LEVEL_ORDER`, or null if this is the last (or an
 * unknown id) — the campaign's "advance" step behind the NEXT LEVEL button. */
export function nextLevelId(levelId: string): string | null {
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index < 0 || index + 1 >= LEVEL_ORDER.length) return null;
  return LEVEL_ORDER[index + 1] as string;
}

// ---- Hardcore campaign tally --------------------------------------------------

/** The zero tally — a campaign not yet begun on a difficulty. */
const EMPTY_TALLY: CampaignTally = {
  kills: 0,
  combatMs: 0,
  peakMenace: 0,
  levels: 0,
};

/** This character's running campaign totals on a difficulty (zeros if none). */
export function campaignTally(
  character: Character,
  difficulty: Difficulty,
): CampaignTally {
  return character.campaigns?.[difficulty] ?? EMPTY_TALLY;
}

/**
 * Fold one cleared level's run into the campaign tally for a difficulty: sum
 * the foes felled and combat-clock time, keep the highest menace stage, and
 * count the level. Persists and returns the updated character. (Callers gate
 * this on hardcore + first-clear so a softcore hero or a replay never scores.)
 */
export function accrueCampaign(
  character: Character,
  difficulty: Difficulty,
  run: { kills: number; combatMs: number; peakMenace: number },
): Character {
  const prev = campaignTally(character, difficulty);
  const next: CampaignTally = {
    kills: prev.kills + Math.max(0, run.kills),
    combatMs: prev.combatMs + Math.max(0, run.combatMs),
    peakMenace: Math.max(prev.peakMenace, Math.max(0, run.peakMenace)),
    levels: prev.levels + 1,
  };
  const updated: Character = {
    ...character,
    campaigns: { ...character.campaigns, [difficulty]: next },
  };
  persist(updated);
  return updated;
}

/** Clear a difficulty's campaign tally once it has been banked, so a later
 * replay-through can't re-bank the same totals. Persists and returns it. */
export function resetCampaign(
  character: Character,
  difficulty: Difficulty,
): Character {
  if (!character.campaigns?.[difficulty]) return character;
  const campaigns = { ...character.campaigns };
  delete campaigns[difficulty];
  const updated: Character = { ...character, campaigns };
  persist(updated);
  return updated;
}

// ---- Progression mutations ----------------------------------------------------

/** Fold store-bought coins waiting on the character (`pendingCoins`) into the
 * loadout being banked, so a purchase made before the hero's first bank lands
 * in the purse the moment there is one. */
function foldPendingCoins(character: Character, loadout: Loadout): Loadout {
  const pending = character.pendingCoins ?? 0;
  if (pending <= 0) return loadout;
  return { ...loadout, coins: Math.max(0, loadout.coins ?? 0) + pending };
}

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
  const updated: Character = {
    ...character,
    loadout: foldPendingCoins(character, loadout),
    pendingCoins: undefined,
    clears,
    beaten,
  };
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
  const updated: Character = {
    ...character,
    loadout: foldPendingCoins(character, loadout),
    pendingCoins: undefined,
  };
  persist(updated);
  return updated;
}
