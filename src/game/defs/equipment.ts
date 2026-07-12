// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The equipment catalog: weapon defs, gear defs, the tier ladder, and the
// affix pools that magic+ items roll from. Levels pick which defs can drop
// via their loot pools; WHEN a base can drop is its own `levelReq` against
// the killer's monster level, and WHEN a tier can drop is the mlvl gate in
// config LOOT.tierUnlockMlvl — so growing this file to hundreds of items
// never touches the engine.

import { MELEE, WEAPON } from "../config.ts";
import { GEAR_DEFS, type GearDef } from "./gear.ts";
import { weaponGradeVariants, type Grade } from "./grades.ts";
import type { Affix, Quality, StatName, Tier, WeaponClass } from "../types.ts";

// ---- Tiers -----------------------------------------------------------------

/**
 * The full quality ladder — the Diablo ladder — defined engine-wide from day
 * one. WHEN each tier can drop is the monster-level gate in config
 * `LOOT.tierUnlockMlvl` (magic from mlvl 5, rare from 10, …); harder
 * difficulties sweeten the chances. `affixCount` is how many bonuses an item
 * of that tier rolls — an upper bound, since a family never repeats an affix
 * kind, so a piece can only carry as many as its pool holds. Affix SIZE
 * scales with the item's level (see AFFIX_POOLS), so a rare pays out twice a
 * magic's points at the same ilvl. Unique and legendary are plumbing: their
 * one-of-a-kind defs don't ship yet.
 */
export const TIERS: Record<Tier, { prefix: string; affixCount: number }> = {
  // TRASH never rolls (see TIER_ROLL_ORDER) — only scripted joke drops mint
  // it. No prefix: the defs' own names already read as garbage.
  trash: { prefix: "", affixCount: 0 },
  regular: { prefix: "", affixCount: 0 },
  magic: { prefix: "MAGIC ", affixCount: 1 },
  rare: { prefix: "RARE ", affixCount: 2 },
  unique: { prefix: "UNIQUE ", affixCount: 3 },
  legendary: { prefix: "LEGENDARY ", affixCount: 4 },
};

/** Roll order: try the best tier first, fall through to regular. TRASH is
 * deliberately absent — it never rolls, only scripted drops mint it. */
export const TIER_ROLL_ORDER: Exclude<Tier, "regular" | "trash">[] = [
  "legendary",
  "unique",
  "rare",
  "magic",
];

// ---- Make quality ------------------------------------------------------------

/**
 * The MAKE-QUALITY ladder, worst to best — the second axis every PLAIN
 * (regular-tier) weapon and armor drop rolls (see `rollQuality` in
 * items.ts): the craftsmanship of the individual piece. Craftsmanship and
 * magic are exclusive, the D2 rule — a magic-or-better find is always
 * normal make. The prefix leads the item's display name (BROKEN GLADIUS,
 * PERFECT KEVLAR VEST); the numbers it scales live in config
 * `QUALITY.mults`, the mlvl-shifting odds in `QUALITY.weightsLow/High`.
 */
export const QUALITY_ORDER: readonly Quality[] = [
  "broken",
  "crude",
  "normal",
  "superior",
  "perfect",
];

/** The word each make quality lends an item's name ("" for normal). */
export const QUALITY_PREFIX: Record<Quality, string> = {
  broken: "BROKEN ",
  crude: "CRUDE ",
  normal: "",
  superior: "SUPERIOR ",
  perfect: "PERFECT ",
};

// ---- Weapons ----------------------------------------------------------------

export type WeaponDef = {
  id: string;
  name: string;
  /** Governs which stat scales it: melee=STR, ranged=DEX, magic=INT. */
  class: WeaponClass;
  /**
   * The weapon's AVERAGE per-hit damage — the mean of the range it rolls, not
   * a fixed number. Every blow lands somewhere inside a band centred here
   * (see `damageVariance`): a weapon written at 10 hits for ~8–12. Keeping the
   * def's `damage` the MEAN is deliberate — the whole damage-budget model
   * (budgets, DPS, auto-equip, grade generation) reasons about expected output,
   * so the spread rides on top without shifting any of it.
   */
  damage: number;
  /**
   * The half-width of this weapon's damage range, as a fraction of `damage`:
   * a blow rolls uniformly in `[damage·(1−v), damage·(1+v)]`. Omitted, the
   * global `WEAPON.damageVariance` (±20%) applies. Set a bigger value for a
   * deliberately WILD weapon — a scattergun or a physics-defying gun whose
   * swings-for-the-fences unpredictability is the whole appeal (a blunderbuss
   * at 0.5 hits for anywhere in ±50%) — or a smaller one for a precise,
   * metronomic tool. The average is unchanged whatever the width, so a wide
   * band trades consistency for excitement without breaking the budget.
   */
  damageVariance?: number;
  cooldownMs: number;
  range: number;
  /**
   * The base item's LEVEL REQUIREMENT, Diablo-style. Gates both ends of the
   * economy: this weapon never drops off a monster whose level is below it
   * (see `rollEquipment`), and the player can't wield it until his own level
   * reaches it (see `meetsLevelReq` — an early lucky find waits in the bag).
   * The campaign's power curve is authored here: each level's base pool
   * introduces its five weapons at stepped requirements.
   */
  levelReq: number;
  /**
   * TreasureClass drop weight (D2's `Prob`): the relative odds this base is the
   * one picked from its level's eligible pool. Omitted = 1 (an even pool). Set
   * below 1 to make a base a rarer find, above to make it common.
   */
  dropWeight?: number;
  /**
   * Attacks before a dropped instance of this weapon breaks. The player's
   * own starting sidearm is minted without durability and never breaks.
   */
  durability: number;
  /**
   * Crit-damage multiplier override. Omitted, the cadence rule applies
   * (`weaponCritMult`): fast weapons crit light, slow ones crit heavy — set
   * this only as a deliberate exception to that rule.
   */
  critMult?: number;
  /**
   * Set on a GENERATED base-grade variant (see defs/grades.ts): which rung
   * of the Normal → Exceptional → Elite ladder this def is. Absent on every
   * hand-authored (normal) base.
   */
  grade?: Grade;
  /** A grade variant's normal ancestor — the pool base it was generated
   * from. The budget/stat scripts classify variants through it. */
  gradeBase?: string;
  /**
   * What the piece is made of, for the merchant's scales (config ECONOMY):
   * `metal` melts down and sells for double, `precious` (gold, gems, the
   * genuinely magical) for four times. Omitted = ordinary matter, base value.
   */
  material?: "metal" | "precious";
  /**
   * Melee only: the full angle (degrees) of the swing's cone of effect. Every
   * monster within `range` and inside this arc of the aim is struck at once,
   * so a swing cleaves the crowd. A wide arc is a blade's slash; a narrow arc
   * paired with a long `range` is a spear's thrust, skewering the line ahead
   * rather than sweeping sideways. Defaults to `MELEE.defaultSweepDeg`.
   */
  sweepDeg?: number;
  /** Melee weapons hit directly and omit this. */
  projectile?: {
    speed: number;
    radius: number;
    lifetimeMs: number;
    /** Sprite the renderer draws for the shot. */
    sprite: string;
    /**
     * Pellets per trigger pull (a shotgun's blast). Each pellet is its own
     * projectile carrying the def's full `damage`; the volley fans across
     * `spreadDeg`. Omitted = 1 (a single straight shot).
     */
    count?: number;
    /** Full fan angle (degrees) a multi-pellet volley spreads across. */
    spreadDeg?: number;
    /**
     * How many extra foes the shot punches THROUGH (a railgun's line): the
     * projectile survives this many hits beyond the first before it spends
     * itself. Omitted = 0 (dies on the first body).
     */
    pierce?: number;
    /**
     * Homing turn rate in radians/s: the shot steers toward the nearest foe
     * ahead of it each tick (a smart pistol's self-correcting darts).
     * Omitted = 0 (flies straight).
     */
    homing?: number;
    /**
     * Chain lightning: on a hit, the bolt leaps to this many further foes
     * (nearest first, within `WEAPON.chainRange`), each leap dealing
     * `WEAPON.chainDamageFrac` of the blow before it. Omitted = no chaining.
     */
    chain?: number;
  };
  /** Inventory icon sprite. */
  icon: string;
};

