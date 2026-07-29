// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Per-frame render caches, all keyed off the (memoized, singleton) Sprites
// instance: a fresh instance — e.g. after a hot reload — drops everything
// (see `ensureCaches`). Everything here trades a one-time bake for cheap
// per-frame reuse: the ground layer, radial glows, enemy sprite variants,
// animated decor frames, and measured sprite widths.

import { type GameState, type TileSpec } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { groundTileName } from "./ground-tiles.ts";
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

/**
 * The COLOUR OF THE FLOOR at a world point, as `"r, g, b"` — what a boot kicks
 * up when it lands there.
 *
 * Read off the baked ground layer rather than from a per-biome palette
 * somewhere, which is the whole point: the moon throws pale regolith, Mars
 * throws rust, and the same jump INSIDE a base throws deck grey — including on
 * a carved map, a zoned floor, and any venue added later — with nothing to
 * author and nothing that can fall out of step with the art. Averaged over a
 * few px so a landing on one dark speckle doesn't come up black, and cached per
 * tile because a hero jumping on the spot lands on the same floor every time.
 */
const groundColorCache = new Map<string, string>();
const GROUND_SAMPLE_PX = 6;
export function groundColorAt(
  state: GameState,
  sprites: Sprites,
  x: number,
  y: number,
): string {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  const key = `${state.level.id}/${tx}/${ty}`;
  const cached = groundColorCache.get(key);
  if (cached !== undefined) return cached;
  const layer = groundLayer(state, sprites);
  const fallback = "150, 145, 135";
  if (!layer) return fallback;
  const ctx = layer.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;
  const sx = Math.max(
    0,
    Math.min(
      layer.width - GROUND_SAMPLE_PX,
      Math.round(x) - GROUND_SAMPLE_PX / 2,
    ),
  );
  const sy = Math.max(
    0,
    Math.min(
      layer.height - GROUND_SAMPLE_PX,
      Math.round(y) - GROUND_SAMPLE_PX / 2,
    ),
  );
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  try {
    const { data } = ctx.getImageData(
      sx,
      sy,
      GROUND_SAMPLE_PX,
      GROUND_SAMPLE_PX,
    );
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) === 0) continue;
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
      n++;
    }
  } catch {
    return fallback; // a tainted or zero-sized canvas: not worth a crash
  }
  // Airborne dust catches the light from every side, so it reads a good deal
  // BRIGHTER than the floor it came off — and it has to, or a rust cloud over
  // rust ground is a cloud nobody can see. Sampled colour, pushed well up toward
  // white while keeping the floor's hue.
  const lift = (v: number) => Math.round(Math.min(255, (v / n) * 1.1 + 72));
  const color = n === 0 ? fallback : `${lift(r)}, ${lift(g)}, ${lift(b)}`;
  groundColorCache.set(key, color);
  return color;
}

/**
 * A sprite RECOLOURED to `rgb` (`"r, g, b"`), keeping its own shading.
 *
 * The dust a jump throws is authored once, in neutral greys, and tinted to
 * whatever floor it came off — which is the only way one set of puff frames can
 * serve six venues and every carved map without an artist drawing regolith,
 * rust, deck plate and sand versions of the same cloud. Multiplying the colour
 * through the art and masking back to its alpha keeps the billow's lit crown and
 * shaded skirt intact; a flat `source-in` fill would collapse it to a
 * silhouette.
 *
 * Baked once per (sprite, colour) — with the colour QUANTIZED, so a floor whose
 * every tile samples a shade apart doesn't mint a canvas per tile.
 */
const tintCache = new Map<string, HTMLCanvasElement | null>();
const TINT_STEP = 24;
export function tintedSprite(
  sprite: ImageBitmap,
  name: string,
  rgb: string,
): HTMLCanvasElement | ImageBitmap {
  const quantized = rgb
    .split(",")
    .map((v) => Math.round(Number(v.trim()) / TINT_STEP) * TINT_STEP)
    .join(",");
  const key = `${name}/${quantized}`;
  const cached = tintCache.get(key);
  if (cached !== undefined) return cached ?? sprite;
  const canvas = document.createElement("canvas");
  canvas.width = sprite.width;
  canvas.height = sprite.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    tintCache.set(key, null);
    return sprite;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `rgb(${quantized})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Multiply paints the whole rect, transparent pixels included — mask back to
  // the art's own alpha so the puff keeps its shape.
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(sprite, 0, 0);
  tintCache.set(key, canvas);
  return canvas;
}

/** Drop every cache when the Sprites instance changes (hot reload). */
export function ensureCaches(sprites: Sprites): void {
  if (cachesFor === sprites) return;
  cachesFor = sprites;
  groundCache = null;
  glowCache.clear();
  enemySpriteCache.clear();
  decorFramesCache.clear();
  groundColorCache.clear();
  tintCache.clear();
}

/**
 * Resolve a ground cell to its bitmap. WHICH sprite belongs there is
 * `groundTileName`'s call — the DOM-free rule the library's page backgrounds
 * read too — so this only has to turn the name into art, falling back to the
 * zone's common ground if the atlas doesn't carry it.
 */
export function groundTile(
  sprites: Sprites,
  tiles: TileSpec,
  tx: number,
  ty: number,
) {
  const name = groundTileName(tiles, tx, ty);
  return (
    spriteByName(sprites, name) ??
    spriteByName(sprites, tiles.ground.common) ??
    sprites.moon_0
  );
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

/**
 * A LIGHT SHAFT: a vertical column of `rgb` that is brightest at its foot and
 * fades out at its head, with the sides falling off too so it reads as a beam
 * of light rather than as a painted rectangle. The rarity beam standing over a
 * unique-or-better drop (see `loot-aura.ts`).
 *
 * Baked and reused for the same reason the glows are: a beam that built its two
 * gradients per item per frame would be the most expensive thing a floor full
 * of loot does. The breathing is `globalAlpha` over the baked column.
 */
export function beamSprite(
  rgb: string,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const key = `beam/${rgb}/${width}/${height}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.ceil(width));
  canvas.height = Math.max(2, Math.ceil(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rise = ctx.createLinearGradient(0, canvas.height, 0, 0);
  rise.addColorStop(0, `rgba(${rgb}, 0.85)`);
  rise.addColorStop(0.45, `rgba(${rgb}, 0.34)`);
  rise.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = rise;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Feather the sides: a hard-edged column is a rectangle, however it fades
  // upward. Punching the edges out leaves a shaft with a bright core.
  ctx.globalCompositeOperation = "destination-in";
  const across = ctx.createLinearGradient(0, 0, canvas.width, 0);
  across.addColorStop(0, "rgba(0, 0, 0, 0)");
  across.addColorStop(0.5, "rgba(0, 0, 0, 1)");
  across.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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
