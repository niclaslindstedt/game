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
  /** One-line menu blurb under the label. */
  tagline: string;
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
    tagline: "A QUIET NIGHT ON THE MOON",
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
    tagline: "THE HAUNTING AS INTENDED",
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
    tagline: "THE GRAVES RUN DEEP",
    mobCountMult: 1.4,
    mobHpMult: 1.35,
    aliveMult: 1.3,
    dropChanceBonus: 0.03,
    tierChanceBonus: { magic: 0.1, epic: 0.06 },
  },
  nightmare: {
    id: "nightmare",
    index: 4,
    name: "NIGHTMARE",
    tagline: "THEY NEVER STOP COMING",
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
    tagline: "THE MOON IS ONE BIG GRAVE",
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

/** Look up a difficulty def; throws on a broken id so bugs surface loudly. */
export function difficultyDef(difficulty: Difficulty): DifficultyDef {
  const def = DIFFICULTY_DEFS[difficulty];
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
