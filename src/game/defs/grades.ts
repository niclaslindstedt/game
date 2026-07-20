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
import type { GearDef } from "./gear.ts";
import type { WeaponDef } from "./equipment.ts";

/** The two upgraded grades a base can exist in (absent = normal). */
export type Grade = "exceptional" | "elite";

/** A variant's hand-authored identity: its id and display name. */
type GradeName = { id: string; name: string };
type GradeNames = { exceptional: GradeName; elite: GradeName };

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
// numbers, the D2 way (Short Sword → Gladius → Falcata).

const WEAPON_GRADE_NAMES: Record<string, GradeNames> = {
  // SPACEZ HQ
  box_cutter: {
    exceptional: { id: "ceramic_cutter", name: "CERAMIC CUTTER" },
    elite: { id: "mono_cutter", name: "MONO-EDGE CUTTER" },
  },
  security_baton: {
    exceptional: { id: "riot_baton", name: "RIOT BATON" },
    elite: { id: "shock_baton", name: "SHOCK BATON" },
  },
  nine_mm: {
    exceptional: { id: "match_pistol", name: "MATCH PISTOL" },
    elite: { id: "race_gun", name: "RACE GUN" },
  },
  prototype_laser: {
    exceptional: { id: "pilot_run_laser", name: "PILOT-RUN LASER" },
    elite: { id: "flight_model_laser", name: "FLIGHT-MODEL LASER" },
  },
  pump_shotgun: {
    exceptional: { id: "combat_shotgun", name: "COMBAT SHOTGUN" },
    elite: { id: "auto_shotgun", name: "AUTO SHOTGUN" },
  },
  microwave_emitter: {
    exceptional: { id: "phase_emitter", name: "PHASE EMITTER" },
    elite: { id: "maser_lance", name: "MASER LANCE" },
  },
  // THE MOON
  lunar_wrench: {
    exceptional: { id: "torque_wrench", name: "TORQUE WRENCH" },
    elite: { id: "hydraulic_wrench", name: "HYDRAULIC WRENCH" },
  },
  service_revolver: {
    exceptional: { id: "magnum_revolver", name: "MAGNUM REVOLVER" },
    elite: { id: "ranger_revolver", name: "RANGER REVOLVER" },
  },
  geology_hammer: {
    exceptional: { id: "seismic_hammer", name: "SEISMIC HAMMER" },
    elite: { id: "meteor_hammer", name: "METEOR HAMMER" },
  },
  surplus_carbine: {
    exceptional: { id: "scout_rifle", name: "SCOUT RIFLE" },
    elite: { id: "marksman_rifle", name: "MARKSMAN RIFLE" },
  },
  retro_raygun: {
    exceptional: { id: "atomic_raygun", name: "ATOMIC RAYGUN" },
    elite: { id: "cosmic_raygun", name: "COSMIC RAYGUN" },
  },
  pulsar_rod: {
    exceptional: { id: "magnetar_rod", name: "MAGNETAR ROD" },
    elite: { id: "quasar_rod", name: "QUASAR ROD" },
  },
  // MARS
  smart_pistol: {
    exceptional: { id: "genius_pistol", name: "GENIUS PISTOL" },
    elite: { id: "oracle_pistol", name: "ORACLE PISTOL" },
  },
  plasma_blade: {
    exceptional: { id: "plasma_saber", name: "PLASMA SABER" },
    elite: { id: "plasma_claymore", name: "PLASMA CLAYMORE" },
  },
  railgun: {
    exceptional: { id: "gauss_rifle", name: "GAUSS RIFLE" },
    elite: { id: "mass_driver", name: "MASS DRIVER" },
  },
  arc_projector: {
    exceptional: { id: "storm_projector", name: "STORM PROJECTOR" },
    elite: { id: "tempest_projector", name: "TEMPEST PROJECTOR" },
  },
  gravity_maul: {
    exceptional: { id: "neutron_maul", name: "NEUTRON MAUL" },
    elite: { id: "quasar_maul", name: "QUASAR MAUL" },
  },
  graviton_maw: {
    exceptional: { id: "tidal_maw", name: "TIDAL MAW" },
    elite: { id: "horizon_maw", name: "EVENT HORIZON MAW" },
  },
  // THE RIFT
  gladius: {
    exceptional: { id: "spatha", name: "SPATHA" },
    elite: { id: "falcata", name: "FALCATA" },
  },
  longbow: {
    exceptional: { id: "war_bow", name: "WAR BOW" },
    elite: { id: "siege_bow", name: "SIEGE BOW" },
  },
  blunderbuss: {
    exceptional: { id: "dragon_blunderbuss", name: "DRAGON BLUNDERBUSS" },
    elite: { id: "hand_mortar", name: "HAND MORTAR" },
  },
  executioners_axe: {
    exceptional: { id: "berserker_axe", name: "BERSERKER AXE" },
    elite: { id: "glorious_axe", name: "GLORIOUS AXE" },
  },
  sorcerers_staff: {
    exceptional: { id: "archmage_staff", name: "ARCHMAGE STAFF" },
    elite: { id: "eldritch_staff", name: "ELDRITCH STAFF" },
  },
  ember_wand: {
    exceptional: { id: "inferno_wand", name: "INFERNO WAND" },
    elite: { id: "solar_wand", name: "SOLAR WAND" },
  },
  // EASTWORLD
  mono_wire_lariat: {
    exceptional: { id: "razor_lariat", name: "RAZOR LARIAT" },
    elite: { id: "singularity_lasso", name: "SINGULARITY LASSO" },
  },
  plasma_peacemaker: {
    exceptional: { id: "ion_peacemaker", name: "ION PEACEMAKER" },
    elite: { id: "nova_peacemaker", name: "NOVA PEACEMAKER" },
  },
  branding_iron: {
    exceptional: { id: "fusion_brand", name: "FUSION BRAND" },
    elite: { id: "starfall_brand", name: "STARFALL BRAND" },
  },
  maglev_repeater: {
    exceptional: { id: "coilgun_repeater", name: "COILGUN REPEATER" },
    elite: { id: "railstorm_repeater", name: "RAILSTORM REPEATER" },
  },
  snake_oil_sprayer: {
    exceptional: { id: "viper_oil_sprayer", name: "VIPER-OIL SPRAYER" },
    elite: { id: "basilisk_sprayer", name: "BASILISK SPRAYER" },
  },
  high_noon: {
    exceptional: { id: "solar_noon", name: "SOLAR NOON" },
    elite: { id: "midnight_sun", name: "MIDNIGHT SUN" },
  },
};

