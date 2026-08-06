// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level registry: one YAML file per level under
// `content/levels/<id>.yaml` (goodco_hq, moon, …), compiled by
// `scripts/generate-levels.mjs` into `src/generated/levels.ts` (the
// map/atlas equivalent for levels — gitignored, regenerated on build). This
// module merges the generated defs into LEVELS and re-exposes the same
// accessor surface the app, the campaign progression, and the tests read.
// Merging throws loudly on a duplicate id.

import { GENERATED_LEVELS } from "../../../generated/levels.ts";
import type { GameState } from "../../types/index.ts";
import { setLevelSummaries } from "./summary.ts";
import type { LevelDef, MissionDef } from "./types.ts";

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
  LevelLight,
  MissionDef,
  PackMember,
  PackSpec,
  SpawnerMember,
  SpawnerSpec,
  SpawnSpec,
  SkyKind,
  WaveBudget,
  WaveSpec,
} from "./types.ts";

/** Merge the defs into one registry, failing loudly on a duplicate
 * id so a clash surfaces at module load, not as a silently shadowed level. */
function mergeLevels(defs: MissionDef[]): Record<string, MissionDef> {
  const merged: Record<string, MissionDef> = {};
  for (const def of defs) {
    if (def.id in merged) {
      throw new Error(`duplicate level id "${def.id}"`);
    }
    merged[def.id] = def;
  }
  return merged;
}

export const LEVELS: Record<string, MissionDef> = mergeLevels(GENERATED_LEVELS);

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeLevels: Record<string, MissionDef> = LEVELS;

/** Test/authoring hook: replace the active level catalog. */
export function setLevelDefs(defs: Record<string, MissionDef>): void {
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

/** Look up a MISSION — the authored half, with no geometry on it. Throws on a
 * broken id so bugs surface loudly. */
export function levelDef(levelId: string): MissionDef {
  const def = activeLevels[levelId];
  if (!def) throw new Error(`unknown level "${levelId}"`);
  return def;
}

/**
 * A mission that carries its own geometry, read as the level it already is.
 *
 * There is exactly one such thing: a synthetic catalog installed through
 * `registerDefs` (the engine test fixtures, a mod that hand-draws a venue),
 * which ships no blueprint to carve from. Every mission the game itself ships
 * is carved, so this is the narrow door rather than the main one — and it
 * throws rather than defaulting, because a level with no floor and no spawn is
 * a run that starts in the void.
 */
export function handAuthoredLevel(def: MissionDef): LevelDef {
  if (def.width === undefined || def.height === undefined || !def.playerSpawn)
    throw new Error(
      `level "${def.id}" has no map: a mission ships its geometry as a blueprint ` +
        `(content/maps/${def.id}.yaml), and only a hand-authored fixture may carry its own`,
    );
  return def as LevelDef;
}

/**
 * THE DEF THE RUN IS ACTUALLY BEING PLAYED ON — the one every in-run read must
 * ask, in place of `levelDef(state.level.id)`.
 *
 * The two answer differently on every run there is: `createGame` carved this
 * run's map from the mission's blueprint (`mapgen/`), and the catalog holds
 * only the mission — no walls, no knots, no props, and nowhere to stand. A run
 * keeps asking the level questions long after creation — which zones are quiet,
 * whose lair is this door, where is the exit, what is scattered here — and the
 * catalog cannot answer any of them. So the rule is flat: **inside a run,
 * nothing reads the catalog for its own level.**
 */
export function runLevelDef(state: GameState): LevelDef {
  return state.carvedLevel ?? handAuthoredLevel(levelDef(state.level.id));
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
export function levelsBefore(levelId: string): MissionDef[] {
  const target = levelDef(levelId);
  return Object.values(activeLevels)
    .filter((def) => def.index < target.index)
    .sort((a, b) => a.index - b.index);
}
