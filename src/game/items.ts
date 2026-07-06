// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Equipment instances, loot rolls, the inventory, and derived player stats.
// Items are rolled from the catalogs in defs/equipment.ts against the
// running level's loot table. The inventory mutators (`equipFromInventory`,
// `unequipToInventory`, `moveInventoryItem`, `allocateStat`) are the engine
// surface the app's drag-and-drop UI and level-up chooser call into — they
// are safe to invoke from outside `step()` because they only touch the
// player.

import type { Rng } from "@game/lib/rng.ts";
import { randomRange } from "@game/lib/rng.ts";
import { LOOT, PLAYER, STATS } from "./config.ts";
import {
  AFFIX_POOLS,
  gearDef,
  isWeaponDef,
  STAT_NAMES,
  TIER_ROLL_ORDER,
  TIERS,
  weaponDef,
  type AffixDef,
  equipmentBaseName,
} from "./defs/equipment.ts";
import { levelDef } from "./defs/levels.ts";
import type {
  Affix,
  EquipSlot,
  Equipment,
  GameState,
  StatName,
  Tier,
  WeaponClass,
} from "./types.ts";

/** The stat that governs each weapon class's damage. */
export const CLASS_STAT: Record<WeaponClass, StatName> = {
  melee: "strength",
  ranged: "dexterity",
  magic: "intelligence",
};

/** Display name of an equipment instance: tier prefix + catalog name. */
export function equipmentName(equipment: Equipment): string {
  return TIERS[equipment.tier].prefix + equipmentBaseName(equipment.defId);
}

// ---- Loot rolls --------------------------------------------------------------

function pickWeighted<T extends { weight: number }>(rng: Rng, pool: T[]): T {
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return pool[pool.length - 1] as T;
}

function rollAffix(rng: Rng, def: AffixDef): Affix {
  const [min, max] = def.range;
  switch (def.kind) {
    case "damagePct":
      return { kind: "damagePct", value: randomRange(rng, min, max) };
    case "crit":
      return { kind: "crit", value: randomRange(rng, min, max) };
    case "maxHp":
      return { kind: "maxHp", value: Math.round(randomRange(rng, min, max)) };
    case "stat":
      return {
        kind: "stat",
        value: Math.round(randomRange(rng, min, max)),
        stat: STAT_NAMES[Math.floor(rng() * STAT_NAMES.length)] as StatName,
      };
  }
}

/**
 * Roll the tier for a drop: best tier first, each gated by the level's loot
 * table (absent = cannot drop on this level), sweetened by LUCK and any
 * per-enemy bonus.
 */
function rollTier(state: GameState, tierBonus: number): Tier {
  const chances = levelDef(state.level.id).loot.tierChances;
  const luckBonus =
    effectiveStat(state, "luck") * STATS.tierChancePerLuck + tierBonus;
  for (const tier of TIER_ROLL_ORDER) {
    const base = chances[tier];
    if (base === undefined) continue;
    if (state.rng() < base + luckBonus) return tier;
  }
  return "regular";
}

/**
 * Roll a fresh equipment instance from the level's loot pools. Tier affix
 * counts come from the tier ladder (regular 0, magic 1, epic 2, legendary
 * 3); affix kinds never repeat on one item.
 */
export function rollEquipment(
  state: GameState,
  opts: { slot?: "weapon" | "gear"; tierBonus?: number } = {},
): Equipment {
  const rng = state.rng;
  const loot = levelDef(state.level.id).loot;
  const family =
    opts.slot ?? (rng() < 0.6 ? ("weapon" as const) : ("gear" as const));
  const pool = family === "weapon" ? loot.weaponPool : loot.gearPool;
  const defId = pool[Math.floor(rng() * pool.length)] as string;
  const slot: EquipSlot = family === "weapon" ? "weapon" : gearDef(defId).slot;

  const tier = rollTier(state, opts.tierBonus ?? 0);
  const affixes: Affix[] = [];
  const available = [...AFFIX_POOLS[family]];
  for (let i = 0; i < TIERS[tier].affixCount && available.length > 0; i++) {
    const affixDef = pickWeighted(rng, available);
    available.splice(available.indexOf(affixDef), 1);
    affixes.push(rollAffix(rng, affixDef));
  }

  return { id: state.nextId++, defId, slot, tier, affixes };
}

// ---- Derived stats -----------------------------------------------------------

function equippedPieces(state: GameState): Equipment[] {
  const { weapon, suit, charm } = state.player.equipment;
  return [weapon, suit, charm].filter((e): e is Equipment => e !== null);
}

/** Stat points from level-ups plus any equipped `+N <stat>` affixes. */
export function effectiveStat(state: GameState, stat: StatName): number {
  let value = state.player.stats[stat];
  for (const piece of equippedPieces(state)) {
    for (const affix of piece.affixes) {
      if (affix.kind === "stat" && affix.stat === stat) value += affix.value;
    }
  }
  return value;
}

/** Max hp from base + HEALTH stat + gear bonuses and affixes. */
export function computeMaxHp(state: GameState): number {
  let max =
    PLAYER.maxHp + effectiveStat(state, "health") * STATS.healthPerPoint;
  for (const piece of equippedPieces(state)) {
    if (!isWeaponDef(piece.defId)) {
      max += gearDef(piece.defId).bonuses.maxHp ?? 0;
    }
    for (const affix of piece.affixes) {
      if (affix.kind === "maxHp") max += affix.value;
    }
  }
  return max;
}

