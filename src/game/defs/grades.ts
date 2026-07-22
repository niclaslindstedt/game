// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// BASE GRADES — the D2-style Normal → EXCEPTIONAL → ELITE base ladder that
// keeps every level's loot pool paying out new bases deep into the campaign
// (elite requirements run to level 100). Each pool base names its two
// upgraded versions here (SPATHA and FALCATA for the GLADIUS, LINKED MAIL
// and TIGULATED MAIL for the CHAINMAIL HAUBERK, …); the variant DEFS are
// GENERATED from the base — same look (icon, sprites), same behavior
// (cadence, reach, arc, projectile), but a remapped level requirement and
// numbers rescaled to sit exactly on the damage budget (weapons) or the
// armor growth curve (armor) at the new requirement.
//
// Specials, signatures, starters, charms, and bags never grade up — grades
// are the RANDOM pool's long ladder, not the story's. Levels keep authoring
// their pools in normal bases only; `rollEquipment` expands each pool entry
// to its grade family at roll time (`gradeVariantIds`), and the ordinary
// levelReq drop gate decides which grades a given monster can actually pay.

import { ARMOR } from "../config.ts";
import {
  GENERATED_GEAR_GRADE_NAMES,
  GENERATED_WEAPON_GRADE_NAMES,
} from "../../generated/items.ts";
import type { GearDef } from "./gear.ts";
import type { WeaponDef } from "./equipment.ts";

/** The two upgraded grades a base can exist in (absent = normal). */
export type Grade = "exceptional" | "elite";

/** A variant's hand-authored identity: its id and display name. */
export type GradeName = { id: string; name: string };
export type GradeNames = { exceptional: GradeName; elite: GradeName };

// ---- The requirement remap ---------------------------------------------------

/**
 * Where each grade's level requirements live. Normal bases are authored in
 * [1, `SOURCE_REQ_MAX`]; a variant's requirement maps that band linearly onto
 * its grade's band, so every level's pool unfolds its exceptional versions
 * across the mid-game and its elites across the run to level 100.
 */
const SOURCE_REQ_MAX = 23;
// Exceptional picks up exactly where the normal band ends (…23 → 24…52); the
// elite band deliberately OVERLAPS it (43…100, the D2 shape: elite work
// starts dropping in late NIGHTMARE, not only at the endgame). The overlap is
// what keeps every map's drop window alive on its high-rung revisits: a map
// whose normal sources sit low (spacez, reqs 1–8) maps its exceptionals onto
// 24–33 only, and without the overlap nothing could carry reqs 34–52 there —
// a dry rung entry at nightmare. With elite from 43, every cumulative pool
// (see the level defs' "…plus every earlier stage's arsenal") covers the
// ladder 24→100 without holes.
const GRADE_REQ_BANDS: Record<Grade, { from: number; to: number }> = {
  exceptional: { from: 24, to: 52 },
  elite: { from: 43, to: 100 },
};

/** A variant's level requirement: the base's, remapped onto the grade band. */
export function gradeLevelReq(baseReq: number, grade: Grade): number {
  const band = GRADE_REQ_BANDS[grade];
  return (
    band.from +
    Math.round(
      ((Math.min(baseReq, SOURCE_REQ_MAX) - 1) * (band.to - band.from)) /
        (SOURCE_REQ_MAX - 1),
    )
  );
}

// ---- The stat rescale ----------------------------------------------------------

/**
 * The damage-budget line (keep in lockstep with scripts/weapon-budget.mjs):
 * every weapon owes an effective DPS of `BASE + PER_LEVEL × (levelReq − 1)`.
 * A variant keeps the base's cadence, targets, and crit shape, so scaling
 * its per-hit damage by the budget ratio lands it exactly on the line at
 * its new requirement — a generated variant passes the budget checker by
 * construction.
 */
const BUDGET_BASE = 40;
const BUDGET_PER_LEVEL = 4;

const budgetAt = (levelReq: number): number =>
  BUDGET_BASE + BUDGET_PER_LEVEL * (levelReq - 1);

/** Better-built work outlasts the original: wear budget per grade. */
const GRADE_DURABILITY: Record<Grade, number> = {
  exceptional: 1.25,
  elite: 1.5,
};

/**
 * An armor variant first grows its points along the same curve an ilvl-grown
 * instance of the base would (`ARMOR.armorPerIlvl` per requirement level),
 * then takes a native edge on top — so a true elite base modestly out-arms a
 * lucky deep drop of its normal ancestor at the same item level.
 */
const GRADE_ARMOR_EDGE: Record<Grade, number> = {
  exceptional: 1.1,
  elite: 1.2,
};

// ---- The name catalog ----------------------------------------------------------
// One entry per POOL base (and only pool bases): the exceptional and elite
// identities. Same look in the world — the upgrade is the name and the
// numbers, the D2 way (Short Sword → Gladius → Falcata). AUTHORED in each
// base item's YAML (`grades:` in content/items/regular/<id>.yaml) and
// compiled into the generated catalogs read here.

