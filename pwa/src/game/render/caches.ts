// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Per-frame render caches, all keyed off the (memoized, singleton) Sprites
// instance: a fresh instance — e.g. after a hot reload — drops everything
// (see `ensureCaches`). Everything here trades a one-time bake for cheap
// per-frame reuse: the ground layer, radial glows, enemy sprite variants,
// animated decor frames, and measured sprite widths.

import { type GameState, type TileSpec } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { TILE } from "./shared.ts";

let cachesFor: Sprites | null = null;

/** The whole level's ground baked into one offscreen canvas. Tiles are a pure
 * function of the level def and the tile hash, so the layer never changes
 * during a run — blitting it is one draw call per frame instead of ~1,000
 * per-tile draws (each with a zone scan) re-composed every frame. */
let groundCache: { levelId: string; canvas: HTMLCanvasElement } | null = null;

/** Pre-rendered radial glows, keyed by `rgb/radius`. Loot glows pulse every
 * frame, and building a CanvasGradient per item per frame is the single most
 * expensive thing a loot-covered floor does — the pulse instead scales a
 * baked full-alpha glow via globalAlpha (identical output, both stops scale
 * linearly). */
const glowCache = new Map<string, HTMLCanvasElement>();

/** A monster's resolved sprite variants (base/hurt/wrecked/dying × 2 frames),
 * keyed by the def's sprite family — saves 1-2 string builds and up to 3
 * atlas probes per enemy per frame at horde scale. */
type EnemyFrames = [ImageBitmap, ImageBitmap];
export type EnemyVariants = {
  base: EnemyFrames;
  hurt: EnemyFrames;
  wrecked: EnemyFrames;
  dying: EnemyFrames;
};
const enemySpriteCache = new Map<string, EnemyVariants>();

/**
 * ANIMATED DECOR: a flat decor piece whose sprite name has numbered frame
 * variants in the atlas (`<name>_0`, `<name>_1`, …) cycles them on render
 * time — the conveyor belts roll (`conveyor_0..4`, each frame the belt
 * pattern one pixel further along) with zero engine involvement. A name with
 * fewer than two frames stays a static sprite. Cached per name; null =
 * "checked, not animated".
 */
const decorFramesCache = new Map<string, ImageBitmap[] | null>();
export const DECOR_FRAME_MS = 110;

export function decorFrames(
  sprites: Sprites,
  name: string,
): ImageBitmap[] | null {
  const cached = decorFramesCache.get(name);
  if (cached !== undefined) return cached;
  const frames: ImageBitmap[] = [];
  for (let i = 0; ; i++) {
    const frame = spriteByName(sprites, `${name}_${i}`);
    if (!frame) break;
    frames.push(frame);
  }
  const result = frames.length >= 2 ? frames : null;
  decorFramesCache.set(name, result);
  return result;
}

/** The width, in world units, of a sprite's non-transparent pixels — the art's
 * visible body, ignoring the transparent margin the fixed atlas cell pads it
 * with. Used to size the minion health bar to the character rather than the
 * cell. Measured once per bitmap (a getImageData scan) and cached. */
const opaqueWidthCache = new Map<ImageBitmap, number>();
export function opaqueWidth(sprite: ImageBitmap): number {
  const cached = opaqueWidthCache.get(sprite);
  if (cached !== undefined) return cached;
  const c = document.createElement("canvas");
  c.width = sprite.width;
  c.height = sprite.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return sprite.width;
  g.drawImage(sprite, 0, 0);
  const { data } = g.getImageData(0, 0, sprite.width, sprite.height);
  let min = sprite.width;
  let max = -1;
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      if ((data[(y * sprite.width + x) * 4 + 3] ?? 0) > 0) {
        if (x < min) min = x;
        if (x > max) max = x;
      }
    }
  }
  const w = max >= min ? max - min + 1 : sprite.width;
  opaqueWidthCache.set(sprite, w);
  return w;
}

/** Drop every cache when the Sprites instance changes (hot reload). */
export function ensureCaches(sprites: Sprites): void {
  if (cachesFor === sprites) return;
  cachesFor = sprites;
  groundCache = null;
  glowCache.clear();
  enemySpriteCache.clear();
  decorFramesCache.clear();
}

