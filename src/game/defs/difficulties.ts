// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The difficulty catalog. A difficulty is pure data layered over every
// level, and it turns a whole rack of knobs at once: how the hero starts
// (stat head-start, the weapon off the wall), how the horde compares to him
// (count and RELATIVE LEVEL), how generous the floor is (medkits, armor,
// powerups), how fast he tires (stamina), how touchy the rampage meter is —
// and it pays the harder rungs back in richer loot (higher tiers, and the
// unique slice once unique items exist). MEDIUM is the 1.0 baseline the
// levels are tuned at; every other entry scales from it.

import type { Difficulty, StatName, Tier } from "../types.ts";

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
  /**
   * The weapon off the hero's wall: the WEAPON_DEFS id minted in hand when a
   * run starts fresh (create.ts). The prelude cutscene shows the same piece
   * mounted on the living-room wall (see defs/cutscenes.ts — the scene has a
   * per-difficulty variant so the wall always matches what he lands with),
   * and the auto-equip treats it as the pickup floor: any real weapon the
   * world yields supplants it (see isBetterEquipment).
   */
  startingWeapon: string;
  /**
   * Pre-allocated stat points the hero opens with — the gentler rungs' head
   * start (a few level-ups' worth of training banked before the first kill).
   * Applied at creation, before any carried-over loadout (which keeps its own
   * earned stats). Empty = the bare authored start.
   */
  startingStats: Partial<Record<StatName, number>>;
  /** Multiplies every spawn count: placed spawns and wave budgets alike. */
  mobCountMult: number;
  /**
   * The horde's level RELATIVE to the player's: every monster spawns at
   * `player level + this offset`, and each level off the baseline shifts its
   * hp by `MENACE.mobHpPerLevel` (kill XP is hp-proportional, so a
   * higher-level horde also pays more). EASY fields mobs three levels under
   * the hero; NIGHTMARE matches him; JESUS fields mobs two levels ABOVE him,
   * so the gap never closes. See `mobHpScaleFor` in menace.ts.
   */
  mobLevelOffset: number;
  /** Multiplies the wave spawner's live cap AND floor (`maxAlive`,
   * `minAlive`) — harder difficulties keep a denser field on screen. */
  aliveMult: number;
  /**
   * How sensitively the rampage (menace) meter answers this difficulty: a
   * master multiplier on all menace gain (rolling DPS/kill-rate heat AND
   * overkill jolts — see `menaceSensitivity` in menace.ts). EASY barely reacts
   * (a rampage is almost impossible even for a strong build); MEDIUM is the 1.0
   * baseline where only a genuinely overpowered player heats it; the harder
   * rungs climb toward JESUS, where a mere handful of kills tips it over —
   * deliberately touchier up the ladder, since a tougher horde dies slower and
   * would otherwise never heat the meter.
   */
  menaceMult: number;
  /**
   * How fast the menace meter COOLS on this rung: multiplies the fixed
   * `MENACE.decayPerSec` bleed. Above 1 the meter settles back to normal
   * quickly (EASY forgives a hot streak); below 1 a rampage lingers — on the
   * hardest rungs the horde stays stirred long after the slaughter pauses.
   */
  menaceDecayMult: number;
  /**
   * How hard a menace stage lands on the MOBS: multiplies both the extra hp
   * evolved minions spawn with (`MENACE.hpPerStage`) and the lure that swells
   * the live crowd (`MENACE.lurePerStage`). The gentle rungs turn a rampage
   * into a shrug; the hard rungs turn it into a wall.
   */
  menaceEffectMult: number;
  /** Added to the base minion drop chance (LOOT.dropChance). */
  dropChanceBonus: number;
  /**
   * Multiplies the medkit slice of the drop ladder (LOOT.medkitShare) —
   * healing thins out a few percent per rung, so the harder fights are also
   * the leaner ones.
   */
  medkitDropMult: number;
  /**
   * Multiplies the odds that a random GEAR drop is a PLATED suit (one with an
   * armor grade): when the gear pick lands on armor, this is its chance to
   * stand — a failed roll re-picks among the pool's unplated pieces. The
   * armor half of the "medkits and armor thin out" rule (see rollEquipment).
   */
  armorDropMult: number;
  /**
   * Multiplies the ability-powerup slice of the drop ladder
   * (LOOT.abilityShare) — the storm/orbit/nuke rain eases off with the
   * medkits as the ladder climbs.
   */
  powerupDropMult: number;
  /**
   * Chance that a minion's equipment drop is drawn from the level's
   * `loot.uniquePool` instead of the regular pools — the harder rungs' shot
   * at one-of-a-kind gear. PLUMBING for now: no level ships a unique pool
   * yet, and an empty pool makes this a clean no-op (no roll is even drawn),
   * so the knob costs nothing until unique items exist.
   */
  uniqueDropChance: number;
  /**
   * Added per tier to the global base chances (config LOOT.tierChances) —
   * the reward side of the ladder: richer blues/yellows per rung, and (once
   * unique/legendary items ship) the harder rungs' better odds at them. The
   * monster-level gates (LOOT.tierUnlockMlvl) still hold: no bonus makes a
   * tier drop off a mob whose level hasn't unlocked it — but since mobs run
   * at `player level + mobLevelOffset`, the harder rungs also reach every
   * gate earlier in the campaign.
   */
  tierChanceBonus: Partial<Record<Tier, number>>;
  /**
   * Multiplies the sprint pool's drain rate (STAMINA.drainPerSec): the harder
   * rungs wind the hero a touch faster. JESUS deliberately matches NIGHTMARE —
   * kiting is the whole game up there, so the legs stay.
   */
  staminaDrainMult: number;
  /**
   * Multiplies the hero's DODGE chance — his odds of sidestepping an enemy
   * blow entirely (see `playerDodgeChance`; the DODGE.max cap still holds).
   * Above 1 the gentle rungs let him slip more hits; the hard rungs trim the
   * reflexes down so every contact counts.
   */
  playerDodgeMult: number;
  /**
   * Multiplies the hero's MISS chance — the innate whiff on his own weapon
   * blows (see `playerMissChance`; DEXTERITY still trims it first, and the
   * floor holds). Below 1 the gentle rungs barely whiff; the hard rungs make
   * the swing itself less reliable.
   */
  playerMissMult: number;
  /**
   * Multiplies every foe's DODGE chance against the hero's weapon blows (see
   * `enemyDodgeChance`; DEXTERITY still trims it first). The harder rungs'
   * monsters are slipperier — the second half, with `playerMissMult`, of
   * "your blows land less up the ladder".
   */
  enemyDodgeMult: number;
  /**
   * The bite an ASTEROID strike takes out of the hero, as a fraction of his
   * MAX hp — the rift's rock rain scales its blow by the rung, not by a flat
   * number (see stepAsteroids). The suit's plating still soaks its grade's
   * share of the result like any physical hit, but there is no crit and no
   * dodge roll — a rock is dodged with the feet. EASY loses a fifth of the
   * bar to a hit; JESUS loses three quarters, two rocks from dead.
   */
  asteroidDamageFrac: number;
};

