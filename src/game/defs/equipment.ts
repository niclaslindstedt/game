// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The equipment catalog: weapon defs, gear defs, the tier ladder, and the
// affix pools that magic+ items roll from. Levels pick which defs can drop
// via their loot pools; WHEN a base can drop is its own `levelReq` against
// the killer's monster level, and WHEN a tier can drop is the mlvl gate in
// config LOOT.tierUnlockMlvl — so growing this file to hundreds of items
// never touches the engine.

import { MELEE, WEAPON } from "../config.ts";
import type {
  Affix,
  ArmorGrade,
  EquipSlot,
  StatName,
  Tier,
  WeaponClass,
} from "../types.ts";

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
  regular: { prefix: "", affixCount: 0 },
  magic: { prefix: "MAGIC ", affixCount: 1 },
  rare: { prefix: "RARE ", affixCount: 2 },
  unique: { prefix: "UNIQUE ", affixCount: 3 },
  legendary: { prefix: "LEGENDARY ", affixCount: 4 },
};

/** Roll order: try the best tier first, fall through to regular. */
export const TIER_ROLL_ORDER: Tier[] = ["legendary", "unique", "rare", "magic"];

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
   * The base item's LEVEL REQUIREMENT, Diablo-style. Gates both ends of the
   * economy: this weapon never drops off a monster whose level is below it
   * (see `rollEquipment`), and the player can't wield it until his own level
   * reaches it (see `meetsLevelReq` — an early lucky find waits in the bag).
   * The campaign's power curve is authored here: each level's base pool
   * introduces its five weapons at stepped requirements.
   */
  levelReq: number;
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
   * Melee only: the full angle (degrees) of the swing's cone of effect. Every
   * monster within `range` and inside this arc of the aim is struck at once,
   * so a swing cleaves the crowd. A wide arc is a blade's slash; a narrow arc
   * paired with a long `range` is a spear's thrust, skewering the line ahead
   * rather than sweeping sideways. Defaults to `MELEE.defaultSweepDeg`.
   */
  sweepDeg?: number;
  /**
   * Melee only: how many foes a single swing may strike before INTELLIGENCE
   * widens the cleave (see `STATS.aoeTargetsPerInt`). Defaults to
   * `MELEE.baseAoeTargets`. A rough, unbalanced blade sets this to 1 — it
   * bites one enemy at a time until INT earns it a cleave.
   */
  baseAoeTargets?: number;
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
    name: "MEDIEVAL SWORD",
    class: "melee",
    levelReq: 1,
    damage: 18,
    cooldownMs: 720,
    range: 38,
    // A genuine slash: a broad arc that catches a pair of foes per swing —
    // the AoE yardstick the knife (narrower) and knuckles (none) sit under.
    sweepDeg: 100,
    baseAoeTargets: 2,
    durability: 130,
    icon: "icon_medieval_sword",
  },
  // HARD: quick and mean, but short and SHALLOW — light per-hit damage means
  // most mobs take several stabs, so despite the tempo it holds a crowd worse
  // than the sword (matching DPS, worse control), and its tighter arc and
  // reach mean the fight happens closer and flanks sooner.
  combat_knife: {
    id: "combat_knife",
    name: "COMBAT KNIFE",
    class: "melee",
    levelReq: 1,
    damage: 10,
    cooldownMs: 400,
    range: 32,
    sweepDeg: 70,
    baseAoeTargets: 2,
    durability: 150,
    icon: "icon_combat_knife",
  },
  // NIGHTMARE: one target, real hurt. Each punch lands like a brick — and
  // then nothing for over a second, no cleave at any INT-less swing, and
  // knuckle range means standing INSIDE the horde to throw it.
  brass_knuckles: {
    id: "brass_knuckles",
    name: "BRASS KNUCKLES",
    class: "melee",
    levelReq: 1,
    damage: 30,
    cooldownMs: 1100,
    range: 24,
    sweepDeg: 60,
    baseAoeTargets: 1,
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
    baseAoeTargets: 3,
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
    baseAoeTargets: 1,
    durability: 130,
    icon: "icon_box_cutter",
  },
  // A desk drawer's 9mm — this is America, even in the space business.
  nine_mm: {
    id: "nine_mm",
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
    name: "SECURITY BATON",
    class: "melee",
    levelReq: 1,
    damage: 4,
    cooldownMs: 400,
    range: 42,
    // A cone-AoE base: light per blow, but the arc catches four at once —
    // the swing "achieves its damage" with a full cleave (budget model).
    sweepDeg: 100,
    baseAoeTargets: 4,
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
    cooldownMs: 380,
    range: 300,
    durability: 180,
    projectile: { speed: 520, radius: 3, lifetimeMs: 900, sprite: "ray" },
    icon: "icon_prototype_laser",
  },
  // The armory's pump gun: slow, brutal, short — five pellets a pull, each
  // carrying the full hit, so a point-blank blast is the building's hardest
  // single swing and a spread at range still stings the crowd.
  pump_shotgun: {
    id: "pump_shotgun",
    name: "PUMP SHOTGUN",
    class: "ranged",
    levelReq: 5,
    damage: 11,
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
    name: "LUNAR WRENCH",
    class: "melee",
    levelReq: 5,
    damage: 12,
    cooldownMs: 480,
    range: 42,
    durability: 180,
    icon: "icon_lunar_wrench",
  },
  // A .38 out of a crew survival kit — the space race packed for bears.
  service_revolver: {
    id: "service_revolver",
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
    name: "GEOLOGY HAMMER",
    class: "melee",
    levelReq: 8,
    damage: 38,
    cooldownMs: 650,
    range: 40,
    sweepDeg: 70,
    baseAoeTargets: 1,
    durability: 150,
    icon: "icon_geology_hammer",
  },
  // Military surplus that hitched a ride: the longest reach of the 70s pool,
  // one deliberate tracer at a time.
  surplus_carbine: {
    id: "surplus_carbine",
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
    cooldownMs: 600,
    range: 290,
    durability: 170,
    projectile: { speed: 340, radius: 4, lifetimeMs: 1100, sprite: "ring" },
    icon: "icon_retro_raygun",
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
    baseAoeTargets: 4,
    durability: 220,
    icon: "icon_plasma_blade",
  },
  // Twin rails and a capacitor bank: one slow slug that refuses to stop at
  // the first body — it holds a whole lane.
  railgun: {
    id: "railgun",
    name: "RAILGUN",
    class: "ranged",
    levelReq: 13,
    damage: 18,
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
  // A black cube floating on a handle. Swinging it moves the ground more
  // than the arm — the Mars pool's slow, enormous exclamation mark.
  gravity_maul: {
    id: "gravity_maul",
    name: "GRAVITY MAUL",
    class: "melee",
    levelReq: 16,
    damage: 14,
    cooldownMs: 850,
    range: 46,
    // The full-AoE slam: the shockwave rings the hero all the way around
    // and catches five foes — per-blow damage carries a fifth of the budget.
    sweepDeg: 360,
    baseAoeTargets: 5,
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
    name: "GLADIUS",
    class: "melee",
    levelReq: 15,
    damage: 18,
    cooldownMs: 420,
    range: 40,
    sweepDeg: 90,
    baseAoeTargets: 2,
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
    name: "BLUNDERBUSS",
    class: "ranged",
    levelReq: 19,
    damage: 20,
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
    name: "EXECUTIONER'S AXE",
    class: "melee",
    levelReq: 21,
    damage: 24,
    cooldownMs: 1000,
    range: 46,
    sweepDeg: 100,
    baseAoeTargets: 4,
    durability: 170,
    icon: "icon_executioners_axe",
  },
  // A gnarled staff with a crystal that predates the concept of physics.
  // The base ladder's magic capstone.
  sorcerers_staff: {
    id: "sorcerers_staff",
    name: "SORCERER'S STAFF",
    class: "magic",
    levelReq: 23,
    damage: 72,
    cooldownMs: 650,
    range: 320,
    durability: 200,
    projectile: { speed: 360, radius: 5, lifetimeMs: 1200, sprite: "orb" },
    icon: "icon_sorcerers_staff",
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
  // Specials — never in a level's random base pool; they arrive via
  // guaranteed drops (a boss's `loot.items`, a level's `allClearWeapon`,
  // a level's `earlyDrops` schedule). Their levelReq is tuned to the hero's
  // level when the story hands them over, and they're the seed stock for the
  // UNIQUE tier once it ships.
  golden_stapler: {
    id: "golden_stapler",
    name: "GOLDEN STAPLER",
    class: "ranged",
    levelReq: 4,
    // The all-clear trophy: the CEO's desk ornament, and somehow the best
    // stapler in the building.
    damage: 15,
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
    levelReq: 5,
    // MUSKRAT's hoard piece — cleanroom tooling rated for rocket hulls.
    damage: 10,
    cooldownMs: 340,
    range: 44,
    durability: 260,
    icon: "icon_plasma_cutter",
  },
  machete: {
    id: "machete",
    name: "MACHETE",
    class: "melee",
    levelReq: 7,
    damage: 13,
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
    levelReq: 3,
    // The NIGHT MANAGER's back-nine special: crisp tempo, real reach.
    damage: 10,
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
    damage: 7,
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
    levelReq: 6,
    // The PROSPECTOR's tunneler — chews rock, chews ghosts.
    damage: 10,
    cooldownMs: 330,
    range: 42,
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
    name: "SURVEYOR'S PICK",
    class: "melee",
    levelReq: 8,
    // THE CARTOGRAPHER's stake hammer: heavy arcs, deep dents.
    damage: 15,
    cooldownMs: 450,
    range: 44,
    durability: 220,
    icon: "icon_surveyors_pick",
  },
  moons_blade: {
    id: "moons_blade",
    name: "MOON'S BLADE",
    class: "melee",
    levelReq: 8,
    damage: 14,
    cooldownMs: 400,
    range: 48,
    durability: 260,
    icon: "icon_moons_blade",
  },
  // ---- Mars (level 3) uniques — the billionaires' signatures and the run's
  // scheduled blade. All guaranteed drops, never in the random pool.
  cyber_katana: {
    id: "cyber_katana",
    name: "CYBER KATANA",
    class: "melee",
    levelReq: 11,
    // Mars's scheduled early blade (earlyDrops): angular, allegedly
    // shatterproof, definitely shipped before testing finished.
    damage: 17,
    cooldownMs: 400,
    range: 48,
    durability: 260,
    icon: "icon_cyber_katana",
  },
  search_bar: {
    id: "search_bar",
    name: "SEARCH BAR",
    class: "melee",
    levelReq: 11,
    // LARRY WEBPAGE's crawler pole — a literal bar that searches the line
    // ahead. Results in about 0.26 seconds.
    damage: 11,
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
    name: "CONTRARIAN DAGGER",
    class: "melee",
    levelReq: 13,
    // PETER SEAL's letter opener: short, fast, and always against the crowd.
    damage: 14,
    cooldownMs: 300,
    range: 40,
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

// ---- Gear -------------------------------------------------------------------

export type GearDef = {
  id: string;
  name: string;
  slot: Exclude<EquipSlot, "weapon">;
  /**
   * Level requirement, same two-way gate as a weapon's (see
   * WeaponDef.levelReq): never drops off a mob below it, never worn by a
   * hero below it. Omitted = 1 (no gate).
   */
  levelReq?: number;
  /** Flat bonuses baked into the item before tier affixes. */
  bonuses: { maxHp?: number; critChance?: number };
  /**
   * Suits only: the armor grade the plating grants. Equipping the suit fills
   * an armor pool of the grade's size (config `ARMOR`) that soaks its share of
   * every physical hit until spent. Absent = the piece has no plating (charms,
   * and cloth suits like the lab coat that lean on `maxHp` instead).
   */
  armor?: ArmorGrade;
  /**
   * A passive trinket's flat stat bonuses, paid out while the piece is merely
   * CARRIED — the effect rides in the bag, so a passive item never needs an
   * equip slot to work (see `effectiveStat`). This is what a `+1 INT` chip
   * grants sitting in a pocket, as distinct from a suit or charm that must be
   * worn. Absent on ordinary gear, whose bonuses only count once equipped.
   */
  passive?: Partial<Record<StatName, number>>;
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
    // The lightest plating: a lab coat turns a few hits, no more.
    armor: "green",
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
    // Bolted-on plates: a solid mid-grade shell.
    armor: "yellow",
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
    // Rated for the void: the heaviest plating in the game.
    armor: "red",
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
  // THE ARCHITECT's PASSAGE CHIP: the implant the old coworker cut into his own
  // skull to badge through the cyborg locks and pass as a machine. In the
  // hero's bag it is a passive trinket — its `+1 INT` applies while merely
  // carried, never occupying an equip slot (see `isPassiveItem`). A `charm`
  // slot only so it is a well-formed piece of gear should the player ever drag
  // it onto the body; either way the mind sharpens exactly once.
  passage_chip: {
    id: "passage_chip",
    name: "PASSAGE CHIP",
    slot: "charm",
    bonuses: {},
    passive: { intelligence: 1 },
    icon: "icon_passage_chip",
  },
  // ---- Mars gear: colony-issue kit in the level's drop pool.
  pressure_plating: {
    id: "pressure_plating",
    name: "PRESSURE PLATING",
    slot: "suit",
    bonuses: { maxHp: 25 },
    // Dome-rated hull panels, restrapped as armor.
    armor: "yellow",
    icon: "icon_suit",
  },
  red_dust_charm: {
    id: "red_dust_charm",
    name: "RED DUST CHARM",
    slot: "charm",
    // A vial of the regolith the colony is built on. Lucky, probably.
    bonuses: { critChance: 0.03 },
    icon: "icon_charm",
  },
  // ---- Rift gear: what history's missing carry, and what the void rains.
  stardust_charm: {
    id: "stardust_charm",
    name: "STARDUST CHARM",
    slot: "charm",
    // A pinch of ground-up somewhere else. It glitters at good moments.
    bonuses: { critChance: 0.03 },
    icon: "icon_charm",
  },
  aviator_goggles: {
    id: "aviator_goggles",
    name: "AVIATOR GOGGLES",
    slot: "charm",
    // EARHART's goggles: ninety years of spotting the gap in the weather.
    bonuses: { critChance: 0.04 },
    icon: "icon_goggles",
  },
  rasputin_beard: {
    id: "rasputin_beard",
    name: "RASPUTIN'S BEARD",
    slot: "charm",
    // The beard survived the poison, the bullets and the river. Now it
    // survives things FOR you.
    bonuses: { maxHp: 30 },
    icon: "icon_beard",
  },
  golden_parachute: {
    id: "golden_parachute",
    name: "GOLDEN PARACHUTE",
    slot: "charm",
    // MOSQUE's exit package, dropped mid-exit. Guaranteed soft landings,
    // whoever crashed the company.
    bonuses: { maxHp: 25, critChance: 0.02 },
    icon: "icon_parachute",
  },
  // ---- Rift FANTASY gear: things that fell through from stories rather
  // than history. Only the rift's pool carries them — it's the one magical
  // level so far.
  lucky_clover: {
    id: "lucky_clover",
    name: "LUCKY CLOVER",
    slot: "charm",
    levelReq: 15,
    // Four leaves, pressed flat by something enormous. Pays out from the bag.
    bonuses: {},
    passive: { luck: 2 },
    icon: "icon_clover",
  },
  crystal_orb: {
    id: "crystal_orb",
    name: "CRYSTAL ORB",
    slot: "charm",
    levelReq: 16,
    // It shows you the blow before it lands.
    bonuses: { critChance: 0.04 },
    icon: "icon_crystal_orb",
  },
  grimoire: {
    id: "grimoire",
    name: "GRIMOIRE",
    slot: "charm",
    levelReq: 18,
    // A book that reads YOU. Sharpens the mind just riding in the bag.
    bonuses: {},
    passive: { intelligence: 2 },
    icon: "icon_grimoire",
  },
  enchanted_ring: {
    id: "enchanted_ring",
    name: "ENCHANTED RING",
    slot: "charm",
    levelReq: 20,
    // One ring. It wants to be worn — and it earns it.
    bonuses: { critChance: 0.05 },
    icon: "icon_enchanted_ring",
  },
  dragonscale_cloak: {
    id: "dragonscale_cloak",
    name: "DRAGONSCALE CLOAK",
    slot: "suit",
    levelReq: 22,
    // Shed, not taken — nobody skins a dragon. The rift's heaviest plating.
    bonuses: { maxHp: 35 },
    armor: "red",
    icon: "icon_dragonscale_cloak",
  },
};

// ---- Affixes ------------------------------------------------------------------

export type AffixDef = {
  kind: "damagePct" | "maxHp" | "crit" | "stat";
  /**
   * Roll size PER ITEM LEVEL: the affix's value is
   * `ilvl × randomRange(min, max)` (stat/maxHp rounded, floored at 1 point).
   * Tying magnitude to ilvl is the Diablo rule "deeper drops roll bigger":
   * a stat affix at [1, 1] pays exactly +1 point per item level, so an
   * ilvl-12 magic find carries +12 in one stat — and a rare, rolling TWO
   * affixes, pays out twice the points at the same ilvl (unique three,
   * legendary four).
   */
  perIlvl: [number, number];
  /** Relative weight within the pool. */
  weight: number;
};

/** What magic+ items can roll, per slot family. */
export const AFFIX_POOLS: Record<"weapon" | "gear", AffixDef[]> = {
  weapon: [
    // +2.4–3.6% damage per ilvl: an ilvl-10 roll is the old mid-band (~30%),
    // and the band keeps growing where the flat roll used to plateau.
    { kind: "damagePct", perIlvl: [0.024, 0.036], weight: 7 },
    { kind: "crit", perIlvl: [0.004, 0.006], weight: 3 },
    // A weapon can also carry stat points (STRENGTH, DEXTERITY, …) or a little
    // life, so a multi-affix rare/unique/legendary weapon reads like a Diablo
    // yellow — "CRUEL PIPE OF THE FOX" — not just raw damage (the engine folds
    // an equipped weapon's maxHp/crit/stat affixes into the player like any
    // other worn piece). Weighted below the offensive rolls so damage stays a
    // weapon's headline, and four kinds let a legendary weapon fill all four
    // affix slots.
    { kind: "stat", perIlvl: [1, 1], weight: 2 },
    { kind: "maxHp", perIlvl: [1.6, 2.6], weight: 2 },
  ],
  gear: [
    { kind: "maxHp", perIlvl: [2, 3.4], weight: 4 },
    { kind: "crit", perIlvl: [0.004, 0.006], weight: 3 },
    { kind: "stat", perIlvl: [1, 1], weight: 3 },
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
    case "stat":
      return { suffix: STAT_SUFFIX[affix.stat] };
  }
}

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
 * How many targets a weapon is BUDGETED to hit at once — the AoE
 * normalization of the damage-budget model: a weapon's effective DPS is its
 * per-target DPS × this, so a cone-AoE weapon (4 assumed targets) carries a
 * quarter of a single-target weapon's per-hit damage at the same level and
 * "achieves its damage" when its cleave is full. Melee reads its cleave cap
 * (`baseAoeTargets`); volleys count their pellets, a piercing round its
 * line, chain lightning its (damage-weighted) leaps.
 */
export function weaponAssumedTargets(def: WeaponDef): number {
  const p = def.projectile;
  if (p) {
    if (p.count && p.count > 1) return p.count;
    if (p.pierce) return 1 + p.pierce;
    if (p.chain) return 1 + p.chain * WEAPON.chainDamageFrac;
    return 1;
  }
  return def.baseAoeTargets ?? MELEE.baseAoeTargets;
}
