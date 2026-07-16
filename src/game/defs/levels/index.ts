// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level registry: one YAML file per level under
// `website/scripts/levels/<id>.yaml` (spacez_hq, moon, …), compiled by
// `website/scripts/generate-levels.mjs` into `src/generated/levels.ts` (the
// map/atlas equivalent for levels — gitignored, regenerated on build). This
// module merges the generated defs into LEVELS and re-exposes the same
// accessor surface the app, the campaign progression, and the tests read.
// Merging throws loudly on a duplicate id.

import {
  GENERATED_CAMPAIGN_ORDER,
  GENERATED_LEVELS,
  GENERATED_SECRET_ORDER,
} from "../../../generated/levels.ts";
import type { LevelDef } from "./types.ts";

export type {
  LevelDef,
  PackMember,
  PackSpec,
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

/**
 * Story order of the campaign levels (see SECRET below). Compiled from each
 * YAML level's `campaign: true` flag, sorted by story `index`.
 */
export const LEVEL_ORDER: string[] = GENERATED_CAMPAIGN_ORDER;

/**
 * SECRET venues: playable levels deliberately OUTSIDE the campaign order — no
 * unlock chain, no NEXT LEVEL slot, no per-level achievement badge, no "beaten
 * difficulty" trigger. They resolve through `levelDef` like any level, but only
 * a travel gate (or a dev warp) reaches them. Compiled from each YAML level's
 * `secret: true` flag; the dev warp picker's extra rows.
 */
export const SECRET_LEVEL_ORDER: string[] = GENERATED_SECRET_ORDER;

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeLevels: Record<string, LevelDef> = LEVELS;

/** Test/authoring hook: replace the active level catalog. */
export function setLevelDefs(defs: Record<string, LevelDef>): void {
  activeLevels = defs;
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
