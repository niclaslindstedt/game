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
  // ---- SpaceZ HQ (level 1): whatever the office and the lab left lying
  // around. Numbers sit a notch under the moon pool — this is the run where
  // a MAGIC KEYBOARD is a genuine find.
  stapler: {
    id: "stapler",
    name: "STAPLER",
    class: "ranged",
    damage: 6,
    cooldownMs: 380,
    range: 210,
    durability: 140,
    projectile: { speed: 380, radius: 3, lifetimeMs: 800, sprite: "staple" },
    icon: "icon_stapler",
  },
  keyboard: {
    id: "keyboard",
    name: "KEYBOARD",
    class: "melee",
    damage: 13,
    cooldownMs: 300,
    range: 38,
    // Keyboards were not built for this. Keys everywhere.
    durability: 100,
    icon: "icon_keyboard",
  },
  mop: {
    id: "mop",
    name: "MOP",
    class: "melee",
    // The janitor's reach weapon: weak per swing, but it keeps the crowd at
    // arm's length — the longest melee range in the building.
    damage: 11,
    cooldownMs: 260,
    range: 52,
    durability: 160,
    icon: "icon_mop",
  },
  fire_extinguisher: {
    id: "fire_extinguisher",
    name: "FIRE EXTINGUISHER",
    class: "melee",
    damage: 28,
    cooldownMs: 680,
    range: 42,
    durability: 110,
    icon: "icon_extinguisher",
  },
  taser: {
    id: "taser",
    name: "TASER",
    class: "ranged",
    // Security issue: hits hard for its cadence but only across a desk —
    // the short lifetime caps the reach well inside other ranged arms.
    damage: 11,
    cooldownMs: 480,
    range: 150,
    durability: 150,
    projectile: { speed: 460, radius: 3, lifetimeMs: 400, sprite: "zap" },
    icon: "icon_taser",
  },
  laser_pointer: {
    id: "laser_pointer",
    name: "LASER POINTER",
    class: "magic",
    damage: 9,
    cooldownMs: 280,
    range: 300,
    durability: 180,
    projectile: { speed: 520, radius: 3, lifetimeMs: 900, sprite: "ray" },
    icon: "icon_laser_pointer",
  },
  beaker: {
    id: "beaker",
    name: "BEAKER",
    class: "magic",
    // Something unlabeled from the lab shelf. Throws slow, hits like it.
    damage: 17,
    cooldownMs: 620,
    range: 230,
    durability: 90,
    projectile: { speed: 300, radius: 4, lifetimeMs: 1100, sprite: "vial" },
    icon: "icon_beaker",
  },
  // ---- The moon (level 2) pool.
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
  // guaranteed drops (a boss's `loot.items`, a level's `allClearWeapon`,
  // a level's `earlyWeapon`).
  security_baton: {
    id: "security_baton",
    name: "SECURITY BATON",
    class: "melee",
    // HQ's guaranteed early drop: a real weapon within the first dozens of
    // kills, so the run's melee spine arrives before the crowd thickens.
    damage: 18,
    cooldownMs: 360,
    range: 42,
    durability: 220,
    icon: "icon_baton",
  },
  golden_stapler: {
    id: "golden_stapler",
    name: "GOLDEN STAPLER",
    class: "ranged",
    // The all-clear trophy: the CEO's desk ornament, and somehow the best
    // stapler in the building.
    damage: 14,
    cooldownMs: 280,
    range: 240,
    durability: 260,
    projectile: { speed: 420, radius: 3, lifetimeMs: 850, sprite: "staple" },
    icon: "icon_golden_stapler",
  },
  plasma_cutter: {
    id: "plasma_cutter",
    name: "PLASMA CUTTER",
    class: "melee",
    // MUSKRAT's hoard piece — cleanroom tooling rated for rocket hulls.
    damage: 26,
    cooldownMs: 340,
    range: 44,
    durability: 260,
    icon: "icon_plasma_cutter",
  },
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
  // ---- Elite signatures — one per unique story mob, arriving via that
  // elite's guaranteed drop. Tuned a clear notch above the level's random
  // pool but under the boss trophies, so the plot fights pay in power too.
  executive_putter: {
    id: "executive_putter",
    name: "EXECUTIVE PUTTER",
    class: "melee",
    // The NIGHT MANAGER's back-nine special: crisp tempo, real reach.
    damage: 21,
    cooldownMs: 380,
    range: 46,
    durability: 200,
    icon: "icon_putter",
  },
  riot_taser: {
    id: "riot_taser",
    name: "RIOT TASER",
    class: "ranged",
    // The CHIEF's issue model: the desk taser with the export firmware.
    damage: 13,
    cooldownMs: 420,
    range: 220,
    durability: 190,
    projectile: { speed: 480, radius: 3, lifetimeMs: 550, sprite: "zap" },
    icon: "icon_riot_taser",
  },
  overclocked_laser: {
    id: "overclocked_laser",
    name: "OVERCLOCKED LASER",
    class: "magic",
    // DR. NOVA's conference pointer, three safety screws short of legal.
    damage: 12,
    cooldownMs: 260,
    range: 300,
    durability: 200,
    projectile: { speed: 540, radius: 3, lifetimeMs: 900, sprite: "ray" },
    icon: "icon_overclocked_laser",
  },
  wet_floor_sign: {
    id: "wet_floor_sign",
    name: "WET FLOOR SIGN",
    class: "melee",
    // THE JANITOR's halberd: light, fast, and the longest reach on level 1.
    damage: 15,
    cooldownMs: 240,
    range: 54,
    durability: 200,
    icon: "icon_floor_sign",
  },
  flare_gun: {
    id: "flare_gun",
    name: "FLARE GUN",
    class: "ranged",
    // The MISSION SPECIALIST's survival kit piece: slow, bright, brutal.
    damage: 22,
    cooldownMs: 800,
    range: 300,
    durability: 160,
    projectile: { speed: 300, radius: 4, lifetimeMs: 1200, sprite: "fireball" },
    icon: "icon_flare_gun",
  },
  core_drill: {
    id: "core_drill",
    name: "CORE DRILL",
    class: "melee",
    // The PROSPECTOR's tunneler — chews rock, chews ghosts.
    damage: 21,
    cooldownMs: 330,
    range: 42,
    durability: 240,
    icon: "icon_core_drill",
  },
  geiger_wand: {
    id: "geiger_wand",
    name: "GEIGER WAND",
    class: "magic",
    // The MEDIC's screening probe, clicking well past the safe band.
    damage: 16,
    cooldownMs: 380,
    range: 290,
    durability: 200,
    projectile: { speed: 380, radius: 4, lifetimeMs: 1000, sprite: "spark" },
    icon: "icon_geiger_wand",
  },
  surveyors_pick: {
    id: "surveyors_pick",
    name: "SURVEYOR'S PICK",
    class: "melee",
    // THE CARTOGRAPHER's stake hammer: heavy arcs, deep dents.
    damage: 24,
    cooldownMs: 450,
    range: 44,
    durability: 220,
    icon: "icon_surveyors_pick",
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
  /**
   * The EVA space suit: equipping it turns the plain-clothes hero into the
   * astronaut (the renderer swaps his sprite). Only the SpaceZ suit sets
   * this; ordinary armor leaves the hero's look alone.
   */
  spacesuit?: boolean;
};