export const WEAPON_DEFS: Record<string, WeaponDef> = {
  // ---- The hero's wall arsenal. ONE of these hangs on his living-room wall
  // the night Ada vanishes — which one is the DIFFICULTY's call
  // (DifficultyDef.startingWeapon; the prelude's per-difficulty variant shows
  // the same piece mounted on the wall) — and it is the one thing he takes
  // with him. All of them are finite (they wear out, pushing the player to
  // scavenge a real weapon) and all of them are the pickup FLOOR: any looted
  // weapon supplants the starter (see isBetterEquipment). The ladder runs
  // from EASY's genuinely decent wand down to the JESUS stick.
  //
  // EASY: a ranged magic starter that holds a lane from safety — the kindest
  // opening loadout in the game. Bought at a licensing discount.
  hairy_potters_wand: {
    id: "hairy_potters_wand",
    name: "HAIRY POTTER'S WAND",
    class: "magic",
    levelReq: 1,
    damage: 14,
    cooldownMs: 550,
    range: 280,
    durability: 150,
    projectile: { speed: 340, radius: 4, lifetimeMs: 1200, sprite: "spark" },
    icon: "icon_hairy_wand",
  },
  // MEDIUM: the baseline the levels are tuned at — a proper blade with a real
  // (if modest) cleave. A slow-ish, heavy swing; DEXTERITY earns the tempo
  // back.
  medieval_sword: {
    id: "medieval_sword",
    material: "metal",
    name: "MEDIEVAL SWORD",
    class: "melee",
    levelReq: 1,
    damage: 18,
    cooldownMs: 720,
    range: 38,
    // A genuine slash: a broad arc that catches a pair of foes per swing —
    // the AoE yardstick the knife (narrower) and knuckles (none) sit under.
    sweepDeg: 100,
    durability: 130,
    icon: "icon_medieval_sword",
  },
  // HARD: quick and mean, but short and SHALLOW — light per-hit damage means
  // most mobs take several stabs, so despite the tempo it holds a crowd worse
  // than the sword (matching DPS, worse control), and its tighter arc and
  // reach mean the fight happens closer and flanks sooner.
  combat_knife: {
    id: "combat_knife",
    material: "metal",
    name: "COMBAT KNIFE",
    class: "melee",
    levelReq: 1,
    damage: 10,
    cooldownMs: 400,
    range: 32,
    sweepDeg: 70,
    durability: 150,
    icon: "icon_combat_knife",
  },
  // NIGHTMARE: one target, real hurt. Each punch lands like a brick — and
  // then nothing for over a second, no cleave at any INT-less swing, and
  // knuckle range means standing INSIDE the horde to throw it.
  brass_knuckles: {
    id: "brass_knuckles",
    material: "metal",
    name: "BRASS KNUCKLES",
    class: "melee",
    levelReq: 1,
    damage: 30,
    cooldownMs: 1100,
    range: 24,
    sweepDeg: 60,
    durability: 170,
    icon: "icon_knuckles",
  },
  // JESUS CHRIST!: a stick. It sweeps a wide, whippy arc — genuine AoE — and
  // each blow means almost nothing. Kite, or perish.
  stick: {
    id: "stick",
    name: "A STICK",
    class: "melee",
    levelReq: 1,
    damage: 7,
    cooldownMs: 520,
    range: 36,
    sweepDeg: 130,
    durability: 100,
    icon: "icon_stick",
  },
  // ---- SPACEZ HQ (level 1) base pool: earthly weapons an American space
  // company keeps around — the office, the security desk, the lab. The base
  // ladder starts here; each entry's `levelReq` is where it enters the drop
  // economy (mobs below it never drop it).
  //
  // The utility knife off a shipping desk: fast, weak, one foe at a time —
  // the base ladder's first rung.
  box_cutter: {
    id: "box_cutter",
    name: "BOX CUTTER",
    class: "melee",
    levelReq: 1,
    damage: 11,
    cooldownMs: 300,
    range: 32,
    sweepDeg: 60,
    durability: 130,
    icon: "icon_box_cutter",
  },
  // A desk drawer's 9mm — this is America, even in the space business.
  nine_mm: {
    id: "nine_mm",
    material: "metal",
    name: "9MM PISTOL",
    class: "ranged",
    levelReq: 2,
    damage: 18,
    cooldownMs: 480,
    range: 230,
    durability: 170,
    projectile: { speed: 420, radius: 3, lifetimeMs: 800, sprite: "bolt" },
    icon: "icon_nine_mm",
  },
  // The guards' telescoping baton: real reach, honest tempo — and the HQ
  // run's scripted second-kill drop, so its levelReq must stay at 1.
  security_baton: {
    id: "security_baton",
    material: "metal",
    name: "SECURITY BATON",
    class: "melee",
    levelReq: 1,
    damage: 4,
    cooldownMs: 400,
    range: 42,
    // A cone-AoE base: light per blow, but the arc catches four at once —
    // the swing "achieves its damage" with a full cleave (budget model).
    sweepDeg: 100,
    durability: 220,
    icon: "icon_baton",
  },
  // A lab bench rig three review meetings from approval. Thin fast beam.
  prototype_laser: {
    id: "prototype_laser",
    name: "PROTOTYPE LASER",
    class: "magic",
    levelReq: 4,
    damage: 18,
    // A calibrated beam: metronomic, near-identical every pulse.
    damageVariance: 0.1,
    cooldownMs: 380,
    range: 300,
    durability: 180,
    projectile: { speed: 520, radius: 3, lifetimeMs: 900, sprite: "ray" },
    icon: "icon_prototype_laser",
  },
  // The break-room magnetron someone in R&D turned into a sidearm: a slow,
  // heavy blue pulse — the pool's second caster, giving an INT build an early
  // option that isn't the thin prototype beam.
  microwave_emitter: {
    id: "microwave_emitter",
    name: "MICROWAVE EMITTER",
    class: "magic",
    levelReq: 6,
    damage: 37,
    // A rebuilt magnetron fires as evenly as its salvaged capacitor allows —
    // which is to say, not very.
    damageVariance: 0.3,
    cooldownMs: 700,
    range: 260,
    durability: 190,
    projectile: { speed: 400, radius: 4, lifetimeMs: 1000, sprite: "spark" },
    icon: "icon_microwave_emitter",
  },
  // The armory's pump gun: slow, brutal, short — five pellets a pull, each
  // carrying the full hit, so a point-blank blast is the building's hardest
  // single swing and a spread at range still stings the crowd.
  pump_shotgun: {
    id: "pump_shotgun",
    material: "metal",
    name: "PUMP SHOTGUN",
    class: "ranged",
    levelReq: 5,
    damage: 11,
    // A scattergun's load is never quite even — each pellet bites for its own
    // number, and the volley as a whole swings wider than a rifled round.
    damageVariance: 0.3,
    cooldownMs: 950,
    range: 150,
    durability: 140,
    projectile: {
      speed: 380,
      radius: 3,
      lifetimeMs: 420,
      sprite: "pellet",
      count: 4,
      spreadDeg: 24,
    },
    icon: "icon_pump_shotgun",
  },
  // The engine's built-in sidearm — never in a pool, minted unbreakable when
  // the holster would otherwise be empty. A deliberate, slow cadence: each
  // shot is an event the player can follow; DEX (and the first weapon drop)
  // is how the fire rate grows back.
  blaster: {
    id: "blaster",
    name: "BLASTER",
    class: "ranged",
    levelReq: 1,
    damage: 8,
    cooldownMs: 900,
    range: 260,
    durability: 150,
    projectile: { speed: 420, radius: 3, lifetimeMs: 900, sprite: "bolt" },
    icon: "icon_blaster",
  },
  // ---- THE MOON (level 2) base pool: what the 70s ferried up — hand tools
  // off the landers and the sidearms of a space race that planned for the
  // worst. Nothing here was made after 1979.
  //
  // The lander's chunky chrome service wrench: heavy, honest, everywhere.
  lunar_wrench: {
    id: "lunar_wrench",
    material: "metal",
    name: "LUNAR WRENCH",
    class: "melee",
    levelReq: 5,
    damage: 23,
    cooldownMs: 480,
    range: 42,
    sweepDeg: 70,
    durability: 180,
    icon: "icon_lunar_wrench",
  },
  // A .38 out of a crew survival kit — the space race packed for bears.
  service_revolver: {
    id: "service_revolver",
    material: "metal",
    name: "SERVICE REVOLVER",
    class: "ranged",
    levelReq: 6,
    damage: 29,
    cooldownMs: 550,
    range: 240,
    durability: 190,
    projectile: { speed: 440, radius: 3, lifetimeMs: 800, sprite: "bolt" },
    icon: "icon_service_revolver",
  },
  // The geologist's pick hammer: slow, spiked, single-minded — a narrow arc
  // that pays its patience back in deep dents.
  geology_hammer: {
    id: "geology_hammer",
    material: "metal",
    name: "GEOLOGY HAMMER",
    class: "melee",
    levelReq: 8,
    damage: 38,
    cooldownMs: 650,
    range: 40,
    sweepDeg: 70,
    durability: 150,
    icon: "icon_geology_hammer",
  },
  // Military surplus that hitched a ride: the longest reach of the 70s pool,
  // one deliberate tracer at a time.
  surplus_carbine: {
    id: "surplus_carbine",
    material: "metal",
    name: "SURPLUS CARBINE",
    class: "ranged",
    levelReq: 9,
    damage: 50,
    cooldownMs: 850,
    range: 320,
    durability: 140,
    projectile: { speed: 560, radius: 3, lifetimeMs: 900, sprite: "bolt" },
    icon: "icon_surplus_carbine",
  },
  // An atomic-age lab prototype, all fins and chrome, straight off a pulp
  // cover. The moon pool's magic capstone.
  retro_raygun: {
    id: "retro_raygun",
    name: "RETRO RAYGUN",
    class: "magic",
    levelReq: 10,
    damage: 40,
    // Atomic-age chrome with a temperamental capacitor — the bolt varies.
    damageVariance: 0.3,
    cooldownMs: 600,
    range: 290,
    durability: 170,
    projectile: { speed: 340, radius: 4, lifetimeMs: 1100, sprite: "ring" },
    icon: "icon_retro_raygun",
  },
  // A survey rod that ticks out a fast, bright pulse — the crews swore the
  // beat was a signal from somewhere. Quick cadence, the moon pool's nimble
  // caster next to the raygun's heavier ring.
  pulsar_rod: {
    id: "pulsar_rod",
    name: "PULSAR ROD",
    class: "magic",
    levelReq: 12,
    damage: 32,
    damageVariance: 0.25,
    cooldownMs: 420,
    range: 280,
    durability: 180,
    projectile: { speed: 380, radius: 4, lifetimeMs: 1100, sprite: "orb" },
    icon: "icon_pulsar_rod",
  },
  // ---- MARS (level 3) base pool: printed overnight by the colony AI.
  // Nothing a human armory would recognize — self-correcting darts, plasma
  // edges, rails. The machines design better weapons than we do.
  //
  // White ceramic, no visible trigger. The darts do the aiming.
  smart_pistol: {
    id: "smart_pistol",
    name: "SMART PISTOL",
    class: "ranged",
    levelReq: 10,
    damage: 26,
    // Machine-perfect fire control — every dart lands within a hair of the last.
    damageVariance: 0.1,
    cooldownMs: 380,
    range: 250,
    durability: 200,
    projectile: {
      speed: 380,
      radius: 3,
      lifetimeMs: 900,
      sprite: "dart",
      homing: 3.5,
    },
    icon: "icon_smart_pistol",
  },
  // A humming magenta edge that cauterizes as it cuts: quick, wide, and
  // genuinely mean in a crowd.
  plasma_blade: {
    id: "plasma_blade",
    name: "PLASMA BLADE",
    class: "melee",
    levelReq: 12,
    damage: 7,
    cooldownMs: 380,
    range: 44,
    sweepDeg: 110,
    durability: 220,
    icon: "icon_plasma_blade",
  },
  // Twin rails and a capacitor bank: one slow slug that refuses to stop at
  // the first body — it holds a whole lane.
  railgun: {
    id: "railgun",
    material: "metal",
    name: "RAILGUN",
    class: "ranged",
    levelReq: 13,
    damage: 18,
    // A magnetically-launched slug at a fixed charge: consistent to the joule.
    damageVariance: 0.1,
    cooldownMs: 1000,
    range: 340,
    durability: 150,
    projectile: {
      speed: 700,
      radius: 3,
      lifetimeMs: 700,
      sprite: "rail",
      pierce: 3,
    },
    icon: "icon_railgun",
  },
  // A fork of blue-white current that refuses to stay in one target.
  arc_projector: {
    id: "arc_projector",
    name: "ARC PROJECTOR",
    class: "magic",
    levelReq: 14,
    damage: 25,
    // Live current never takes quite the same path twice — the jolt varies.
    damageVariance: 0.3,
    cooldownMs: 500,
    range: 280,
    durability: 190,
    projectile: {
      speed: 420,
      radius: 4,
      lifetimeMs: 900,
      sprite: "zap",
      chain: 1,
    },
    icon: "icon_arc_projector",
  },
  // Printed overnight by the colony AI: a black housing cupping a well of bent
  // space. Slow, enormously heavy single hits — the Mars pool's caster answer
  // to the gravity maul, at arm's length.
  graviton_maw: {
    id: "graviton_maw",
    name: "GRAVITON MAW",
    class: "magic",
    levelReq: 18,
    damage: 72,
    // Tidal forces are not a precise art — the well bites for whatever it grips.
    damageVariance: 0.35,
    cooldownMs: 820,
    range: 270,
    durability: 210,
    projectile: { speed: 300, radius: 5, lifetimeMs: 1100, sprite: "glitch" },
    icon: "icon_graviton_maw",
  },
  // A black cube floating on a handle. Swinging it moves the ground more
  // than the arm — the Mars pool's slow, enormous exclamation mark.
  gravity_maul: {
    id: "gravity_maul",
    material: "metal",
    name: "GRAVITY MAUL",
    class: "melee",
    levelReq: 16,
    damage: 14,
    // The shockwave lands as hard as the ground under it decides to buckle —
    // a heavy, wildly swingy slam.
    damageVariance: 0.4,
    cooldownMs: 850,
    range: 46,
    // The full-AoE slam: the shockwave rings the hero all the way around
    // and catches five foes — per-blow damage carries a fifth of the budget.
    sweepDeg: 360,
    durability: 160,
    icon: "icon_gravity_maul",
  },
  // ---- THE RIFT (level 4) base pool: everything history has ever dropped
  // falls through here — antiquity to the age of powder, plus the odd thing
  // history never had.
  //
  // A legionary's short sword, still keen after two thousand years somewhere
  // that didn't have years.
  gladius: {
    id: "gladius",
    material: "metal",
    name: "GLADIUS",
    class: "melee",
    levelReq: 15,
    damage: 37,
    cooldownMs: 420,
    range: 40,
    sweepDeg: 70,
    durability: 240,
    icon: "icon_gladius",
  },
  // An English yew warbow: the longest lane in the game, one feathered
  // arrow at a time.
  longbow: {
    id: "longbow",
    name: "LONGBOW",
    class: "ranged",
    levelReq: 17,
    damage: 68,
    cooldownMs: 800,
    range: 360,
    durability: 180,
    projectile: { speed: 520, radius: 3, lifetimeMs: 1000, sprite: "arrow" },
    icon: "icon_longbow",
  },
  // The shotgun's flared-brass great-grandfather, loaded with whatever fit
  // down the muzzle.
  blunderbuss: {
    id: "blunderbuss",
    material: "metal",
    name: "BLUNDERBUSS",
    class: "ranged",
    levelReq: 19,
    damage: 20,
    // Loaded with whatever fit down the muzzle: gravel, nails, a spare button.
    // The widest, most gleefully unpredictable spread on the ladder.
    damageVariance: 0.5,
    cooldownMs: 1100,
    range: 160,
    durability: 150,
    projectile: {
      speed: 360,
      radius: 3,
      lifetimeMs: 470,
      sprite: "pellet",
      count: 5,
      spreadDeg: 32,
    },
    icon: "icon_blunderbuss",
  },
  // The hooded era's argument-ender: the slowest, hardest melee blow on the
  // ladder.
  executioners_axe: {
    id: "executioners_axe",
    material: "metal",
    name: "EXECUTIONER'S AXE",
    class: "melee",
    levelReq: 21,
    damage: 24,
    // The slowest, hardest chop on the ladder — all-or-nothing, and it rolls
    // like it: a glancing bite or a clean cleave.
    damageVariance: 0.35,
    cooldownMs: 1000,
    range: 46,
    sweepDeg: 100,
    durability: 170,
    icon: "icon_executioners_axe",
  },
  // A gnarled staff with a crystal that predates the concept of physics.
  // The base ladder's magic capstone.
  sorcerers_staff: {
    id: "sorcerers_staff",
    material: "precious",
    name: "SORCERER'S STAFF",
    class: "magic",
    levelReq: 23,
    damage: 72,
    // A crystal older than physics, and about as reliable — the orb hits for
    // whatever the staff feels like channelling.
    damageVariance: 0.35,
    cooldownMs: 650,
    range: 320,
    durability: 200,
    projectile: { speed: 360, radius: 5, lifetimeMs: 1200, sprite: "orb" },
    icon: "icon_sorcerers_staff",
  },
  // A knotted wand crowned with a live flame — the rift's classic caster, a
  // medium-cadence fireball the sorcerer's-staff student grows up alongside.
  ember_wand: {
    id: "ember_wand",
    material: "precious",
    name: "EMBER WAND",
    class: "magic",
    levelReq: 21,
    damage: 58,
    // Fire keeps its own counsel — the flame flares hot or gutters low.
    damageVariance: 0.35,
    cooldownMs: 560,
    range: 300,
    durability: 200,
    projectile: { speed: 320, radius: 4, lifetimeMs: 1000, sprite: "fireball" },
    icon: "icon_ember_wand",
  },
  // The rift's scheduled early caster (earlyDrops) — a special, not a base.
  void_wand: {
    id: "void_wand",
    name: "VOID WAND",
    class: "magic",
    levelReq: 14,
    damage: 41,
    cooldownMs: 420,
    range: 260,
    durability: 220,
    projectile: { speed: 360, radius: 4, lifetimeMs: 1000, sprite: "spark" },
    icon: "icon_void_wand",
  },
  // ---- EASTWORLD (level 5) base pool: the control center's hybrid arsenal —
  // frontier silhouettes printed on ZAI fabricators, dropped by the park's
  // hosts. The pool takes the normal band's top rungs (18 → 23, the ceiling
  // grades unfold from); the hero arrives here around the high teens.
  //
  // A monomolecular lasso off the host-wrangling bench: the widest rope in
  // the west, cracking a whole circle of the crowd at once.
  mono_wire_lariat: {
    id: "mono_wire_lariat",
    material: "metal",
    name: "MONO-WIRE LARIAT",
    class: "melee",
    levelReq: 18,
    damage: 15,
    cooldownMs: 650,
    range: 46,
    // A cracked lasso sweeps wide — a genuine cone AoE, the level's crowd tool.
    sweepDeg: 130,
    durability: 200,
    icon: "icon_lariat",
  },
  // The park's signature sidearm: a six-shooter with a plasma cylinder.
  // Honest cadence, honest damage — the peacekeeper of the main street.
  plasma_peacemaker: {
    id: "plasma_peacemaker",
    material: "metal",
    name: "PLASMA PEACEMAKER",
    class: "ranged",
    levelReq: 19,
    damage: 45,
    cooldownMs: 460,
    range: 250,
    durability: 200,
    projectile: {
      speed: 440,
      radius: 3,
      lifetimeMs: 800,
      sprite: "plasma_slug",
    },
    icon: "icon_peacemaker",
  },
  // The cattle bench's plasma brand: one slow, searing thrust that ends the
  // argument — the knuckles archetype grown up.
  branding_iron: {
    id: "branding_iron",
    material: "metal",
    name: "PLASMA BRANDING IRON",
    class: "melee",
    levelReq: 20,
    damage: 90,
    cooldownMs: 950,
    range: 40,
    // A thrust, not a sweep — one target takes the whole brand.
    sweepDeg: 55,
    durability: 180,
    icon: "icon_branding_iron",
  },
  // A lever rifle on a maglev rail: the slug threads the line, punching
  // through the front bodies into the ones behind.
  maglev_repeater: {
    id: "maglev_repeater",
    material: "metal",
    name: "MAGLEV REPEATER",
    class: "ranged",
    levelReq: 21,
    damage: 24,
    cooldownMs: 700,
    range: 320,
    durability: 190,
    projectile: {
      speed: 520,
      radius: 3,
      lifetimeMs: 900,
      sprite: "rail_slug",
      pierce: 2,
    },
    icon: "icon_repeater",
  },
  // The medicine wagon's pride: a fan of corrosive vials, three per squeeze.
  // Cures nothing, dissolves most things.
  snake_oil_sprayer: {
    id: "snake_oil_sprayer",
    name: "SNAKE-OIL SPRAYER",
    class: "magic",
    levelReq: 22,
    damage: 19,
    // Patent medicine: the batch varies. A lot.
    damageVariance: 0.35,
    cooldownMs: 520,
    range: 220,
    durability: 190,
    projectile: {
      speed: 300,
      radius: 4,
      lifetimeMs: 900,
      sprite: "oil_vial",
      count: 3,
      spreadDeg: 26,
    },
    icon: "icon_snake_oil",
  },
  // The control center's sun-gun: a captured noon, released one blinding
  // bolt at a time. The base ladder's slow magic capstone.
  high_noon: {
    id: "high_noon",
    material: "precious",
    name: "HIGH NOON",
    class: "magic",
    levelReq: 23,
    damage: 94,
    // A calibrated star: near-metronomic output.
    damageVariance: 0.1,
    cooldownMs: 900,
    range: 340,
    durability: 200,
    projectile: { speed: 480, radius: 5, lifetimeMs: 1100, sprite: "sun_bolt" },
    icon: "icon_high_noon",
  },
  // Eastworld's scheduled early revolver (earlyDrops) — a special, not a
  // base: the first host down surrenders its stage prop, live rounds and all.
  prairie_iron: {
    id: "prairie_iron",
    material: "metal",
    name: "PRAIRIE IRON",
    class: "ranged",
    levelReq: 17,
    damage: 52,
    cooldownMs: 500,
    range: 240,
    durability: 210,
    projectile: {
      speed: 420,
      radius: 3,
      lifetimeMs: 800,
      sprite: "plasma_slug",
    },
    icon: "icon_prairie_iron",
  },
  // ---- TRASH — the joke class (tier "trash", see Tier). ELON MOSQUE's final
  // estate: weapons with ZERO damage and no stats, minted only by his scripted
  // Eastworld drop, worth pocket lint at the counter. Never pooled, never
  // rolled, exempt from the damage budget (they deliberately owe nothing).
  soggy_cardboard_sword: {
    id: "soggy_cardboard_sword",
    name: "SOGGY CARDBOARD SWORD",
    class: "melee",
    levelReq: 1,
    damage: 0,
    cooldownMs: 800,
    range: 30,
    sweepDeg: 90,
    durability: 10,
    icon: "icon_cardboard_sword",
  },
  busted_flamethrower: {
    id: "busted_flamethrower",
    name: "NOT-A-FLAMETHROWER (EMPTY)",
    class: "melee",
    levelReq: 1,
    damage: 0,
    cooldownMs: 900,
    range: 28,
    sweepDeg: 60,
    durability: 10,
    icon: "icon_busted_flamethrower",
  },
  cybervan_wiper: {
    id: "cybervan_wiper",
    material: "metal",
    name: "CYBERVAN WIPER BLADE",
    class: "melee",
    levelReq: 1,
    damage: 0,
    cooldownMs: 700,
    range: 34,
    sweepDeg: 70,
    durability: 10,
    icon: "icon_cybervan_wiper",
  },
  // Specials — never in a level's random base pool; they arrive via
  // guaranteed drops (a boss's `loot.items`, a level's `allClearWeapon`,
  // a level's `earlyDrops` schedule). Their levelReq is tuned to the hero's
  // level when the story hands them over, and they're the seed stock for the
  // UNIQUE tier once it ships.
  golden_stapler: {
    id: "golden_stapler",
    material: "precious",
    name: "GOLDEN STAPLER",
    class: "ranged",
    levelReq: 4,
    // The all-clear trophy: the CEO's desk ornament, and somehow the best
    // stapler in the building.
    damage: 15,
    // Executive precision: it staples exactly where, and how hard, it means to.
    damageVariance: 0.08,
    cooldownMs: 280,
    range: 240,
    durability: 260,
    projectile: { speed: 420, radius: 3, lifetimeMs: 850, sprite: "staple" },
    icon: "icon_golden_stapler",
  },
  plasma_cutter: {
    id: "plasma_cutter",
    material: "metal",
    name: "PLASMA CUTTER",
    class: "melee",
    levelReq: 5,
    // MUSKRAT's hoard piece — cleanroom tooling rated for rocket hulls.
    damage: 20,
    cooldownMs: 340,
    range: 44,
    sweepDeg: 70,
    durability: 260,
    icon: "icon_plasma_cutter",
  },
  machete: {
    id: "machete",
    material: "metal",
    name: "MACHETE",
    class: "melee",
    levelReq: 7,
    damage: 7,
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
    material: "metal",
    name: "EXECUTIVE PUTTER",
    class: "melee",
    levelReq: 3,
    // The NIGHT MANAGER's back-nine special: crisp tempo, real reach.
    damage: 5,
    cooldownMs: 380,
    range: 46,
    durability: 200,
    icon: "icon_putter",
  },
  riot_taser: {
    id: "riot_taser",
    name: "RIOT TASER",
    class: "ranged",
    levelReq: 3,
    // The CHIEF's issue model: the desk taser with the export firmware.
    damage: 21,
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
    levelReq: 4,
    // DR. NOVA's conference pointer, three safety screws short of legal.
    damage: 14,
    // Overclocked past spec — the beam surges and sags run to run.
    damageVariance: 0.3,
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
    levelReq: 4,
    // THE JANITOR's halberd: light, fast, and the longest reach on level 1.
    // A polearm's thrust — a narrow cone that reaches far down the line.
    damage: 13,
    cooldownMs: 240,
    range: 54,
    sweepDeg: 44,
    durability: 200,
    icon: "icon_floor_sign",
  },
  flare_gun: {
    id: "flare_gun",
    name: "FLARE GUN",
    class: "ranged",
    levelReq: 7,
    // The MISSION SPECIALIST's survival kit piece: slow, bright, brutal.
    damage: 48,
    // A signal flare fired in anger — it burns as hot as it burns.
    damageVariance: 0.35,
    cooldownMs: 800,
    range: 300,
    durability: 160,
    projectile: { speed: 300, radius: 4, lifetimeMs: 1200, sprite: "fireball" },
    icon: "icon_flare_gun",
  },
  core_drill: {
    id: "core_drill",
    material: "metal",
    name: "CORE DRILL",
    class: "melee",
    levelReq: 6,
    // The PROSPECTOR's tunneler — chews rock, chews ghosts.
    damage: 21,
    cooldownMs: 330,
    range: 42,
    sweepDeg: 50,
    durability: 240,
    icon: "icon_core_drill",
  },
  geiger_wand: {
    id: "geiger_wand",
    name: "GEIGER WAND",
    class: "magic",
    levelReq: 7,
    // The MEDIC's screening probe, clicking well past the safe band.
    damage: 26,
    cooldownMs: 380,
    range: 290,
    durability: 200,
    projectile: { speed: 380, radius: 4, lifetimeMs: 1000, sprite: "spark" },
    icon: "icon_geiger_wand",
  },
  surveyors_pick: {
    id: "surveyors_pick",
    material: "metal",
    name: "SURVEYOR'S PICK",
    class: "melee",
    levelReq: 8,
    // THE CARTOGRAPHER's stake hammer: heavy arcs, deep dents.
    damage: 31,
    cooldownMs: 450,
    range: 44,
    sweepDeg: 60,
    durability: 220,
    icon: "icon_surveyors_pick",
  },
  moons_blade: {
    id: "moons_blade",
    material: "metal",
    name: "MOON'S BLADE",
    class: "melee",
    levelReq: 8,
    damage: 7,
    cooldownMs: 400,
    range: 48,
    durability: 260,
    icon: "icon_moons_blade",
  },
  // ---- Mars (level 3) uniques — the billionaires' signatures and the run's
  // scheduled blade. All guaranteed drops, never in the random pool.
  cyber_katana: {
    id: "cyber_katana",
    material: "metal",
    name: "CYBER KATANA",
    class: "melee",
    levelReq: 11,
    // Mars's scheduled early blade (earlyDrops): angular, allegedly
    // shatterproof, definitely shipped before testing finished.
    damage: 8,
    cooldownMs: 400,
    range: 48,
    durability: 260,
    icon: "icon_cyber_katana",
  },
  search_bar: {
    id: "search_bar",
    material: "metal",
    name: "SEARCH BAR",
    class: "melee",
    levelReq: 11,
    // LARRY WEBPAGE's crawler pole — a literal bar that searches the line
    // ahead. Results in about 0.26 seconds.
    damage: 22,
    cooldownMs: 260,
    range: 56,
    sweepDeg: 40,
    durability: 220,
    icon: "icon_search_bar",
  },
  blue_screen: {
    id: "blue_screen",
    name: "BLUE SCREEN",
    class: "magic",
    levelReq: 12,
    // BUILD GATES's tablet: it crashes whatever it's pointed at.
    damage: 37,
    cooldownMs: 420,
    range: 280,
    durability: 200,
    projectile: { speed: 380, radius: 4, lifetimeMs: 1000, sprite: "glitch" },
    icon: "icon_blue_screen",
  },
  contrarian_dagger: {
    id: "contrarian_dagger",
    material: "metal",
    name: "CONTRARIAN DAGGER",
    class: "melee",
    levelReq: 13,
    // PETER SEAL's letter opener: short, fast, and always against the crowd.
    damage: 28,
    cooldownMs: 300,
    range: 40,
    sweepDeg: 60,
    durability: 240,
    icon: "icon_contrarian_dagger",
  },
  prompt_injector: {
    id: "prompt_injector",
    name: "PROMPT INJECTOR",
    class: "magic",
    levelReq: 14,
    // OPTIMUSK PRIME's sidearm: it injects a prompt and the target does the
    // rest to itself. A notch over the BLUE SCREEN — PRIME sits deepest of
    // the Mars elites.
    damage: 37,
    cooldownMs: 380,
    range: 280,
    durability: 220,
    projectile: { speed: 380, radius: 4, lifetimeMs: 1000, sprite: "spark" },
    icon: "icon_prompt_injector",
  },
  not_a_flamethrower: {
    id: "not_a_flamethrower",
    name: "NOT-A-FLAMETHROWER",
    class: "ranged",
    levelReq: 14,
    // MOSQUE drops it as he bolts. Legally, it is not a flamethrower.
    damage: 48,
    // A gout of not-fire licks for wildly different bites tick to tick.
    damageVariance: 0.4,
    cooldownMs: 520,
    range: 240,
    durability: 260,
    projectile: { speed: 320, radius: 4, lifetimeMs: 900, sprite: "fireball" },
    icon: "icon_not_a_flamethrower",
  },
  tesla_coil: {
    id: "tesla_coil",
    name: "TESLA COIL",
    class: "magic",
    levelReq: 16,
    // NIKOLA TESLA's coil, surrendered as the current returns to it: fast
    // wireless lightning. They laughed. They are not laughing now.
    damage: 38,
    // Wireless current arcs where it will — the jolt lands unevenly.
    damageVariance: 0.3,
    cooldownMs: 360,
    range: 290,
    durability: 240,
    projectile: { speed: 420, radius: 4, lifetimeMs: 1000, sprite: "zap" },
    icon: "icon_tesla_coil",
  },
  singularity_cannon: {
    id: "singularity_cannon",
    name: "SINGULARITY CANNON",
    class: "magic",
    levelReq: 16,
    // GROK OMEGA's sidearm: it fires very small, very rude black holes. The
    // deepest hit in the campaign so far, paid for with a slow, heavy cycle.
    damage: 62,
    // Very small, very rude black holes — tidal forces are not a precise art.
    // The wildest swing in the game: a whiff or an annihilation.
    damageVariance: 0.55,
    cooldownMs: 620,
    range: 260,
    durability: 240,
    projectile: {
      speed: 300,
      radius: 5,
      lifetimeMs: 1100,
      sprite: "singularity",
    },
    icon: "icon_singularity_cannon",
  },
};

