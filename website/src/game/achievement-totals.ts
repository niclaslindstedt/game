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
  };
}

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
  for (const event of events) {
    switch (event.type) {
      case "enemyKilled": {
        totals.kills++;
        const role = roleOf(event.defId);
        if (role === "elite") totals.eliteKills++;
        if (role === "boss") totals.bossKills++;
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
