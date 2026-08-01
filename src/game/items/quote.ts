// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The item card's FLAVOR LINE — the one sentence printed in gold at the foot of
// a tooltip, under everything the piece does.
//
// A whole module for one accessor, and the reason is the 200 KB CRITICAL-PATH
// BUDGET rather than tidiness. This reads `defs/uniques.ts`, and the named chase
// roster is deliberately kept off the app's startup path — it rides its own
// generated module precisely so the title screen does not download 149 items it
// will never name. Tree-shaking is global, so what matters is which MODULE an
// import lands in: parked next to `equipmentName` in `items/quality.ts` (which
// the roster screen reaches) this pulled the whole roster into the startup
// chunk and blew the budget by 4 KB. Alone in here, nothing on the startup path
// imports it and the catalog stays where it belongs — in the run.
//
// So: keep this module's importers RUN-SIDE. If a menu ever needs an item's
// flavor line, the answer is to hand it the string, not to import this.

import { gearDef, isWeaponDef, weaponDef } from "../defs/equipment.ts";
import { uniqueDef } from "../defs/uniques.ts";
import type { Equipment } from "../types/index.ts";

/**
 * The instance's FLAVOR LINE, or null for the great majority of items, which
 * say nothing.
 *
 * ONE accessor over TWO authored fields, because the two catalogs already
 * answered this question in their own words and a third field would have been a
 * third answer: a NAMED item's line is its `UniqueDef.lore` (authored as "one-
 * line flavor for the item card" since the chase roster shipped, and printed
 * nowhere in the running game until now), a plain base's is `quote` on its own
 * def. A base's `description` is deliberately NOT a candidate — that is a
 * library paragraph, stripped off the shipped def entirely, and printing it
 * here would put a wall of prose under a bag icon.
 */
export function itemQuote(equipment: Equipment): string | null {
  if (equipment.uniqueId) return uniqueDef(equipment.uniqueId).lore || null;
  const def = isWeaponDef(equipment.defId)
    ? weaponDef(equipment.defId)
    : gearDef(equipment.defId);
  return def.quote || null;
}