// The generated EXCEPTIONAL/ELITE versions of every pool base — same look,
// higher numbers and requirements (see defs/grades.ts). Merged into the
// catalog at load so every surface (lookups, scripts, the weapon sheet)
// sees them as ordinary defs. The budget model's shape readers are injected
// (they live below in this module) so grades.ts stays import-cycle-free.
Object.assign(
  WEAPON_DEFS,
  weaponGradeVariants(WEAPON_DEFS, {
    assumedTargets: (def) => weaponAssumedTargets(def),
    critMult: (def) => weaponCritMult(def),
  }),
);

// ---- Gear -------------------------------------------------------------------
// The gear catalog (armor, charms, bags) lives in its own module purely by
// size; re-exported here so `defs/equipment.ts` stays the one import surface
// for the whole equipment catalog.

export { GEAR_DEFS, type GearDef };

// ---- Affixes ------------------------------------------------------------------

/**
 * One rung of an affix's roll ladder: at/above `minIlvl` the affix may roll a
 * flat value in [min, max]. PoE-style affix TIERS, replacing the old linear
 * `ilvl × perIlvl` rule: magnitude now comes in authored GENERATIONS that
 * unlock as items drop deeper, so a deep find rolls bigger — but never
 * unboundedly bigger. The generations are the balance wall the old linear
 * rule lacked: an endgame stat affix tops out around 60% of the hero's own
 * soft cap (STATS.statSoftCap) instead of sailing past a whole build's
 * chosen points.
 */