export const GEAR_DEFS: Record<string, GearDef> = {
  lab_coat: {
    id: "lab_coat",
    name: "LAB COAT",
    slot: "suit",
    bonuses: { maxHp: 15 },
    icon: "icon_lab_coat",
  },
  id_badge: {
    id: "id_badge",
    name: "ID BADGE",
    slot: "charm",
    // All-areas access reads as luck: doors you should not have opened.
    bonuses: { critChance: 0.03 },
    icon: "icon_badge",
  },
  suit_plating: {
    id: "suit_plating",
    name: "SUIT PLATING",
    slot: "suit",
    bonuses: { maxHp: 20 },
    icon: "icon_suit",
  },
  // The prize of SpaceZ HQ: the EVA suit the hero needs to follow Ada
  // off-planet. An epic drop that both armors him and, once worn, makes him
  // the astronaut he is for the rest of the game.
  space_suit: {
    id: "space_suit",
    name: "SPACE SUIT",
    slot: "suit",
    bonuses: { maxHp: 40 },
    icon: "icon_suit",
    spacesuit: true,
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

// Active registries the accessors read (default to the shipped catalogs;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeWeaponDefs: Record<string, WeaponDef> = WEAPON_DEFS;
let activeGearDefs: Record<string, GearDef> = GEAR_DEFS;

/** Test/authoring hook: replace the active weapon + gear catalogs. */
export function setEquipmentDefs(defs: {
  weapons: Record<string, WeaponDef>;
  gear: Record<string, GearDef>;
}): void {
  activeWeaponDefs = defs.weapons;
  activeGearDefs = defs.gear;
}

/** Look up a weapon def; throws on a broken id so bugs surface loudly. */
export function weaponDef(defId: string): WeaponDef {
  const def = activeWeaponDefs[defId];
  if (!def) throw new Error(`unknown weapon def "${defId}"`);
  return def;
}

/** Look up a gear def; throws on a broken id so bugs surface loudly. */
export function gearDef(defId: string): GearDef {
  const def = activeGearDefs[defId];
  if (!def) throw new Error(`unknown gear def "${defId}"`);
  return def;
}

/** True when the def id names a weapon (vs a piece of gear). */
export function isWeaponDef(defId: string): boolean {
  return defId in activeWeaponDefs;
}

/** The display name of an equipment def, without tier prefix. */
export function equipmentBaseName(defId: string): string {
  return isWeaponDef(defId) ? weaponDef(defId).name : gearDef(defId).name;
}

/** The icon sprite of an equipment def. */
export function equipmentIcon(defId: string): string {
  return isWeaponDef(defId) ? weaponDef(defId).icon : gearDef(defId).icon;
}
