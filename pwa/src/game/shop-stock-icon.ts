// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH GLYPH A STALL ENTRY WEARS — a powerup's own icon, a consumable's dock
// glyph (medkits per quality), a weapon's item icon. A React-free leaf so the
// counter and its card can both ask without either importing the other.

import {
  abilityDef,
  equipmentIcon,
  medkitTierIndex,
  type MerchantStock,
} from "@game/core";

import {
  medkitIconFor,
  REPAIR_KIT_ICON,
  STAMINA_POTION_ICON,
} from "./consumables.ts";

/** The sprite a stall entry shows on the counter. */
export function stockIconName(entry: MerchantStock): string {
  switch (entry.kind) {
    case "ability":
      return abilityDef(entry.defId).icon;
    case "consumable":
      return entry.item === "medkit"
        ? medkitIconFor(medkitTierIndex(entry.tier))
        : entry.item === "repair"
          ? REPAIR_KIT_ICON
          : STAMINA_POTION_ICON;
    case "weapon":
      return equipmentIcon(entry.equipment.defId);
  }
}
