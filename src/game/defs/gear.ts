// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The gear catalog: everything equippable that is not a weapon — the four
// ARMOR slots (head/chest/legs/feet), charms, and bags. The pieces are
// AUTHORED IN YAML (one file per item under `content/items/regular/`,
// compiled by scripts/generate-items.mjs); this module wraps them with the
// `GearDef` type and the grade merge. Split out of equipment.ts (which keeps
// the weapons, tiers, and affix machinery) purely by size; the lookups and
// active-registry plumbing still live there, and this module is re-exported
// through it. Levels pick which pieces can drop via their `gearPool`s; WHEN
// a base can drop is its `levelReq` against the killer's monster level,
// exactly like a weapon's.

import { GENERATED_GEAR } from "../../generated/items.ts";
import { gearGradeVariants, type Grade } from "./grades.ts";
import type { ArmorType, EquipSlot, StatName } from "../types.ts";

export type GearDef = {
  id: string;
  name: string;
  /** A few sentences of lore — where the piece comes from in the story's
   * world. Authored in the item's YAML; the engine treats it as opaque
   * flavor. Test fixtures may omit it. */
  description?: string;
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

/**
 * The gear catalog: the YAML item tree (compiled to `GENERATED_GEAR` — every
 * hand-authored armor piece, charm, and bag under `content/items/regular/`)
 * with the generated grade variants merged below.
 */
export const GEAR_DEFS: Record<string, GearDef> = {
  ...GENERATED_GEAR,
};

// The generated EXCEPTIONAL/ELITE versions of every pool armor piece — same
// look, higher numbers and requirements (see defs/grades.ts). Merged into
// the catalog at load so every surface sees them as ordinary defs.
Object.assign(GEAR_DEFS, gearGradeVariants(GEAR_DEFS));