export type AffixBracket = {
  /** The item level this generation unlocks at. */
  minIlvl: number;
  /** The roll band inside the generation (flat, not per-ilvl). */
  min: number;
  max: number;
};

export type AffixDef = {
  kind: "damagePct" | "maxHp" | "crit" | "stat" | "armor";
  /**
   * The affix's roll generations, ascending by `minIlvl` (the first entry
   * unlocks at 1 so every affix always has a band). `rollAffix` rolls in the
   * HIGHEST unlocked bracket most of the time and one below it sometimes
   * (weighted 3:1), so a deep drop usually pays deep-generation values with
   * a taste of the previous one — a rare still varies, a bracket is not a
   * fixed price.
   */
  brackets: AffixBracket[];
  /** Relative weight within the pool. */
  weight: number;
};

/**
 * The bracket ladders, shared by both pools so a kind means the same thing
 * on a weapon and a worn piece. `minIlvl`s (1/10/22/36/52) deliberately
 * track where the difficulty rungs end (see LEVELING's per-rung landings):
 * each rung of the campaign unlocks the next affix generation, and the
 * harder difficulties' `lootIlvlBonus` reaches a generation a few levels
 * early — climbing the ladder is visible in the loot's very numbers.
 */
const BRACKETS: Record<AffixDef["kind"], AffixBracket[]> = {
  stat: [
    { minIlvl: 1, min: 1, max: 3 },
    { minIlvl: 10, min: 4, max: 7 },
    { minIlvl: 22, min: 8, max: 12 },
    { minIlvl: 36, min: 13, max: 18 },
    // Top generation ≈ 60% of STATS.statSoftCap: the ceiling rule that keeps
    // one affix from out-muscling a whole build's chosen points.
    { minIlvl: 52, min: 19, max: 25 },
  ],
  damagePct: [
    { minIlvl: 1, min: 0.05, max: 0.1 },
    { minIlvl: 10, min: 0.11, max: 0.18 },
    { minIlvl: 22, min: 0.19, max: 0.28 },
    { minIlvl: 36, min: 0.29, max: 0.4 },
    { minIlvl: 52, min: 0.41, max: 0.55 },
  ],
  crit: [
    { minIlvl: 1, min: 0.02, max: 0.03 },
    { minIlvl: 10, min: 0.03, max: 0.05 },
    { minIlvl: 22, min: 0.05, max: 0.07 },
    { minIlvl: 36, min: 0.07, max: 0.09 },
    { minIlvl: 52, min: 0.09, max: 0.12 },
  ],
  maxHp: [
    { minIlvl: 1, min: 5, max: 12 },
    { minIlvl: 10, min: 13, max: 25 },
    { minIlvl: 22, min: 26, max: 45 },
    { minIlvl: 36, min: 46, max: 70 },
    { minIlvl: 52, min: 71, max: 100 },
  ],
  armor: [
    { minIlvl: 1, min: 4, max: 8 },
    { minIlvl: 10, min: 9, max: 16 },
    { minIlvl: 22, min: 17, max: 28 },
    { minIlvl: 36, min: 29, max: 44 },
    { minIlvl: 52, min: 45, max: 65 },
  ],
};

