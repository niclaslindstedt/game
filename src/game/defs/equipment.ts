// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The equipment catalog: weapon defs, gear defs, the tier ladder, and the
// affix pools that magic+ items roll from. Levels pick which defs can drop
// via their loot pools and which tiers are unlocked via their tier chances —
// so growing this file to hundreds of items never touches the engine.

import type { EquipSlot, StatName, Tier, WeaponClass } from "../types.ts";

// ---- Tiers -----------------------------------------------------------------

/**
 * The full quality ladder, defined engine-wide from day one. The moon level
 * only unlocks regular+magic; later levels raise epic/legendary chances in
 * their loot tables. `affixCount` is how many bonuses an item of that tier
 * rolls.
 */
export const TIERS: Record<Tier, { prefix: string; affixCount: number }> = {
  regular: { prefix: "", affixCount: 0 },
  magic: { prefix: "MAGIC ", affixCount: 1 },
  epic: { prefix: "EPIC ", affixCount: 2 },
  legendary: { prefix: "LEGENDARY ", affixCount: 3 },
};

/** Roll order: try the best tier first, fall through to regular. */
export const TIER_ROLL_ORDER: Tier[] = ["legendary", "epic", "magic"];

// ---- Weapons ----------------------------------------------------------------

export type WeaponDef = {
  id: string;
  name: string;
  /** Governs which stat scales it: melee=STR, ranged=DEX, magic=INT. */
  class: WeaponClass;
  damage: number;
  cooldownMs: number;
  range: number;
  /** Melee weapons hit directly and omit this. */
  projectile?: {
    speed: number;
    radius: number;
    lifetimeMs: number;
    /** Sprite the renderer draws for the shot. */
    sprite: string;
  };
  /** Inventory icon sprite. */
  icon: string;
};

export const WEAPON_DEFS: Record<string, WeaponDef> = {
  blaster: {
    id: "blaster",
    name: "BLASTER",
    class: "ranged",
    damage: 10,
    cooldownMs: 380,
    range: 260,
    projectile: { speed: 420, radius: 3, lifetimeMs: 900, sprite: "bolt" },
    icon: "icon_blaster",
  },
  wand: {
    id: "wand",
    name: "WAND",
    class: "magic",
    damage: 15,
    cooldownMs: 500,
    range: 300,
    projectile: { speed: 320, radius: 4, lifetimeMs: 1300, sprite: "spark" },
    icon: "icon_wand",
  },
  wrench: {
    id: "wrench",
    name: "WRENCH",
    class: "melee",
    damage: 22,
    cooldownMs: 420,
    range: 42,
    icon: "icon_wrench",
  },
};

// ---- Gear -------------------------------------------------------------------

export type GearDef = {
  id: string;
  name: string;
  slot: Exclude<EquipSlot, "weapon">;
  /** Flat bonuses baked into the item before tier affixes. */
  bonuses: { maxHp?: number; critChance?: number };
  /** Inventory icon sprite. */
  icon: string;
};

export const GEAR_DEFS: Record<string, GearDef> = {
  suit_plating: {
    id: "suit_plating",
    name: "SUIT PLATING",
    slot: "suit",
    bonuses: { maxHp: 20 },
    icon: "icon_suit",
  },
  moon_charm: {
    id: "moon_charm",
    name: "MOON CHARM",
    slot: "charm",
    bonuses: { critChance: 0.03 },
    icon: "icon_charm",
  },
};

// ---- Affixes ------------------------------------------------------------------

export type AffixDef = {
  kind: "damagePct" | "maxHp" | "crit" | "stat";
  /** Rolled uniformly; `stat` affixes use the integer value as points. */
  range: [number, number];
  /** Relative weight within the pool. */
  weight: number;
};

/** What magic+ items can roll, per slot family. */
export const AFFIX_POOLS: Record<"weapon" | "gear", AffixDef[]> = {
  weapon: [
    { kind: "damagePct", range: [0.15, 0.35], weight: 7 },
    { kind: "crit", range: [0.03, 0.06], weight: 3 },
  ],
  gear: [
    { kind: "maxHp", range: [10, 30], weight: 4 },
    { kind: "crit", range: [0.03, 0.06], weight: 3 },
    { kind: "stat", range: [1, 1], weight: 3 },
  ],
};

export const STAT_NAMES: StatName[] = [
  "health",
  "strength",
  "dexterity",
  "intelligence",
  "luck",
];

// ---- Lookups -------------------------------------------------------------------

/** Look up a weapon def; throws on a broken id so bugs surface loudly. */
export function weaponDef(defId: string): WeaponDef {
  const def = WEAPON_DEFS[defId];
  if (!def) throw new Error(`unknown weapon def "${defId}"`);
  return def;
}

/** Look up a gear def; throws on a broken id so bugs surface loudly. */
export function gearDef(defId: string): GearDef {
  const def = GEAR_DEFS[defId];
  if (!def) throw new Error(`unknown gear def "${defId}"`);
  return def;
}

/** True when the def id names a weapon (vs a piece of gear). */
export function isWeaponDef(defId: string): boolean {
  return defId in WEAPON_DEFS;
}

/** The display name of an equipment def, without tier prefix. */
export function equipmentBaseName(defId: string): string {
  return isWeaponDef(defId) ? weaponDef(defId).name : gearDef(defId).name;
}

/** The icon sprite of an equipment def. */
export function equipmentIcon(defId: string): string {
  return isWeaponDef(defId) ? weaponDef(defId).icon : gearDef(defId).icon;
}
