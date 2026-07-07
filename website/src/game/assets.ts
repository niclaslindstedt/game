// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Loads the generated pixel assets (see the pixel-assets skill) into decoded
// images the renderer can blit. Everything under ./assets/ is produced by
// website/scripts/generate-assets.mjs — never edited by hand.

import { loadImages } from "@ui/lib/load-images.ts";
import { createPixelFont, type PixelFont } from "@ui/lib/pixel-font.ts";

import ada0Url from "./assets/ada_0.png";
import ada1Url from "./assets/ada_1.png";
import armstrong0Url from "./assets/armstrong_0.png";
import armstrong1Url from "./assets/armstrong_1.png";
import boltUrl from "./assets/bolt.png";
import boulderUrl from "./assets/boulder.png";
import cableUrl from "./assets/cable.png";
import couchUrl from "./assets/couch.png";
import crateUrl from "./assets/crate.png";
import craterBigUrl from "./assets/crater_big.png";
import craterSmallUrl from "./assets/crater_small.png";
import deskUrl from "./assets/desk.png";
import doorUrl from "./assets/door.png";
import engineer0Url from "./assets/engineer_0.png";
import engineer1Url from "./assets/engineer_1.png";
import entranceUrl from "./assets/entrance.png";
import fireballUrl from "./assets/fireball.png";
import flagUrl from "./assets/flag.png";
import fontMeta from "./assets/font.json";
import fontUrl from "./assets/font.png";
import ghost0Url from "./assets/ghost_0.png";
import ghost1Url from "./assets/ghost_1.png";
import gravel0Url from "./assets/gravel_0.png";
import gravel1Url from "./assets/gravel_1.png";
import guard0Url from "./assets/guard_0.png";
import guard1Url from "./assets/guard_1.png";
import hazmat0Url from "./assets/hazmat_0.png";
import hazmat1Url from "./assets/hazmat_1.png";
import heroCouch0Url from "./assets/hero_couch_0.png";
import heroCouch1Url from "./assets/hero_couch_1.png";
import iconBadgeUrl from "./assets/icon_badge.png";
import iconBatonUrl from "./assets/icon_baton.png";
import iconBeakerUrl from "./assets/icon_beaker.png";
import iconBlasterUrl from "./assets/icon_blaster.png";
import iconCharmUrl from "./assets/icon_charm.png";
import iconExtinguisherUrl from "./assets/icon_extinguisher.png";
import iconFireOrbsUrl from "./assets/icon_fire_orbs.png";
import iconGoldenStaplerUrl from "./assets/icon_golden_stapler.png";
import iconHammerUrl from "./assets/icon_hammer.png";
import iconKeyboardUrl from "./assets/icon_keyboard.png";
import iconLabCoatUrl from "./assets/icon_lab_coat.png";
import iconLaserPointerUrl from "./assets/icon_laser_pointer.png";
import iconMacheteUrl from "./assets/icon_machete.png";
import iconMagnetUrl from "./assets/icon_magnet.png";
import iconMoonsBladeUrl from "./assets/icon_moons_blade.png";
import iconMopUrl from "./assets/icon_mop.png";
import iconNukeUrl from "./assets/icon_nuke.png";
import iconPipeUrl from "./assets/icon_pipe.png";
import iconPistolUrl from "./assets/icon_pistol.png";
import iconPlasmaCutterUrl from "./assets/icon_plasma_cutter.png";
import iconRifleUrl from "./assets/icon_rifle.png";
import iconStaplerUrl from "./assets/icon_stapler.png";
import iconStarWandUrl from "./assets/icon_star_wand.png";
import iconStasisUrl from "./assets/icon_stasis.png";
import iconStormUrl from "./assets/icon_storm.png";
import iconSuitUrl from "./assets/icon_suit.png";
import iconTaserUrl from "./assets/icon_taser.png";
import iconVoidWandUrl from "./assets/icon_void_wand.png";
import iconWandUrl from "./assets/icon_wand.png";
import iconWrenchUrl from "./assets/icon_wrench.png";
import intern0Url from "./assets/intern_0.png";
import intern1Url from "./assets/intern_1.png";
import lab0Url from "./assets/lab_0.png";
import lab1Url from "./assets/lab_1.png";
import lampUrl from "./assets/lamp.png";
import landerUrl from "./assets/lander.png";
import medkitUrl from "./assets/medkit.png";
import moon0Url from "./assets/moon_0.png";
import moon1Url from "./assets/moon_1.png";
import muskrat0Url from "./assets/muskrat_0.png";
import muskrat1Url from "./assets/muskrat_1.png";
import papersUrl from "./assets/papers.png";
import plantUrl from "./assets/plant.png";
import player0Url from "./assets/player_0.png";
import player1Url from "./assets/player_1.png";
import playerJumpUrl from "./assets/player_jump.png";
import rayUrl from "./assets/ray.png";
import repairUrl from "./assets/repair.png";
import rockUrl from "./assets/rock.png";
import rocketUrl from "./assets/rocket.png";
import rocksUrl from "./assets/rocks.png";
import scientist0Url from "./assets/scientist_0.png";
import scientist1Url from "./assets/scientist_1.png";
import serverUrl from "./assets/server.png";
import shadowUrl from "./assets/shadow.png";
import sparkUrl from "./assets/spark.png";
import stainUrl from "./assets/stain.png";
import stapleUrl from "./assets/staple.png";
import tableUrl from "./assets/table.png";
import tvUrl from "./assets/tv.png";
import upgradeUrl from "./assets/upgrade.png";
import vendingUrl from "./assets/vending.png";
import vent0Url from "./assets/vent_0.png";
import vent1Url from "./assets/vent_1.png";
import vialUrl from "./assets/vial.png";
import wallUrl from "./assets/wall.png";
import windowUrl from "./assets/window.png";
import wisp0Url from "./assets/wisp_0.png";
import wisp1Url from "./assets/wisp_1.png";
import wraith0Url from "./assets/wraith_0.png";
import wraith1Url from "./assets/wraith_1.png";
import zapUrl from "./assets/zap.png";
const SPRITE_URLS = {
  ada_0: ada0Url,
  ada_1: ada1Url,
  armstrong_0: armstrong0Url,
  armstrong_1: armstrong1Url,
  bolt: boltUrl,
  boulder: boulderUrl,
  cable: cableUrl,
  couch: couchUrl,
  crate: crateUrl,
  crater_big: craterBigUrl,
  crater_small: craterSmallUrl,
  desk: deskUrl,
  door: doorUrl,
  engineer_0: engineer0Url,
  engineer_1: engineer1Url,
  entrance: entranceUrl,
  fireball: fireballUrl,
  flag: flagUrl,
  ghost_0: ghost0Url,
  ghost_1: ghost1Url,
  gravel_0: gravel0Url,
  gravel_1: gravel1Url,
  guard_0: guard0Url,
  guard_1: guard1Url,
  hazmat_0: hazmat0Url,
  hazmat_1: hazmat1Url,
  hero_couch_0: heroCouch0Url,
  hero_couch_1: heroCouch1Url,
  icon_badge: iconBadgeUrl,
  icon_baton: iconBatonUrl,
  icon_beaker: iconBeakerUrl,
  icon_blaster: iconBlasterUrl,
  icon_charm: iconCharmUrl,
  icon_extinguisher: iconExtinguisherUrl,
  icon_fire_orbs: iconFireOrbsUrl,
  icon_golden_stapler: iconGoldenStaplerUrl,
  icon_hammer: iconHammerUrl,
  icon_keyboard: iconKeyboardUrl,
  icon_lab_coat: iconLabCoatUrl,
  icon_laser_pointer: iconLaserPointerUrl,
  icon_machete: iconMacheteUrl,
  icon_magnet: iconMagnetUrl,
  icon_moons_blade: iconMoonsBladeUrl,
  icon_mop: iconMopUrl,
  icon_nuke: iconNukeUrl,
  icon_pipe: iconPipeUrl,
  icon_pistol: iconPistolUrl,
  icon_plasma_cutter: iconPlasmaCutterUrl,
  icon_rifle: iconRifleUrl,
  icon_stapler: iconStaplerUrl,
  icon_star_wand: iconStarWandUrl,
  icon_stasis: iconStasisUrl,
  icon_storm: iconStormUrl,
  icon_suit: iconSuitUrl,
  icon_taser: iconTaserUrl,
  icon_void_wand: iconVoidWandUrl,
  icon_wand: iconWandUrl,
  icon_wrench: iconWrenchUrl,
  intern_0: intern0Url,
  intern_1: intern1Url,
  lab_0: lab0Url,
  lab_1: lab1Url,
  lamp: lampUrl,
  lander: landerUrl,
  medkit: medkitUrl,
  moon_0: moon0Url,
  moon_1: moon1Url,
  muskrat_0: muskrat0Url,
  muskrat_1: muskrat1Url,
  papers: papersUrl,
  plant: plantUrl,
  player_0: player0Url,
  player_1: player1Url,
  player_jump: playerJumpUrl,
  ray: rayUrl,
  repair: repairUrl,
  rock: rockUrl,
  rocket: rocketUrl,
  rocks: rocksUrl,
  scientist_0: scientist0Url,
  scientist_1: scientist1Url,
  server: serverUrl,
  shadow: shadowUrl,
  spark: sparkUrl,
  stain: stainUrl,
  staple: stapleUrl,
  table: tableUrl,
  tv: tvUrl,
  upgrade: upgradeUrl,
  vending: vendingUrl,
  vent_0: vent0Url,
  vent_1: vent1Url,
  vial: vialUrl,
  wall: wallUrl,
  window: windowUrl,
  wisp_0: wisp0Url,
  wisp_1: wisp1Url,
  wraith_0: wraith0Url,
  wraith_1: wraith1Url,
  zap: zapUrl,
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
