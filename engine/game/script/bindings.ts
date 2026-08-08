// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TYPED CALL SITES — one function per hook, and the ONLY place the rest of
// the engine touches the script system. Everything above this line is
// TypeScript with ordinary arguments; everything below it is Lua.
//
// Each binding does three things and nothing else:
//
//   1. RESOLVES the dynamic arguments (a difficulty's numbers, a hero's
//      effective stat) — the script reads the STATIC tuning itself, out of
//      `game.config`, so a mod that wants a different constant edits the
//      formula it belongs to rather than being handed a pre-chewed number,
//   2. calls the hook,
//   3. carries a `fallback` — the same arithmetic, in TypeScript.
//
// **The fallback is not a second implementation of the rule.** It exists
// because the engine has to be runnable with NO content tree at all: the
// `tests/engine/` suites register synthetic fixtures and never compile a script,
// the mod SDK's analyzers run against a half-built catalog, and a fresh clone
// typechecks before `npm run levels` has ever run. The shipped
// `content/scripts/*.lua` file is the rule; the fallback is what the engine does
// when nobody has told it one. `tests/content/script_parity_test.ts` pins the
// two together over the whole plausible input range, so the day they disagree is
// a failing test rather than a balance mystery.
//
// The `numberHook` calls pass `state`/`hero` so `game.run` answers about the run
// (and the hero) the call is actually about — a private read of one hero is a
// parameter, never a lookup.

import { toLuaTable, type LuaValue } from "@game/lib/lua/index.ts";
import type { GameState, Player } from "../types/index.ts";
import { numberHook } from "./host.ts";

/** A context record as the Lua table a hook's `ctx` parameter receives. The
 * keys are snake_cased at the binding, so a script reads `ctx.damage_pct` while
 * the engine keeps its own spelling. */
const ctxTable = (fields: Record<string, LuaValue>) => toLuaTable(fields);

// ---- progression.lua ------------------------------------------------------

/** The XP crossing out of `level` costs, given the authored curve row and the
 * difficulty's cost tier. */
export function hookXpToLevelUp(
  level: number,
  curveXp: number,
  tier: number,
  fallback: () => number,
): number {
  return numberHook("xp_to_level_up", [level, curveXp, tier], fallback);
}

/** What one kill of a monster of `mobLevel` pays a hero of `heroLevel`. */
export function hookMobXp(
  mobLevel: number,
  heroLevel: number,
  fallback: () => number,
): number {
  return numberHook("mob_xp", [mobLevel, heroLevel], fallback);
}

/** How much of an XP grant a hero of `level` still collects against `cap`. */
export function hookXpCapMultiplier(
  level: number,
  cap: number,
  fallback: () => number,
): number {
  return numberHook("xp_cap_multiplier", [level, cap], fallback);
}

/** The diminishing-returns curve on a stat pile, against the level-scaled
 * `cap`. */
export function hookStatDiminish(
  points: number,
  cap: number,
  fallback: () => number,
): number {
  return numberHook("stat_diminish", [points, cap], fallback);
}

// ---- menace.lua -----------------------------------------------------------

/** The hp multiplier a monster's own level buys it. */
export function hookMobHpLevelFactor(
  mobLevel: number,
  fallback: () => number,
): number {
  return numberHook("mob_hp_level_factor", [mobLevel], fallback);
}

/** The monster level the horde fields, inside the difficulty's band. */
export function hookMobLevel(
  heroLevel: number,
  offset: number,
  min: number | undefined,
  max: number | undefined,
  fallback: () => number,
): number {
  return numberHook("mob_level", [heroLevel, offset, min, max], fallback);
}

/** What a killing blow is worth once it overkills its victim. */
export function hookOverkillEfficiency(
  damage: number,
  maxHp: number,
  fallback: () => number,
): number {
  return numberHook("overkill_efficiency", [damage, maxHp], fallback);
}

// ---- loot.lua -------------------------------------------------------------

