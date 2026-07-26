// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ADOPTING a persisted item — the load-side half of the item snapshot promise.
//
// Kept apart from `rolling.ts` (which MINTS items) because this runs at LOAD:
// the app re-homes a saved hero's gear the moment the roster is read, long
// before a run exists. Rolling reaches for the menace curve, the companion
// catalog and the whole loot economy behind it; adopting needs nothing but the
// equipment defs, so a save-loading path that imports this pulls no simulation
// along. `rolling.ts` re-exports it, so every existing importer is unaffected.

import {
  gearDef,
  isGearDef,
  isWeaponDef,
  registerFrozenDef,
  weaponDef,
} from "../defs/equipment.ts";
import type { Equipment } from "../types/index.ts";

/**
 * Bring a persisted item into the live catalog so a rebalanced or DELETED base
 * can neither nerf it nor crash the load — the guarantee that a kept drop stays
 * exactly as it dropped. Every item minted since snapshots shipped carries a
 * frozen copy of its def (`Equipment.def`); here we park that snapshot under a
 * stable synthetic id (`registerFrozenDef`) and re-home the instance onto it,
 * so from now on every stat read (`weaponDef`/`gearDef` and everything routing
 * through them) resolves the item AS DROPPED, independent of the shipped
 * catalog. Newly rolled items still reference the live def, so catalog edits
 * land on new drops alone.
 *
 * Idempotent — an already-adopted piece re-registers to the same id. Returns
 * `null` only for a LEGACY piece (minted before snapshots) whose base is also
 * gone from the catalog: with neither a snapshot nor a live def there is
 * nothing left to resolve, the same unrecoverable case the loader dropped
 * before. A legacy piece whose base still exists is frozen at the current def,
 * protecting it from here on.
 */
export function adoptEquipment(piece: Equipment): Equipment | null {
  const family: "weapon" | "gear" = piece.slot === "weapon" ? "weapon" : "gear";
  let def = piece.def;
  if (!def) {
    const present =
      family === "weapon" ? isWeaponDef(piece.defId) : isGearDef(piece.defId);
    if (!present) return null;
    def = structuredClone(
      family === "weapon" ? weaponDef(piece.defId) : gearDef(piece.defId),
    );
  }
  const defId = registerFrozenDef(def, family);
  return { ...piece, defId, def };
}
