// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Loads the generated pixel assets (see the pixel-assets skill): the sprite
// atlas (one PNG + JSON source rects covering every sprite in the game) is
// fetched and decoded once, then sliced into per-sprite bitmaps the
// renderer blits like any image. Everything under ./assets/ is produced by
// website/scripts/generate-assets.mjs — never edited by hand.

import { bitmapDataUrl, sliceAtlas } from "@ui/lib/atlas.ts";
import { loadImages } from "@ui/lib/load-images.ts";
import { createPixelFont, type PixelFont } from "@ui/lib/pixel-font.ts";

import atlasRects from "./assets/atlas.json";
import atlasUrl from "./assets/atlas.png";
import fontMeta from "./assets/font.json";
import fontUrl from "./assets/font.png";
import relicMeta from "./assets/font-relic.json";
import relicArtifactUrl from "./assets/font-relic-artifact.png";
import relicLegendaryUrl from "./assets/font-relic-legendary.png";
import relicUniqueUrl from "./assets/font-relic-unique.png";

export type SpriteName = keyof typeof atlasRects;
export type Sprites = Record<SpriteName, ImageBitmap>;

/** The rarity tiers that carry a struck-gold RELIC name font on their card. */
export type RelicTier = "unique" | "legendary" | "artifact";

export type GameAssets = {
  sprites: Sprites;
  font: PixelFont;
  /**
   * The pre-colored golden display fonts for unique/legendary/artifact item
   * NAMES — one per tier, escalating in metallic richness. Pre-shaded, so
   * they ignore the `color` draw option (see createPixelFont `tinted: false`).
   */
  relicFonts: Record<RelicTier, PixelFont>;
};

/**
 * Look up a sprite by a catalog-provided name (enemy defs and equipment defs
 * name their sprites/icons as strings). Returns undefined for unknown names
 * so a missing sprite degrades to "not drawn" instead of crashing a frame.
 */
export function spriteByName(
  sprites: Sprites,
  name: string,
): ImageBitmap | undefined {
  return (sprites as Record<string, ImageBitmap>)[name];
}

const dataUrls = new Map<string, string>();

/**
 * A sprite as a standalone data URL, for the few DOM `<img>` consumers
 * (inventory icons, dialogue portraits). Cached per name — the sprite set
 * is a memoized singleton, so the slices never change.
 */
export function spriteDataUrl(
  sprites: Sprites,
  name: string,
): string | undefined {
  const sprite = spriteByName(sprites, name);
  if (!sprite) return undefined;
  let url = dataUrls.get(name);
  if (!url) {
    url = bitmapDataUrl(sprite);
    dataUrls.set(name, url);
  }
  return url;
}

/**
 * Build a CSS `cursor` value from a sprite, upscaled by an integer factor with
 * smoothing off so it stays crisp 16-bit pixels — a browser can't pixelate a
 * cursor image at display time, so the chunkiness is baked into the PNG. The
 * hotspot defaults to the sprite's centre. Cached per (name, scale).
 */
export function spriteCursor(
  sprites: Sprites,
  name: string,
  {
    scale = 2,
    hotX,
    hotY,
    fallback = "auto",
  }: { scale?: number; hotX?: number; hotY?: number; fallback?: string } = {},
): string | undefined {
  const sprite = spriteByName(sprites, name);
  if (!sprite) return undefined;
  const cacheKey = `cursor:${name}@${scale}`;
  let url = dataUrls.get(cacheKey);
  if (!url) {
    const canvas = document.createElement("canvas");
    canvas.width = sprite.width * scale;
    canvas.height = sprite.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, 0, 0, canvas.width, canvas.height);
    url = canvas.toDataURL();
    dataUrls.set(cacheKey, url);
  }
  const hx = Math.round((hotX ?? sprite.width / 2) * scale);
  const hy = Math.round((hotY ?? sprite.height / 2) * scale);
  return `url(${url}) ${hx} ${hy}, ${fallback}`;
}

let loaded: Promise<GameAssets> | null = null;
let loadedValue: GameAssets | null = null;

export function loadGameAssets(): Promise<GameAssets> {
  // Memoized: the title screen and the game screen share one decode pass.
  loaded ??= loadImages({
    atlas: atlasUrl,
    font: fontUrl,
    relicUnique: relicUniqueUrl,
    relicLegendary: relicLegendaryUrl,
    relicArtifact: relicArtifactUrl,
  }).then(async (images) => {
    const assets: GameAssets = {
      sprites: await sliceAtlas(images.atlas, atlasRects),
      font: createPixelFont(images.font, fontMeta),
      relicFonts: {
        unique: createPixelFont(images.relicUnique, relicMeta, {
          tinted: false,
        }),
        legendary: createPixelFont(images.relicLegendary, relicMeta, {
          tinted: false,
        }),
        artifact: createPixelFont(images.relicArtifact, relicMeta, {
          tinted: false,
        }),
      },
    };
    loadedValue = assets;
    return assets;
  });
  return loaded;
}

/**
 * The already-decoded assets if `loadGameAssets` has resolved, else null. Lets
 * a screen mount without a "Loading…" flash once the shared decode pass is done
 * (the title screen triggers it) — the sibling menu screens (NEW GAME / LOAD
 * GAME) seed their state from this and skip the loading placeholder.
 */
export function peekGameAssets(): GameAssets | null {
  return loadedValue;
}