/** The chance a rank-and-file monster drops anything at all. */
export function hookDropChance(
  difficultyBonus: number,
  luck: number,
  fallback: () => number,
  state?: GameState,
  hero?: Player,
): number {
  return numberHook(
    "drop_chance",
    [difficultyBonus, luck],
    fallback,
    state,
    hero,
  );
}

/** Everything about one kill that the rarity roll's per-tier chance depends
 * on. Mirrors the `ctx` table `loot.lua` documents. */
export type TierChanceContext = {
  /** How far the kill's loot level sits over this tier's unlock level. */
  depth: number;
  /** The difficulty's `tierChanceBonus` for this tier. */
  difficultyBonus: number;
  /** The elite/boss set-piece bonus on the rarest tiers. */
  roleBonus: number;
  /** The generic per-kill sweetener — lifts the ROLLED tiers only. */
  tierBonus: number;
  /** The farm-venue multiplier on the chase tiers. */
  namedMult: number;
  /** Rank-and-file with no rarity of its own — suffers the named penalty. */
  plainMinion: boolean;
  /** The killer's magic find. */
  mf: number;
  /** The past-the-cap rampage multiplier on the chase tiers. */
  overCapMult: number;
};

/** The per-tier CHANCE the rarity roll measures its draw against. Zero means
 * "do not offer this tier", and the caller spends no rng on it — which is what
 * keeps a seeded run's draw sequence stable. */
export function hookTierChance(
  tier: string,
  ctx: TierChanceContext,
  fallback: () => number,
  state?: GameState,
  hero?: Player,
): number {
  return numberHook(
    "tier_chance",
    [
      tier,
      ctxTable({
        depth: ctx.depth,
        difficulty_bonus: ctx.difficultyBonus,
        role_bonus: ctx.roleBonus,
        tier_bonus: ctx.tierBonus,
        named_mult: ctx.namedMult,
        plain_minion: ctx.plainMinion,
        mf: ctx.mf,
        over_cap_mult: ctx.overCapMult,
      }),
    ],
    fallback,
    state,
    hero,
  );
}

/** How magic find multiplies a tier's odds. */
export function hookMagicFindFactor(
  tier: string,
  mf: number,
  fallback: () => number,
): number {
  return numberHook("magic_find_factor", [tier, mf], fallback);
}

// ---- combat.lua -----------------------------------------------------------

/** Everything a weapon's per-hit damage is made of. Mirrors the `ctx` table
 * `combat.lua` documents. */
export type WeaponDamageContext = {
  /** The weapon def's authored damage. */
  base: number;
  /** Which stat governs this weapon class. */
  damageStat: string;
  /** The wielder's effective value of it. */
  stat: number;
  /** The sum of the instance's `damagePct` affixes. */
  damagePct: number;
  /** 1 + the instance's ENHANCED DAMAGE roll. */
  enhanced: number;
  /** The instance's MAKE quality multiplier. */
  quality: number;
  /** A running REACTOR SURGE, else 1. */
  surge: number;
};

/** A weapon instance's per-hit damage for its wielder. */
export function hookWeaponDamage(
  ctx: WeaponDamageContext,
  fallback: () => number,
  state?: GameState,
  hero?: Player,
): number {
  return numberHook(
    "weapon_damage",
    [
      ctxTable({
        base: ctx.base,
        damage_stat: ctx.damageStat,
        stat: ctx.stat,
        damage_pct: ctx.damagePct,
        enhanced: ctx.enhanced,
        quality: ctx.quality,
        surge: ctx.surge,
      }),
    ],
    fallback,
    state,
    hero,
  );
}

/** The fraction of a physical blow a monster shrugs off. */
export function hookMobArmorReduction(
  mobLevel: number,
  difficultyBonus: number,
  fallback: () => number,
): number {
  return numberHook(
    "mob_armor_reduction",
    [mobLevel, difficultyBonus],
    fallback,
  );
}
