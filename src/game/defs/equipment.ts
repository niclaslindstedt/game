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
  /**
   * Attacks before a dropped instance of this weapon breaks. The player's
   * own starting sidearm is minted without durability and never breaks.
   */
  durability: number;
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
    // A deliberate starting cadence: each shot is an event the player can
    // follow, and the first weapon drop is a felt upgrade. Two shots per
    // wisp — the sidearm holds the line, it doesn't erase it.
    damage: 8,
    cooldownMs: 650,
    range: 260,
    durability: 150,
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
    durability: 160,
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
    durability: 160,
    icon: "icon_wrench",
  },
  // The plain drop pool — simple, unnamed base types Diablo-style. Tier
  // affixes (MAGIC …) are what make one PIPE better than another.
  pipe: {
    id: "pipe",
    name: "PIPE",
    class: "melee",
    damage: 16,
    cooldownMs: 320,
    range: 40,
    durability: 180,
    icon: "icon_pipe",
  },
  hammer: {
    id: "hammer",
    name: "HAMMER",
    class: "melee",
    damage: 34,
    cooldownMs: 640,
    range: 44,
    durability: 120,
    icon: "icon_hammer",
  },
  pistol: {
    id: "pistol",
    name: "PISTOL",
    class: "ranged",
    damage: 7,
    cooldownMs: 400,
    range: 230,
    durability: 200,
    projectile: { speed: 400, radius: 3, lifetimeMs: 800, sprite: "bolt" },
    icon: "icon_pistol",
  },
  rifle: {
    id: "rifle",
    name: "RIFLE",
    class: "ranged",
    damage: 18,
    cooldownMs: 950,
    range: 320,
    durability: 120,
    projectile: { speed: 540, radius: 3, lifetimeMs: 900, sprite: "bolt" },
    icon: "icon_rifle",
  },
  star_wand: {
    id: "star_wand",
    name: "STAR WAND",
    class: "magic",
    damage: 21,
    cooldownMs: 700,
    range: 290,
    durability: 130,
    projectile: { speed: 340, radius: 4, lifetimeMs: 1200, sprite: "spark" },
    icon: "icon_star_wand",
  },
  void_wand: {
    id: "void_wand",
    name: "VOID WAND",
    class: "magic",
    damage: 11,
    cooldownMs: 340,
    range: 260,
    durability: 220,
    projectile: { speed: 360, radius: 4, lifetimeMs: 1000, sprite: "spark" },
    icon: "icon_void_wand",
  },
  // Uniques — never in a level's random weapon pool; they arrive via
  // guaranteed drops (a boss's `loot.items`, a level's `allClearWeapon`).
  machete: {
    id: "machete",
    name: "MACHETE",
    class: "melee",
    damage: 26,
    cooldownMs: 380,
    range: 46,
    durability: 220,
    icon: "icon_machete",
  },
  moons_blade: {
    id: "moons_blade",
    name: "MOON'S BLADE",
    class: "melee",
    damage: 32,
    cooldownMs: 400,
    range: 48,
    durability: 260,
    icon: "icon_moons_blade",
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
  "speed",
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