/** Cheap deterministic per-tile hash for ground variety. */
function tileHash(tx: number, ty: number): number {
  return (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0;
}

/**
 * Pick the ground tile for a cell, entirely from the level's `tiles` spec
 * (defs/levels.ts): the rare ground variant scatters into the common one,
 * and an optional `patch` pair clusters on a coarser grid so gravel/vents
 * clump instead of speckling. A new biome is a new `tiles` entry, no edit
 * here. `sprite` falls back to the first ground sprite if a name is unknown.
 */
export function groundTile(
  sprites: Sprites,
  tiles: TileSpec,
  tx: number,
  ty: number,
) {
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
  const fallback = spriteByName(sprites, ground.common) ?? sprites.moon_0;
  const pick = (name: string) => spriteByName(sprites, name) ?? fallback;
  if (patch && tileHash(tx >> 2, ty >> 2) % patch.every === 0) {
    return pick(tileHash(tx, ty) % 2 === 0 ? patch.a : patch.b);
  }
  const { common, rare, rareEvery } = ground;
  return pick(tileHash(tx, ty) % rareEvery === 0 ? rare : common);
}

export function groundLayer(
  state: GameState,
  sprites: Sprites,
): HTMLCanvasElement | null {
  if (groundCache && groundCache.levelId === state.level.id) {
    return groundCache.canvas;
  }
  const canvas = document.createElement("canvas");
  canvas.width = state.level.width;
  canvas.height = state.level.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  const tilesX = Math.ceil(state.level.width / TILE);
  const tilesY = Math.ceil(state.level.height / TILE);
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      ctx.drawImage(
        groundTile(sprites, state.level.tiles, tx, ty),
        tx * TILE,
        ty * TILE,
      );
    }
  }
  groundCache = { levelId: state.level.id, canvas };
  return canvas;
}

/** A soft radial glow fading `rgb` from full alpha at the center to clear at
 * `radius`, rendered once and reused. Draw with globalAlpha for the pulse. */
export function glowSprite(
  rgb: string,
  radius: number,
): HTMLCanvasElement | null {
  const key = `${rgb}/${radius}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const size = Math.max(2, Math.ceil(radius * 2));
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = size / 2;
  const glow = ctx.createRadialGradient(r, r, 0, r, r, r);
  glow.addColorStop(0, `rgba(${rgb}, 1)`);
  glow.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  glowCache.set(key, canvas);
  return canvas;
}

/** A gravity well's darkening funnel (three fixed stops between the core and
 * the pull rim), rendered once per (core, pull) radius pair and reused. */
export function funnelSprite(
  coreRadius: number,
  pullRadius: number,
): HTMLCanvasElement | null {
  const key = `funnel/${coreRadius}/${pullRadius}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const size = Math.max(2, Math.ceil(pullRadius * 2));
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = size / 2;
  const funnel = ctx.createRadialGradient(r, r, coreRadius, r, r, pullRadius);
  funnel.addColorStop(0, "rgba(8, 6, 20, 0.55)");
  funnel.addColorStop(0.6, "rgba(20, 12, 44, 0.28)");
  funnel.addColorStop(1, "rgba(20, 12, 44, 0)");
  ctx.fillStyle = funnel;
  ctx.beginPath();
  ctx.arc(r, r, pullRadius, 0, Math.PI * 2);
  ctx.fill();
  glowCache.set(key, canvas);
  return canvas;
}

export function enemySprites(sprites: Sprites, family: string): EnemyVariants {
  const cached = enemySpriteCache.get(family);
  if (cached) return cached;
  // Faithful to the old per-frame fallbacks: a missing stage variant degrades
  // to the base frame of the same index, a missing base frame to the ghost.
  const base: EnemyFrames = [
    spriteByName(sprites, `${family}_0`) ?? sprites.ghost_0,
    spriteByName(sprites, `${family}_1`) ?? sprites.ghost_0,
  ];
  const stage = (suffix: string): EnemyFrames => [
    spriteByName(sprites, `${family}${suffix}_0`) ?? base[0],
    spriteByName(sprites, `${family}${suffix}_1`) ?? base[1],
  ];
  const variants: EnemyVariants = {
    base,
    hurt: stage("_hurt"),
    wrecked: stage("_wrecked"),
    dying: stage("_dying"),
  };
  enemySpriteCache.set(family, variants);
  return variants;
}
