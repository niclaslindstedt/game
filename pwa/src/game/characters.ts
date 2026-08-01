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
// roster under one key, the active-character id under another, and the
// deletion tombstones under a third (see CLOUD SAVE below).
//
// This file owns the roster, its storage, and the mutations that advance a
// hero. The pure READS over a stored hero — what they have cleared, which
// rungs and missions are open, where LOAD drops them back in — live next door
// in character-progress.ts and are re-exported here.
//
// CLOUD SAVE (cloud-save.ts) merges rosters between the player's devices, and
// two things here exist for it: the `updatedAt` stamp `saveCharacters` writes
// on the heroes a save actually CHANGED, and the tombstone a deletion leaves
// behind. Both are load-bearing — see their own comments before touching them.

import {
  adoptEquipment,
  equipmentLevelReq,
  LEVEL_ORDER,
  reclaimCost,
  vaultContents,
  emptyCampaignQuests,
  mergeCampaignQuests,
  type CampaignQuestSave,
  type Difficulty,
  type Equipment,
  type Loadout,
} from "@game/menu";

import { canonicalJson } from "@ui/lib/canonical-json.ts";

import { storageKey } from "../identity.ts";

import { clearKey, openingKey, thoughtSeenKey } from "./character-progress.ts";

// The pure progression queries live next door (character-progress.ts) — this
// file owns the roster and its storage. They are re-exported here so a caller
// still reaches a hero's whole surface through one module.
export {
  clearedLevelsFor,
  firstUnclearedLevel,
  hasClearedLevel,
  hasMetMerchant,
  hasSeenOpening,
  isDifficultyBeaten,
  isDifficultyTierBeaten,
  isDifficultyUnlocked,
  isLevelUnlocked,
  nextDifficultyFor,
  nextLevelId,
  resumeTargetFor,
  seenThoughts,
} from "./character-progress.ts";

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
  /**
   * Last-changed timestamp (ms), stamped by `saveCharacters` on every save
   * that actually changes this hero. CLOUD SAVE merges the roster hero by hero
   * on it — the newer copy of a hero wins — so a device that hasn't touched a
   * hero in a week can never drag it back over the version the other phone
   * levelled up last night (see cloud-save.ts). Optional: a character stored
   * before the field existed reads as timestamp 0 and loses to any copy that
   * carries one.
   */
  updatedAt?: number;
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
  /**
   * KEEPSAKES — story items banked for good (`StoryItemDef.keepsake`),
   * across every run and every difficulty: the RIFT CREATOR that unseals
   * the garage's rift seam. Recorded on the `storyItemCollected` engine
   * event; read by the hub's travel doors (`travelDoors[].requires`).
   * Optional: a roster stored before the field existed reads as none.
   */
  keepsakes?: string[];
  /**
   * THE CAMPAIGN CHAIN'S LOG, per difficulty — the errands marked
   * `campaign: true` (see src/game/quests/campaign.ts) plus the run flags their
   * conversations set. Keyed by rung for the same reason clears and story beats
   * are: a fresh difficulty is a fresh campaign, and a chain finished on hard
   * must not arrive pre-solved on the rung above it.
   *
   * Optional: a hero created before the chain shipped simply carries none.
   */
  campaignQuests?: Partial<Record<Difficulty, CampaignQuestSave>>;
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
  /**
   * ANY LEG OF THIS CAMPAIGN WAS PLAYED IN COMPANY (`PartyStamp`, multiplayer
   * plan §5.3) — so the whole campaign is off the two hardcore boards, however
   * the remaining maps were played.
   *
   * It latches on the first co-op map and is only cleared with the tally
   * itself, because a campaign is one record: a party carrying the hero through
   * the hardest venue and the player finishing the last two alone is not a solo
   * campaign, and asking per-map would rank exactly that.
   */
  party?: boolean;
};

const ROSTER_KEY = storageKey("characters");
const ACTIVE_KEY = storageKey("active-character");

/** Deleted heroes, `id → when` (ms). A deletion has to travel to the player's
 * other devices as its own fact: without it, the next CLOUD SAVE merge would
 * see a hero the cloud still holds, decide this device is simply missing it,
 * and resurrect the character the player just threw away. */
const TOMBSTONE_KEY = storageKey("character-tombstones");
/** Enough to outlive any plausible delete-then-sync gap without growing the
 * payload; the oldest fall off first. */
