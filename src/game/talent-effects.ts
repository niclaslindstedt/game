// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The talent EFFECT reads — the pure, state-in→number-out half of the passive
// talent system. Each combat read site (`combat-stats.ts`, `derived.ts`,
// `weapon-math.ts`) folds in one of these, summing `rank × slope` over the
// relevant talents. Kept in its own LEAF module (it imports only the catalog +
// types) so the read sites can pull an effect without dragging in the talent
// ECONOMY (`talents.ts`, which in turn needs `items/derived.ts` — importing the
// economy here would close a cycle).

import { TALENTS } from "./config/talents.ts";
import {
  talentDefs,
  talentsForTree,
  type TalentClass,
  type TalentEffect,
} from "./defs/talents/index.ts";
import type { GameState, SpellKind, WeaponClass } from "./types/index.ts";

/** The rank the hero owns in a talent (0 when untrained). */
export function talentRank(state: GameState, id: string): number {
  return state.player.talents[id] ?? 0;
}

/** Total ranks the hero has spent across `tree`'s talents. */
export function spentTalentRanks(state: GameState, tree: TalentClass): number {
  let sum = 0;
  for (const def of talentsForTree(tree)) sum += talentRank(state, def.id);
  return sum;
}

/** The `…PerRank` (numeric slope) fields of a `TalentEffect` — every field but
 * the CONJURE spell tag, which `sumEffect` can't add. */
type NumericEffectField = {
  [K in keyof TalentEffect]-?: NonNullable<TalentEffect[K]> extends number
    ? K
    : never;
}[keyof TalentEffect];

/** Sum `rank × def.effect[field]` over the active talents, optionally limited
 * to one tree. Cheap: the catalog is a handful of defs. */
function sumEffect(
  state: GameState,
  field: NumericEffectField,
  tree?: TalentClass,
): number {
  let total = 0;
  for (const def of Object.values(talentDefs())) {
    if (tree && def.tree !== tree) continue;
    const per = def.effect[field];
    if (per) total += talentRank(state, def.id) * per;
  }
  return total;
}

/** +crit chance from the tree that matches the weapon class (Executioner for
 * melee, Deadeye for ranged; magic has none). */
export function talentCritChanceBonus(
  state: GameState,
  weaponClass: WeaponClass,
): number {
  return sumEffect(state, "critChancePerRank", weaponClass);
}

/** +crit-damage multiplier from the weapon class's tree. */
export function talentCritDamageBonus(
  state: GameState,
  weaponClass: WeaponClass,
): number {
  return sumEffect(state, "critDamagePerRank", weaponClass);
}

/** Move-speed MULTIPLIER from Wind Runner (1 when untrained). */
export function talentSpeedMult(state: GameState): number {
  return 1 + sumEffect(state, "moveSpeedPerRank");
}

/** +dodge chance from Evasion. */
export function talentDodgeBonus(state: GameState): number {
  return sumEffect(state, "dodgePerRank");
}

/** +max-hp fraction from Bulwark. */
export function talentMaxHpPct(state: GameState): number {
  return sumEffect(state, "maxHpPerRank");
}

/** Flat incoming-damage reduction fraction — Ironhide (martial) + Mage Armor
 * (magic ward) combined, since both apply as one flat cut at the player-damage
 * choke point today. */
export function talentDamageReduction(state: GameState): number {
  return (
    sumEffect(state, "damageReductionPerRank") +
    sumEffect(state, "magicReductionPerRank")
  );
}

/**
 * The granted-spell ranks the hero's trained CONJURATION talents contribute —
 * each such talent's rank feeds one `SpellKind` (Orbiting Flames → orbit, Storm
 * Call → storm). Summed here and folded into the loadout's granted-spell ranks
 * (`grantedSpellRanks` in spells.ts) so a talent-conjured spell runs through the
 * exact always-on machinery a legendary's granted spell does, and talent + item
 * ranks STACK. Returns only present entries (a rank-0 talent conjures nothing).
 */
export function talentSpellRanks(
  state: GameState,
): Partial<Record<SpellKind, number>> {
  const ranks: Partial<Record<SpellKind, number>> = {};
  for (const def of Object.values(talentDefs())) {
    const spell = def.effect.conjure;
    if (!spell) continue;
    const rank = talentRank(state, def.id);
    if (rank > 0) ranks[spell] = (ranks[spell] ?? 0) + rank;
  }
  return ranks;
}

/** ARCANE RETRIBUTION: the fraction of an enemy blow reflected back at the
 * attacker (0 when untrained). */
