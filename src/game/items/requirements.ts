// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Equip gates: the base identity behind a rolled instance, the level
// requirement, the derived attribute requirement (weapon class gate, heavy
// armor's STR gate), and the canEquip predicate every equip decision routes
// through.

import { ARMOR_TYPES, LEVELING, STAT_REQ } from "../config/index.ts";
import {
  equipmentLevelReq,
  gearDef,
  isWeaponDef,
  weaponDef,
} from "../defs/equipment.ts";
import { baseStatBonus, chosenStatPointsThrough } from "../leveling.ts";
import type { Equipment, GameState, StatName } from "../types.ts";
import { REQ_STAT } from "./class-stats.ts";
import { isWeaponBroken, rawStat } from "./derived.ts";

/** The original catalog id a piece was minted from — the frozen snapshot's own
 * id when the instance has been re-homed onto a synthetic frozen id, else the
 * live `defId`. Lets "is this the same base?" checks see through re-homing so a
 * kept item and a fresh drop of the same base still read as one base. */
export function baseDefId(piece: Equipment): string {
  return piece.def?.id ?? piece.defId;
}

/**
 * The level a hero must reach to WEAR this instance. For EVERY tier up to
 * legendary the Diablo level gate keys on the BASE item's `levelReq` — strip
 * the rolled/authored bonuses and what's left is the base, so a magic, rare,
 * unique, or legendary piece equips at the same level a plain one on that base
 * would (its high ilvl scales its power, not its requirement — a find to grab
 * early). ARTIFACTS are the exception: the endgame relics require `min(maxLevel,
 * ilvl)` — level 99 for the whole shipped roster (every artifact ilvl ≥ 99) —
 * so a cap-tier relic is worn only AT the cap, matching where it drops. The
 * `min` guards against an ilvl above the level cap ever demanding an
 * unreachable level.
 */
export function itemLevelReq(equipment: Equipment): number {
  if (equipment.tier === "artifact") {
    return Math.min(LEVELING.maxLevel, equipment.ilvl);
  }
  return equipmentLevelReq(equipment.defId);
}

/**
 * Can the hero WEAR this piece yet? Gated on `itemLevelReq` — the base's
 * `levelReq` for every tier up to legendary, and `min(maxLevel, ilvl)` for an
 * artifact. Auto-equip skips a piece the hero can't wear, the bag refuses to
 * equip it, and the UI paints the requirement red until the hero grows into it.
 */
export function meetsLevelReq(state: GameState, equipment: Equipment): boolean {
  return state.player.level >= itemLevelReq(equipment);
}

/**
 * An item's ATTRIBUTE requirement — the Diablo stat gate that forces a build to
 * pick a lane. TWO families carry one:
 *
 * - WEAPONS demand their class attribute (STRENGTH for melee, DEXTERITY for
 *   ranged, INTELLIGENCE for magic; see `REQ_STAT`), a fraction
 *   (`STAT_REQ.investFraction`) of the hero's banked points.
 * - HEAVY ARMOR demands STRENGTH to heft it — the material's
 *   `ARMOR_TYPES[…].strReqFraction` of the same banked points: none for CLOTH
 *   (any build wears a robe), a little for LEATHER, a LOT for MAIL and PLATE,
 *   so heavy armor is a melee-only lane a caster or archer cannot enter. Worn
 *   `+STR` gear counts toward the gate (`meetsStatReq` reads `rawStat`), so a
 *   bruiser stacking mail naturally meets the next piece's demand. Charms and
 *   bags carry no material (`cloth` default → fraction 0) and stay ungated.
 *
 * The amount is DERIVED, never authored per item, so the whole catalog is
 * calibrated by those two fractions: it is a fraction of the trainable points a
 * hero has banked by the item's `levelReq` (`chosenStatPointsThrough`) plus the
 * AUTOMATIC growth that stat has accrued by then (`baseStatBonus`). Folding in
 * the auto floor is what makes the gate track the AUTO LEVEL STATS dev flag:
 * `baseStatBonus` is zero for every stat while the flag is off (and always zero
 * for INTELLIGENCE, which has no auto growth), so the requirement drops by
 * exactly the free points the hero no longer receives — leaving the CHOSEN
 * investment it demands unchanged. That invariance is the point: toggling
 * WoW-style auto-attributes never requires re-tuning a single item. A
 * `levelReq`-1 starter derives to zero and is ungated.
 */
export function statRequirement(
  defId: string,
): { stat: StatName; amount: number } | null {
  if (isWeaponDef(defId)) {
    const def = weaponDef(defId);
    const stat = REQ_STAT[def.class];
    const amount =
      baseStatBonus(def.levelReq, stat) +
      Math.round(
        STAT_REQ.investFraction * chosenStatPointsThrough(def.levelReq),
      );
    return amount > 0 ? { stat, amount } : null;
  }
  // Heavy ARMOR demands STRENGTH to wear — sized by the material's
  // `strReqFraction` (cloth 0, up to plate), the exact analogue of a weapon's
  // class gate. Non-armor gear (charms, bags → cloth default) derives to zero.
  const def = gearDef(defId);
  if (def.armor === undefined) return null;
  const fraction = ARMOR_TYPES[def.armorType ?? "cloth"].strReqFraction;
  if (fraction <= 0) return null;
  const levelReq = def.levelReq ?? 1;
  const amount =
    baseStatBonus(levelReq, "strength") +
    Math.round(fraction * chosenStatPointsThrough(levelReq));
  return amount > 0 ? { stat: "strength", amount } : null;
}

/**
 * Does the hero meet a piece's ATTRIBUTE requirement? Gear and requirement-free
 * weapons always pass; a weapon is gated on the hero's RAW (pre-diminish)
 * class attribute (`rawStat`) so the gate measures points invested rather than
 * their diminished combat value — see `rawStat` for why the diminished figure
 * would break the gate at high levels. Worn `+stat` gear counts toward the
 * requirement, so a "OF THE OX" find helps heft a heavier weapon.
 */
export function meetsStatReq(state: GameState, equipment: Equipment): boolean {
  const req = statRequirement(equipment.defId);
  if (!req) return true;
  return rawStat(state, req.stat) >= req.amount;
}

/**
 * Can the hero WEAR this piece right now — BOTH the level gate (`meetsLevelReq`)
 * and the attribute gate (`meetsStatReq`)? The single predicate every equip
 * decision routes through (auto-equip, the bag's manual equip, the on-break
 * weapon swap), so a piece the hero is too weak OR too low-level to wield is
 * banked, never worn. The drop side is unaffected — a base still drops on
 * `levelReq` vs monster level; only the hero's hands are gated by attributes.
 */
export function canEquip(state: GameState, equipment: Equipment): boolean {
  // A weapon worn out to zero durability is unequippable until a repair kit
  // mends it — it rides in the bag as a broken spare, never worn.
  if (isWeaponBroken(equipment)) return false;
  return meetsLevelReq(state, equipment) && meetsStatReq(state, equipment);
}
