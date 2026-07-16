// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The gear catalog: everything equippable that is not a weapon — the four
// ARMOR slots (head/chest/legs/feet), charms, and bags. Split out of
// equipment.ts (which keeps the weapons, tiers, and affix machinery) purely
// by size; the lookups and active-registry plumbing still live there, and
// this module is re-exported through it. Levels pick which pieces can drop
// via their `gearPool`s; WHEN a base can drop is its `levelReq` against the
// killer's monster level, exactly like a weapon's.

import { gearGradeVariants, type Grade } from "./grades.ts";
import type { ArmorType, EquipSlot, StatName } from "../types.ts";

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
  /**
   * TreasureClass drop weight (D2's `Prob`): the relative odds this base is the
   * one picked from its level's eligible pool. Omitted = 1 (an even pool). Set
   * below 1 to make a piece a rarer find, above to make it common.
   */
  dropWeight?: number;
  /** Flat bonuses baked into the item before tier affixes. */
  bonuses: { maxHp?: number; critChance?: number };
  /**
   * Armor pieces only (head/chest/legs/feet): the BASE armor points the
   * piece carries at its own `levelReq`. Worn pieces sum, and the total
   * reduces every physical hit against the attacker's level (config `ARMOR`
   * — the D2/WoW diminishing-returns curve). A rolled instance GROWS this
   * base with its item level (`ARMOR.armorPerIlvl`, stamped at mint), so a
   * deep drop of an old base is genuinely better than an early one. Absent =
   * the piece is not armor (charms, bags).
   *
   * This is the piece's CLOTH-EQUIVALENT value (the slot curve the item-forge
   * prices); the worn number is this times its material's `armorMult` (see
   * `armorType` / `ARMOR_TYPES` / `armorValueOf`), so a mail piece protects far
   * more than a cloth one of the same slot and level without re-authoring the
   * catalog off the budget line.
   */
  armor?: number;
  /**
   * Armor pieces only: what the piece is MADE of — the D2/WoW material class
   * (see `ArmorType` / config `ARMOR_TYPES`). Steers worn armor (heavier
   * materials protect more), the STRENGTH needed to wear it (mail/plate demand
   * a bruiser), and which stats its `+stat` affixes lean toward (cloth → INT,
   * leather → DEX, mail/plate → STR). PLATE additionally drops only on the
   * hardest rungs. Absent = `cloth` (the neutral, ungated baseline) — charms,
   * bags, and fixture/legacy gear carry no material.
   */
  armorType?: ArmorType;
  /**
   * Armor pieces only: hits taken before the piece wears out. Worn armor
   * spends one point per landed hit; at zero the piece goes INACTIVE —
   * still worn, contributing no armor/bonuses/affixes — until a repair kit
   * restores it (armor is never trashed, unlike a broken weapon). Absent =
   * unbreakable, like a charm or bag; unique/legendary drops also mint
   * without durability, the same "very well built" rule as weapons.
   */
  durability?: number;
  /**
   * A passive trinket's flat stat bonuses, paid out while the piece is merely
   * CARRIED — the effect rides in the bag, so a passive item never needs an
   * equip slot to work (see `effectiveStat`). This is what a `+1 INT` chip
   * grants sitting in a pocket, as distinct from armor or a charm that must
   * be worn. Absent on ordinary gear, whose bonuses only count once equipped.
   */
  passive?: Partial<Record<StatName, number>>;
  /**
   * BAGS only (`slot: "bag"`): how many extra inventory cells this bag adds on
   * top of the STRENGTH-scaled floor while it is worn in the bag slot (see
   * `inventoryCapacity`). Absent on every other piece. Bigger bags ship later
   * as new defs carrying a larger count.
   */
  bagSlots?: number;
  /**
   * Merchant material, same scale as a weapon's (see WeaponDef.material):
   * metal sells for double, precious for four times. Omitted = base value.
   */
  material?: "metal" | "precious";
  /**
   * Set on a GENERATED base-grade variant (see defs/grades.ts): which rung
   * of the Normal → Exceptional → Elite ladder this def is. Absent on every
   * hand-authored (normal) base.
   */
  grade?: Grade;
  /** A grade variant's normal ancestor — the pool base it was generated
   * from. Only armor pieces grade up; charms and bags never do. */
  gradeBase?: string;
  /** Inventory icon sprite. */
  icon: string;
  /**
   * HEAD pieces only: which on-body silhouette the paper-doll draws when the
   * piece is worn — a brimmed `cap`, a full `helm` (the default), a mirrored
   * eye-band `visor`, or a face-covering `mask`. The overlay sprite itself is
   * generated from this style plus the icon's colors (`make assets`); other
   * slots have one silhouette each, so only heads carry a style.
   */
  worn?: WornStyle;
  /**
   * The icon palette char the worn overlay's color ramp derives from.
   * Defaults to the icon's dominant color, which is right for almost every
   * piece — set this when the piece's signature color is an accent rather
   * than its main material (the APOLLO VISOR is a white bubble whose
   * identity is the gold mirror).
   */
  wornChar?: string;
};