export function talentReflectFrac(state: GameState): number {
  return sumEffect(state, "reflectPerRank");
}

/** FROST NOVA's live numbers for this hero, or null when untrained. Rank widens
 * the freeze ring, lengthens the freeze, and shortens the internal cooldown
 * (config `TALENTS.frostNova`) — read directly by rank rather than through the
 * additive effect bag, since it's a structured proc, not a summed stat term. */
export function talentFrostNova(state: GameState): {
  radius: number;
  freezeMs: number;
  slowFactor: number;
  cooldownMs: number;
} | null {
  const rank = talentRank(state, "frost_nova");
  if (rank <= 0) return null;
  const c = TALENTS.frostNova;
  const steps = rank - 1;
  return {
    radius: c.radius + c.radiusPerRank * steps,
    freezeMs: c.freezeMs + c.freezeMsPerRank * steps,
    slowFactor: c.slowFactor,
    cooldownMs: Math.max(
      c.cooldownFloorMs,
      c.cooldownMs - c.cooldownPerRank * steps,
    ),
  };
}

/** Weapon-damage MULTIPLIER from Berserker Rage: `1 + rank×slope × missing-hp
 * fraction`, so it peaks near death and is 1 at full hp (or untrained). */
export function talentBerserkMult(state: GameState): number {
  const per = sumEffect(state, "berserkPerRank");
  if (per <= 0) return 1;
  const player = state.player;
  const missing =
    player.maxHp > 0 ? Math.max(0, 1 - player.hp / player.maxHp) : 0;
  return 1 + per * missing;
}

/** TWIN STRIKE's live numbers, or null when untrained (config `TALENTS.twinStrike`).
 * `chance` is the per-blow roll (rank-scaled, capped); `echoFrac` the echo hit's
 * share of the blow (full at rank 5). Read once per hit in `meleeSweep`. */
export function talentTwinStrike(
  state: GameState,
): { chance: number; echoFrac: number } | null {
  const rank = talentRank(state, "twin_strike");
  if (rank <= 0) return null;
  const c = TALENTS.twinStrike;
  return {
    chance: Math.min(c.chanceCap, rank * c.chancePerRank),
    echoFrac: rank >= c.fullEchoRank ? 1 : c.echoDamageFrac,
  };
}

/** CLEAVING ECHO's live numbers, or null when untrained (config
 * `TALENTS.cleavingEcho`). `chance` is the per-swing roll (rank-scaled, capped);
 * `extraTargets` the extra bodies a successful roll adds past the cap (+2 from
 * rank 4). Read once per swing in `stepWeapon`. */
export function talentCleavingEcho(
  state: GameState,
): { chance: number; extraTargets: number } | null {
  const rank = talentRank(state, "cleaving_echo");
  if (rank <= 0) return null;
  const c = TALENTS.cleavingEcho;
  return {
    chance: Math.min(c.chanceCap, rank * c.chancePerRank),
    extraTargets: rank >= c.bonusFromRank ? c.bonusTargets : c.extraTargets,
  };
}

/** PARRY's live numbers, or null when untrained (config `TALENTS.parry`).
 * `chance` fully negates an enemy melee blow (rank-scaled, capped); `riposteFrac`
 * (rank 5) is the share of the negated blow billed back at the attacker. Read in
 * the struck path (`applyParry`). */
export function talentParry(
  state: GameState,
): { chance: number; riposteFrac: number } | null {
  const rank = talentRank(state, "parry");
  if (rank <= 0) return null;
  const c = TALENTS.parry;
  return {
    chance: Math.min(c.chanceCap, rank * c.chancePerRank),
    riposteFrac: rank >= c.riposteRank ? c.riposteFrac : 0,
  };
}

/** SEISMIC LANDING's live numbers, or null when untrained (config
 * `TALENTS.seismic`). Rank grows the AoE radius and the flat base damage (scaled
 * by `abilityPowerScale` at the read site); `knockback` is the flat shove. Read
 * on the `land` event (`applySeismicLanding`). */
export function talentSeismic(
  state: GameState,
): { radius: number; damage: number; knockback: number } | null {
  const rank = talentRank(state, "seismic_landing");
  if (rank <= 0) return null;
  const c = TALENTS.seismic;
  const steps = rank - 1;
  return {
    radius: c.radius + c.radiusPerRank * steps,
    damage: c.damage + c.damagePerRank * steps,
    knockback: c.knockback,
  };
}

