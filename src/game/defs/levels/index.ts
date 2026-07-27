// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level registry: one YAML file per level under
// `content/levels/<id>.yaml` (spacez_hq, moon, …), compiled by
// `scripts/generate-levels.mjs` into `src/generated/levels.ts` (the
// map/atlas equivalent for levels — gitignored, regenerated on build). This
// module merges the generated defs into LEVELS and re-exposes the same
// accessor surface the app, the campaign progression, and the tests read.
// Merging throws loudly on a duplicate id.

import { GENERATED_LEVELS } from "../../../generated/levels.ts";
import { setLevelSummaries } from "./summary.ts";
import type { LevelDef } from "./types.ts";

// The story/secret ORDER and the per-level name/`foes` summary live in the leaf
// `summary.ts`, which reads the compiled index rather than the compiled maps —
// so the menus can order and name levels without downloading them (see the file
// header there). Re-exported here so every existing importer is unaffected.
export {
  hasLevel,
  levelSummary,
  LEVEL_ORDER,
  SECRET_LEVEL_ORDER,
  type LevelSummary,
} from "./summary.ts";

export type {
  LevelDef,
  PackMember,
  PackSpec,
  SpawnerMember,
  SpawnerSpec,
  SpawnSpec,
  WaveBudget,
  WaveSpec,
} from "./types.ts";

/** Merge the defs into one registry, failing loudly on a duplicate
 * id so a clash surfaces at module load, not as a silently shadowed level. */
function mergeLevels(defs: LevelDef[]): Record<string, LevelDef> {
  const merged: Record<string, LevelDef> = {};
  for (const def of defs) {
    if (def.id in merged) {
      throw new Error(`duplicate level id "${def.id}"`);
    }
    merged[def.id] = def;
  }
  return merged;
}

export const LEVELS: Record<string, LevelDef> = mergeLevels(GENERATED_LEVELS);

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeLevels: Record<string, LevelDef> = LEVELS;

/** Test/authoring hook: replace the active level catalog. */
export function setLevelDefs(defs: Record<string, LevelDef>): void {
  activeLevels = defs;
  // Keep the menu-facing summaries in step, so a fixture catalog answers for
  // itself on both sides of the split (see summary.ts).
  setLevelSummaries(
    Object.fromEntries(
      Object.entries(defs).map(([id, def]) => [
        id,
        { name: def.name, foes: def.foes },
      ]),
    ),
  );
}

/** Look up a level def; throws on a broken id so bugs surface loudly. */
export function levelDef(levelId: string): LevelDef {
  const def = activeLevels[levelId];
  if (!def) throw new Error(`unknown level "${levelId}"`);
  return def;
}

/**
 * Every GEAR id some ACTIVE level's travel gate opens with
 * (`LevelDef.gates[].opensWith`) — the keys the scrap sweep must never treat
 * as junk, however worthless their stats read. Reads the active registry so
 * fixture catalogs answer for themselves.
 */
export function gateKeyIds(): string[] {
  return Object.values(activeLevels).flatMap((def) =>
    (def.gates ?? []).map((g) => g.opensWith),
  );
}

/**
 * Where `levelId` sits in the ACTIVE story order: its 0-based position among
 * the distinct story indexes, and how many there are — the interpolation axis
 * per-map rules (the XP caps in leveling.ts) scale along. Variants sharing an
 * index (fixture catalogs do this) count once, like `deriveArrivalLoadout`.
 */
export function levelPosition(levelId: string): {
  position: number;
  total: number;
} {
  const target = levelDef(levelId);
  const indexes = [
    ...new Set(Object.values(activeLevels).map((def) => def.index)),
  ].sort((a, b) => a - b);
  return { position: indexes.indexOf(target.index), total: indexes.length };
}

/**
 * Every active level with a LOWER story index than `levelId`, ascending —
 * the campaign the hero has already cleared by the time this level opens.
 * Reads the active registry, so tests that install fixture catalogs get
 * fixture answers.
 */
export function levelsBefore(levelId: string): LevelDef[] {
  const target = levelDef(levelId);
  return Object.values(activeLevels)
    .filter((def) => def.index < target.index)
    .sort((a, b) => a.index - b.index);
}
