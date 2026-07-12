// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Lifetime achievement TOTALS: the account-wide counters the achievement
// catalog's conditions read (kills by rarity, loot found by tier, distinct
// uniques, clears, runs, …), accumulated across every hero and every run.
// This module is the pure half — a plain data shape plus reducers fed by the
// engine's per-tick `GameEvent`s — so the whole tracking rulebook is testable
// in plain Node. Persistence and unlock bookkeeping live in achievements.ts.
//
// The engine never learns achievements exist (like tokens and hardcore, meta-
// progression is the app's): everything here derives from the events the app
// already consumes each `step()` plus the run-start hook GameScreen calls.

import {
  DIFFICULTY_DEFS,
  enemyDef,
  LEVEL_ORDER,
  type GameEvent,
  type GameStats,
} from "@game/core";

/** A mission this fast is a SPEED CLEAR (ms) — the SPEEDRUNNER condition. */
export const SPEED_CLEAR_MS = 5 * 60_000;

/** The account-wide counters achievements read. All monotonic. */
export type LifetimeTotals = {
  /** Every mob killed, any role. */
  kills: number;
  /** Kills of `role: "elite"` enemies. */
  eliteKills: number;
  /** Kills of `role: "boss"` enemies (a FLED boss is not a kill). */
  bossKills: number;
  /** Bosses witnessed escaping through a rift (`bossFled`). */
  bossFlees: number;
  /** Equipment picked up, by rarity tier (duplicates count). */
  magicFound: number;
  rareFound: number;
  uniqueFound: number;
  legendaryFound: number;
  artifactFound: number;
  /** DISTINCT hand-authored uniques found (UNIQUE_DEFS ids). */
  uniquesFound: string[];
  /** DISTINCT companions recruited (COMPANION_DEFS ids). */
  companions: string[];
  /** DISTINCT story/lore pieces collected (STORY_ITEM_DEFS ids). */
  storyItems: string[];
  /** DISTINCT levels cleared, any difficulty (level ids). */
  levelClears: string[];
  /** DISTINCT `${difficulty}:${levelId}` clears. */
  clears: string[];
  /** Difficulties whose campaign (its LAST level) has been cleared. */
  difficultiesBeaten: string[];
  /** Runs started per level id (fresh starts and retries; resumes don't count). */
  levelRuns: Record<string, number>;
  /** Runs started, all levels together. */
  totalRuns: number;
  /** The highest hero level ever reached. */
  heroLevel: number;
  /** Times the wandering merchant was discovered. */
  merchantsMet: number;
  /** Screen nukes set off. */
  nukes: number;
  /** The highest RAMPAGE (menace) stage ever reached. */
  maxMenace: number;
  /** Times a run ended in defeat. */
  deaths: number;
  /** Victories with zero damage taken the whole run. */
  untouchableClears: number;
  /** Victories faster than SPEED_CLEAR_MS. */
  speedClears: number;
  /** DISTINCT equipment slots ever filled (the built-in sidearm doesn't
   * count as arming the weapon slot — see `applyWornEquipment`). */
  slotsWorn: string[];
  /** The best FULL OUTFIT ever worn: with every slot filled at once, the
   * lowest tier among the pieces, ranked regular 0 → magic 1 → rare 2 →
   * unique/legendary 3. -1 = never had every slot filled. */
  outfitRank: number;
  /** Lifetime damage dealt to the horde (every hit's roll, summed). */
  totalDamage: number;
  /** The hardest single blow ever landed on ONE target (one hit event). */
  maxSingleHit: number;
  /** The biggest damage dealt in one strike — a single tick's summed hits,
   * so a nuke, an AoE sweep, or a pierce volley counts as one blow. */
  maxBurstDamage: number;
};

