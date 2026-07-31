// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The talent EFFECT reads — the pure, state-in→number-out half of the passive
// talent system. Each combat read site (`combat-stats.ts`, `derived.ts`,
// `weapon-math.ts`) folds in one of these, summing `rank × slope` over the
// relevant talents. Kept in its own LEAF module (it imports only the catalog +
// types) so the read sites can pull an effect without dragging in the talent
// ECONOMY (`talents.ts`, which in turn needs `items/derived.ts` — importing the
// economy here would close a cycle).
//
// The structured PROCS (a parry, a volley, a frost nova) are read the same way,
// but through `procTalent` — which asks the catalog "which trained talent
// carries this BLOCK", never "what rank is `frost_nova`". Every number they
// return is authored in `content/talents.yaml`, so a mod can retune a shipped
// proc or hang one off a talent of its own without an engine change.

import {
  talentDefs,
  talentsForTree,
  type TalentBlockName,
  type TalentClass,
  type TalentDef,
  type TalentEffect,
} from "./defs/talents/index.ts";
import { BALANCE } from "./tuning.ts";
import type { GameState, SpellKind, WeaponClass } from "./types/index.ts";

/**
 * The developer TALENT POWER dial (`BALANCE.talentPower`, neutral 1). Every
 * talent OUTPUT magnitude — the summed always-on stat bonuses and each
 * offensive proc's rate/blast — is multiplied by this so the whole talent
 * stat/proc layer can be turned up or off at runtime without a rebuild. Talent
 * SHAPE (integer counts, reach, jump height, freeze radius) is scaled by rank
 * only, never by this knob. Conjuration ranks ride `abilityPowerScale` instead
 * (see `talentSpellRanks`), so they are intentionally outside this lever.
 */
function talentPower(): number {
  return BALANCE.talentPower;
}

/** The rank the hero owns in a talent (0 when untrained). */
export function talentRank(state: GameState, id: string): number {
  return state.players[0].talents[id] ?? 0;
}

/** Total ranks the hero has spent across `tree`'s talents. */
export function spentTalentRanks(state: GameState, tree: TalentClass): number {
  let sum = 0;
  for (const def of talentsForTree(tree)) sum += talentRank(state, def.id);
  return sum;
}

/** A trained talent's proc block plus the rank it is trained to. */
type TrainedProc<K extends TalentBlockName> = {
  rank: number;
  block: NonNullable<TalentDef[K]>;
};

/**
 * The trained talent carrying the `name` proc block, or null when the hero has
 * no rank in it. THE HOOK ASKS FOR A BLOCK, NEVER FOR AN ID — that is what lets
 * a mod's talent fire a shipped proc with its own numbers, and what makes every
 * proc's tuning an edit to `content/talents.yaml` rather than to the engine.
 *
 * One carrier per proc is a build rule (`validateTalentCatalog`), so a second
 * one is impossible in a compiled catalog; taking the first trained carrier is
 * how that degrades if two MODS both ship one — earlier in the load order wins,
 * predictably, rather than the numbers being summed into something nobody
 * authored.
 */
