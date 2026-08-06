// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT KIND of thing a piece is, as a sprite id — a weapon's class glyph or a
// gear piece's slot glyph. It lives in this leaf rather than in ItemCard.tsx so
// the naming rule can be checked against the shipped atlas without dragging
// React, the asset loader and the audio surface into a test process
// (tests/content/slot_icons_test.ts), and so the ITEM_SLOTS vocabulary and the
// `icon_slot_*` sprite family can never drift apart unnoticed again: the charm
// → trinket rename left every trinket card asking for `icon_slot_trinket`, a
// sprite that did not exist, and the card silently drew no glyph at all.

import { isWeaponDef, weaponDef, type Equipment } from "@game/core";

/**
 * The sprite naming WHAT KIND of thing a piece is — a weapon's class glyph
 * (sword/reticle/spark) or a gear piece's slot glyph. A SHIELD borrows the
 * OFF HAND frame's own glyph (`icon_slot_offhand`, which IS a shield
 * silhouette) rather than shipping an identical second copy; a BAG keeps its
 * satchel, and the glyph is how the card says which of the two arm-fillers
 * this is. A TRINKET — carried, never worn — gets the clover. The card's foot
 * row reads it, and so does the unidentified tooltip's IDENTIFY button (the one
 * place a veiled find says its shape).
 */
export function itemKindGlyph(item: Equipment): string {
  if (isWeaponDef(item.defId)) {
    return `icon_class_${weaponDef(item.defId).class}`;
  }
  return slotGlyph(item.slot);
}

/** The glyph for a gear KIND, without an instance to read it off — the same
 * mapping `itemKindGlyph` applies, exposed so the coverage test can walk
 * `ITEM_SLOTS` directly. */
export function slotGlyph(slot: Equipment["slot"]): string {
  return `icon_slot_${slot === "shield" ? "offhand" : slot}`;
}
