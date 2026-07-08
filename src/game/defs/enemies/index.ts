// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The enemy catalog: one roster module per level/biome (spacez.ts, moon.ts,
// …), merged into ENEMY_DEFS here. This split keeps each roster well under
// the source-size cap as the game grows to 100+ mobs — a new mob is one entry
// in the right roster + a sprite named after it, no engine changes. Merging
// throws loudly on a duplicate id (the same loud-fail style as the sprite
// `register()`), so two rosters can never silently shadow each other.

import type { EnemyDef } from "./types.ts";

import { MARS_ENEMIES } from "./mars.ts";
import { MOON_ENEMIES } from "./moon.ts";
import { SPACEZ_ENEMIES } from "./spacez.ts";

export type { EnemyDef, EnemyRole } from "./types.ts";

/** Merge the rosters into one registry, failing loudly on a duplicate id so a
 * clash surfaces at module load, not as a silently shadowed monster. */
function mergeRosters(
  rosters: Record<string, EnemyDef>[],
): Record<string, EnemyDef> {
  const merged: Record<string, EnemyDef> = {};
  for (const roster of rosters) {
    for (const [id, def] of Object.entries(roster)) {
      if (id in merged) {
        throw new Error(`duplicate enemy id "${id}" across rosters`);
      }
      merged[id] = def;
    }
  }
  return merged;
}

/**
 * Every monster in the game, keyed by id. The rosters are listed in story
 * order; the map is flat, so callers never care which file an enemy lives in.
 */
export const ENEMY_DEFS: Record<string, EnemyDef> = mergeRosters([
  SPACEZ_ENEMIES,
  MOON_ENEMIES,
  MARS_ENEMIES,
]);

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeEnemyDefs: Record<string, EnemyDef> = ENEMY_DEFS;

/** Test/authoring hook: replace the active enemy catalog. */
export function setEnemyDefs(defs: Record<string, EnemyDef>): void {
  activeEnemyDefs = defs;
}

/** Look up an enemy's def; throws on a broken id so bugs surface loudly. */
export function enemyDef(defId: string): EnemyDef {
  const def = activeEnemyDefs[defId];
  if (!def) throw new Error(`unknown enemy def "${defId}"`);
  return def;
}
