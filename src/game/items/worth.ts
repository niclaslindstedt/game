// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a piece of loot is WORTH, in coins — the one valuation every surface
// reads: the merchant's sell action and stall prices, the app's price tags,
// the autopilot's bag discipline, and the LOST & FOUND's eviction order.
//
// It lives in items/ rather than merchant.ts because it is pure ITEM math (the
// catalogs, the tier ladder, and the make quality — no counter, no stall, no
// run state), and because items/ must not import the merchant: the merchant
// already imports items/, so the reverse would close a module cycle.
// `merchant.ts` re-exports it, so every existing caller reads it from either
// place unchanged.

import { ECONOMY } from "../config/index.ts";
import { gearDef, isWeaponDef, weaponDef } from "../defs/equipment.ts";
import type { Equipment } from "../types/index.ts";
import { qualityMult } from "./quality.ts";

/**
 * What the merchant pays for a piece of loot, in coins (config ECONOMY):
 * the item's LEVEL carries the base worth, its TIER multiplies by orders of
 * magnitude (magic 10×, rare 100×, …), and its MATERIAL sweetens the scale —
 * metal melts down for double, precious (gold, gems, true magic) for four
 * times.
 */
export function sellValue(item: Equipment): number {
  const material = isWeaponDef(item.defId)
    ? weaponDef(item.defId).material
    : gearDef(item.defId).material;
  const materialMult =
    material === "metal"
      ? ECONOMY.metalMult
      : material === "precious"
        ? ECONOMY.preciousMult
        : 1;
  return Math.round(
    (ECONOMY.itemBase + ECONOMY.itemPerIlvl * item.ilvl) *
      ECONOMY.tierValueMult[item.tier] *
      materialMult *
      // Craftsmanship carries to the scales: a BROKEN find melts down for
      // less, a PERFECT one commands its premium (config QUALITY.mults).
      qualityMult(item),
  );
}
