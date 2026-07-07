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

export type SpriteName = keyof typeof atlasRects;
export type Sprites = Record<SpriteName, ImageBitmap>;

export type GameAssets = {
  sprites: Sprites;
  font: PixelFont;
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

let loaded: Promise<GameAssets> | null = null;

export function loadGameAssets(): Promise<GameAssets> {
  // Memoized: the title screen and the game screen share one decode pass.
  loaded ??= loadImages({ atlas: atlasUrl, font: fontUrl }).then(
    async (images) => ({
      sprites: await sliceAtlas(images.atlas, atlasRects),
      font: createPixelFont(images.font, fontMeta),
    }),
  );
  return loaded;
}
