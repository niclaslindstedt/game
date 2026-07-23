// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Data shapes for the simulation. The state is a plain mutable object the
// renderer reads every frame; `step()` advances it and reports what happened
// as events so the app layer can drive sound and visual feedback without the
// engine knowing either exists. The state holds a seeded RNG closure for
// in-run rolls (crits, drops), so it is deterministic but not JSON-plain.
//
// Entities reference the content catalogs (defs/) by id: an Enemy carries a
// `defId` into ENEMY_DEFS, an Equipment a `defId` into WEAPON_DEFS/GEAR_DEFS.
// The catalogs scale to hundreds of entries without these shapes changing.

export * from "./core.ts";
export * from "./actors.ts";
export * from "./hazards.ts";
export * from "./world.ts";
export * from "./events.ts";
export * from "./io.ts";
export * from "./state.ts";
