// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Pure COMPANION stat / level / power math (config + def only — no engine
// state). Kept in its own module so every reader can share it without a cycle:
// the per-tick pass (`companions.ts`), the kill rail that credits a companion's
// XP (`loot.ts`), the party's magic-find aura (`items.ts`), and the loadout
// carry (`arrival.ts`) all import from here, while none of THIS module's
// imports (config, the level XP unit, the companion catalog type) reach back.
//
// A companion earns its OWN levels from its OWN kills, decoupled from the hero
// (config `COMPANIONS.levelKills`): hp, damage, and its signature POWER all
// grow with that level, and the level rides the loadout so it persists across
// every level AND difficulty — a companion levels up forever. The POWER is the
// signature trick a `CompanionDef.power` grants: it gains a RANK every
// `power.everyLevels` levels, and each rank adds pellets / chain arcs / nova
// reach / magic find on top of the base kit.

import { COMPANIONS } from "./config.ts";
import type { CompanionDef } from "./defs/companions.ts";
import { referenceMobXp } from "./leveling.ts";

/** A companion's max hp at its own `level` — the base hp grown by
 * `COMPANIONS.hpPerLevel` per level past the first. */
export function companionMaxHp(def: CompanionDef, level: number): number {
  return Math.round(
    def.hp * (1 + COMPANIONS.hpPerLevel * (Math.max(1, level) - 1)),
  );
}

/**
 * The XP a companion needs to cross OUT of `level` (from L to L+1). Authored in
 * KILLS like the hero's curve (`xpToLevelUp`): `COMPANIONS.levelKills` of a
 * reference-mob's worth of XP (`referenceMobXp`), grown geometrically by
 * `levelKillsGrowth` per level. The per-kill reward is the same figure the hero
 * earns (`enemyKillXp`), so the count reads in real kills and scales with the
 * difficulty exactly as the hero's does.
 */
export function companionXpToLevelUp(level: number): number {
  const l = Math.max(1, level);
  const kills =
    COMPANIONS.levelKills * Math.pow(COMPANIONS.levelKillsGrowth, l - 1);
  return Math.max(1, Math.round(kills * referenceMobXp(l)));
}

/**
 * The POWER RANK a companion of `level` has reached: one rank every
 * `power.everyLevels` levels, starting at 0. Zero for a companion whose def
 * names no `power` (it still trains — hp/damage — it just never gains a trick).
 */
export function companionPowerRank(def: CompanionDef, level: number): number {
  if (!def.power) return 0;
  return Math.max(
    0,
    Math.floor((Math.max(1, level) - 1) / def.power.everyLevels),
  );
}

/**
 * The bonus a companion's power adds to its WEAPON shots at `level`: extra
 * pellets, chain arcs, and pierce, each `perRank` value times the current rank.
 * Added on top of the weapon's own `projectile` spec in `companionAttack`, so a
 * coil with no base chain still learns to arc once Tesla ranks up.
 */
export function companionProjectileBonus(
  def: CompanionDef,
  level: number,
): { pellets: number; chain: number; pierce: number } {
  const rank = companionPowerRank(def, level);
  const power = def.power;
  return {
    pellets: rank * (power?.pelletsPerRank ?? 0),
    chain: rank * (power?.chainPerRank ?? 0),
    pierce: rank * (power?.piercePerRank ?? 0),
  };
}

/** A companion's effective FROST NOVA blast radius at `level`: the def's base
 * `nova.radius` widened by `power.novaRadiusPerRank` per rank. 0 with no nova. */
export function companionNovaRadius(def: CompanionDef, level: number): number {
  if (!def.nova) return 0;
  const perRank = def.power?.novaRadiusPerRank ?? 0;
  return def.nova.radius + perRank * companionPowerRank(def, level);
}

/** The flat damage a companion's power ADDS to each nova bite at `level`
 * (`power.novaDamagePerRank` per rank); the base nova damage is grown with the
 * companion's level separately (`companionNovaDamage`). 0 with no power. */
export function companionNovaBonusDamage(
  def: CompanionDef,
  level: number,
): number {
  const perRank = def.power?.novaDamagePerRank ?? 0;
  return perRank * companionPowerRank(def, level);
}

/**
 * A companion's effective party MAGIC FIND aura at `level`: the def's base
 * `aura.magicFind` plus `power.magicFindPerRank` per rank — so LUCKY's luck
 * swells as he levels. 0 for a companion with neither.
 */
export function companionAuraMagicFind(
  def: CompanionDef,
  level: number,
): number {
  const base = def.aura?.magicFind ?? 0;
  const perRank = def.power?.magicFindPerRank ?? 0;
  return base + perRank * companionPowerRank(def, level);
}
