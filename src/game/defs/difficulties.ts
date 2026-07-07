// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The difficulty catalog. A difficulty is pure data layered over every
// level: it multiplies how many monsters spawn and how much hp they carry,
// and it sweetens the loot in return — harder hauntings drop more often and
// unlock higher tiers (the risk pays for the gear that survives it). MEDIUM
// is the exact 1.0 baseline the levels are tuned at; every other entry
// scales from it. Kill XP is proportional to max hp, so harder monsters
// also level the player faster — the whole run accelerates, both ways.

import type { Difficulty, Tier } from "../types.ts";

export type DifficultyDef = {
  /** Registry key. */
  id: Difficulty;
  /** Menu order, gentlest first. */
  index: number;
  /** Menu label. */
  name: string;
  /** One-line menu blurb under the label. Level-agnostic — it describes the
   * difficulty, not any one level's flavor (the ladder is shown globally). */
  tagline: string;
  /** Menu color for this rung; the ladder heats up as it descends. Lives with
   * the def so a new difficulty is pure data (no TitleScreen edit). */
  color: string;
  /** Multiplies every spawn count: placed spawns and wave budgets alike. */
  mobCountMult: number;
  /** Multiplies every monster's hp (bosses included; XP scales with it). */
  mobHpMult: number;
  /** Multiplies the wave spawner's live cap AND floor (`maxAlive`,
   * `minAlive`) — harder difficulties keep a denser field on screen. */
  aliveMult: number;
  /** Added to the base minion drop chance (LOOT.dropChance). */
  dropChanceBonus: number;
  /**
   * Added per tier to the level's loot-table chances. A tier absent from
   * BOTH the level and this map cannot drop; a bonus here unlocks it — this
   * is how nightmare+ runs reach epic and legendary gear on the moon.
   */
  tierChanceBonus: Partial<Record<Tier, number>>;
};

export const DIFFICULTY_DEFS: Record<Difficulty, DifficultyDef> = {
  easy: {
    id: "easy",
    index: 1,
    name: "EASY",
    tagline: "A GENTLE WARM-UP",
    color: "#7ef0c8",
    mobCountMult: 0.7,
    mobHpMult: 0.8,
    aliveMult: 0.7,
    dropChanceBonus: 0,
    tierChanceBonus: {},
  },
  medium: {
    id: "medium",
    index: 2,
    name: "MEDIUM",
    tagline: "THE FIGHT AS INTENDED",
    color: "#4da6ff",
    mobCountMult: 1,
    mobHpMult: 1,
    aliveMult: 1,
    dropChanceBonus: 0,
    tierChanceBonus: {},
  },
  hard: {
    id: "hard",
    index: 3,
    name: "HARD",
    tagline: "NO ROOM FOR MISTAKES",
    color: "#ffd75e",
    mobCountMult: 1.4,
    mobHpMult: 1.35,
    aliveMult: 1.3,
    dropChanceBonus: 0.03,
    tierChanceBonus: { magic: 0.1, rare: 0.08, epic: 0.06 },
  },
  nightmare: {
    id: "nightmare",
    index: 4,
    name: "NIGHTMARE",
    tagline: "THEY NEVER STOP COMING",
    color: "#ff8c42",
    mobCountMult: 1.9,
    mobHpMult: 1.75,
    aliveMult: 1.65,
    dropChanceBonus: 0.06,
    tierChanceBonus: { magic: 0.18, epic: 0.14, legendary: 0.04 },
  },
  jesus: {
    id: "jesus",
    index: 5,
    name: "JESUS CHRIST!",
    tagline: "ABANDON ALL HOPE",
    color: "#d83a3a",
    mobCountMult: 2.6,
    mobHpMult: 2.25,
    aliveMult: 2.1,
    dropChanceBonus: 0.1,
    tierChanceBonus: { magic: 0.26, epic: 0.22, legendary: 0.09 },
  },
};

/** Menu order of the difficulties, gentlest first. */
export const DIFFICULTY_ORDER: Difficulty[] = [
  "easy",
  "medium",
  "hard",
  "nightmare",
  "jesus",
];

// Active registry the accessor reads (defaults to the shipped ladder;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeDifficultyDefs: Record<string, DifficultyDef> = DIFFICULTY_DEFS;

/** Test/authoring hook: replace the active difficulty ladder. */
export function setDifficultyDefs(defs: Record<string, DifficultyDef>): void {
  activeDifficultyDefs = defs;
}

/** Look up a difficulty def; throws on a broken id so bugs surface loudly. */
export function difficultyDef(difficulty: Difficulty): DifficultyDef {
  const def = activeDifficultyDefs[difficulty];
  if (!def) throw new Error(`unknown difficulty "${difficulty as string}"`);
  return def;
}

/** A spawn count through a difficulty's mob multiplier (never rounds a
 * non-empty spawn line down to zero). */
export function scaledMobCount(count: number, difficulty: Difficulty): number {
  if (count <= 0) return 0;
  return Math.max(
    1,
    Math.round(count * difficultyDef(difficulty).mobCountMult),
  );
}

/**
 * Does `current` sit at or above `min` on the ladder? The ordering is a def's
 * `index`, so this is how difficulty-gated content (a level's
 * `minDifficulty` spawn/wave lines) decides whether to appear: a line tagged
 * `minDifficulty: "hard"` is skipped on easy/medium and included from hard up.
 * An omitted `min` always passes.
 */
export function meetsMinDifficulty(
  current: Difficulty,
  min: Difficulty | undefined,
): boolean {
  if (!min) return true;
  return difficultyDef(current).index >= difficultyDef(min).index;
}
