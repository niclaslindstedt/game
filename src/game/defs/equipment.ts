// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The equipment catalog: weapon defs, gear defs, the tier ladder, and the
// affix pools that magic+ items roll from. The catalogs themselves are
// AUTHORED IN YAML — one file per item under `content/items/<rarity>/`,
// compiled by scripts/generate-items.mjs into src/generated/items.ts (see
// the weapon-system skill) — and this module wraps them with the types,
// lookups, and budget machinery. Levels pick which defs can drop via their
// loot pools; WHEN a base can drop is its own `levelReq` against the
// killer's monster level, and WHEN a tier can drop is the mlvl gate in
// config LOOT.tierUnlockMlvl — so growing the catalog to hundreds of items
// never touches the engine.

import { MELEE, STATS, WEAPON } from "../config/index.ts";
import { chosenStatPointsThrough } from "../stat-points.ts";
import {
  GENERATED_WEAPONS,
  ITEM_QUALITY,
  ITEM_RARITY,
} from "../../generated/items.ts";
import { GEAR_DEFS, type GearDef } from "./gear.ts";
import { weaponGradeVariants, type Grade } from "./grades.ts";
import type {
  Affix,
  Quality,
  StatName,
  Tier,
  WeaponClass,
} from "../types/index.ts";

/** The melee build's realistic STR/INT SHARES of its chosen stat points (from
 * `builds.ts` `BUILD_ROTATION.melee`: STR ×4, INT ×2 of 8 beats). Plain constants
 * (rather than importing `buildStatWeights`, which would close an `equipment ↔
 * builds` import cycle, and defined ABOVE the weapon catalog since the grade
 * variants read the build-aware budget at module-eval time) — keep in step with
 * the melee rotation. Consumed by `meleeBudgetTargets`. */
const MELEE_BUILD_STR_SHARE = 0.5;
const MELEE_BUILD_INT_SHARE = 0.25;

// ---- Tiers -----------------------------------------------------------------

/**
 * The full quality ladder — the Diablo ladder — defined engine-wide from day
 * one, AUTHORED in `content/item_rarity.yaml` (the one place to tweak the
 * rarity aspects of items — prefixes, affix counts, unlock gates, roll
 * chances). WHEN each tier can drop is the monster-level gate in config
 * `LOOT.tierUnlockMlvl` (magic from mlvl 5, rare from 10, …); harder
 * difficulties sweeten the chances. `affixCount` is how many bonuses an item
 * of that tier rolls — an upper bound, since a family never repeats an affix
 * kind, so a piece can only carry as many as its pool holds. Affix SIZE
 * scales with the item's level (see AFFIX_POOLS), so a rare pays out twice a
 * magic's points at the same ilvl.
 */
export const TIERS: Record<Tier, { prefix: string; affixCount: number }> =
  ITEM_RARITY.tiers;

/** Roll order: try the best tier first, fall through to regular. TRASH is
 * deliberately absent — it never rolls, only scripted drops mint it. SET
 * (green) is absent too: like a named unique it is AUTHORED, minted only from
 * its boss's `uniquesByDifficulty`, never chosen by a random rarity roll.
 * Authored as `rollOrder` in `content/item_rarity.yaml`. */
export const TIER_ROLL_ORDER: readonly Exclude<
  Tier,
  "regular" | "trash" | "set"
>[] = ITEM_RARITY.rollOrder;

// ---- Make quality ------------------------------------------------------------

/**
 * The MAKE-QUALITY ladder, worst to best — the second axis every PLAIN
 * (regular-tier) weapon and armor drop rolls (see `rollQuality` in
 * items/quality.ts): the craftsmanship of the individual piece. AUTHORED in
 * `content/item_quality.yaml` (the one place to tweak the quality axis).
 * Craftsmanship and magic are exclusive, the D2 rule — a magic-or-better
 * find is always normal make. The prefix leads the item's display name
 * (BROKEN GLADIUS, PERFECT KEVLAR VEST); the numbers it scales live in
 * config `QUALITY.mults`, the mlvl-shifting odds in
 * `QUALITY.weightsLow/High` — all read from the same YAML.
 */
export const QUALITY_ORDER: readonly Quality[] = ITEM_QUALITY.order;

/** The word each make quality lends an item's name ("" for normal). */
export const QUALITY_PREFIX: Record<Quality, string> = ITEM_QUALITY.prefix;