/** What magic+ items can roll, per slot family. */
export const AFFIX_POOLS: Record<"weapon" | "gear", AffixDef[]> = {
  weapon: [
    { kind: "damagePct", brackets: BRACKETS.damagePct, weight: 7 },
    { kind: "crit", brackets: BRACKETS.crit, weight: 3 },
    // A weapon can also carry stat points (STRENGTH, DEXTERITY, …) or a little
    // life, so a multi-affix rare/unique/legendary weapon reads like a Diablo
    // yellow — "CRUEL PIPE OF THE FOX" — not just raw damage (the engine folds
    // an equipped weapon's maxHp/crit/stat affixes into the player like any
    // other worn piece). Weighted below the offensive rolls so damage stays a
    // weapon's headline, and four kinds let a legendary weapon fill all four
    // affix slots.
    { kind: "stat", brackets: BRACKETS.stat, weight: 2 },
    { kind: "maxHp", brackets: BRACKETS.maxHp, weight: 2 },
  ],
  gear: [
    { kind: "maxHp", brackets: BRACKETS.maxHp, weight: 4 },
    { kind: "crit", brackets: BRACKETS.crit, weight: 3 },
    { kind: "stat", brackets: BRACKETS.stat, weight: 3 },
    // Armor rolls on any gear (a +armor charm is a fine Diablo tradition),
    // stacking into the same worn total.
    { kind: "armor", brackets: BRACKETS.armor, weight: 3 },
  ],
};

