// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GLOBAL gameplay tuning — the rules that hold across every level, split by
// system (one module per system, re-exported here). Per-level content
// (geometry, gravity, spawns, loot pools) lives in defs/levels.ts; the enemy
// and equipment catalogs live in defs/enemies.ts and defs/equipment.ts.
// Units: world pixels (one sprite pixel = one world unit at scale 1),
// milliseconds, hit points.

export * from "./player.ts";
export * from "./combat.ts";
export * from "./armor.ts";
export * from "./stats.ts";
export * from "./leveling.ts";
export * from "./menace.ts";
export * from "./loot.ts";
export * from "./spawning.ts";
export * from "./enemies.ts";
export * from "./hazards.ts";
export * from "./world.ts";
export * from "./consumables.ts";
export * from "./abilities.ts";
export * from "./talents.ts";
export * from "./dialogue.ts";
export * from "./companions.ts";
export * from "./economy.ts";
export * from "./run.ts";