export function emptyTotals(): LifetimeTotals {
  return {
    kills: 0,
    eliteKills: 0,
    bossKills: 0,
    bossFlees: 0,
    magicFound: 0,
    rareFound: 0,
    uniqueFound: 0,
    legendaryFound: 0,
    artifactFound: 0,
    uniquesFound: [],
    companions: [],
    storyItems: [],
    levelClears: [],
    clears: [],
    difficultiesBeaten: [],
    levelRuns: {},
    totalRuns: 0,
    heroLevel: 1,
    merchantsMet: 0,
    nukes: 0,
    maxMenace: 0,
    deaths: 0,
    untouchableClears: 0,
    speedClears: 0,
    slotsWorn: [],
    outfitRank: -1,
    totalDamage: 0,
    maxSingleHit: 0,
    maxBurstDamage: 0,
  };
}

/** Every wearable slot, the full-outfit roster (`EquipSlot` order). */
export const EQUIP_SLOTS = [
  "weapon",
  "head",
  "chest",
  "legs",
  "feet",
  "charm",
  "bag",
] as const;

/** Outfit rank of a tier — unique, legendary, and artifact share the top rung. */
const TIER_RANK: Record<string, number> = {
  trash: 0,
  regular: 0,
  magic: 1,
  rare: 2,
  unique: 3,
  legendary: 3,
  artifact: 3,
};

/** One currently-worn piece, as GameScreen summarizes the hero each tick. */
export type WornPiece = { slot: string; tier: string; defId: string };

/** Gear the hero is ISSUED rather than loots: the built-in sidearm, every
 * difficulty's wall weapon (the prelude's starting piece), and the clothes
 * on his back (`DifficultyDef.startingGear` — t-shirt, jeans, boots).
 * Spawning dressed must not book first-equip feats — those are for the
 * first pieces the player actually picked up and wore. (A looted copy of
 * an issued base also skips; any other piece in the slot still books.) */
const ISSUED_GEAR = new Set([
  "blaster",
  ...Object.values(DIFFICULTY_DEFS).flatMap((d) => [
    d.startingWeapon,
    ...(d.startingGear ?? []),
  ]),
]);

/** The run context a batch of events is booked against: which mission on
 * which difficulty, and the run's live stats (read at victory for the
 * untouchable/speed conditions). */
export type RunContext = {
  levelId: string;
  difficulty: string;
  stats: GameStats;
};

/** Add `value` to `list` if absent; true when it was genuinely new. */
function addDistinct(list: string[], value: string): boolean {
  if (list.includes(value)) return false;
  list.push(value);
  return true;
}

/** An unknown def id (a retired enemy in an old replay, a test fixture the
 * catalog doesn't know) must never crash the ledger — book it as a minion. */
function roleOf(defId: string): string {
  try {
    return enemyDef(defId).role;
  } catch {
    return "minion";
  }
}

/**
 * Book one tick's events into the totals, IN PLACE. Returns true when any
 * counter moved — the caller's cue to re-evaluate the catalog and persist.
 */