/** PIERCING SHOT's live numbers, or null when untrained (config
 * `TALENTS.piercing`). `pierce` is the extra bodies a shot punches through;
 * `retain` the fraction of damage it keeps per pierced body (rank softens the
 * falloff, capped). Read in `stepWeapon` (stamped on the hero's shots). */
export function talentPiercing(
  state: GameState,
): { pierce: number; retain: number } | null {
  const rank = talentRank(state, "piercing_shot");
  if (rank <= 0) return null;
  const c = TALENTS.piercing;
  return {
    pierce: rank * c.piercePerRank,
    retain: Math.min(c.retainCap, c.retainBase + c.retainPerRank * (rank - 1)),
  };
}

/** CONCUSSIVE ROUNDS' live numbers, or null when untrained (config
 * `TALENTS.concussive`). `chance` shoves the struck foe (rank-scaled, capped);
 * `distance` the flat push (world px, role-scaled at the read site). Read on the
 * hero's surviving ranged hits (`applyRangedShotProcs`). */
export function talentConcussive(
  state: GameState,
): { chance: number; distance: number } | null {
  const rank = talentRank(state, "concussive_rounds");
  if (rank <= 0) return null;
  const c = TALENTS.concussive;
  return {
    chance: Math.min(c.chanceCap, rank * c.chancePerRank),
    distance: c.distance + c.distancePerRank * (rank - 1),
  };
}

/** CRIPPLING SHOT's live numbers, or null when untrained (config
 * `TALENTS.crippling`). `chance` slows the struck foe (rank-scaled, capped);
 * `slowFactor` the speed multiplier while slowed; `slowMs` its duration (rank
 * lengthens it). Read on the hero's ranged hits (`applyRangedShotProcs`). */
export function talentCrippling(
  state: GameState,
): { chance: number; slowFactor: number; slowMs: number } | null {
  const rank = talentRank(state, "crippling_shot");
  if (rank <= 0) return null;
  const c = TALENTS.crippling;
  return {
    chance: Math.min(c.chanceCap, rank * c.chancePerRank),
    slowFactor: c.slowFactor,
    slowMs: c.slowMs + c.slowMsPerRank * (rank - 1),
  };
}

/** VOLLEY's live numbers, or null when untrained (config `TALENTS.volley`).
 * `chance` fires extra projectiles on a pull (rank-scaled, capped); `extra` the
 * pellet count added (+4 from rank 4); `spreadDeg` fans them. Read once per pull
 * in `stepWeapon`. */
export function talentVolley(
  state: GameState,
): { chance: number; extra: number; spreadDeg: number } | null {
  const rank = talentRank(state, "volley");
  if (rank <= 0) return null;
  const c = TALENTS.volley;
  return {
    chance: Math.min(c.chanceCap, rank * c.chancePerRank),
    extra: rank >= c.bonusFromRank ? c.bonusExtra : c.extra,
    spreadDeg: c.spreadDeg,
  };
}

/** SPRING HEELS' jump modifiers (config `TALENTS.springHeels`): a takeoff-speed
 * MULTIPLIER (1 when untrained) and a jump-cost MULTIPLIER (< 1 only at rank 5).
 * Read in `stepPlayer`. */
export function talentJumpMods(state: GameState): {
  velocityMult: number;
  costMult: number;
} {
  const rank = talentRank(state, "spring_heels");
  if (rank <= 0) return { velocityMult: 1, costMult: 1 };
  const c = TALENTS.springHeels;
  return {
    velocityMult: 1 + c.velocityPerRank * rank,
    costMult: rank >= c.costReductionRank ? 1 - c.jumpCostReduction : 1,
  };
}

/** EVASION's rank-5 speed-burst MULTIPLIER while the burst window is live (config
 * `TALENTS.evasionBurst`; `player.evasionBurstMs > 0`), 1 otherwise. Read in
 * `playerSpeed`; the window is armed on a dodge in the struck path. */
export function talentEvasionBurstMult(state: GameState): number {
  if ((state.player.evasionBurstMs ?? 0) <= 0) return 1;
  return TALENTS.evasionBurst.speedMult;
}

/** EVASION's rank-5 burst duration (ms), or 0 when the mastery isn't owned —
 * armed on a dodge in the struck path (config `TALENTS.evasionBurst`). */
export function talentEvasionBurstMs(state: GameState): number {
  return talentRank(state, "evasion") >= TALENTS.evasionBurst.rank
    ? TALENTS.evasionBurst.ms
    : 0;
}