export const STAT_NAMES: StatName[] = [
  "stamina",
  "strength",
  "dexterity",
  "intelligence",
  "speed",
  "luck",
];

// ---- Magic item naming (Diablo-style) -----------------------------------------

/**
 * The "of the X" suffix each `+stat` affix lends an item's name, so a rolled
 * bonus reads as flavor (BEAKER OF THE FOX = +DEXTERITY) the way Diablo names
 * its magic finds. Deterministic — the name follows the affix, not a fresh
 * roll.
 */
const STAT_SUFFIX: Record<StatName, string> = {
  stamina: "OF THE BEAR",
  strength: "OF THE OX",
  dexterity: "OF THE FOX",
  intelligence: "OF THE OWL",
  speed: "OF THE HARE",
  luck: "OF FORTUNE",
};

/**
 * The word an affix contributes to a magic item's name: a `prefix` sits before
 * the base name (VICIOUS BEAKER), a `suffix` after it (BEAKER OF PRECISION).
 * Each kind picks one or the other so a two-affix item reads as
 * "<PREFIX> BASE OF <SUFFIX>"; the wording steps up with the roll's magnitude.
 * Purely presentational — the numbers still live on the affix.
 */
export function affixNaming(affix: Affix): {
  prefix?: string;
  suffix?: string;
} {
  switch (affix.kind) {
    // Wording thresholds track the ilvl-scaled magnitudes: the low band is
    // an early find, the top band only rolls deep in the campaign.
    case "damagePct":
      return {
        prefix:
          affix.value < 0.25
            ? "JAGGED"
            : affix.value < 0.5
              ? "VICIOUS"
              : "CRUEL",
      };
    case "crit":
      return { suffix: affix.value < 0.06 ? "OF PRECISION" : "OF DEADLINESS" };
    case "maxHp":
      return { prefix: affix.value < 35 ? "STURDY" : "REINFORCED" };
    case "armor":
      return { prefix: affix.value < 20 ? "STUDDED" : "PLATED" };
    case "stat":
      return { suffix: STAT_SUFFIX[affix.stat] };
    // Scaling kinds only ride hand-named UNIQUES, never rolled magic names, so
    // these are here for exhaustiveness — a magic item never composes from them.
    case "statPct":
      return { suffix: STAT_SUFFIX[affix.stat] };
    case "maxHpPct":
      return { prefix: "REINFORCED" };
  }
}

