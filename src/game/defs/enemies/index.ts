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

// ---- Uniform hidden class (V8 monomorphism) -----------------------------------
// The compiled catalog authors each def as an object literal carrying ONLY the
// fields that def uses, so all ~90 defs have DIFFERENT hidden classes. The tick's
// per-enemy AI loop (step/enemies.ts `moveEnemy`) reads a dozen `def.*` fields
// per enemy per tick, so with mixed shapes every one of those property loads goes
// MEGAMORPHIC — measured as the sim's single biggest cost. Rebuilding every def
// through one fixed-order factory (absent optionals stamped `undefined`) gives
// them all ONE hidden class, so those loads drop to monomorphic. Value semantics
// are unchanged: an explicit `undefined` reads identically to an absent field at
// every consuming site (`def.x ?? d`, `def.x?.y`, `def.x && …`, `def.x === true`)
// and JSON/`toEqual` ignore it, so the round-trip snapshot is untouched. The hot
// `ai` sub-object is canonicalized the same way for the same reason.
function canonicalEnemyDef(d: EnemyDef): EnemyDef {
  const ai = d.ai;
  return {
    id: d.id,
    name: d.name,
    role: d.role,
    sprite: d.sprite,
    gore: d.gore,
    rarity: d.rarity,
    pack: d.pack,
    hp: d.hp,
    levelBonus: d.levelBonus,
    speed: d.speed,
    radius: d.radius,
    contactDamage: d.contactDamage,
    critChance: d.critChance,
    dodgeChance: d.dodgeChance,
    contactCooldownMs: d.contactCooldownMs,
    phasing: d.phasing,
    apparition: d.apparition,
    flees: d.flees,
    ranged: d.ranged,
    shieldedBy: d.shieldedBy,
    spareable: d.spareable,
    xp: d.xp,
    xpMobMult: d.xpMobMult,
    dialogue: d.dialogue,
    lastWords: d.lastWords,
    ai: {
      aggroRadius: ai.aggroRadius,
      idle: ai.idle,
      leashRadius: ai.leashRadius,
      returnSpeedFactor: ai.returnSpeedFactor,
      rushSpeed: ai.rushSpeed,
    },
    mechanics: d.mechanics,
    phases: d.phases,
    dropProfile: d.dropProfile,
    loot: d.loot,
    uniquesByDifficulty: d.uniquesByDifficulty,
  };
}

/** Rebuild a catalog so every def shares one hidden class (see
 * {@link canonicalEnemyDef}). Applied to the shipped catalog and to any test
 * fixture set, so `moveEnemy`'s `def.*` reads stay monomorphic in every run. */
function canonicalizeCatalog(
  defs: Record<string, EnemyDef>,
): Record<string, EnemyDef> {
  const out: Record<string, EnemyDef> = {};
  for (const id of Object.keys(defs)) out[id] = canonicalEnemyDef(defs[id]!);
  return out;
}

/**
 * Every monster in the game, keyed by id. The map is flat, so callers never
 * care which biome file an enemy was authored in.
 */
export const ENEMY_DEFS: Record<string, EnemyDef> =
  canonicalizeCatalog(GENERATED_ENEMIES);

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeEnemyDefs: Record<string, EnemyDef> = ENEMY_DEFS;

/** Test/authoring hook: replace the active enemy catalog. */
export function setEnemyDefs(defs: Record<string, EnemyDef>): void {
  activeEnemyDefs = canonicalizeCatalog(defs);
  memoId = undefined;
  memoDef = undefined;
}

// One-entry memo: the tick loops over a horde of mostly one species, so the
// same id repeats back-to-back thousands of times a second — a last-hit cache
// short-circuits the record probe on nearly every call.
let memoId: string | undefined;
let memoDef: EnemyDef | undefined;

/** Look up an enemy's def; throws on a broken id so bugs surface loudly. */
export function enemyDef(defId: string): EnemyDef {
  if (defId === memoId) return memoDef as EnemyDef;
  const def = activeEnemyDefs[defId];
  if (!def) throw new Error(`unknown enemy def "${defId}"`);
  memoId = defId;
  memoDef = def;
  return def;
}