const TOMBSTONE_CAP = 200;

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
      amulet: fix(loadout.equipment.amulet ?? null),
      ring1: fix(loadout.equipment.ring1 ?? null),
      ring2: fix(loadout.equipment.ring2 ?? null),
      // LEGACY: the retired CHARM slot rides through untouched (its kind is
      // rewritten to `trinket` by `fix`/`adoptEquipment`) so `applyLoadout`
      // can bank it into the bag, where a trinket now pays out.
      charm: fix(loadout.equipment.charm ?? null),
      // LEGACY: `bag` is what the second arm was called before it grew to hold
      // a shield. A save banked then still carries it, so it is read as the
      // offhand and never written again.
      offhand: fix(loadout.equipment.offhand ?? loadout.equipment.bag ?? null),
    },
    inventory: loadout.inventory.map(fix),
    // The LOST & FOUND is adopted like the bag — a piece whose base the
    // catalog later retired simply falls out of the list rather than pricing
    // a reclaim off a def that no longer exists.
    vault: (loadout.vault ?? [])
      .map(fix)
      .filter((piece): piece is Equipment => piece !== null),
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
      ...(Array.isArray(c.keepsakes) ? { keepsakes: c.keepsakes } : {}),
      ...(c.campaignQuests && typeof c.campaignQuests === "object"
        ? { campaignQuests: c.campaignQuests as Character["campaignQuests"] }
        : {}),
      updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : 0,
      loadout: c.loadout ? migrateLoadout(c.loadout) : null,
    }));
  } catch {
    return [];
  }
}

/** A character's content with its change stamp neutralized — what "did this
 * hero actually change?" compares. Canonical, so a hero rebuilt from storage
 * compares equal to the same hero held in memory. */
function contentOf(character: Character): string {
  return canonicalJson({ ...character, updatedAt: 0 });
}

/**
 * Write the roster, stamping `updatedAt` on every hero whose content actually
 * changed. Only changed heroes move: a save that rewrites the whole roster to
 * touch ONE hero must not make the other nine look freshly edited, or a cloud
 * merge would let this device's stale copies win over another device's newer
 * ones.
 */
function saveCharacters(characters: Character[]): void {
  const now = Date.now();
  const before = new Map(loadCharacters().map((c) => [c.id, c]));
  const stamped = characters.map((character) => {
    const previous = before.get(character.id);
    if (previous && contentOf(previous) === contentOf(character)) {
      return { ...character, updatedAt: previous.updatedAt ?? 0 };
    }
    // `Math.max` guards a clock that jumped backwards (or two saves inside one
    // millisecond): an edit is never stamped older than what it replaces.
    return {
      ...character,
      updatedAt: Math.max(now, (previous?.updatedAt ?? 0) + 1),
    };
  });
  writeRoster(stamped);
}

function writeRoster(characters: Character[]): void {
  try {
    window.localStorage.setItem(ROSTER_KEY, JSON.stringify(characters));
  } catch {
    // Storage unavailable (private mode / full) — the roster stays in-memory.
  }
}

// ---- Cloud save seam (cloud-save.ts) ------------------------------------------

/**
 * Install a merged roster verbatim — no `updatedAt` stamping. The merge has
 * already picked each hero's authoritative version and its stamp; re-stamping
 * here would mark every hero as edited-now on this device and let it win the
 * next merge with data it never changed.
 */
export function replaceRoster(characters: Character[]): void {
  writeRoster(characters);
}

/** The deletion tombstones, `id → when` (ms). */
export function characterTombstones(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(TOMBSTONE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === "number" && Number.isFinite(at)) out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Cap a tombstone set to the newest `TOMBSTONE_CAP`. Both the local store and
 * the cloud merge apply it, so a merged set can't come back bigger than what
 * this device would keep — which would leave the two disagreeing forever.
 */
export function trimTombstones(
  stones: Record<string, number>,
): Record<string, number> {
  const entries = Object.entries(stones);
  if (entries.length <= TOMBSTONE_CAP) return { ...stones };
  return Object.fromEntries(
    entries
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, TOMBSTONE_CAP),
  );
}

