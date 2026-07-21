// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The enemy catalog. The monsters are authored as YAML — one self-describing
// file per mob under `content/enemies/<biome>/<id>.yaml` — and compiled
// into GENERATED_ENEMIES (`src/generated/enemies.ts`, gitignored, regenerated on
// every build via `npm run levels` / `make assets`) by
// `scripts/generate-enemies.mjs`, which is where a duplicate id / bad
// field / dangling cross-ref fails loudly. This module just re-exposes that
// compiled catalog behind the `enemyDef()` accessor the engine reads; adding a
// mob is one YAML file + a sprite named after it, no engine changes.

import type { EnemyDef } from "./types.ts";

import { GENERATED_ENEMIES } from "../../../generated/enemies.ts";

export type { DialoguePage, EnemyDef, EnemyRole, MobRarity } from "./types.ts";

/**
 * Every monster in the game, keyed by id. The map is flat, so callers never
 * care which biome file an enemy was authored in.
 */
export const ENEMY_DEFS: Record<string, EnemyDef> = GENERATED_ENEMIES;

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