export function applyEventsToTotals(
  totals: LifetimeTotals,
  events: readonly GameEvent[],
  ctx: RunContext,
): boolean {
  let changed = false;
  // One tick's summed damage output = one STRIKE for the burst feats: a
  // nuke's screen wipe, an AoE sweep, or a pierce volley all land their hits
  // in the same tick. (Companion hits ride along — events carry no shooter
  // attribution — but the party fights at a heavy damper, so the hero's own
  // blows dominate any record.)
  let tickDamage = 0;
  for (const event of events) {
    switch (event.type) {
      case "enemyHit":
        totals.totalDamage += event.damage;
        tickDamage += event.damage;
        if (event.damage > totals.maxSingleHit) {
          totals.maxSingleHit = event.damage;
        }
        changed = true;
        break;
      case "enemyKilled": {
        totals.kills++;
        const role = roleOf(event.defId);
        if (role === "elite") totals.eliteKills++;
        if (role === "boss") totals.bossKills++;
        totals.totalDamage += event.damage;
        tickDamage += event.damage;
        if (event.damage > totals.maxSingleHit) {
          totals.maxSingleHit = event.damage;
        }
        changed = true;
        break;
      }
      case "bossFled":
        totals.bossFlees++;
        changed = true;
        break;
      case "itemCollected": {
        if (event.kind !== "equipment") break;
        if (event.tier === "magic") totals.magicFound++;
        else if (event.tier === "rare") totals.rareFound++;
        else if (event.tier === "unique") totals.uniqueFound++;
        else if (event.tier === "legendary") totals.legendaryFound++;
        else if (event.tier === "artifact") totals.artifactFound++;
        else break;
        if (event.uniqueId) addDistinct(totals.uniquesFound, event.uniqueId);
        changed = true;
        break;
      }
      case "levelUp":
        if (event.level > totals.heroLevel) {
          totals.heroLevel = event.level;
          changed = true;
        }
        break;
      case "companionJoined":
        changed = addDistinct(totals.companions, event.defId) || changed;
        break;
      case "storyItemCollected":
        changed = addDistinct(totals.storyItems, event.defId) || changed;
        break;
      case "merchantDiscovered":
        totals.merchantsMet++;
        changed = true;
        break;
      case "nuke":
        totals.nukes++;
        changed = true;
        break;
      case "menaceRose":
        if (event.stage > totals.maxMenace) {
          totals.maxMenace = event.stage;
          changed = true;
        }
        break;
      case "victory": {
        addDistinct(totals.levelClears, ctx.levelId);
        addDistinct(totals.clears, `${ctx.difficulty}:${ctx.levelId}`);
        // Clearing the campaign's LAST level beats the difficulty — the same
        // rule characters.ts banks (recordVictory), restated on the ledger so
        // achievements stay account-wide across heroes.
        if (ctx.levelId === LEVEL_ORDER[LEVEL_ORDER.length - 1]) {
          addDistinct(totals.difficultiesBeaten, ctx.difficulty);
        }
        if (ctx.stats.damageTaken === 0) totals.untouchableClears++;
        if (ctx.stats.timeMs <= SPEED_CLEAR_MS) totals.speedClears++;
        changed = true;
        break;
      }
      case "defeat":
        totals.deaths++;
        changed = true;
        break;
      default:
        break;
    }
  }
  if (tickDamage > totals.maxBurstDamage) {
    totals.maxBurstDamage = tickDamage;
    changed = true;
  }
  return changed;
}

/**
 * Book the hero's currently-worn gear, IN PLACE: which slots have ever been
 * filled (the built-in sidearm doesn't count as arming the weapon slot — the
 * hero spawns with it), and, when EVERY slot is filled at once, the outfit's
 * rank (the lowest tier worn — a full set of rares ranks 2). Returns true
 * when something new was booked. Fed by GameScreen once per change (it keeps
 * a cheap signature of the worn set, so this never runs on a quiet frame).
 */
export function applyWornEquipment(
  totals: LifetimeTotals,
  worn: readonly WornPiece[],
): boolean {
  let changed = false;
  for (const piece of worn) {
    if (ISSUED_GEAR.has(piece.defId)) continue;
    changed = addDistinct(totals.slotsWorn, piece.slot) || changed;
  }
  if (worn.length === EQUIP_SLOTS.length) {
    const rank = Math.min(...worn.map((p) => TIER_RANK[p.tier] ?? 0));
    if (rank > totals.outfitRank) {
      totals.outfitRank = rank;
      changed = true;
    }
  }
  return changed;
}

/** Book a run STARTING on `levelId` (fresh starts and retries; a run resumed
 * from the menu is the same run continuing, so the caller skips it). */
export function applyRunStart(totals: LifetimeTotals, levelId: string): void {
  totals.totalRuns++;
  totals.levelRuns[levelId] = (totals.levelRuns[levelId] ?? 0) + 1;
}

/** The deepest per-level run count — the "farm one mission" conditions. */
export function maxLevelRuns(totals: LifetimeTotals): number {
  let max = 0;
  for (const n of Object.values(totals.levelRuns)) if (n > max) max = n;
  return max;
}
