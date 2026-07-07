// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Loads the generated pixel assets (see the pixel-assets skill) into decoded
// images the renderer can blit. Everything under ./assets/ is produced by
// website/scripts/generate-assets.mjs — never edited by hand.

import { loadImages } from "@ui/lib/load-images.ts";
import { createPixelFont, type PixelFont } from "@ui/lib/pixel-font.ts";

import ada0Url from "./assets/ada_0.png";
import ada1Url from "./assets/ada_1.png";
import apolloGhost0Url from "./assets/apollo_ghost_0.png";
import apolloGhost1Url from "./assets/apollo_ghost_1.png";
import apolloGhostHurt0Url from "./assets/apollo_ghost_hurt_0.png";
import apolloGhostHurt1Url from "./assets/apollo_ghost_hurt_1.png";
import apolloGhostWrecked0Url from "./assets/apollo_ghost_wrecked_0.png";
import apolloGhostWrecked1Url from "./assets/apollo_ghost_wrecked_1.png";
import armstrong0Url from "./assets/armstrong_0.png";
import armstrong1Url from "./assets/armstrong_1.png";
import armstrongDying0Url from "./assets/armstrong_dying_0.png";
import armstrongDying1Url from "./assets/armstrong_dying_1.png";
import armstrongHurt0Url from "./assets/armstrong_hurt_0.png";
import armstrongHurt1Url from "./assets/armstrong_hurt_1.png";
import armstrongWrecked0Url from "./assets/armstrong_wrecked_0.png";
import armstrongWrecked1Url from "./assets/armstrong_wrecked_1.png";
import blood0Url from "./assets/blood_0.png";
import blood1Url from "./assets/blood_1.png";
import boltUrl from "./assets/bolt.png";
import boulderUrl from "./assets/boulder.png";
import cableUrl from "./assets/cable.png";
import cartographer0Url from "./assets/cartographer_0.png";
import cartographer1Url from "./assets/cartographer_1.png";
import cartographerHurt0Url from "./assets/cartographer_hurt_0.png";
import cartographerHurt1Url from "./assets/cartographer_hurt_1.png";
import cartographerWrecked0Url from "./assets/cartographer_wrecked_0.png";
import cartographerWrecked1Url from "./assets/cartographer_wrecked_1.png";
import couchUrl from "./assets/couch.png";
import crateUrl from "./assets/crate.png";
import craterBigUrl from "./assets/crater_big.png";
import craterSmallUrl from "./assets/crater_small.png";
import deskUrl from "./assets/desk.png";
import doorUrl from "./assets/door.png";
import doorLockedUrl from "./assets/door_locked.png";
import ecto0Url from "./assets/ecto_0.png";
import ecto1Url from "./assets/ecto_1.png";
import engineer0Url from "./assets/engineer_0.png";
import engineer1Url from "./assets/engineer_1.png";
import engineerHurt0Url from "./assets/engineer_hurt_0.png";
import engineerHurt1Url from "./assets/engineer_hurt_1.png";
import entranceUrl from "./assets/entrance.png";
import fireballUrl from "./assets/fireball.png";
import flagUrl from "./assets/flag.png";
import fontMeta from "./assets/font.json";
import fontUrl from "./assets/font.png";
import ghost0Url from "./assets/ghost_0.png";
import ghost1Url from "./assets/ghost_1.png";
import ghostHurt0Url from "./assets/ghost_hurt_0.png";
import ghostHurt1Url from "./assets/ghost_hurt_1.png";
import grass0Url from "./assets/grass_0.png";
import grass1Url from "./assets/grass_1.png";
import gravel0Url from "./assets/gravel_0.png";
import gravel1Url from "./assets/gravel_1.png";
import guard0Url from "./assets/guard_0.png";
import guard1Url from "./assets/guard_1.png";
import guardHurt0Url from "./assets/guard_hurt_0.png";
import guardHurt1Url from "./assets/guard_hurt_1.png";
import hazmat0Url from "./assets/hazmat_0.png";
import hazmat1Url from "./assets/hazmat_1.png";
import hazmatHurt0Url from "./assets/hazmat_hurt_0.png";
import hazmatHurt1Url from "./assets/hazmat_hurt_1.png";
import headScientist0Url from "./assets/head_scientist_0.png";
import headScientist1Url from "./assets/head_scientist_1.png";
import headScientistHurt0Url from "./assets/head_scientist_hurt_0.png";
import headScientistHurt1Url from "./assets/head_scientist_hurt_1.png";
import headScientistWrecked0Url from "./assets/head_scientist_wrecked_0.png";
import headScientistWrecked1Url from "./assets/head_scientist_wrecked_1.png";
import heroCouch0Url from "./assets/hero_couch_0.png";
import heroCouch1Url from "./assets/hero_couch_1.png";
import iconAntigravUrl from "./assets/icon_antigrav.png";
import iconBadgeUrl from "./assets/icon_badge.png";
import iconBatonUrl from "./assets/icon_baton.png";
import iconBeakerUrl from "./assets/icon_beaker.png";
import iconBlasterUrl from "./assets/icon_blaster.png";
import iconBlueprintUrl from "./assets/icon_blueprint.png";
import iconCharmUrl from "./assets/icon_charm.png";
import iconCoreDrillUrl from "./assets/icon_core_drill.png";
import iconDossierUrl from "./assets/icon_dossier.png";
import iconExtinguisherUrl from "./assets/icon_extinguisher.png";
import iconFireOrbsUrl from "./assets/icon_fire_orbs.png";
import iconFlareGunUrl from "./assets/icon_flare_gun.png";
import iconFloorSignUrl from "./assets/icon_floor_sign.png";
import iconGeigerWandUrl from "./assets/icon_geiger_wand.png";
import iconGoldenStaplerUrl from "./assets/icon_golden_stapler.png";
import iconHammerUrl from "./assets/icon_hammer.png";
import iconKeyboardUrl from "./assets/icon_keyboard.png";
import iconKeycardUrl from "./assets/icon_keycard.png";
import iconKeycardRedUrl from "./assets/icon_keycard_red.png";
import iconLabCoatUrl from "./assets/icon_lab_coat.png";
import iconLaserPointerUrl from "./assets/icon_laser_pointer.png";
import iconLogUrl from "./assets/icon_log.png";
import iconMacheteUrl from "./assets/icon_machete.png";
import iconMagnetUrl from "./assets/icon_magnet.png";
import iconManifestUrl from "./assets/icon_manifest.png";
import iconMoonsBladeUrl from "./assets/icon_moons_blade.png";
import iconMopUrl from "./assets/icon_mop.png";
import iconNukeUrl from "./assets/icon_nuke.png";
import iconOverclockedLaserUrl from "./assets/icon_overclocked_laser.png";
import iconPipeUrl from "./assets/icon_pipe.png";
import iconPistolUrl from "./assets/icon_pistol.png";
import iconPlasmaCutterUrl from "./assets/icon_plasma_cutter.png";
import iconPutterUrl from "./assets/icon_putter.png";
import iconRifleUrl from "./assets/icon_rifle.png";
import iconRiotTaserUrl from "./assets/icon_riot_taser.png";
import iconStaplerUrl from "./assets/icon_stapler.png";
import iconStarWandUrl from "./assets/icon_star_wand.png";
import iconStasisUrl from "./assets/icon_stasis.png";
import iconStormUrl from "./assets/icon_storm.png";
import iconSuitUrl from "./assets/icon_suit.png";
import iconSurveyorsPickUrl from "./assets/icon_surveyors_pick.png";
import iconTaserUrl from "./assets/icon_taser.png";
import iconVoidWandUrl from "./assets/icon_void_wand.png";
import iconWandUrl from "./assets/icon_wand.png";
import iconWrenchUrl from "./assets/icon_wrench.png";
import intern0Url from "./assets/intern_0.png";
import intern1Url from "./assets/intern_1.png";
import internHurt0Url from "./assets/intern_hurt_0.png";
import internHurt1Url from "./assets/intern_hurt_1.png";
import janitor0Url from "./assets/janitor_0.png";
import janitor1Url from "./assets/janitor_1.png";
import janitorHurt0Url from "./assets/janitor_hurt_0.png";
import janitorHurt1Url from "./assets/janitor_hurt_1.png";
import janitorWrecked0Url from "./assets/janitor_wrecked_0.png";
import janitorWrecked1Url from "./assets/janitor_wrecked_1.png";
import lab0Url from "./assets/lab_0.png";
import lab1Url from "./assets/lab_1.png";
import lampUrl from "./assets/lamp.png";
import landerUrl from "./assets/lander.png";
import medkitUrl from "./assets/medkit.png";
import moon0Url from "./assets/moon_0.png";
import moon1Url from "./assets/moon_1.png";
import muskrat0Url from "./assets/muskrat_0.png";
import muskrat1Url from "./assets/muskrat_1.png";
import muskratDying0Url from "./assets/muskrat_dying_0.png";
import muskratDying1Url from "./assets/muskrat_dying_1.png";
import muskratHurt0Url from "./assets/muskrat_hurt_0.png";
import muskratHurt1Url from "./assets/muskrat_hurt_1.png";
import muskratWrecked0Url from "./assets/muskrat_wrecked_0.png";
import muskratWrecked1Url from "./assets/muskrat_wrecked_1.png";
import nightManager0Url from "./assets/night_manager_0.png";
import nightManager1Url from "./assets/night_manager_1.png";
import nightManagerHurt0Url from "./assets/night_manager_hurt_0.png";
import nightManagerHurt1Url from "./assets/night_manager_hurt_1.png";
import nightManagerWrecked0Url from "./assets/night_manager_wrecked_0.png";
import nightManagerWrecked1Url from "./assets/night_manager_wrecked_1.png";
import papersUrl from "./assets/papers.png";
import plantUrl from "./assets/plant.png";
import player0Url from "./assets/player_0.png";
import player1Url from "./assets/player_1.png";
import playerJumpUrl from "./assets/player_jump.png";
import prospector0Url from "./assets/prospector_0.png";
import prospector1Url from "./assets/prospector_1.png";
import prospectorHurt0Url from "./assets/prospector_hurt_0.png";
import prospectorHurt1Url from "./assets/prospector_hurt_1.png";
import prospectorWrecked0Url from "./assets/prospector_wrecked_0.png";
import prospectorWrecked1Url from "./assets/prospector_wrecked_1.png";
import quarantineMedic0Url from "./assets/quarantine_medic_0.png";
import quarantineMedic1Url from "./assets/quarantine_medic_1.png";
import quarantineMedicHurt0Url from "./assets/quarantine_medic_hurt_0.png";
import quarantineMedicHurt1Url from "./assets/quarantine_medic_hurt_1.png";
import quarantineMedicWrecked0Url from "./assets/quarantine_medic_wrecked_0.png";
import quarantineMedicWrecked1Url from "./assets/quarantine_medic_wrecked_1.png";
import rayUrl from "./assets/ray.png";
import repairUrl from "./assets/repair.png";
import rockUrl from "./assets/rock.png";
import rocketUrl from "./assets/rocket.png";
import rocksUrl from "./assets/rocks.png";
import scientist0Url from "./assets/scientist_0.png";
import scientist1Url from "./assets/scientist_1.png";
import scientistHurt0Url from "./assets/scientist_hurt_0.png";
import scientistHurt1Url from "./assets/scientist_hurt_1.png";
import securityChief0Url from "./assets/security_chief_0.png";
import securityChief1Url from "./assets/security_chief_1.png";
import securityChiefHurt0Url from "./assets/security_chief_hurt_0.png";
import securityChiefHurt1Url from "./assets/security_chief_hurt_1.png";
import securityChiefWrecked0Url from "./assets/security_chief_wrecked_0.png";
import securityChiefWrecked1Url from "./assets/security_chief_wrecked_1.png";
import serverUrl from "./assets/server.png";
import shadowUrl from "./assets/shadow.png";
import slime0Url from "./assets/slime_0.png";
import slime1Url from "./assets/slime_1.png";
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
import wispHurt0Url from "./assets/wisp_hurt_0.png";
import wispHurt1Url from "./assets/wisp_hurt_1.png";
import wraith0Url from "./assets/wraith_0.png";
import wraith1Url from "./assets/wraith_1.png";
import wraithHurt0Url from "./assets/wraith_hurt_0.png";
import wraithHurt1Url from "./assets/wraith_hurt_1.png";
import zapUrl from "./assets/zap.png";
const SPRITE_URLS = {
  ada_0: ada0Url,
  ada_1: ada1Url,
  apollo_ghost_0: apolloGhost0Url,
  apollo_ghost_1: apolloGhost1Url,
  apollo_ghost_hurt_0: apolloGhostHurt0Url,
  apollo_ghost_hurt_1: apolloGhostHurt1Url,
  apollo_ghost_wrecked_0: apolloGhostWrecked0Url,
  apollo_ghost_wrecked_1: apolloGhostWrecked1Url,
  armstrong_0: armstrong0Url,
  armstrong_1: armstrong1Url,
  armstrong_dying_0: armstrongDying0Url,
  armstrong_dying_1: armstrongDying1Url,
  armstrong_hurt_0: armstrongHurt0Url,
  armstrong_hurt_1: armstrongHurt1Url,
  armstrong_wrecked_0: armstrongWrecked0Url,
  armstrong_wrecked_1: armstrongWrecked1Url,
  blood_0: blood0Url,
  blood_1: blood1Url,
  bolt: boltUrl,
  boulder: boulderUrl,
  cable: cableUrl,
  cartographer_0: cartographer0Url,
  cartographer_1: cartographer1Url,
  cartographer_hurt_0: cartographerHurt0Url,
  cartographer_hurt_1: cartographerHurt1Url,
  cartographer_wrecked_0: cartographerWrecked0Url,
  cartographer_wrecked_1: cartographerWrecked1Url,
  couch: couchUrl,
  crate: crateUrl,
  crater_big: craterBigUrl,
  crater_small: craterSmallUrl,
  desk: deskUrl,
  door: doorUrl,
  door_locked: doorLockedUrl,
  ecto_0: ecto0Url,
  ecto_1: ecto1Url,
  engineer_0: engineer0Url,
  engineer_1: engineer1Url,
  engineer_hurt_0: engineerHurt0Url,
  engineer_hurt_1: engineerHurt1Url,
  entrance: entranceUrl,
  fireball: fireballUrl,
  flag: flagUrl,
  ghost_0: ghost0Url,
  ghost_1: ghost1Url,
  ghost_hurt_0: ghostHurt0Url,
  ghost_hurt_1: ghostHurt1Url,
  grass_0: grass0Url,
  grass_1: grass1Url,
  gravel_0: gravel0Url,
  gravel_1: gravel1Url,
  guard_0: guard0Url,
  guard_1: guard1Url,
  guard_hurt_0: guardHurt0Url,
  guard_hurt_1: guardHurt1Url,
  hazmat_0: hazmat0Url,
  hazmat_1: hazmat1Url,
  hazmat_hurt_0: hazmatHurt0Url,
  hazmat_hurt_1: hazmatHurt1Url,
  head_scientist_0: headScientist0Url,
  head_scientist_1: headScientist1Url,
  head_scientist_hurt_0: headScientistHurt0Url,
  head_scientist_hurt_1: headScientistHurt1Url,
  head_scientist_wrecked_0: headScientistWrecked0Url,
  head_scientist_wrecked_1: headScientistWrecked1Url,
  hero_couch_0: heroCouch0Url,
  hero_couch_1: heroCouch1Url,
  icon_antigrav: iconAntigravUrl,
  icon_badge: iconBadgeUrl,
  icon_baton: iconBatonUrl,
  icon_beaker: iconBeakerUrl,
  icon_blaster: iconBlasterUrl,
  icon_blueprint: iconBlueprintUrl,
  icon_charm: iconCharmUrl,
  icon_core_drill: iconCoreDrillUrl,
  icon_dossier: iconDossierUrl,
  icon_extinguisher: iconExtinguisherUrl,
  icon_fire_orbs: iconFireOrbsUrl,
  icon_flare_gun: iconFlareGunUrl,
  icon_floor_sign: iconFloorSignUrl,
  icon_geiger_wand: iconGeigerWandUrl,
  icon_golden_stapler: iconGoldenStaplerUrl,
  icon_hammer: iconHammerUrl,
  icon_keyboard: iconKeyboardUrl,
  icon_keycard: iconKeycardUrl,
  icon_keycard_red: iconKeycardRedUrl,
  icon_lab_coat: iconLabCoatUrl,
  icon_laser_pointer: iconLaserPointerUrl,
  icon_log: iconLogUrl,
  icon_machete: iconMacheteUrl,
  icon_magnet: iconMagnetUrl,
  icon_manifest: iconManifestUrl,
  icon_moons_blade: iconMoonsBladeUrl,
  icon_mop: iconMopUrl,
  icon_nuke: iconNukeUrl,
  icon_overclocked_laser: iconOverclockedLaserUrl,
  icon_pipe: iconPipeUrl,
  icon_pistol: iconPistolUrl,
  icon_plasma_cutter: iconPlasmaCutterUrl,
  icon_putter: iconPutterUrl,
  icon_rifle: iconRifleUrl,
  icon_riot_taser: iconRiotTaserUrl,
  icon_stapler: iconStaplerUrl,
  icon_star_wand: iconStarWandUrl,
  icon_stasis: iconStasisUrl,
  icon_storm: iconStormUrl,
  icon_suit: iconSuitUrl,
  icon_surveyors_pick: iconSurveyorsPickUrl,
  icon_taser: iconTaserUrl,
  icon_void_wand: iconVoidWandUrl,
  icon_wand: iconWandUrl,
  icon_wrench: iconWrenchUrl,
  intern_0: intern0Url,
  intern_1: intern1Url,
  intern_hurt_0: internHurt0Url,
  intern_hurt_1: internHurt1Url,
  janitor_0: janitor0Url,
  janitor_1: janitor1Url,
  janitor_hurt_0: janitorHurt0Url,
  janitor_hurt_1: janitorHurt1Url,
  janitor_wrecked_0: janitorWrecked0Url,
  janitor_wrecked_1: janitorWrecked1Url,
  lab_0: lab0Url,
  lab_1: lab1Url,
  lamp: lampUrl,
  lander: landerUrl,
  medkit: medkitUrl,
  moon_0: moon0Url,
  moon_1: moon1Url,
  muskrat_0: muskrat0Url,
  muskrat_1: muskrat1Url,
  muskrat_dying_0: muskratDying0Url,
  muskrat_dying_1: muskratDying1Url,
  muskrat_hurt_0: muskratHurt0Url,
  muskrat_hurt_1: muskratHurt1Url,
  muskrat_wrecked_0: muskratWrecked0Url,
  muskrat_wrecked_1: muskratWrecked1Url,
  night_manager_0: nightManager0Url,
  night_manager_1: nightManager1Url,
  night_manager_hurt_0: nightManagerHurt0Url,
  night_manager_hurt_1: nightManagerHurt1Url,
  night_manager_wrecked_0: nightManagerWrecked0Url,
  night_manager_wrecked_1: nightManagerWrecked1Url,
  papers: papersUrl,
  plant: plantUrl,
  player_0: player0Url,
  player_1: player1Url,
  player_jump: playerJumpUrl,
  prospector_0: prospector0Url,
  prospector_1: prospector1Url,
  prospector_hurt_0: prospectorHurt0Url,
  prospector_hurt_1: prospectorHurt1Url,
  prospector_wrecked_0: prospectorWrecked0Url,
  prospector_wrecked_1: prospectorWrecked1Url,
  quarantine_medic_0: quarantineMedic0Url,
  quarantine_medic_1: quarantineMedic1Url,
  quarantine_medic_hurt_0: quarantineMedicHurt0Url,
  quarantine_medic_hurt_1: quarantineMedicHurt1Url,
  quarantine_medic_wrecked_0: quarantineMedicWrecked0Url,
  quarantine_medic_wrecked_1: quarantineMedicWrecked1Url,
  ray: rayUrl,
  repair: repairUrl,
  rock: rockUrl,
  rocket: rocketUrl,
  rocks: rocksUrl,
  scientist_0: scientist0Url,
  scientist_1: scientist1Url,
  scientist_hurt_0: scientistHurt0Url,
  scientist_hurt_1: scientistHurt1Url,
  security_chief_0: securityChief0Url,
  security_chief_1: securityChief1Url,
  security_chief_hurt_0: securityChiefHurt0Url,
  security_chief_hurt_1: securityChiefHurt1Url,
  security_chief_wrecked_0: securityChiefWrecked0Url,
  security_chief_wrecked_1: securityChiefWrecked1Url,
  server: serverUrl,
  shadow: shadowUrl,
  slime_0: slime0Url,
  slime_1: slime1Url,
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
  wisp_hurt_0: wispHurt0Url,
  wisp_hurt_1: wispHurt1Url,
  wraith_0: wraith0Url,
  wraith_1: wraith1Url,
  wraith_hurt_0: wraithHurt0Url,
  wraith_hurt_1: wraithHurt1Url,
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