export const DIFFICULTY_DEFS: Record<Difficulty, DifficultyDef> = {
  easy: {
    id: "easy",
    index: 1,
    name: "EASY",
    tagline: "A GENTLE WARM-UP",
    color: "#7ef0c8",
    startingWeapon: "hairy_potters_wand",
    // Four banked points — a broad head start, one in each combat stat.
    startingStats: { stamina: 1, strength: 1, dexterity: 1, intelligence: 1 },
    mobCountMult: 0.9,
    mobLevelOffset: -3,
    aliveMult: 0.9,
    menaceMult: 0.05,
    menaceDecayMult: 1.5,
    menaceEffectMult: 0.5,
    dropChanceBonus: 0,
    medkitDropMult: 1.05,
    armorDropMult: 1.05,
    powerupDropMult: 1.05,
    uniqueDropChance: 0,
    tierChanceBonus: {},
    staminaDrainMult: 0.95,
    playerDodgeMult: 1.3,
    playerMissMult: 0.5,
    enemyDodgeMult: 0.5,
    asteroidDamageFrac: 0.2,
  },
  medium: {
    id: "medium",
    index: 2,
    name: "MEDIUM",
    tagline: "THE FIGHT AS INTENDED",
    color: "#4da6ff",
    startingWeapon: "medieval_sword",
    startingStats: {},
    mobCountMult: 1,
    mobLevelOffset: -2,
    aliveMult: 1,
    menaceMult: 0.7,
    menaceDecayMult: 1,
    menaceEffectMult: 1,
    dropChanceBonus: 0,
    medkitDropMult: 1,
    armorDropMult: 1,
    powerupDropMult: 1,
    uniqueDropChance: 0,
    tierChanceBonus: {},
    staminaDrainMult: 1,
    playerDodgeMult: 1,
    playerMissMult: 1,
    enemyDodgeMult: 1,
    asteroidDamageFrac: 0.3,
  },
  hard: {
    id: "hard",
    index: 3,
    name: "HARD",
    tagline: "NO ROOM FOR MISTAKES",
    color: "#ffd75e",
    startingWeapon: "combat_knife",
    startingStats: {},
    mobCountMult: 1.1,
    mobLevelOffset: -1,
    aliveMult: 1.1,
    menaceMult: 1.5,
    menaceDecayMult: 0.85,
    menaceEffectMult: 1.15,
    dropChanceBonus: 0.03,
    medkitDropMult: 0.95,
    armorDropMult: 0.95,
    powerupDropMult: 0.95,
    uniqueDropChance: 0.01,
    tierChanceBonus: { magic: 0.08, rare: 0.05 },
    staminaDrainMult: 1.05,
    playerDodgeMult: 0.9,
    playerMissMult: 1.1,
    enemyDodgeMult: 1.1,
    asteroidDamageFrac: 0.4,
  },
  nightmare: {
    id: "nightmare",
    index: 4,
    name: "NIGHTMARE",
    tagline: "THEY NEVER STOP COMING",
    color: "#ff8c42",
    startingWeapon: "brass_knuckles",
    startingStats: {},
    mobCountMult: 1.2,
    mobLevelOffset: 0,
    aliveMult: 1.2,
    menaceMult: 3.0,
    menaceDecayMult: 0.7,
    menaceEffectMult: 1.3,
    dropChanceBonus: 0.06,
    medkitDropMult: 0.9,
    armorDropMult: 0.9,
    powerupDropMult: 0.9,
    uniqueDropChance: 0.02,
    tierChanceBonus: { magic: 0.14, rare: 0.08 },
    staminaDrainMult: 1.1,
    playerDodgeMult: 0.8,
    playerMissMult: 1.25,
    enemyDodgeMult: 1.25,
    asteroidDamageFrac: 0.5,
  },
  jesus: {
    id: "jesus",
    index: 5,
    name: "JESUS CHRIST!",
    tagline: "ABANDON ALL HOPE",
    color: "#d83a3a",
    startingWeapon: "stick",
    startingStats: {},
    // One extra step of count PLUS the +50% pile-on: 1.2 × 1.5.
    mobCountMult: 1.8,
    mobLevelOffset: 2,
    aliveMult: 1.8,
    menaceMult: 7.0,
    menaceDecayMult: 0.5,
    menaceEffectMult: 1.5,
    dropChanceBonus: 0.1,
    // A step below nightmare, then the extra −10% squeeze: 0.855 × 0.9.
    medkitDropMult: 0.77,
    armorDropMult: 0.77,
    powerupDropMult: 0.77,
    uniqueDropChance: 0.04,
    tierChanceBonus: { magic: 0.2, rare: 0.12 },
    // No extra burn past nightmare — JESUS is kited or not survived at all.
    staminaDrainMult: 1.1,
    playerDodgeMult: 0.7,
    playerMissMult: 1.4,
    enemyDodgeMult: 1.4,
    asteroidDamageFrac: 0.75,
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