// ---- Lookups -------------------------------------------------------------------

// Active registries the accessors read (default to the shipped catalogs;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeWeaponDefs: Record<string, WeaponDef> = WEAPON_DEFS;
let activeGearDefs: Record<string, GearDef> = GEAR_DEFS;

// ---- Frozen def snapshots (version immunity) --------------------------------
// A kept item must not be nerfed or broken when we later rebalance or delete
// its base — only new drops should feel a catalog edit. Each item instance
// carries a frozen copy of its def (`Equipment.def`, snapshotted at mint); on
// load `adoptEquipment` (items.ts) parks that snapshot HERE, under a stable
// synthetic id derived from its content, and re-homes the instance onto it.
// These overlays are a separate namespace from the live catalog: the shipped
// pools never see them, so a frozen id can't leak into a fresh drop, and
// swapping the active catalog (tests) doesn't touch them.
const frozenWeaponDefs: Record<string, WeaponDef> = {};
const frozenGearDefs: Record<string, GearDef> = {};

/** The prefix marking a synthetic id minted for a frozen def snapshot. */
export const FROZEN_DEF_PREFIX = "frozen:";

/** A small, stable, dependency-free hash (djb2) of a snapshot's JSON, so an
 * identical def always frozen to the SAME id — re-registration is idempotent
 * and the id survives round-trips through storage. */
