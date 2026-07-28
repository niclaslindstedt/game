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
  const migrated = migrateSlot(piece);
  const family: "weapon" | "gear" =
    migrated.slot === "weapon" ? "weapon" : "gear";
  let def = migrated.def;
  if (!def) {
    const present =
      family === "weapon"
        ? isWeaponDef(migrated.defId)
        : isGearDef(migrated.defId);
    if (!present) return null;
    def = structuredClone(
      family === "weapon" ? weaponDef(migrated.defId) : gearDef(migrated.defId),
    );
  }
  const defId = registerFrozenDef(def, family);
  return { ...migrated, defId, def };
}

/**
 * Rewrite a RETIRED item kind onto the one that replaced it, so a piece saved
 * under the old name keeps working instead of being dropped by the loaders'
 * live-kind guard.
 *
 * The one live rewrite is CHARM → TRINKET: charms used to be worn in a slot of
 * their own, and are now carried in the bag (which is where a trinket pays
 * out). The frozen def snapshot riding on the instance is re-stamped too —
 * that snapshot, not the shipped catalog, is what every later stat read
 * resolves through, so leaving it saying "charm" would strand the piece
 * between two kinds.
 *
 * Runs at the top of `adoptEquipment`, so EVERY persisted piece passes through
 * it — worn, bagged, vaulted, or lying on the ground of a parked run.
 */
function migrateSlot(piece: Equipment): Equipment {
  if ((piece.slot as string) !== "charm") return piece;
  const def = piece.def
    ? { ...piece.def, slot: "trinket" as const }
    : undefined;
  return { ...piece, slot: "trinket", ...(def ? { def } : {}) } as Equipment;
}