// ---- Weapons ----------------------------------------------------------------

export type WeaponDef = {
  id: string;
  name: string;
  /** A few sentences of lore — where the piece comes from in the story's
   * world. Authored in the item's YAML; the engine treats it as opaque
   * flavor. The engine's built-in sidearm and test fixtures may omit it. */
  description?: string;
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

/**
 * The engine's BUILT-IN weapons — the only defs authored here rather than in
 * the YAML item tree. The BLASTER is engine machinery, not content: it is
 * minted unbreakable whenever the holster would otherwise be empty (see
 * `drawSidearm` in items/durability.ts, which hard-codes the id), never sits in a drop
 * pool, and the engine test fixtures ship their own copy — so it must
 * survive a sequel deleting `content/items/` wholesale.
 */
const ENGINE_WEAPONS: Record<string, WeaponDef> = {
  // A deliberate, slow cadence: each shot is an event the player can follow;
  // DEX (and the first weapon drop) is how the fire rate grows back.
  blaster: {
    id: "blaster",
    name: "BLASTER",
    description:
      "The printed polymer sidearm out of the garage ship's emergency locker. It is the weapon of last resort, and it knows it: slow, steady, and impossible to break.",
    class: "ranged",
    levelReq: 1,
    damage: 8,
    cooldownMs: 900,
    range: 260,
    durability: 150,
    projectile: { speed: 420, radius: 3, lifetimeMs: 900, sprite: "bolt" },
    icon: "icon_blaster",
  },
};

/**
 * The full weapon catalog: the YAML item tree (compiled to
 * `GENERATED_WEAPONS` — every hand-authored base, special, signature, and
 * joke drop under `content/items/<rarity>/`) plus the engine built-ins, plus
 * the generated grade variants merged below.
 */
export const WEAPON_DEFS: Record<string, WeaponDef> = {
  ...GENERATED_WEAPONS,
  ...ENGINE_WEAPONS,
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
    critMult: (def) => baseCritMult(def),
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
 * rule lacked: an endgame stat affix stays a COMPLEMENT to a spec, topping
 * out around a fifth of the hero's endgame stat cap (STATS.statHardCap, 250)
 * instead of sailing past a whole build's chosen points — a full rack of
 * affixes lifts a build, one roll never replaces the spec.
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
 * on a weapon and a worn piece. `minIlvl`s (1/10/22/36/52/70/88) deliberately
 * track where the difficulty rungs end (see LEVELING's per-rung landings):
 * each rung of the campaign unlocks the next affix generation, and the
 * harder difficulties' `lootIlvlBonus` reaches a generation a few levels
 * early — climbing the ladder is visible in the loot's very numbers. The two
 * top generations (70, 88) carry rolled gear through the ilvl 52–99 ENDGAME so
 * a deep NIGHTMARE/JESUS drop keeps out-rolling a mid-campaign one — the "better
 * gear pushes menace higher" loop stays alive past the old ilvl-52 flatline.
 */
const BRACKETS: Record<AffixDef["kind"], AffixBracket[]> = {
  stat: [
    { minIlvl: 1, min: 1, max: 3 },
    { minIlvl: 10, min: 4, max: 7 },
    { minIlvl: 22, min: 8, max: 12 },
    { minIlvl: 36, min: 13, max: 18 },
    { minIlvl: 52, min: 19, max: 25 },
    { minIlvl: 70, min: 26, max: 34 },
    // Top generation ≈ a fifth of STATS.statHardCap (250): the ceiling rule
    // that keeps one affix a COMPLEMENT to a spec, never a replacement for it.
    { minIlvl: 88, min: 35, max: 46 },
  ],
  damagePct: [
    { minIlvl: 1, min: 0.05, max: 0.1 },
    { minIlvl: 10, min: 0.11, max: 0.18 },
    { minIlvl: 22, min: 0.19, max: 0.28 },
    { minIlvl: 36, min: 0.29, max: 0.4 },
    { minIlvl: 52, min: 0.41, max: 0.55 },
    { minIlvl: 70, min: 0.56, max: 0.75 },
    { minIlvl: 88, min: 0.76, max: 1.0 },
  ],
  crit: [
    { minIlvl: 1, min: 0.02, max: 0.03 },
    { minIlvl: 10, min: 0.03, max: 0.05 },
    { minIlvl: 22, min: 0.05, max: 0.07 },
    { minIlvl: 36, min: 0.07, max: 0.09 },
    { minIlvl: 52, min: 0.09, max: 0.12 },
    { minIlvl: 70, min: 0.12, max: 0.15 },
    // Crit affixes feed the pre-saturation crit chance; `playerCritChance`
    // bends the total toward STATS.critCap, so a stacked-crit endgame build
    // still can't reach a degenerate 100%.
    { minIlvl: 88, min: 0.15, max: 0.19 },
  ],
  maxHp: [
    { minIlvl: 1, min: 5, max: 12 },
    { minIlvl: 10, min: 13, max: 25 },
    { minIlvl: 22, min: 26, max: 45 },
    { minIlvl: 36, min: 46, max: 70 },
    { minIlvl: 52, min: 71, max: 100 },
    { minIlvl: 70, min: 101, max: 140 },
    { minIlvl: 88, min: 141, max: 190 },
  ],
  armor: [
    { minIlvl: 1, min: 4, max: 8 },
    { minIlvl: 10, min: 9, max: 16 },
    { minIlvl: 22, min: 17, max: 28 },
    { minIlvl: 36, min: 29, max: 44 },
    { minIlvl: 52, min: 45, max: 65 },
    { minIlvl: 70, min: 66, max: 92 },
    { minIlvl: 88, min: 93, max: 125 },
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
  "luck",
  "spirit",
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
  luck: "OF FORTUNE",
  spirit: "OF THE WHALE",
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
    case "armorPen":
      return { suffix: "OF SUNDERING" };
    // Granted spells, procs, sure strike, and knockback are unique/legendary
    // authoring territory — they never roll onto magic items, so they lend no
    // name (the named item carries its own).
    case "spell":
    case "proc":
    case "sureStrike":
    case "knockback":
      return {};
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
// load `adoptEquipment` (items/rolling.ts) parks that snapshot HERE, under a stable
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
 * A weapon's crit-damage multiplier — a flat CLASS TRAIT (`STATS.critMultByClass`),
 * ordered RANGED > MELEE > MAGIC. It is the WHOLE of a weapon's crit weight:
 * there is no per-weapon and no stat-scaled crit-damage term, so every weapon of
 * a class crits for the same weight and the item card shows no per-item crit
 * number. A build earns its crit CHANCE from stats/gear; the class fixes crit
 * WEIGHT. The damage-budget model prices crit off this same figure.
 */
export function baseCritMult(def: WeaponDef): number {
  return STATS.critMultByClass[def.class] ?? STATS.critMultiplier;
}

/**
 * A weapon's damage-range half-width as a fraction of its average `damage`:
 * its own `damageVariance` override, else the global `WEAPON.damageVariance`.
 * The one source every range surface reads — the per-hit roll (rollWeaponDamage
 * in items/weapon-math.ts), the item card's "DMG min–max", and the arsenal sheet.
 */
export function weaponDamageVariance(def: WeaponDef): number {
  return def.damageVariance ?? WEAPON.damageVariance;
}

/**
 * How many foes a MELEE swing reaches given its SWEPT SECTOR — the calibrated,
 * REACH-AWARE `WEAPON.meleeAoe` model (`src/sim/aoe-calibration.ts --reach`).
 * The independent variable is the swept sector AREA (½·arc·reach² = `half`·reach²,
 * since `half` is the half-angle in radians and area = ½·(2·half)·reach²), because
 * a reach sweep showed reach — not arc — is the dominant lever (area ∝ reach²).
 * `intercept + gain·(1 − e^(−area/scaleArea))`, clamped at the design `targetCap`
 * so endgame melee keeps a viable per-hit blow. The single source of truth for
 * both the budget and the ranking.
 */
export function meleeRealizedTargets(
  halfAngleRad: number,
  reach: number,
): number {
  const { intercept, gain, scaleArea, targetCap } = WEAPON.meleeAoe;
  const area = Math.max(0, halfAngleRad) * reach * reach;
  return Math.min(
    targetCap,
    intercept + gain * (1 - Math.exp(-area / scaleArea)),
  );
}

/**
 * How many targets a MELEE weapon is BUDGETED to hit — BUILD-AWARE: a weapon is
 * priced at the crowd it reaches once wielded by a melee hero of the REALISTIC
 * stats for its `levelReq`. Half a melee build's chosen points go to STRENGTH
 * (its `rangePerStr` REACH) and a quarter to INTELLIGENCE (the cone's `aoePerInt`
 * BREADTH), so a high-level blade sweeps a deep, wide sector and threads far more
 * of the horde than a starter — and carries a proportionally smaller per-hit blow
 * at the same budget. Capped by the same `maxMeleeTargets` INT can cleave (which,
 * for a real melee build, sits well above the geometry, so reach is the limiter).
 */
export function meleeBudgetTargets(def: WeaponDef): number {
  const chosen = chosenStatPointsThrough(def.levelReq);
  const str = MELEE_BUILD_STR_SHARE * chosen;
  const int = MELEE_BUILD_INT_SHARE * chosen;
  const reach = (def.range ?? 0) * (1 + str * STATS.rangePerStr);
  const baseHalf = ((def.sweepDeg ?? MELEE.defaultSweepDeg) * Math.PI) / 360;
  const half = Math.min(
    STATS.aoeMaxHalfAngle,
    baseHalf * (1 + int * STATS.aoePerInt),
  );
  const intCap = Math.max(
    1,
    MELEE.baseAoeTargets + int * STATS.aoeTargetsPerInt,
  );
  return Math.min(meleeRealizedTargets(half, reach), intCap);
}

/**
 * How many targets a weapon is BUDGETED to hit at once — the AoE
 * normalization of the damage-budget model: a weapon's effective DPS is its
 * per-target DPS × this, so an AoE weapon spreads its budget across the crowd
 * it reaches and carries a smaller per-hit blow at the same level. Melee reads
 * the build-aware, reach-scaled `meleeBudgetTargets` (a starter threads ~1.3, a
 * high-level long blade up to the `targetCap`); a volley counts its pellets, a
 * piercing round its line, chain lightning its (damage-weighted) leaps.
 */
export function weaponAssumedTargets(def: WeaponDef): number {
  const p = def.projectile;
  if (p) return rangedShotTargets(p);
  return meleeBudgetTargets(def);
}

/**
 * The value-weighted target credit for one ranged trigger pull. A SPREAD keeps
 * its raw `count`: its pellets deliver the full count× damage whether they STACK
 * on one foe at point-blank (a burst) or fan across a crowd, so `count` is the
 * honest value (the AoE calibration's distinct-foe count undersells the burst).
 * PIERCE and CHAIN instead read the CALIBRATED `WEAPON.rangedAoe` realized count
 * (~0.5 / ~0.7 distinct foes each) — they thread/leap between bodies without
 * stacking, so the old `1 + pierce` / `1 + chain` over-credited them. A single
 * projectile hits one. Shared by the budget and the auto-equip ranking.
 */
export function rangedShotTargets(
  p: NonNullable<WeaponDef["projectile"]>,
): number {
  if (p.count && p.count > 1) return p.count;
  const { piercePerHit, chainPerHit } = WEAPON.rangedAoe;
  if (p.pierce) return 1 + p.pierce * piercePerHit;
  if (p.chain) return 1 + p.chain * chainPerHit;
  return 1;
}

/**
 * The RANKED target credit for a ranged weapon in the AUTO-EQUIP scoring
 * (`weaponScore`) — the budget count with a SPREAD damped: its `count` is a
 * point-blank burst that a lone foe at range doesn't cash, so it ranks at
 * `1 + (count − 1) · spreadRankDamp` and never paper-out-ranks a reliable
 * single-target/pierce weapon. Pierce/chain rank at their full calibrated count
 * (`rangedShotTargets`). Ranged only; melee has its own realized curve.
 */
export function rangedRankTargets(def: WeaponDef): number {
  const p = def.projectile;
  if (!p) return 1;
  if (p.count && p.count > 1)
    return 1 + (p.count - 1) * WEAPON.rangedAoe.spreadRankDamp;
  return rangedShotTargets(p);
}

// The AUTO-EQUIP melee ranking no longer has its own def-only function: unlike
// the budget (which estimates the realistic stats for a weapon's level), the
// ranking runs with the LIVE hero, so `weaponScore` credits melee targets from
// the hero's ACTUAL reach/cone via `meleeRealizedTargets(weaponSweepHalfAngle,
// weaponRangeFor)` capped by `maxMeleeTargets` — see items/weapon-math.ts.
