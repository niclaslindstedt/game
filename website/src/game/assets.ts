// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Loads the generated pixel assets (see the pixel-assets skill) into decoded
// images the renderer can blit. Everything under ./assets/ is produced by
// website/scripts/generate-assets.mjs — never edited by hand.

import { loadImages } from "../lib/load-images.ts";
import { createPixelFont, type PixelFont } from "../lib/pixel-font.ts";

import boltUrl from "./assets/bolt.png";
import fontMeta from "./assets/font.json";
import fontUrl from "./assets/font.png";
import grass0Url from "./assets/grass_0.png";
import grass1Url from "./assets/grass_1.png";
import medkitUrl from "./assets/medkit.png";
import player0Url from "./assets/player_0.png";
import player1Url from "./assets/player_1.png";
import slime0Url from "./assets/slime_0.png";
import slime1Url from "./assets/slime_1.png";

const SPRITE_URLS = {
  bolt: boltUrl,
  grass_0: grass0Url,
  grass_1: grass1Url,
  medkit: medkitUrl,
  player_0: player0Url,
  player_1: player1Url,
  slime_0: slime0Url,
  slime_1: slime1Url,
  font: fontUrl,
};

export type SpriteName = keyof typeof SPRITE_URLS;
export type Sprites = Record<SpriteName, HTMLImageElement>;

export type GameAssets = {
  sprites: Sprites;
  font: PixelFont;
};

export async function loadGameAssets(): Promise<GameAssets> {
  const sprites = await loadImages(SPRITE_URLS);
  return { sprites, font: createPixelFont(sprites.font, fontMeta) };
}