const WEAPON_GRADE_NAMES: Record<string, GradeNames> =
  GENERATED_WEAPON_GRADE_NAMES;

const GEAR_GRADE_NAMES: Record<string, GradeNames> = GENERATED_GEAR_GRADE_NAMES;

// ---- Variant generation --------------------------------------------------------

const GRADES: Grade[] = ["exceptional", "elite"];

/**
 * Generate the exceptional and elite WEAPON variants of every base named in
 * the catalog above: same class, look, cadence, reach, arc, and projectile —
 * a remapped level requirement, damage set straight ONTO the budget line at
 * it (so a generated variant passes the budget checker by construction,
 * independent of any drift its base carries), and a longer wear budget.
 * Called once at module load (equipment.ts) to fill the shipped catalog;
 * the budget model's two shape readers are injected from there to keep this
 * module cycle-free.
 */
export function weaponGradeVariants(
  bases: Record<string, WeaponDef>,
  model: {
    assumedTargets: (def: WeaponDef) => number;
    critMult: (def: WeaponDef) => number;
  },
): Record<string, WeaponDef> {
  // The reference crit chance the budget lift is priced at (keep in lockstep
  // with scripts/weapon-budget.mjs REF_CRIT).
  const REF_CRIT = 0.15;
  const variants: Record<string, WeaponDef> = {};
  for (const [baseId, names] of Object.entries(WEAPON_GRADE_NAMES)) {
    const base = bases[baseId];
    if (!base) throw new Error(`grade names for unknown weapon "${baseId}"`);
    for (const grade of GRADES) {
      const { id, name } = names[grade];
      const levelReq = gradeLevelReq(base.levelReq, grade);
      const critLift = 1 + REF_CRIT * (model.critMult(base) - 1);
      const variant: WeaponDef = {
        ...structuredClone(base),
        id,
        name,
        grade,
        gradeBase: baseId,
        levelReq,
        durability: Math.round(base.durability * GRADE_DURABILITY[grade]),
      };
      // Price the variant's damage on ITS OWN shape, not the base's: the melee
      // budget's assumed targets is now build-aware (it grows with `levelReq` as
      // a melee hero's STR deepens reach), so a higher-grade variant assumes a
      // bigger crowd and must carry a proportionally smaller per-hit blow. (For
      // ranged, `assumedTargets` is level-independent, so this is a no-op.)
      variant.damage = Math.round(
        (budgetAt(levelReq) * (base.cooldownMs / 1000)) /
          model.assumedTargets(variant) /
          critLift,
      );
      variants[id] = variant;
    }
  }
  return variants;
}

/**
 * Generate the exceptional and elite ARMOR variants of every base named in
 * the catalog above: same slot and look — a remapped level requirement,
 * armor points grown along the ilvl curve to it plus the grade's native
 * edge, flat bonuses grown in step, and a longer wear budget.
 */
export function gearGradeVariants(
  bases: Record<string, GearDef>,
): Record<string, GearDef> {
  const variants: Record<string, GearDef> = {};
  for (const [baseId, names] of Object.entries(GEAR_GRADE_NAMES)) {
    const base = bases[baseId];
    if (!base) throw new Error(`grade names for unknown gear "${baseId}"`);
    if (base.armor === undefined) {
      throw new Error(`grade names for non-armor gear "${baseId}"`);
    }
    const baseReq = base.levelReq ?? 1;
    for (const grade of GRADES) {
      const { id, name } = names[grade];
      const levelReq = gradeLevelReq(baseReq, grade);
      const mult =
        (1 + ARMOR.armorPerIlvl * (levelReq - baseReq)) *
        GRADE_ARMOR_EDGE[grade];
      const variant: GearDef = {
        ...structuredClone(base),
        id,
        name,
        grade,
        gradeBase: baseId,
        levelReq,
        armor: Math.round(base.armor * mult),
        bonuses: {
          ...base.bonuses,
          ...(base.bonuses.maxHp !== undefined && {
            maxHp: Math.round(base.bonuses.maxHp * mult),
          }),
        },
      };
      if (base.durability !== undefined) {
        variant.durability = Math.round(
          base.durability * GRADE_DURABILITY[grade],
        );
      }
      variants[id] = variant;
    }
  }
  return variants;
}

/**
 * The upgraded ids a pool base implies — `rollEquipment` expands every pool
 * entry through this, so levels keep authoring normal bases only and the
 * grade ladder rides along automatically (gated, as ever, by each variant's
 * own levelReq against the killer's monster level). Ids not in the grade
 * catalog (specials, charms, fixture ids) expand to nothing.
 */
export function gradeVariantIds(baseId: string): string[] {
  const names = WEAPON_GRADE_NAMES[baseId] ?? GEAR_GRADE_NAMES[baseId];
  if (!names) return [];
  return GRADES.map((grade) => names[grade].id);
}
