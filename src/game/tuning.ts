// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Runtime BALANCE TUNING — a small set of developer multipliers layered over
// the shipped config, so the game's balance can be probed at runtime (the
// hidden DEVELOPER → BALANCE menu) without editing config.ts and rebuilding.
// Every knob is a multiplier over the config value it governs, applied at the
// ONE read site that owns its rule (grantXp, weaponDamageFor, spawnEnemy, …),
// so a knob moves every surface of that rule consistently. Like the other
// developer flags (see leveling.ts `setAutoStatGainsEnabled`), the engine holds
// the defaults and the app applies the persisted values on load.
//
// Almost every default is a neutral 1 — the exception is the pair that carries
// the world's shipped PACE (`playerSpeed` / `mobSpeed`, both 0.8; see
// BALANCE_TUNING_DEFAULTS), where the number IS the balance decision rather
// than a probe over one.
//
// Deliberately ~10 knobs, not one per config field: each is the single most
// useful lever of its system (leveling pace, mob strength, loot rain, …) —
// a balance probe, not a config editor.

import { clamp } from "@game/lib/vec.ts";

/** The developer balance multipliers — 1 is the engine's own authored value for
 * each, and the shipped tuning too except for the speed pair (see
 * `BALANCE_TUNING_DEFAULTS`). */
export type BalanceTuning = {
  /** Scales all XP granted (kills, errands, a scroll's doubled cut alike) —
   * leveling pace. */
  xpGain: number;
  /** Scales the PER-TIER leveling slowdown (`LEVELING.tierLevelCostStep`): how
   * much longer a level takes on nightmare/jesus than on a bottom lane. 1× is
   * the shipped 25%/tier; 0× levels every difficulty alike; 2× is 50%/tier. */
  levelingSlowdown: number;
  /** Scales the ENDGAME steepening rate (`LEVELING.endgameSteepenRate`): how
   * hard the curve walls up past level 70. 1× is the shipped 5%/level; 0× a
   * pure geometric tail; higher makes the grind to 99 brutal. */
  endgameSteepen: number;
  /** Scales the DEATH XP TOLL (`LEVELING.deathXpPenaltyFraction`): the share of
   * the current level's XP a softcore hero loses on death. 1× is the shipped
   * 10%; 0× turns the penalty off (death is free again); higher makes it bite
   * harder (past 10× a death empties the level's bar). Applied in
   * `applyDeathXpPenalty` (loot.ts). */
  deathXpLoss: number;
  /** Scales the WoW-style LEVEL-DIFFERENCE XP slopes (`LEVELING.xpAbove/
   * BelowPlayerPerLevel`) together: how much a mob's level vs the hero's swings
   * its XP. 1× is shipped; 0× flattens it (every mob pays its level's XP flat);
   * higher steepens the above-bonus / below-penalty. */
  restXp: number;
  /** Scales MOB ARMOR (`DifficultyDef.mobArmor`): the fraction of a PHYSICAL
   * blow the horde shrugs off (magic ignores it). 1× is shipped; 0× strips
   * armor (physical and magic hit alike); higher favors magic builds more. */
  mobArmor: number;
  /** Scales the PASSIVE TALENTS' output — the always-on stat bonuses (crit,
   * dodge, max-hp, move-speed, damage reduction, berserker, retribution) and the
   * proc RATES (twin strike, cleaving echo, volley, concussive, crippling,
   * parry) plus the seismic-landing blast. Talent SHAPE (pierce/target counts,
   * reach, jump height, freeze radius) is deliberately left fixed — a raw-power
   * dial, not a mechanics editor. Applied at the talent-effect choke
   * (`talent-effects.ts`). 0× turns the talent stat/proc layer off; conjuration
   * ranks (which already ride `abilityPowerScale`) are governed there, not here. */
  talentPower: number;
  /** Scales the knockback a KNOCKBACK weapon's melee/ranged blow shoves a
   * struck mob back (config `KNOCKBACK.distance`; only the rare weapons that
   * carry the `knockback` affix push at all) — 0 turns the push off entirely. */
  knockback: number;
  /** Scales every monster's hp at spawn. (Kill XP is level-based now, so a
   * hp-scaled mob is tougher but pays the same xp for its level.) */
  mobHp: number;
  /** Scales monster damage to the hero — contact blows and hostile shots. */
  mobDamage: number;
  /** Scales how fast a RUN spends the sprint pool (`STAMINA.drainPerSec`, on
   * top of the difficulty's `staminaDrainMult` and the STAMINA stat's
   * reduction). 1× is shipped; 0× makes running free (the pool never empties,
   * so stamina potions become a luxury rather than a tax); higher winds the
   * hero faster. Applied at the one drain site (`stepPlayer`), so the pool's
   * depth, regen, jump cost, and empty-pool lockout are untouched. */
  staminaDrain: number;
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
  /**
   * Scales how fast EVERYTHING on foot moves — the hero and the horde together.
   * The world's TEMPO knob: because both sides scale by the same number, every
   * chase ratio the fights were tuned on holds, and what changes is how quickly
   * the game plays rather than who wins a footrace. This is the one to reach
   * for first when the game feels sluggish or frantic.
   *
   * Composes with the two one-sided knobs below (`playerSpeed`, `mobSpeed`),
   * which is the whole point of splitting them: tempo moves the pair, the other
   * two break the tie. `tempo 1.5, mobSpeed 0.5` is a fast hero in a slow
   * world; setting tempo alone can never say that.
   */
  tempo: number;
  /** Scales the HERO's move speed alone (on top of `tempo`) — how far ahead of
   * the horde he can get. Applied at `playerSpeed`, so the sprint pool, the
   * winded jog and every talent/powerup multiplier ride it unchanged. Ships
   * BELOW 1 — this and `mobSpeed` carry the world's shipped pace between them
   * (see `BALANCE_TUNING_DEFAULTS`), leaving `tempo` free at 1. */
  playerSpeed: number;
  /** Scales the HORDE's move speed alone (on top of `tempo`) — chases, flanks
   * and elite/boss rushes together. Applied where a monster actually moves, not
   * at its spawn, so a pull mid-run re-paces the mobs already on the field.
   * Ships BELOW 1, by the SAME factor as `playerSpeed` — see above. */
  mobSpeed: number;
};

