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
  /** Scales the hero's weapon damage (combat, scoring, and readouts). */
  playerDamage: number;
  /** Scales every monster's hp at spawn (kill XP is hp-proportional, so a
   * tougher mob also pays more). */
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
  /** Scales how much of the hero's DAMAGE level the horde tracks (over the
   * shipped `MENACE.damageLevelTracking`, 0.2): higher = mobs hp-match a strong
   * weapon more (harder to overkill/rampage), 0 = the horde ignores dps
   * entirely and keys toughness to character/gear level alone. */
  mobDamageTracking: number;
};

export const BALANCE_TUNING_DEFAULTS: BalanceTuning = {
  xpGain: 1,
  playerDamage: 1,
  mobHp: 1,
  mobDamage: 1,
  hordeSize: 1,
  dropRate: 1,
  equipmentShare: 1,
  repairDrops: 1,
  gearQuality: 1,
  uniqueDrops: 1,
  menaceGain: 1,
  mobDamageTracking: 1,
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