/** Install merged tombstones, newest kept when over the cap. */
export function setCharacterTombstones(stones: Record<string, number>): void {
  try {
    window.localStorage.setItem(
      TOMBSTONE_KEY,
      JSON.stringify(trimTombstones(stones)),
    );
  } catch {
    // Best effort — see saveCharacters.
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
 * The hero a SPECTATOR carries into somebody else's session.
 *
 * The same trick the demo hero above rests on, for the same reason and one
 * machine further away: the run on screen is not this player's, so every
 * `persist()` over it must be a no-op. A watcher whose roster grew a level
 * clear, a banked loadout or a hardcore death out of a game they only watched
 * would be the worst kind of bug — silent, permanent, and other people's.
 *
 * The NAME is the player's own, because it is what the roster and every chat
 * line in the session call them.
 */
export function spectatorCharacter(name: string): Character {
  return {
    id: "__spectator__",
    name,
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
 * Mint a DEVELOPER seed character (see seed-characters.ts): a softcore hero
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
    ...(Array.isArray(c.keepsakes) && c.keepsakes.length > 0
      ? { keepsakes: strings(c.keepsakes) }
      : {}),
    ...(c.campaignQuests && typeof c.campaignQuests === "object"
      ? { campaignQuests: c.campaignQuests as Character["campaignQuests"] }
      : {}),
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

// ---- The LOST & FOUND (items/vault.ts) ----------------------------------------

/** What a paid AUTO PILOT ride threw away to keep its bag workable, most
 * precious first — the LOST & FOUND's list. Empty for a hero who has never
 * flown one (or whose vault has been emptied). */
export function characterVault(character: Character): Equipment[] {
  return vaultContents(character.loadout?.vault ?? []);
}

/** Why a reclaim can't go through — what the LOST & FOUND row shows instead of
 * a price it would happily take. */
export type ReclaimRefusal = "gone" | "coins" | "bag";

/**
 * Buy a piece back out of the LOST & FOUND: charge the hero's purse
 * `reclaimCost` (config `VAULT.reclaimCost` — the per-tier ladder) and move
 * the piece into a free bag cell of their banked loadout, so the next run
 * starts carrying it.
 *
 * Three refusals, all reported rather than silently swallowed: the entry is
 * `gone` (a stale list — the id no longer sits in the vault), the purse is
 * short (`coins`), or the banked bag has no free cell (`bag` — the player
 * empties one on their next run and comes back; nothing is lost by waiting,
 * the vault holds it). Only the banked PURSE pays: store credit still waiting
 * on a first bank (`pendingCoins`) isn't spendable here, and a hero with no
 * banked loadout has no vault to draw from in the first place.
 *
 * Returns the updated character on success, or the refusal reason.
 */
export function reclaimFromVault(
  character: Character,
  itemId: number,
): { character: Character } | { refused: ReclaimRefusal } {
  const loadout = character.loadout;
  const vault = loadout?.vault ?? [];
  const at = vault.findIndex((piece) => piece.id === itemId);
  if (!loadout || at < 0) return { refused: "gone" };
  const item = vault[at] as Equipment;
  const price = reclaimCost(item);
  if (Math.max(0, loadout.coins ?? 0) < price) return { refused: "coins" };
  const cell = loadout.inventory.findIndex((piece) => piece === null);
  if (cell < 0) return { refused: "bag" };
  const inventory = [...loadout.inventory];
  inventory[cell] = item;
  const next: Character = {
    ...character,
    loadout: {
      ...loadout,
      coins: Math.max(0, loadout.coins ?? 0) - price,
      inventory,
      vault: vault.filter((_, i) => i !== at),
    },
  };
  persist(next);
  return { character: next };
}

/** Delete a character from the roster (roster screen). Clears the active
 * selection if it was the one removed, and leaves a tombstone so CLOUD SAVE
 * carries the deletion to the player's other devices instead of restoring the
 * hero from the cloud on the next merge. */
export function deleteCharacter(id: string): void {
  saveCharacters(loadCharacters().filter((c) => c.id !== id));
  setCharacterTombstones({ ...characterTombstones(), [id]: Date.now() });
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

// ---- Story / merchant bookmarks (persisting) ---------------------------------

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

/** Record that this hero has now MET the merchant on `levelId`/`difficulty`
 * (called on the `merchantDiscovered` event). Idempotent — a no-op returns the
 * character untouched; otherwise it persists and returns the update. */
/** BANK A KEEPSAKE — a story item the character keeps for good (the RIFT
 * CREATOR; see `StoryItemDef.keepsake`). Recorded on the
 * `storyItemCollected` event; idempotent like `markMerchantMet` beside it. */
export function bankKeepsake(character: Character, defId: string): Character {
  if (character.keepsakes?.includes(defId)) return character;
  const updated: Character = {
    ...character,
    keepsakes: [...(character.keepsakes ?? []), defId],
  };
  persist(updated);
  return updated;
}

/** Does this character keep `defId` — the travel doors' `requires` read. */
export function hasKeepsake(character: Character, defId: string): boolean {
  return character.keepsakes?.includes(defId) === true;
}

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

/**
 * BANK THE CAMPAIGN CHAIN. Folded into whatever the hero already carried on
 * this rung, keeping the FURTHER reading of each errand — so a run abandoned
 * halfway, a death, or a level replayed from a stale checkpoint can never walk
 * the chain backwards. That is the one bug this feature could have that would
 * actually hurt: hours of work undone by quitting to the menu at the wrong
 * moment, with nothing on screen to say it happened.
 *
 * Called on every quest EVENT rather than only at a victory, because a chain
 * the player is halfway through when they exit to the menu is exactly the case
 * a level-end bank would lose.
 */
export function bankCampaignChain(
  character: Character,
  difficulty: Difficulty,
  banked: CampaignQuestSave,
): Character {
  const carried = character.campaignQuests?.[difficulty];
  const merged = mergeCampaignQuests(carried, banked);
  // Nothing actually moved — skip the write so a quiet tick cannot churn the
  // roster's `updatedAt` and start winning cloud merges with unchanged data.
  if (carried && canonicalJson(carried) === canonicalJson(merged)) {
    return character;
  }
  const updated: Character = {
    ...character,
    campaignQuests: { ...character.campaignQuests, [difficulty]: merged },
  };
  persist(updated);
  return updated;
}

/** What this hero carries into a run of `difficulty` (empty if nothing yet). */
export function campaignChainFor(
  character: Character,
  difficulty: Difficulty,
): CampaignQuestSave {
  return character.campaignQuests?.[difficulty] ?? emptyCampaignQuests();
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
  run: { kills: number; combatMs: number; peakMenace: number; party?: boolean },
): Character {
  const prev = campaignTally(character, difficulty);
  const next: CampaignTally = {
    kills: prev.kills + Math.max(0, run.kills),
    combatMs: prev.combatMs + Math.max(0, run.combatMs),
    peakMenace: Math.max(prev.peakMenace, Math.max(0, run.peakMenace)),
    levels: prev.levels + 1,
    // Latched, never lowered — see `CampaignTally.party`.
    party: prev.party || run.party === true,
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
 * in the purse the moment there is one.
 *
 * `coinsIncludePending` says the loadout's coins ALREADY account for the
 * pending credit: a real run funds its purse from the whole character purse
 * (banked coins + pendingCoins) at run start — see `characterPurse` and
 * run-setup.ts — so a brand-new hero can actually SPEND store-bought coins
 * before their first bank (the AUTO PILOT reads `state.players[0].coins`).
 * The run's end-of-run loadout.coins then already carries the pending, and
 * folding it again would double it — so we bank the loadout as-is and only
 * clear the pending marker. It stays `false` (fold) for callers that bank a
 * loadout NOT sourced from such a run. */
function foldPendingCoins(
  character: Character,
  loadout: Loadout,
  coinsIncludePending = false,
): Loadout {
  const pending = character.pendingCoins ?? 0;
  if (coinsIncludePending || pending <= 0) return loadout;
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
  /** The run's purse already carries any `pendingCoins` (a real run funds it
   * from the whole character purse at start) — don't fold it in twice. */
  coinsIncludePending = false,
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
    loadout: foldPendingCoins(character, loadout, coinsIncludePending),
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
export function bankLoadout(
  character: Character,
  loadout: Loadout,
  /** The run's purse already carries any `pendingCoins` (a real run funds it
   * from the whole character purse at start) — don't fold it in twice. */
  coinsIncludePending = false,
): Character {
  const updated: Character = {
    ...character,
    loadout: foldPendingCoins(character, loadout, coinsIncludePending),
    pendingCoins: undefined,
  };
  persist(updated);
  return updated;
}