function procTalent<K extends TalentBlockName>(
  state: GameState,
  name: K,
): TrainedProc<K> | null {
  for (const def of Object.values(talentDefs())) {
    const block = def[name];
    if (block === undefined) continue;
    const rank = talentRank(state, def.id);
    if (rank > 0) return { rank, block: block as NonNullable<TalentDef[K]> };
  }
  return null;
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
    const per = def.effect?.[field];
    if (per) total += talentRank(state, def.id) * per;
  }
  // The TALENT POWER dial scales every summed always-on bonus at once (crit,
  // dodge, max-hp, move-speed, damage reduction, berserker, retribution).
  return total * talentPower();
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
    const spell = def.effect?.conjure;
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
 * (the carrier's `frostNova` block) — read through the block rather than the
 * additive effect bag, since it's a structured proc, not a summed stat term. */
export function talentFrostNova(state: GameState): {
  radius: number;
  freezeMs: number;
  slowFactor: number;
  cooldownMs: number;
} | null {
  const proc = procTalent(state, "frostNova");
  if (!proc) return null;
  const c = proc.block;
  const steps = proc.rank - 1;
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
  const player = state.players[0];
  const missing =
    player.maxHp > 0 ? Math.max(0, 1 - player.hp / player.maxHp) : 0;
  return 1 + per * missing;
}

/** TWIN STRIKE's live numbers, or null when untrained (the carrier's
 * `twinStrike` block). `chance` is the per-blow roll (rank-scaled, capped);
 * `echoFrac` the echo hit's share of the blow (full from `fullEchoRank`). Read
 * once per hit in `meleeSweep`. */
export function talentTwinStrike(
  state: GameState,
): { chance: number; echoFrac: number } | null {
  const proc = procTalent(state, "twinStrike");
  if (!proc) return null;
  const c = proc.block;
  return {
    chance: Math.min(c.chanceCap, proc.rank * c.chancePerRank * talentPower()),
    echoFrac: proc.rank >= c.fullEchoRank ? 1 : c.echoDamageFrac,
  };
}

/** CLEAVING ECHO's live numbers, or null when untrained (the carrier's
 * `cleavingEcho` block). `chance` is the per-swing roll (rank-scaled, capped);
 * `extraTargets` the extra bodies a successful roll adds past the cap (the
 * bigger figure from `bonusFromRank`). Read once per swing in `stepWeapon`. */
export function talentCleavingEcho(
  state: GameState,
): { chance: number; extraTargets: number } | null {
  const proc = procTalent(state, "cleavingEcho");
  if (!proc) return null;
  const c = proc.block;
  return {
    chance: Math.min(c.chanceCap, proc.rank * c.chancePerRank * talentPower()),
    extraTargets:
      proc.rank >= c.bonusFromRank ? c.bonusTargets : c.extraTargets,
  };
}

/** PARRY's live numbers, or null when untrained (the carrier's `parry` block).
 * `chance` fully negates an enemy melee blow (rank-scaled, capped);
 * `riposteFrac` (from `riposteRank`) is the share of the negated blow billed
 * back at the attacker. Read in the struck path (`applyParry`). */
export function talentParry(
  state: GameState,
): { chance: number; riposteFrac: number } | null {
  const proc = procTalent(state, "parry");
  if (!proc) return null;
  const c = proc.block;
  return {
    chance: Math.min(c.chanceCap, proc.rank * c.chancePerRank * talentPower()),
    riposteFrac: proc.rank >= c.riposteRank ? c.riposteFrac : 0,
  };
}

/** SEISMIC LANDING's live numbers, or null when untrained (the carrier's
 * `seismic` block). Rank grows the AoE radius and the flat base damage (scaled
 * by `abilityPowerScale` at the read site); `knockback` is the flat shove. Read
 * on the `land` event (`applySeismicLanding`). */
export function talentSeismic(
  state: GameState,
): { radius: number; damage: number; knockback: number } | null {
  const proc = procTalent(state, "seismic");
  if (!proc) return null;
  const c = proc.block;
  const steps = proc.rank - 1;
  return {
    radius: c.radius + c.radiusPerRank * steps,
    damage: (c.damage + c.damagePerRank * steps) * talentPower(),
    knockback: c.knockback,
  };
}

/** PIERCING SHOT's live numbers, or null when untrained (the carrier's
 * `piercing` block). `pierce` is the extra bodies a shot punches through;
 * `retain` the fraction of damage it keeps per pierced body (rank softens the
 * falloff, capped). Read in `stepWeapon` (stamped on the hero's shots). */
export function talentPiercing(
  state: GameState,
): { pierce: number; retain: number } | null {
  const proc = procTalent(state, "piercing");
  if (!proc) return null;
  const c = proc.block;
  return {
    pierce: proc.rank * c.piercePerRank,
    retain: Math.min(
      c.retainCap,
      c.retainBase + c.retainPerRank * (proc.rank - 1),
    ),
  };
}

/** CONCUSSIVE ROUNDS' live numbers, or null when untrained (the carrier's
 * `concussive` block). `chance` shoves the struck foe (rank-scaled, capped);
 * `distance` the flat push (world px, role-scaled at the read site). Read on the
 * hero's surviving ranged hits (`applyRangedShotProcs`). */
export function talentConcussive(
  state: GameState,
): { chance: number; distance: number } | null {
  const proc = procTalent(state, "concussive");
  if (!proc) return null;
  const c = proc.block;
  return {
    chance: Math.min(c.chanceCap, proc.rank * c.chancePerRank * talentPower()),
    distance: c.distance + c.distancePerRank * (proc.rank - 1),
  };
}

/** CRIPPLING SHOT's live numbers, or null when untrained (the carrier's
 * `crippling` block). `chance` slows the struck foe (rank-scaled, capped);
 * `slowFactor` the speed multiplier while slowed; `slowMs` its duration (rank
 * lengthens it). Read on the hero's ranged hits (`applyRangedShotProcs`). */
export function talentCrippling(
  state: GameState,
): { chance: number; slowFactor: number; slowMs: number } | null {
  const proc = procTalent(state, "crippling");
  if (!proc) return null;
  const c = proc.block;
  return {
    chance: Math.min(c.chanceCap, proc.rank * c.chancePerRank * talentPower()),
    slowFactor: c.slowFactor,
    slowMs: c.slowMs + c.slowMsPerRank * (proc.rank - 1),
  };
}

/** VOLLEY's live numbers, or null when untrained (the carrier's `volley`
 * block). `chance` fires extra projectiles on a pull (rank-scaled, capped);
 * `extra` the pellet count added (the bigger figure from `bonusFromRank`);
 * `spreadDeg` fans them. Read once per pull in `stepWeapon`. */
export function talentVolley(
  state: GameState,
): { chance: number; extra: number; spreadDeg: number } | null {
  const proc = procTalent(state, "volley");
  if (!proc) return null;
  const c = proc.block;
  return {
    chance: Math.min(c.chanceCap, proc.rank * c.chancePerRank * talentPower()),
    extra: proc.rank >= c.bonusFromRank ? c.bonusExtra : c.extra,
    spreadDeg: c.spreadDeg,
  };
}

/** SPRING HEELS' jump modifiers (the carrier's `springHeels` block): a
 * takeoff-speed MULTIPLIER (1 when untrained) and a jump-cost MULTIPLIER (< 1
 * only from `costReductionRank`). Read in `stepPlayer`. */
export function talentJumpMods(state: GameState): {
  velocityMult: number;
  costMult: number;
} {
  const proc = procTalent(state, "springHeels");
  if (!proc) return { velocityMult: 1, costMult: 1 };
  const c = proc.block;
  return {
    velocityMult: 1 + c.velocityPerRank * proc.rank,
    costMult: proc.rank >= c.costReductionRank ? 1 - c.jumpCostReduction : 1,
  };
}

/** EVASION's mastery speed-burst MULTIPLIER while the burst window is live (the
 * carrier's `evasionBurst` block; `player.evasionBurstMs > 0`), 1 otherwise.
 * Read in `playerSpeed`; the window is armed on a dodge in the struck path. */
export function talentEvasionBurstMult(state: GameState): number {
  if ((state.players[0].evasionBurstMs ?? 0) <= 0) return 1;
  return procTalent(state, "evasionBurst")?.block.speedMult ?? 1;
}

/** EVASION's mastery burst duration (ms), or 0 when the mastery rank isn't
 * owned — armed on a dodge in the struck path (the carrier's `evasionBurst`
 * block). */
export function talentEvasionBurstMs(state: GameState): number {
  const proc = procTalent(state, "evasionBurst");
  if (!proc) return 0;
  return proc.rank >= proc.block.rank ? proc.block.ms : 0;
}
