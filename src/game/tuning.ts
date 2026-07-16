// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Runtime BALANCE TUNING — a small set of developer multipliers layered over
// the shipped config, so the game's balance can be probed at runtime (the
// hidden DEVELOPER → BALANCE menu) without editing config.ts and rebuilding.
// Every knob is a multiplier with a neutral default of 1, applied at the ONE
// read site that owns its rule (grantXp, weaponDamageFor, spawnEnemy, …), so
// a knob moves every surface of that rule consistently. Like the other
// developer flags (see leveling.ts `setAutoStatGainsEnabled`), the engine
// default is neutral and the app applies the persisted values on load.
//
// Deliberately ~10 knobs, not one per config field: each is the single most
// useful lever of its system (leveling pace, mob strength, loot rain, …) —
// a balance probe, not a config editor.

/** The developer balance multipliers — 1 is the shipped tuning for each. */
export type BalanceTuning = {
  /** Scales all XP granted (kills and golden arrows alike) — leveling pace. */
  xpGain: number;
  /** Scales the PER-TIER leveling slowdown (`LEVELING.tierLevelCostStep`): how
   * much longer a level takes on nightmare/jesus than on a bottom lane. 1× is
   * the shipped 25%/tier; 0× levels every difficulty alike; 2× is 50%/tier. */
  levelingSlowdown: number;
  /** Scales the ENDGAME steepening rate (`LEVELING.endgameSteepenRate`): how
   * hard the curve walls up past level 70. 1× is the shipped 5%/level; 0× a
   * pure geometric tail; higher makes the grind to 99 brutal. */
  endgameSteepen: number;
  /** Scales the WoW-style LEVEL-DIFFERENCE XP slopes (`LEVELING.xpAbove/
   * BelowPlayerPerLevel`) together: how much a mob's level vs the hero's swings
   * its XP. 1× is shipped; 0× flattens it (every mob pays its level's XP flat);
   * higher steepens the above-bonus / below-penalty. */
  restXp: number;
  /** Scales MOB ARMOR (`DifficultyDef.mobArmor`): the fraction of a PHYSICAL
   * blow the horde shrugs off (magic ignores it). 1× is shipped; 0× strips
   * armor (physical and magic hit alike); higher favors magic builds more. */
  mobArmor: number;
  /** Scales the hero's weapon damage (combat, scoring, and readouts). */
  playerDamage: number;
  /** Scales the knockback a melee/ranged weapon blow shoves a struck mob back
   * (config `KNOCKBACK.distance`) — 0 turns the push off entirely. */
  knockback: number;
  /** Scales every monster's hp at spawn. (Kill XP is level-based now, so a
   * hp-scaled mob is tougher but pays the same xp for its level.) */
  mobHp: number;
  /** Scales monster damage to the hero — contact blows and hostile shots. */
  mobDamage: number;
  /** Scales the wave spawner's live floor and cap — how thick the horde is. */
  hordeSize: number;
  /** Scales the per-kill chance a regular monster drops anything. */
  dropRate: number;
  /** Scales the share of drops that is equipment (eats the lesser slices). */
  equipmentShare: number;
  /** Scales the share of drops that is a weapon repair kit — how much of the
   * drop rain mends a worn weapon (eats the ladder's empty tail). */
  repairDrops: number;
  /** Scales the tier odds (magic/rare) an equipment drop rolls. */
  gearQuality: number;
  /** Scales the unique drop chances — boss tables and world drops. */
  uniqueDrops: number;
  /** Scales how fast the menace meter heats from the player's output. */
  menaceGain: number;
  /** Scales the CLEARANCE THRESHOLD (over `MENACE.clearanceThreshold`, 0.1) the
   * rolling heat needs before it fires: how far the player must out-clear the
   * horde's spawn rate before sustained output heats the meter. 0× heats on any
   * positive clearance (out-kill spawns at all); higher demands a bigger rout. */
  menaceClearance: number;
};

export const BALANCE_TUNING_DEFAULTS: BalanceTuning = {
  xpGain: 1,
  levelingSlowdown: 1,
  endgameSteepen: 1,
  restXp: 1,
  mobArmor: 1,
  playerDamage: 1,
  knockback: 1,
  mobHp: 1,
  mobDamage: 1,
  hordeSize: 1,
  dropRate: 1,
  equipmentShare: 1,
  repairDrops: 1,
  gearQuality: 1,
  uniqueDrops: 1,
  menaceGain: 1,
  menaceClearance: 1,
};

/** Guard rails on any applied value — the developer BALANCE sliders span a
 * system fully off (0×) to a hundred times the shipped tuning, and the clamp
 * matches so a corrupt persisted value still can't overflow the simulation.
 * Every read site multiplies by its knob and floors the result where a zero
 * would be nonsensical (e.g. mob hp is `Math.max(1, …)`), so 0 is safe. */
const TUNING_MIN = 0;
const TUNING_MAX = 100;

// The live values, read by the rule owners each roll/tick. Exported read-only
// so the hot paths pay a property read, not a getter call — mutate ONLY
// through `setBalanceTuning`.
const tuning: BalanceTuning = { ...BALANCE_TUNING_DEFAULTS };
export const BALANCE: Readonly<BalanceTuning> = tuning;

/**
 * Apply developer balance multipliers (partial — omitted knobs keep their
 * current value). Non-finite values are ignored and the rest clamped to
 * [0, 100], so a corrupt store can never wedge the simulation. Takes effect
 * on the NEXT roll/spawn/tick — nothing already in flight is restated.
 */
export function setBalanceTuning(patch: Partial<BalanceTuning>): void {
  for (const key of Object.keys(
    BALANCE_TUNING_DEFAULTS,
  ) as (keyof BalanceTuning)[]) {
    const value = patch[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    tuning[key] = Math.min(TUNING_MAX, Math.max(TUNING_MIN, value));
  }
}

/** The current multipliers, as a defensive copy (UI/readout use). */
export function getBalanceTuning(): BalanceTuning {
  return { ...tuning };
}

/** Restore every knob to its neutral 1 — the RESET row, and test teardown. */
export function resetBalanceTuning(): void {
  Object.assign(tuning, BALANCE_TUNING_DEFAULTS);
}
