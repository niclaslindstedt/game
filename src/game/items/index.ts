// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Equipment instances, loot rolls, the inventory, and derived player stats.
// Items are rolled from the catalogs in defs/equipment.ts against the
// running level's loot table. The inventory mutators (`equipFromInventory`,
// `unequipToInventory`, `moveInventoryItem`, `allocateStat`) are the engine
// surface the app's drag-and-drop UI and level-up chooser call into — they
// are safe to invoke from outside `step()` because they only touch the
// player.
//
// The implementation is split by concern into the sibling modules; this
// barrel is the import surface the rest of the engine (and src/index.ts)
// reads, so callers never chase the split.

export * from "./class-stats.ts";
export * from "./quality.ts";
export * from "./rolling.ts";
export * from "./derived.ts";
export * from "./durability.ts";
export * from "./consumables.ts";
export * from "./spellcasting.ts";
export * from "./combat-stats.ts";
export * from "./mercy.ts";
export * from "./weapon-math.ts";
export * from "./requirements.ts";
export * from "./auto-equip.ts";
export * from "./inventory.ts";
export * from "./stat-points.ts";
export * from "./flow.ts";