function hashJson(json: string): string {
  let h = 5381;
  for (let i = 0; i < json.length; i++) {
    h = (((h << 5) + h) ^ json.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/**
 * Park a frozen def snapshot in the overlay and return the synthetic id it
 * lives under. Content-addressed (`frozen:<origId>:<hash>`), so two instances
 * that dropped with identical stats share one id and one registry entry, while
 * the same base rebalanced across versions freezes to distinct ids. Idempotent.
 */
export function registerFrozenDef(
  def: WeaponDef | GearDef,
  family: "weapon" | "gear",
): string {
  const id = `${FROZEN_DEF_PREFIX}${def.id}:${hashJson(JSON.stringify(def))}`;
  if (family === "weapon") frozenWeaponDefs[id] = def as WeaponDef;
  else frozenGearDefs[id] = def as GearDef;
  return id;
}

/** Test/authoring hook: replace the active weapon + gear catalogs. */
export function setEquipmentDefs(defs: {
  weapons: Record<string, WeaponDef>;
  gear: Record<string, GearDef>;
}): void {
  activeWeaponDefs = defs.weapons;
  activeGearDefs = defs.gear;
}

/** Look up a weapon def; throws on a broken id so bugs surface loudly. Frozen
 * snapshots (kept items whose base changed/vanished) resolve from the overlay. */
export function weaponDef(defId: string): WeaponDef {
  const def = activeWeaponDefs[defId] ?? frozenWeaponDefs[defId];
  if (!def) throw new Error(`unknown weapon def "${defId}"`);
  return def;
}

/** Look up a gear def; throws on a broken id so bugs surface loudly. Frozen
 * snapshots (kept items whose base changed/vanished) resolve from the overlay. */
export function gearDef(defId: string): GearDef {
  const def = activeGearDefs[defId] ?? frozenGearDefs[defId];
  if (!def) throw new Error(`unknown gear def "${defId}"`);
  return def;
}

/** True when the def id names a weapon (vs a piece of gear) — including a
 * frozen weapon snapshot. */
export function isWeaponDef(defId: string): boolean {
  return defId in activeWeaponDefs || defId in frozenWeaponDefs;
}

/** True when the def id names a piece of gear — including a frozen gear
 * snapshot. */
export function isGearDef(defId: string): boolean {
  return defId in activeGearDefs || defId in frozenGearDefs;
}

/** The display name of an equipment def, without tier prefix. */
export function equipmentBaseName(defId: string): string {
  return isWeaponDef(defId) ? weaponDef(defId).name : gearDef(defId).name;
}

/**
 * The LEVEL REQUIREMENT of an equipment def — a weapon's authored `levelReq`,
 * a gear piece's optional one (1 = ungated). The single accessor both gates
 * read through: the drop side (a mob below it never drops the base) and the
 * wear side (a hero below it banks the find instead of wielding it).
 */
export function equipmentLevelReq(defId: string): number {
  return isWeaponDef(defId)
    ? weaponDef(defId).levelReq
    : (gearDef(defId).levelReq ?? 1);
}

/** The icon sprite of an equipment def. */
export function equipmentIcon(defId: string): string {
  return isWeaponDef(defId) ? weaponDef(defId).icon : gearDef(defId).icon;
}

/**
 * A base's TREASURECLASS drop weight (D2's `Prob`): the relative odds it is the
 * one picked from a level's eligible pool once stage 1 decides SOMETHING drops
 * (see the weighted pick in `rollEquipment`). Default 1 — an even pool, exactly
 * the old uniform pick — so a base only becomes rarer/commoner where a def
 * authors a `dropWeight`. The single accessor both families read through.
 */
export function equipmentDropWeight(defId: string): number {
  return isWeaponDef(defId)
    ? (weaponDef(defId).dropWeight ?? 1)
    : (gearDef(defId).dropWeight ?? 1);
}

// ---- The damage-budget model (see the weapon-system skill) --------------------

/**
 * A weapon's crit-damage multiplier: its own `critMult` override, else the
 * cadence rule (config `WEAPON.critMultByCadence`) — a quick blade crits
 * light (many rolls of the dice), a slow heavy hitter crits like a truck.
 * The one source every crit-damage surface reads: the blow itself
 * (hitEnemy via step.ts), the DPS readouts, and auto-equip scoring.
 */
export function weaponCritMult(def: WeaponDef): number {
  if (def.critMult !== undefined) return def.critMult;
  if (def.cooldownMs < WEAPON.critFastBelowMs) {
    return WEAPON.critMultByCadence.fast;
  }
  if (def.cooldownMs >= WEAPON.critSlowFromMs) {
    return WEAPON.critMultByCadence.slow;
  }
  return WEAPON.critMultByCadence.medium;
}

/**
 * A weapon's damage-range half-width as a fraction of its average `damage`:
 * its own `damageVariance` override, else the global `WEAPON.damageVariance`.
 * The one source every range surface reads — the per-hit roll (rollWeaponDamage
 * in items.ts), the item card's "DMG min–max", and the arsenal sheet.
 */
export function weaponDamageVariance(def: WeaponDef): number {
  return def.damageVariance ?? WEAPON.damageVariance;
}

/**
 * How many targets a weapon is BUDGETED to hit at once — the AoE
 * normalization of the damage-budget model: a weapon's effective DPS is its
 * per-target DPS × this, so a cone-AoE weapon (assumed 4 targets) carries a
 * quarter of a single-target weapon's per-hit damage at the same level and
 * "achieves its damage" once INTELLIGENCE has grown the cleave to match
 * (the actual count hit is INT's, not the weapon's — see maxMeleeTargets).
 * Volleys count their pellets, a piercing round its line, chain lightning
 * its (damage-weighted) leaps.
 */
export function weaponAssumedTargets(def: WeaponDef): number {
  const p = def.projectile;
  if (p) {
    if (p.count && p.count > 1) return p.count;
    if (p.pierce) return 1 + p.pierce;
    if (p.chain) return 1 + p.chain * WEAPON.chainDamageFrac;
    return 1;
  }
  // Melee is classified by SHAPE alone: the arc says whether it is a
  // thrust, a cone, or a full-circle sweep. How many foes a swing actually
  // strikes is INTELLIGENCE's business (maxMeleeTargets) — these counts are
  // the balance assumption the per-hit damage is divided by.
  const arc = def.sweepDeg ?? MELEE.defaultSweepDeg;
  if (arc >= WEAPON.aoeFullFromDeg) return WEAPON.assumedTargets.full;
  if (arc >= WEAPON.aoeConeFromDeg) return WEAPON.assumedTargets.cone;
  return 1;
}