export const BALANCE_TUNING_DEFAULTS: BalanceTuning = {
  xpGain: 1,
  levelingSlowdown: 1,
  endgameSteepen: 1,
  deathXpLoss: 1,
  restXp: 1,
  mobArmor: 1,
  talentPower: 1,
  knockback: 1,
  mobHp: 1,
  mobDamage: 1,
  staminaDrain: 1,
  hordeSize: 1,
  dropRate: 1,
  equipmentShare: 1,
  repairDrops: 1,
  gearQuality: 1,
  uniqueDrops: 1,
  menaceGain: 1,
  menaceClearance: 1,
  tempo: 1,
  /**
   * THE WORLD'S SHIPPED PACE — the two knobs that do not rest at a neutral 1.
   *
   * The hero's authored 84 px/s (4.2 body-lengths a second, the reference
   * phone's 422 world units crossed in 5 s) overshot: a game steered by
   * POINTING at where you want to be is only as fast as the player can read the
   * ground ahead, and at that pace the crowd arrives before it has been looked
   * at. 0.8 puts him at 67.2 px/s — 3.36 bodies/s, ~6.3 s a screen, still ×1.2
   * the historical 56 — and the horde takes the SAME 0.8, so every chase ratio
   * the fights were tuned on is untouched. This re-paces the world; it does not
   * hand either side an advantage.
   *
   * It is spent HERE rather than on `tempo` deliberately: tempo is the lever a
   * developer grabs to feel the whole world faster or slower, and a lever whose
   * rest position isn't 1 can't be read at a glance. The pair below is the same
   * arithmetic with the shipped decision written on the two sides it applies
   * to — so TEMPO stays honest, and either side can still be re-paced alone.
   */
  playerSpeed: 0.8,
  mobSpeed: 0.8,
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
    tuning[key] = clamp(value, TUNING_MIN, TUNING_MAX);
  }
}

/** The current multipliers, as a defensive copy (UI/readout use). */
export function getBalanceTuning(): BalanceTuning {
  return { ...tuning };
}

/** Restore every knob to the SHIPPED tuning — a neutral 1 for all but the speed
 * pair, which returns to the world's own pace. The RESET row, and test
 * teardown. */
export function resetBalanceTuning(): void {
  Object.assign(tuning, BALANCE_TUNING_DEFAULTS);
}
