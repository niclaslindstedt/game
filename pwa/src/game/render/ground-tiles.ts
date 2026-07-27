// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH ground sprite goes in a cell — the rule alone, with no canvas, no
// atlas and no DOM anywhere near it.
//
// It lives apart from `caches.ts` (which bakes the ground layer with it)
// because the LIBRARY's build step derives each venue's tiled page background
// from the very same rule. A biome's ground is a thing the game draws rather
// than a file on disk, so the only way the two can't drift is for both to ask
// this function.

// `import type` rather than an inline `type` specifier: the library's build
// step imports this module from plain node, where a bare side-effect import of
// `@game/core` would pull the whole engine in behind a type that gets erased.
import type { TileSpec } from "@game/core";

import { TILE } from "./shared.ts";

/** Cheap deterministic per-tile hash for ground variety. */
export function tileHash(tx: number, ty: number): number {
  return (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0;
}

/**
 * The sprite NAME for a ground cell, entirely from the level's `tiles` spec
 * (defs/levels.ts): the rare ground variant scatters into the common one, and
 * an optional `patch` pair clusters on a coarser grid so gravel/vents clump
 * instead of speckling. A new biome is a new `tiles` entry, no edit here.
 */
export function groundTileName(
  tiles: TileSpec,
  tx: number,
  ty: number,
): string {
  // Zoned terrain: the first zone rect containing this tile supplies its own
  // ground/patch pair (martian dust outside, deck plating inside the base) —
  // still all data from the level def, no per-biome code.
  const zone = tiles.zones?.find(
    (z) =>
      tx * TILE >= z.rect.x &&
      tx * TILE < z.rect.x + z.rect.width &&
      ty * TILE >= z.rect.y &&
      ty * TILE < z.rect.y + z.rect.height,
  );
  const ground = zone?.ground ?? tiles.ground;
  const patch = zone ? zone.patch : tiles.patch;
  if (patch && tileHash(tx >> 2, ty >> 2) % patch.every === 0) {
    return tileHash(tx, ty) % 2 === 0 ? patch.a : patch.b;
  }
  const { common, rare, rareEvery } = ground;
  return tileHash(tx, ty) % rareEvery === 0 ? rare : common;
}
