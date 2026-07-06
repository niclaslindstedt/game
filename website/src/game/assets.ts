// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Loads the generated pixel assets (see the pixel-assets skill) into decoded
// images the renderer can blit. Everything under ./assets/ is produced by
// website/scripts/generate-assets.mjs — never edited by hand.

import { loadImages } from "@ui/lib/load-images.ts";
import { createPixelFont, type PixelFont } from "@ui/lib/pixel-font.ts";

import armstrong0Url from "./assets/armstrong_0.png";
import armstrong1Url from "./assets/armstrong_1.png";
import boltUrl from "./assets/bolt.png";
import boulderUrl from "./assets/boulder.png";
import craterBigUrl from "./assets/crater_big.png";
import craterSmallUrl from "./assets/crater_small.png";
import fireballUrl from "./assets/fireball.png";
import flagUrl from "./assets/flag.png";
import fontMeta from "./assets/font.json";
import fontUrl from "./assets/font.png";
import ghost0Url from "./assets/ghost_0.png";
import ghost1Url from "./assets/ghost_1.png";
import gravel0Url from "./assets/gravel_0.png";
import gravel1Url from "./assets/gravel_1.png";
import iconBlasterUrl from "./assets/icon_blaster.png";
import iconCharmUrl from "./assets/icon_charm.png";
import iconFireOrbsUrl from "./assets/icon_fire_orbs.png";
import iconHammerUrl from "./assets/icon_hammer.png";
import iconMacheteUrl from "./assets/icon_machete.png";
import iconMagnetUrl from "./assets/icon_magnet.png";
import iconMoonsBladeUrl from "./assets/icon_moons_blade.png";
import iconNukeUrl from "./assets/icon_nuke.png";
import iconPipeUrl from "./assets/icon_pipe.png";
import iconPistolUrl from "./assets/icon_pistol.png";
import iconRifleUrl from "./assets/icon_rifle.png";
import iconStarWandUrl from "./assets/icon_star_wand.png";
import iconStasisUrl from "./assets/icon_stasis.png";
import iconStormUrl from "./assets/icon_storm.png";
import iconSuitUrl from "./assets/icon_suit.png";
import iconVoidWandUrl from "./assets/icon_void_wand.png";
import iconWandUrl from "./assets/icon_wand.png";
import iconWrenchUrl from "./assets/icon_wrench.png";
import landerUrl from "./assets/lander.png";
import medkitUrl from "./assets/medkit.png";
import moon0Url from "./assets/moon_0.png";
import moon1Url from "./assets/moon_1.png";
import player0Url from "./assets/player_0.png";
import player1Url from "./assets/player_1.png";
import playerJumpUrl from "./assets/player_jump.png";
import repairUrl from "./assets/repair.png";
import rockUrl from "./assets/rock.png";
import rocksUrl from "./assets/rocks.png";
import shadowUrl from "./assets/shadow.png";
import sparkUrl from "./assets/spark.png";
import upgradeUrl from "./assets/upgrade.png";
import wisp0Url from "./assets/wisp_0.png";
import wisp1Url from "./assets/wisp_1.png";
import wraith0Url from "./assets/wraith_0.png";
import wraith1Url from "./assets/wraith_1.png";

const SPRITE_URLS = {
  armstrong_0: armstrong0Url,
  armstrong_1: armstrong1Url,
  bolt: boltUrl,
  boulder: boulderUrl,
  crater_big: craterBigUrl,
  crater_small: craterSmallUrl,
  fireball: fireballUrl,
  flag: flagUrl,
  ghost_0: ghost0Url,
  ghost_1: ghost1Url,
  gravel_0: gravel0Url,
  gravel_1: gravel1Url,
  icon_blaster: iconBlasterUrl,
  icon_charm: iconCharmUrl,
  icon_fire_orbs: iconFireOrbsUrl,
  icon_hammer: iconHammerUrl,
  icon_machete: iconMacheteUrl,
  icon_magnet: iconMagnetUrl,
  icon_moons_blade: iconMoonsBladeUrl,
  icon_nuke: iconNukeUrl,
  icon_pipe: iconPipeUrl,
  icon_pistol: iconPistolUrl,
  icon_rifle: iconRifleUrl,
  icon_star_wand: iconStarWandUrl,
  icon_stasis: iconStasisUrl,
  icon_storm: iconStormUrl,
  icon_suit: iconSuitUrl,
  icon_void_wand: iconVoidWandUrl,
  icon_wand: iconWandUrl,
  icon_wrench: iconWrenchUrl,
  lander: landerUrl,
  medkit: medkitUrl,
  moon_0: moon0Url,
  moon_1: moon1Url,
  player_0: player0Url,
  player_1: player1Url,
  player_jump: playerJumpUrl,
  repair: repairUrl,
  rock: rockUrl,
  rocks: rocksUrl,
  shadow: shadowUrl,
  spark: sparkUrl,
  upgrade: upgradeUrl,
  wisp_0: wisp0Url,
  wisp_1: wisp1Url,
  wraith_0: wraith0Url,
  wraith_1: wraith1Url,
  font: fontUrl,
};

export type SpriteName = keyof typeof SPRITE_URLS;
export type Sprites = Record<SpriteName, HTMLImageElement>;

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
): HTMLImageElement | undefined {
  return (sprites as Record<string, HTMLImageElement>)[name];
}

let loaded: Promise<GameAssets> | null = null;

export function loadGameAssets(): Promise<GameAssets> {
  // Memoized: the title screen and the game screen share one decode pass.
  loaded ??= loadImages(SPRITE_URLS).then((sprites) => ({
    sprites,
    font: createPixelFont(sprites.font, fontMeta),
  }));
  return loaded;
}