/**
 * Re-derive max hp after stats or equipment changed. Gaining max hp raises
 * current hp by the same amount (a level-up or a fresh suit feels good);
 * losing it only clamps.
 */
export function recomputeMaxHp(state: GameState): void {
  const player = state.player;
  const next = computeMaxHp(state);
  const delta = next - player.maxHp;
  player.maxHp = next;
  player.hp = delta > 0 ? player.hp + delta : Math.min(player.hp, next);
}

/** The player's crit chance: base + LUCK + gear bonuses and affixes. */
export function playerCritChance(state: GameState): number {
  let chance =
    STATS.baseCritChance +
    effectiveStat(state, "luck") * STATS.critChancePerLuck;
  for (const piece of equippedPieces(state)) {
    if (!isWeaponDef(piece.defId)) {
      chance += gearDef(piece.defId).bonuses.critChance ?? 0;
    }
    for (const affix of piece.affixes) {
      if (affix.kind === "crit") chance += affix.value;
    }
  }
  return chance;
}

/** Enemy crit chance against the player, after LUCK's avoidance. */
export function enemyCritChance(state: GameState, base: number): number {
  return Math.max(
    0,
    base - effectiveStat(state, "luck") * STATS.critAvoidPerLuck,
  );
}

/** Chance a regular monster drops loot, after LUCK. */
export function dropChance(state: GameState): number {
  return (
    LOOT.dropChance + effectiveStat(state, "luck") * STATS.dropChancePerLuck
  );
}

/** The equipped weapon's per-hit damage before the crit roll. */
export function weaponDamage(state: GameState): number {
  const weapon = state.player.equipment.weapon;
  const def = weaponDef(weapon.defId);
  const stat = effectiveStat(state, CLASS_STAT[def.class]);
  let multiplier = 1 + stat * STATS.damageBonusPerPoint;
  for (const affix of weapon.affixes) {
    if (affix.kind === "damagePct") multiplier += affix.value;
  }
  return def.damage * multiplier;
}

// ---- Inventory mutations (called by the app's UI) ------------------------------

/**
 * Equip the item in inventory cell `index`, swapping whatever occupied its
 * slot back into that cell. Returns false on an empty cell.
 */
export function equipFromInventory(state: GameState, index: number): boolean {
  const player = state.player;
  const item = player.inventory[index];
  if (!item) return false;
  const slot = item.slot;
  const previous =
    slot === "weapon" ? player.equipment.weapon : player.equipment[slot];
  player.inventory[index] = previous ?? null;
  if (slot === "weapon") {
    player.equipment.weapon = item;
    player.weaponCooldownMs = 0;
  } else {
    player.equipment[slot] = item;
  }
  recomputeMaxHp(state);
  return true;
}

/**
 * Move an equipped piece back into the first free inventory cell. The weapon
 * slot can never be emptied — the character always fights with something —
 * so weapons only leave via an `equipFromInventory` swap.
 */
export function unequipToInventory(state: GameState, slot: EquipSlot): boolean {
  if (slot === "weapon") return false;
  const player = state.player;
  const item = player.equipment[slot];
  if (!item) return false;
  const free = player.inventory.indexOf(null);
  if (free === -1) return false;
  player.inventory[free] = item;
  player.equipment[slot] = null;
  recomputeMaxHp(state);
  return true;
}

/** Swap two inventory cells (drag-to-rearrange). */
export function moveInventoryItem(
  state: GameState,
  from: number,
  to: number,
): void {
  const inv = state.player.inventory;
  if (from === to || !(from in inv) || !(to in inv)) return;
  const a = inv[from] ?? null;
  inv[from] = inv[to] ?? null;
  inv[to] = a;
}

/** Add loot to the first free cell; false (and no mutation) when full. */
export function addToInventory(state: GameState, item: Equipment): boolean {
  const free = state.player.inventory.indexOf(null);
  if (free === -1) return false;
  state.player.inventory[free] = item;
  return true;
}

// ---- Level-ups -------------------------------------------------------------------

/**
 * Spend one pending stat point. When the last point is spent the `levelup`
 * pause lifts and play resumes.
 */
export function allocateStat(state: GameState, stat: StatName): boolean {
  const player = state.player;
  if (player.pendingStatPoints <= 0) return false;
  player.stats[stat]++;
  player.pendingStatPoints--;
  recomputeMaxHp(state);
  if (player.pendingStatPoints === 0 && state.phase === "levelup") {
    state.phase = "playing";
  }
  return true;
}

// ---- Phase toggles (called by the app's UI) -----------------------------------

/** Dismiss the story intro and start the run. */
export function dismissIntro(state: GameState): void {
  if (state.phase === "intro") state.phase = "playing";
}

/** Pause into the bag. Only possible mid-run. */
export function openInventory(state: GameState): void {
  if (state.phase === "playing") state.phase = "inventory";
}

/** Close the bag and resume (pending level-ups take priority). */
export function closeInventory(state: GameState): void {
  if (state.phase !== "inventory") return;
  state.phase = state.player.pendingStatPoints > 0 ? "levelup" : "playing";
}