const GEAR_GRADE_NAMES: Record<string, GradeNames> = {
  // SPACEZ HQ
  baseball_cap: {
    exceptional: { id: "varsity_cap", name: "VARSITY CAP" },
    elite: { id: "champions_cap", name: "CHAMPION'S CAP" },
  },
  hard_hat: {
    exceptional: { id: "foremans_hard_hat", name: "FOREMAN'S HARD HAT" },
    elite: { id: "titanium_hard_hat", name: "TITANIUM HARD HAT" },
  },
  welding_mask: {
    exceptional: { id: "arc_welding_mask", name: "ARC WELDING MASK" },
    elite: { id: "fusion_mask", name: "FUSION MASK" },
  },
  riot_helmet: {
    exceptional: { id: "assault_helmet", name: "ASSAULT HELMET" },
    elite: { id: "juggernaut_helmet", name: "JUGGERNAUT HELMET" },
  },
  lab_coat: {
    exceptional: { id: "cleanroom_coat", name: "CLEANROOM COAT" },
    elite: { id: "hazmat_coat", name: "HAZMAT COAT" },
  },
  coveralls: {
    exceptional: { id: "mechanics_coveralls", name: "MECHANIC'S COVERALLS" },
    elite: { id: "armored_coveralls", name: "ARMORED COVERALLS" },
  },
  kevlar_vest: {
    exceptional: { id: "tactical_vest", name: "TACTICAL VEST" },
    elite: { id: "composite_vest", name: "COMPOSITE VEST" },
  },
  cargo_pants: {
    exceptional: { id: "tactical_pants", name: "TACTICAL PANTS" },
    elite: { id: "operator_pants", name: "OPERATOR PANTS" },
  },
  padded_work_pants: {
    exceptional: {
      id: "reinforced_work_pants",
      name: "REINFORCED WORK PANTS",
    },
    elite: { id: "armored_work_pants", name: "ARMORED WORK PANTS" },
  },
  sneakers: {
    exceptional: { id: "cross_trainers", name: "CROSS-TRAINERS" },
    elite: { id: "parkour_shoes", name: "PARKOUR SHOES" },
  },
  steel_toe_boots: {
    exceptional: { id: "titanium_toe_boots", name: "TITANIUM-TOE BOOTS" },
    elite: { id: "carbide_toe_boots", name: "CARBIDE-TOE BOOTS" },
  },
  // THE MOON
  mission_cap: {
    exceptional: { id: "commanders_cap", name: "COMMANDER'S CAP" },
    elite: { id: "flight_directors_cap", name: "FLIGHT DIRECTOR'S CAP" },
  },
  apollo_visor: {
    exceptional: { id: "artemis_visor", name: "ARTEMIS VISOR" },
    elite: { id: "orion_visor", name: "ORION VISOR" },
  },
  flight_jacket: {
    exceptional: { id: "pilot_jacket", name: "TEST PILOT JACKET" },
    elite: { id: "aces_jacket", name: "ACE'S JACKET" },
  },
  micrometeoroid_vest: {
    exceptional: { id: "whipple_vest", name: "WHIPPLE VEST" },
    elite: { id: "debris_shield_vest", name: "DEBRIS-SHIELD VEST" },
  },
  thermal_leggings: {
    exceptional: { id: "aerogel_leggings", name: "AEROGEL LEGGINGS" },
    elite: { id: "cryo_leggings", name: "CRYO LEGGINGS" },
  },
  pressure_trousers: {
    exceptional: { id: "eva_trousers", name: "EVA TROUSERS" },
    elite: { id: "hardsuit_trousers", name: "HARD-SUIT TROUSERS" },
  },
  lunar_overshoes: {
    exceptional: { id: "regolith_overshoes", name: "REGOLITH OVERSHOES" },
    elite: { id: "mare_striders", name: "MARE STRIDERS" },
  },
  moon_boots: {
    exceptional: { id: "crater_boots", name: "CRATER BOOTS" },
    elite: { id: "tranquility_boots", name: "TRANQUILITY BOOTS" },
  },
  // MARS
  targeting_monocle: {
    exceptional: { id: "prediction_monocle", name: "PREDICTION MONOCLE" },
    elite: { id: "prescient_monocle", name: "PRESCIENT MONOCLE" },
  },
  neural_visor: {
    exceptional: { id: "synaptic_visor", name: "SYNAPTIC VISOR" },
    elite: { id: "cortex_visor", name: "CORTEX VISOR" },
  },
  printed_helm: {
    exceptional: { id: "lattice_helm", name: "LATTICE HELM" },
    elite: { id: "monocoque_helm", name: "MONOCOQUE HELM" },
  },
  polymer_shell: {
    exceptional: { id: "ceramic_shell", name: "CERAMIC SHELL" },
    elite: { id: "graphene_shell", name: "GRAPHENE SHELL" },
  },
  nanoweave_plate: {
    exceptional: { id: "microlattice_plate", name: "MICROLATTICE PLATE" },
    elite: { id: "femtoweave_plate", name: "FEMTOWEAVE PLATE" },
  },
  aegis_exoplate: {
    exceptional: { id: "bulwark_exoplate", name: "BULWARK EXOPLATE" },
    elite: { id: "paladin_exoplate", name: "PALADIN EXOPLATE" },
  },
  carbon_leggings: {
    exceptional: { id: "nanotube_leggings", name: "NANOTUBE LEGGINGS" },
    elite: { id: "fullerene_leggings", name: "FULLERENE LEGGINGS" },
  },
  servo_greaves: {
    exceptional: { id: "actuator_greaves", name: "ACTUATOR GREAVES" },
    elite: { id: "exo_greaves", name: "EXO GREAVES" },
  },
  gecko_soles: {
    exceptional: { id: "spider_soles", name: "SPIDER SOLES" },
    elite: { id: "voidgrip_soles", name: "VOID-GRIP SOLES" },
  },
  mag_boots: {
    exceptional: { id: "flux_boots", name: "FLUX BOOTS" },
    elite: { id: "grav_anchor_boots", name: "GRAV-ANCHOR BOOTS" },
  },
  // THE RIFT
  viking_helm: {
    exceptional: { id: "jarls_helm", name: "JARL'S HELM" },
    elite: { id: "einherjar_helm", name: "EINHERJAR HELM" },
  },
  knights_helm: {
    exceptional: { id: "crusaders_helm", name: "CRUSADER'S HELM" },
    elite: { id: "templars_helm", name: "TEMPLAR'S HELM" },
  },
  great_helm: {
    exceptional: { id: "giants_helm", name: "GIANT'S HELM" },
    elite: { id: "spired_helm", name: "SPIRED HELM" },
  },
  centurion_cuirass: {
    exceptional: { id: "legates_cuirass", name: "LEGATE'S CUIRASS" },
    elite: { id: "praetorian_cuirass", name: "PRAETORIAN CUIRASS" },
  },
  chainmail_hauberk: {
    // The D2 homage the whole system is named for.
    exceptional: { id: "linked_mail", name: "LINKED MAIL" },
    elite: { id: "tigulated_mail", name: "TIGULATED MAIL" },
  },
  dragonscale_cloak: {
    exceptional: { id: "wyrmscale_cloak", name: "WYRMSCALE CLOAK" },
    elite: { id: "elder_scale_cloak", name: "ELDER-SCALE CLOAK" },
  },
  chausses: {
    exceptional: { id: "riveted_chausses", name: "RIVETED CHAUSSES" },
    elite: { id: "double_mail_chausses", name: "DOUBLE-MAIL CHAUSSES" },
  },
  plate_greaves: {
    exceptional: { id: "fluted_greaves", name: "FLUTED GREAVES" },
    elite: { id: "mirrored_greaves", name: "MIRRORED GREAVES" },
  },
  legionary_sandals: {
    exceptional: { id: "hobnailed_caligae", name: "HOBNAILED CALIGAE" },
    elite: { id: "gilded_caligae", name: "GILDED CALIGAE" },
  },
  sabatons: {
    exceptional: { id: "gothic_sabatons", name: "GOTHIC SABATONS" },
    elite: { id: "myrmidon_sabatons", name: "MYRMIDON SABATONS" },
  },
  // EASTWORLD
  servo_stetson: {
    exceptional: { id: "marshals_stetson", name: "MARSHAL'S STETSON" },
    elite: { id: "high_nooner", name: "HIGH NOONER" },
  },
  mirrorshade_visor: {
    exceptional: { id: "duelists_visor", name: "DUELIST'S VISOR" },
    elite: { id: "deadeye_visor", name: "DEADEYE VISOR" },
  },
  exo_duster: {
    exceptional: { id: "outriders_duster", name: "OUTRIDER'S DUSTER" },
    elite: { id: "stormwall_duster", name: "STORMWALL DUSTER" },
  },
  tin_star_cuirass: {
    exceptional: { id: "silver_star_cuirass", name: "SILVER STAR CUIRASS" },
    elite: { id: "gold_star_cuirass", name: "GOLD STAR CUIRASS" },
  },
  rattlesnake_chaps: {
    exceptional: { id: "diamondback_chaps", name: "DIAMONDBACK CHAPS" },
    elite: { id: "basilisk_chaps", name: "BASILISK CHAPS" },
  },
  spur_jet_boots: {
    exceptional: { id: "thruster_spurs", name: "THRUSTER SPURS" },
    elite: { id: "afterburner_spurs", name: "AFTERBURNER SPURS" },
  },
};

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