/** Head-slot silhouette styles for the generated worn-gear overlays. */
export type WornStyle = "cap" | "helm" | "visor" | "mask";

export const GEAR_DEFS: Record<string, GearDef> = {
  // ---- The hero's own clothes: what he is wearing the night Ada vanishes.
  // Never in a drop pool — minted onto the body at creation (see create.ts /
  // DifficultyDef.startingGear). No bonuses, a whisper of armor, and honest
  // cotton durability: the first real find outclasses all three.
  t_shirt: {
    id: "t_shirt",
    name: "T-SHIRT",
    slot: "chest",
    bonuses: {},
    armor: 1,
    armorType: "cloth",
    durability: 60,
    icon: "icon_tshirt",
  },
  jeans: {
    id: "jeans",
    name: "JEANS",
    slot: "legs",
    bonuses: {},
    armor: 2,
    armorType: "cloth",
    durability: 60,
    icon: "icon_jeans",
  },
  leather_boots: {
    id: "leather_boots",
    name: "LEATHER BOOTS",
    slot: "feet",
    bonuses: {},
    armor: 2,
    armorType: "leather",
    durability: 60,
    icon: "icon_leather_boots",
  },
  // The starter BAG: the plainest carry-all, worn in the bag slot to widen the
  // inventory by two cells. It is the first of a family — bigger bags arrive
  // later as their own defs with a larger `bagSlots`. Carries no combat stats,
  // so it never competes with a charm or armor for a body slot.
  bag: {
    id: "bag",
    name: "BAG",
    slot: "bag",
    bonuses: {},
    bagSlots: 2,
    icon: "icon_bag",
  },
  // ---- SPACEZ HQ (level 1) armor: what an American space company's campus
  // yields — the office, the shipping floor, the security desk, the lab.
  // Inspired by the same rooms as the level's weapon pool (the box cutter's
  // warehouse, the 9mm's desk, the pump gun's armory).
  baseball_cap: {
    id: "baseball_cap",
    name: "BASEBALL CAP",
    slot: "head",
    // The company softball team's. Morale mandatory, protection minimal.
    bonuses: {},
    armor: 2,
    armorType: "cloth",
    durability: 60,
    icon: "icon_baseball_cap",
    worn: "cap",
  },
  hard_hat: {
    id: "hard_hat",
    name: "HARD HAT",
    slot: "head",
    levelReq: 1,
    // Shipping-floor issue, box-cutter country.
    bonuses: {},
    armor: 5,
    armorType: "leather",
    durability: 70,
    icon: "icon_hard_hat",
    worn: "cap",
  },
  welding_mask: {
    id: "welding_mask",
    material: "metal",
    name: "WELDING MASK",
    slot: "head",
    levelReq: 4,
    // The fab shop's spare face. Sparks bounce; so do teeth.
    bonuses: {},
    armor: 8,
    armorType: "mail",
    durability: 80,
    icon: "icon_welding_mask",
    worn: "mask",
  },
  riot_helmet: {
    id: "riot_helmet",
    name: "RIOT HELMET",
    slot: "head",
    levelReq: 5,
    // The armory shelf above the pump gun. HQ's hardest hat.
    bonuses: {},
    armor: 10,
    armorType: "mail",
    durability: 90,
    icon: "icon_riot_helmet",
  },
  lab_coat: {
    id: "lab_coat",
    name: "LAB COAT",
    slot: "chest",
    // Thin cotton, deep pockets — it turns a scratch and buys a little life.
    bonuses: { maxHp: 15 },
    armor: 4,
    armorType: "cloth",
    durability: 60,
    icon: "icon_lab_coat",
  },
  coveralls: {
    id: "coveralls",
    name: "COVERALLS",
    slot: "chest",
    levelReq: 1,
    // Maintenance issue, one size fits most.
    bonuses: {},
    armor: 8,
    armorType: "leather",
    durability: 70,
    icon: "icon_coveralls",
  },
  kevlar_vest: {
    id: "kevlar_vest",
    name: "KEVLAR VEST",
    slot: "chest",
    levelReq: 4,
    // The security desk's other drawer — the 9mm's counterpart.
    bonuses: {},
    armor: 16,
    armorType: "leather",
    durability: 90,
    icon: "icon_kevlar_vest",
  },
  cargo_pants: {
    id: "cargo_pants",
    name: "CARGO PANTS",
    slot: "legs",
    levelReq: 1,
    bonuses: {},
    armor: 6,
    armorType: "leather",
    durability: 70,
    icon: "icon_cargo_pants",
  },
  padded_work_pants: {
    id: "padded_work_pants",
    name: "PADDED WORK PANTS",
    slot: "legs",
    levelReq: 4,
    // Knee pads sewn in — the warehouse knows its floors.
    bonuses: {},
    armor: 10,
    armorType: "leather",
    durability: 80,
    icon: "icon_work_pants",
  },
  sneakers: {
    id: "sneakers",
    name: "SNEAKERS",
    slot: "feet",
    bonuses: {},
    armor: 3,
    armorType: "cloth",
    durability: 60,
    icon: "icon_sneakers",
  },
  steel_toe_boots: {
    id: "steel_toe_boots",
    material: "metal",
    name: "STEEL-TOE BOOTS",
    slot: "feet",
    levelReq: 3,
    bonuses: {},
    armor: 8,
    armorType: "mail",
    durability: 80,
    icon: "icon_steel_boots",
  },
  // ---- THE MOON (level 2) armor: what the 70s ferried up, cut from the
  // same cloth as the pool's wrench and revolver — nothing made after 1979.
  mission_cap: {
    id: "mission_cap",
    name: "MISSION CAP",
    slot: "head",
    levelReq: 5,
    // Ground-crew cotton with the patch still on.
    bonuses: {},
    armor: 8,
    armorType: "cloth",
    durability: 80,
    icon: "icon_mission_cap",
    worn: "cap",
  },
  apollo_visor: {
    id: "apollo_visor",
    material: "precious",
    name: "APOLLO VISOR",
    slot: "head",
    levelReq: 7,
    // The gold-mirrored bubble. Fifty years of glare, turned.
    bonuses: {},
    armor: 16,
    armorType: "leather",
    durability: 100,
    icon: "icon_apollo_visor",
    worn: "visor",
    wornChar: "y", // the gold mirror, not the white bubble around it
  },
  flight_jacket: {
    id: "flight_jacket",
    name: "FLIGHT JACKET",
    slot: "chest",
    levelReq: 6,
    // Crew survival kit — packed beside the service revolver.
    bonuses: {},
    armor: 16,
    armorType: "leather",
    durability: 90,
    icon: "icon_flight_jacket",
  },
  micrometeoroid_vest: {
    id: "micrometeoroid_vest",
    name: "MICROMETEOROID VEST",
    slot: "chest",
    levelReq: 9,
    // Layered like the landers: whipple shielding, tailored.
    bonuses: {},
    armor: 24,
    armorType: "mail",
    durability: 110,
    icon: "icon_micro_vest",
  },
  thermal_leggings: {
    id: "thermal_leggings",
    name: "THERMAL LEGGINGS",
    slot: "legs",
    levelReq: 6,
    bonuses: {},
    armor: 12,
    armorType: "cloth",
    durability: 80,
    icon: "icon_thermal_leggings",
  },
  pressure_trousers: {
    id: "pressure_trousers",
    name: "PRESSURE TROUSERS",
    slot: "legs",
    levelReq: 8,
    // The lower half of a suit that never got its top back.
    bonuses: {},
    armor: 16,
    armorType: "leather",
    durability: 100,
    icon: "icon_pressure_trousers",
  },
  lunar_overshoes: {
    id: "lunar_overshoes",
    name: "LUNAR OVERSHOES",
    slot: "feet",
    levelReq: 6,
    // Galoshes rated for the Sea of Tranquility.
    bonuses: {},
    armor: 10,
    armorType: "leather",
    durability: 80,
    icon: "icon_lunar_overshoes",
  },
  moon_boots: {
    id: "moon_boots",
    name: "MOON BOOTS",
    slot: "feet",
    levelReq: 8,
    // The classic print-leaving kind. Big soles, bigger history.
    bonuses: {},
    armor: 14,
    armorType: "leather",
    durability: 100,
    icon: "icon_moon_boots",
  },
  // ---- MARS (level 3) armor: printed overnight by the colony AI, kin to
  // the pool's smart pistol and railgun. No seams, no straps, no manuals.
  targeting_monocle: {
    id: "targeting_monocle",
    name: "TARGETING MONOCLE",
    slot: "head",
    levelReq: 10,
    // The smart pistol's other half: it watches where the darts go.
    bonuses: {},
    armor: 16,
    armorType: "leather",
    durability: 100,
    icon: "icon_monocle",
    worn: "visor",
  },
  neural_visor: {
    id: "neural_visor",
    name: "NEURAL VISOR",
    slot: "head",
    levelReq: 12,
    bonuses: {},
    armor: 20,
    armorType: "cloth",
    durability: 110,
    icon: "icon_neural_visor",
    worn: "visor",
  },
  printed_helm: {
    id: "printed_helm",
    name: "PRINTED HELM",
    slot: "head",
    levelReq: 14,
    // One seamless ceramic piece. The printer refused to explain it.
    bonuses: {},
    armor: 26,
    armorType: "plate",
    durability: 120,
    icon: "icon_printed_helm",
  },
  polymer_shell: {
    id: "polymer_shell",
    name: "POLYMER SHELL",
    slot: "chest",
    levelReq: 10,
    bonuses: {},
    armor: 22,
    armorType: "mail",
    durability: 100,
    icon: "icon_polymer_shell",
  },
  nanoweave_plate: {
    id: "nanoweave_plate",
    name: "NANOWEAVE PLATE",
    slot: "chest",
    levelReq: 12,
    // Woven at a scale nobody audits.
    bonuses: {},
    armor: 28,
    armorType: "mail",
    durability: 110,
    icon: "icon_nanoweave",
  },
  aegis_exoplate: {
    id: "aegis_exoplate",
    name: "AEGIS EXOPLATE",
    slot: "chest",
    levelReq: 15,
    // The colony pool's capstone: it braces before you know you're hit.
    bonuses: { maxHp: 20 },
    armor: 34,
    armorType: "plate",
    durability: 130,
    icon: "icon_aegis_plate",
  },
  carbon_leggings: {
    id: "carbon_leggings",
    name: "CARBON LEGGINGS",
    slot: "legs",
    levelReq: 11,
    bonuses: {},
    armor: 18,
    armorType: "leather",
    durability: 100,
    icon: "icon_carbon_leggings",
  },
  servo_greaves: {
    id: "servo_greaves",
    material: "metal",
    name: "SERVO GREAVES",
    slot: "legs",
    levelReq: 13,
    // They walk part of the walk for you.
    bonuses: {},
    armor: 24,
    armorType: "mail",
    durability: 120,
    icon: "icon_servo_greaves",
  },
  gecko_soles: {
    id: "gecko_soles",
    name: "GECKO SOLES",
    slot: "feet",
    levelReq: 11,
    bonuses: {},
    armor: 14,
    armorType: "leather",
    durability: 100,
    icon: "icon_gecko_soles",
  },
  mag_boots: {
    id: "mag_boots",
    material: "metal",
    name: "MAG BOOTS",
    slot: "feet",
    levelReq: 14,
    bonuses: {},
    armor: 20,
    armorType: "mail",
    durability: 120,
    icon: "icon_mag_boots",
  },
  // ---- THE RIFT (level 4) armor: everything history's armories dropped
  // through, leaning medieval — the gladius and the executioner's axe get
  // the wardrobe they deserve.
  viking_helm: {
    id: "viking_helm",
    material: "metal",
    name: "VIKING HELM",
    slot: "head",
    levelReq: 15,
    // No horns. The horns were never real.
    bonuses: {},
    armor: 22,
    armorType: "mail",
    durability: 110,
    icon: "icon_viking_helm",
  },
  knights_helm: {
    id: "knights_helm",
    material: "metal",
    name: "KNIGHT'S HELM",
    slot: "head",
    levelReq: 18,
    bonuses: {},
    armor: 30,
    armorType: "mail",
    durability: 130,
    icon: "icon_knights_helm",
  },
  great_helm: {
    id: "great_helm",
    material: "metal",
    name: "GREAT HELM",
    slot: "head",
    levelReq: 21,
    // The executioner's era: a bucket that outlived every argument.
    bonuses: {},
    armor: 38,
    armorType: "plate",
    durability: 140,
    icon: "icon_great_helm",
  },
  centurion_cuirass: {
    id: "centurion_cuirass",
    material: "metal",
    name: "CENTURION CUIRASS",
    slot: "chest",
    levelReq: 15,
    // The gladius's partner, still legion-polished.
    bonuses: {},
    armor: 28,
    armorType: "plate",
    durability: 110,
    icon: "icon_cuirass",
  },
  chainmail_hauberk: {
    id: "chainmail_hauberk",
    material: "metal",
    name: "CHAINMAIL HAUBERK",
    slot: "chest",
    levelReq: 19,
    bonuses: {},
    armor: 40,
    armorType: "mail",
    durability: 130,
    icon: "icon_chainmail",
  },
  dragonscale_cloak: {
    id: "dragonscale_cloak",
    material: "precious",
    name: "DRAGONSCALE CLOAK",
    slot: "chest",
    levelReq: 22,
    // Shed, not taken — nobody skins a dragon. The rift's heaviest hide.
    bonuses: { maxHp: 35 },
    armor: 50,
    armorType: "mail",
    durability: 150,
    icon: "icon_dragonscale_cloak",
  },
  chausses: {
    id: "chausses",
    material: "metal",
    name: "CHAUSSES",
    slot: "legs",
    levelReq: 16,
    // Mail for the legs, ring by patient ring.
    bonuses: {},
    armor: 24,
    armorType: "mail",
    durability: 110,
    icon: "icon_chausses",
  },
  plate_greaves: {
    id: "plate_greaves",
    material: "metal",
    name: "PLATE GREAVES",
    slot: "legs",
    levelReq: 18,
    bonuses: {},
    armor: 34,
    armorType: "plate",
    durability: 130,
    icon: "icon_plate_greaves",
  },
  legionary_sandals: {
    id: "legionary_sandals",
    name: "LEGIONARY SANDALS",
    slot: "feet",
    levelReq: 15,
    // Caligae: two thousand years broken-in.
    bonuses: {},
    armor: 18,
    armorType: "leather",
    durability: 100,
    icon: "icon_sandals",
  },
  sabatons: {
    id: "sabatons",
    material: "metal",
    name: "SABATONS",
    slot: "feet",
    levelReq: 20,
    bonuses: {},
    armor: 28,
    armorType: "mail",
    durability: 130,
    icon: "icon_sabatons",
  },
  // ---- Charms and trinkets (unchanged by the armor revamp) -------------------
  id_badge: {
    id: "id_badge",
    name: "ID BADGE",
    slot: "charm",
    // All-areas access reads as luck: doors you should not have opened.
    bonuses: { critChance: 0.03 },
    icon: "icon_badge",
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
  red_dust_charm: {
    id: "red_dust_charm",
    name: "RED DUST CHARM",
    slot: "charm",
    // A vial of the regolith the colony is built on. Lucky, probably.
    bonuses: { critChance: 0.03 },
    icon: "icon_charm",
  },
  // ---- Rift charms: what history's missing carry, and what the void rains.
  stardust_charm: {
    id: "stardust_charm",
    material: "precious",
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
    material: "precious",
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
    material: "precious",
    name: "CRYSTAL ORB",
    slot: "charm",
    levelReq: 16,
    // It shows you the blow before it lands.
    bonuses: { critChance: 0.04 },
    icon: "icon_crystal_orb",
  },
  grimoire: {
    id: "grimoire",
    material: "precious",
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
    material: "precious",
    name: "ENCHANTED RING",
    slot: "charm",
    levelReq: 20,
    // One ring. It wants to be worn — and it earns it.
    bonuses: { critChance: 0.05 },
    icon: "icon_enchanted_ring",
  },
  // ---- EASTWORLD (level 5) armor: the park wardrobe department's hybrid
  // frontier kit — cowboy silhouettes over ZAI-printed shells, same fabricators
  // as the weapon pool. Requirements ride the normal band's top rungs (18–23).
  servo_stetson: {
    id: "servo_stetson",
    name: "SERVO STETSON",
    slot: "head",
    levelReq: 18,
    // A ten-gallon hat with a one-gallon gyro: it tips itself at danger.
    bonuses: {},
    armor: 32,
    armorType: "leather",
    durability: 130,
    icon: "icon_stetson",
    worn: "cap",
  },
  mirrorshade_visor: {
    id: "mirrorshade_visor",
    material: "metal",
    name: "MIRRORSHADE VISOR",
    slot: "head",
    levelReq: 22,
    // The gunslinger hosts' eye-band: it shows the crowd only themselves.
    bonuses: {},
    armor: 40,
    armorType: "leather",
    durability: 140,
    icon: "icon_mirrorshade",
    worn: "visor",
  },
  exo_duster: {
    id: "exo_duster",
    name: "EXO-DUSTER",
    slot: "chest",
    levelReq: 20,
    // A trail duster over a printed exoframe — flaps in the wind, stops a slug.
    bonuses: {},
    armor: 44,
    armorType: "leather",
    durability: 140,
    icon: "icon_duster",
  },
  tin_star_cuirass: {
    id: "tin_star_cuirass",
    material: "metal",
    name: "TIN STAR CUIRASS",
    slot: "chest",
    levelReq: 23,
    // The sheriff hosts' chest plate, star included. The star is the armor.
    bonuses: {},
    armor: 48,
    armorType: "plate",
    durability: 150,
    icon: "icon_tin_star",
  },
  rattlesnake_chaps: {
    id: "rattlesnake_chaps",
    name: "RATTLESNAKE CHAPS",
    slot: "legs",
    levelReq: 19,
    // Cut from the park's own robot rattlers. They still rattle. Ignore it.
    bonuses: {},
    armor: 30,
    armorType: "leather",
    durability: 130,
    icon: "icon_chaps",
  },
  spur_jet_boots: {
    id: "spur_jet_boots",
    material: "metal",
    name: "SPUR-JET BOOTS",
    slot: "feet",
    levelReq: 21,
    // Riding boots with micro-thrusters in the spurs. The rowels are turbines.
    bonuses: {},
    armor: 31,
    armorType: "leather",
    durability: 140,
    icon: "icon_spur_boots",
  },
  sheriffs_badge: {
    id: "sheriffs_badge",
    material: "metal",
    name: "SHERIFF'S BADGE",
    slot: "charm",
    levelReq: 18,
    // Authority is mostly posture. The badge handles the posture.
    bonuses: { critChance: 0.03 },
    icon: "icon_sheriff_badge",
  },
  // ---- Eastworld signatures — elite drops, never pooled.
  seagulls_ponytail: {
    id: "seagulls_ponytail",
    name: "SEAGULL'S PONYTAIL",
    slot: "charm",
    // Cut clean off mid-lecture. It remembers seven kinds of ju-jutsu,
    // three of which exist.
    bonuses: { maxHp: 30 },
    icon: "icon_ponytail",
  },
  bottomless_carafe: {
    id: "bottomless_carafe",
    material: "precious",
    name: "BOTTOMLESS CARAFE",
    slot: "charm",
    // DEPARDIEU's carafe: it refills itself, and so, somehow, do you.
    bonuses: { maxHp: 40 },
    icon: "icon_carafe",
  },
  snows_dead_mans_switch: {
    id: "snows_dead_mans_switch",
    name: "DEAD MAN'S SWITCH",
    slot: "charm",
    // SNOW's insurance policy: if his heart stops, everything publishes.
    // Worn, it gives yours a very good reason to keep going.
    bonuses: { maxHp: 35 },
    icon: "icon_dead_switch",
  },
  // ---- THE SEVERED HAND: the cow-level key. A biometric palm off some
  // bunker resident's arm, carried by RASPUTIN — the tribute road's doorman
  // holds more than one door's key. Zero bonuses, base value, no fanfare:
  // it looks like the worst charm in the game, and the only clue it isn't
  // is the USE row its card grows while the hero stands in the rift
  // (`LevelDef.gates` on the_rift / `spendGateKey`). Deliberately undocumented.
  severed_hand: {
    id: "severed_hand",
    name: "SEVERED HAND",
    slot: "charm",
    // Cold. Manicured. Won't open a conversation, but somewhere a door
    // still answers to it.
    bonuses: {},
    icon: "icon_severed_hand",
  },
  // ---- PUTAIN's brand watches: pure VALUABLES. Zero base bonuses — their
  // job is the merchant's scales (precious ×4, dropped at unique tier by the
  // man himself), the coin that buys his own estate back off the stall.
  kolex_daytonne: {
    id: "kolex_daytonne",
    material: "precious",
    name: "KOLEX DAYTONNE",
    slot: "charm",
    // Waterproof to forty metres of denial.
    bonuses: {},
    icon: "icon_watch_gold",
  },
  putek_philippe: {
    id: "putek_philippe",
    material: "precious",
    name: "PUTEK PHILIPPE",
    slot: "charm",
    // You never actually own one. It was seized from the previous owner.
    bonuses: {},
    icon: "icon_watch_silver",
  },
  vacheron_kremlinton: {
    id: "vacheron_kremlinton",
    material: "precious",
    name: "VACHERON KREMLINTON",
    slot: "charm",
    // Keeps two times: yours, and the one the state prefers.
    bonuses: {},
    icon: "icon_watch_rose",
  },
};

// The generated EXCEPTIONAL/ELITE versions of every pool armor piece — same
// look, higher numbers and requirements (see defs/grades.ts). Merged into
// the catalog at load so every surface sees them as ordinary defs.
Object.assign(GEAR_DEFS, gearGradeVariants(GEAR_DEFS));
