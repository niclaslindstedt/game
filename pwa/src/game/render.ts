// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Canvas renderer: draws one frame of the engine state. The canvas backing
// store is in world units (1 canvas px = 1 world unit) and the browser
// upscales it with image-rendering: pixelated, so all coordinates here stay
// integers and the pixel art stays crisp. Draw order: ground → decor →
// landmarks → items → projectiles → enemies → player (shadow, jump height)
// → hurt flash.
//
// This module is the facade: it owns the frame's draw order (`drawFrame`) and
// re-exports the renderer's public API; each draw pass lives in its own
// module under `render/` (view/camera, caches, world plane, items,
// projectiles, enemies, actors, hazards, guidance, fog, player, effects).

import { localHero } from "./local-seat.ts";
import type { GameState } from "@game/core";

import { type GameAssets } from "./assets.ts";
import {
  drawAbilities,
  drawCompanions,
  drawMerchant,
} from "./render/actors.ts";
import { drawBloodGround } from "./render/blood-ground.ts";
import { drawBloodTracks, stepBloodTracks } from "./render/blood-tracks.ts";
import { ensureCaches } from "./render/caches.ts";
import { stepFootsteps } from "./render/footsteps.ts";
import {
  combatNoiseFade,
  drawDeathClouds,
  effectsClockMs,
} from "./render/death.ts";
import { drawUnderActors, type Effect } from "./render/effects.ts";
import {
  drawBaits,
  drawBeams,
  drawScorches,
  drawTethers,
} from "./render/boss-fx.ts";
import { drawEliteAuras } from "./render/elite-fx.ts";
import { drawBossRite } from "./render/boss-rite.ts";
import { drawEnemies } from "./render/enemies.ts";
import { drawFog, ensureFogField } from "./render/fog.ts";
import { drawLamps, drawNight } from "./render/night.ts";
import { drawGuidanceArrow } from "./render/guidance.ts";
import {
  drawAsteroids,
  drawHayBalls,
  drawSandstorms,
  drawStampedes,
  drawStampedeWarn,
} from "./render/hazards.ts";
import { drawCanopy } from "./render/canopy.ts";
import { drawElevators, drawLairs } from "./render/elevators.ts";
import { drawFauna } from "./render/fauna.ts";
import { drawItems } from "./render/items.ts";
import { drawPlayerCorpses } from "./render/player-corpse.ts";
import {
  drawLevelUpBurn,
  drawPlayer,
  type HeroImpact,
  type PlayerAction,
} from "./render/player.ts";
import { drawXpBoostVeil } from "./render/xp-veil.ts";
import { drawProjectiles } from "./render/projectiles.ts";
import {
  drawEscortDestinations,
  drawEscorts,
  drawQuestGivers,
} from "./render/quests.ts";
import { makeInView, worldViewOf } from "./render/shared.ts";
import { applyWorldProjection } from "./render/tilt.ts";
import { type Camera } from "./render/view.ts";
import {
  drawBossCorpseRing,
  drawCraters,
  drawDecor,
  drawGround,
  drawLandmarks,
  drawRiftPortals,
  drawObstacles,
  drawWells,
} from "./render/world.ts";
import { drawLoomingShips, drawVehicles } from "./render/vehicles.ts";

export {
  applyCameraShake,
  clearCameraShake,
  computeCamera,
  createCameraShake,
  kickCameraShake,
  uiScaleFor,
  VIEW_SCALE,
  viewScaleFor,
  type Camera,
  type CameraShake,
} from "./render/view.ts";
export {
  guidanceArrowBlinkIndex,
  guidanceArrowVisible,
} from "./render/guidance.ts";
export {
  applyWorldProjection,
  billboard,
  canvasToWorld,
  worldToCanvas,
  DEFAULT_PITCH,
  DEFAULT_YAW,
  PITCH_RANGE,
  projectX,
  projectY,
  setWorldProjection,
  unprojectX,
  unprojectY,
  worldPitch,
  worldViewRect,
  worldYaw,
  YAW_RANGE,
} from "./render/tilt.ts";
export { damageTextScale, drawEffects, type Effect } from "./render/effects.ts";
export {
  combatNoiseFade,
  COMBAT_NOISE_FADE_MS,
  deathZoom,
  effectsClockMs,
} from "./render/death.ts";
export {
  heldMotion,
  heldTwoHanded,
  MELEE_SWING_MS,
  meleeSwingMs,
  type HeroImpact,
  type PlayerAction,
} from "./render/player.ts";

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
  playerAction?: PlayerAction,
  heroImpact?: HeroImpact,
  effects: readonly Effect[] = [],
): void {
  const { sprites } = assets;
  ensureCaches(sprites);
  // TWO rects, and mixing them up is the whole hazard of the tilt. `view` is
  // the canvas in SCREEN px — what the full-screen washes and the pre-projected
  // ground blit cover. `worldView` is the same rect measured in WORLD units,
  // which the tilt makes TALLER (render/tilt.ts) — what every cull, every
  // spawn-margin test and the fog's field sampling work against.
  const view = { width: ctx.canvas.width, height: ctx.canvas.height };
  const worldView = worldViewOf(view);
  ctx.imageSmoothingEnabled = false;
  const inView = makeInView(camera, worldView);

  // The COMBAT-NOISE fade: everything the fight was shouting — the horde's
  // health bars here, the shots in flight, and the whole floating
  // damage/crit/XP effect layer (drawn by the app's render loop) — eases out
  // over the death scene's opening beat so the tableau plays clean (death.ts).
  const noiseFade = combatNoiseFade(state);

  // The fog's distance-to-frontier field, computed once per frame and shared by
  // the mob cull (drawEnemies) and the fog draw (bottom): a mob is only drawn
  // on ground the hero has actually uncovered, never through the frontier
  // stipple.
  // Takes the render clock because the frontier EASES toward where it really is
  // rather than snapping (render/fog.ts): the explored grid is 32 px cells and
  // the band is only 48 px wide, so an un-eased frontier lurches a third of a
  // band every time a cell flips.
  const field = ensureFogField(state, timeMs);

  // Letterbox backdrop (visible when the view outgrows the level).
  ctx.fillStyle = "#0b0d10";
  ctx.fillRect(0, 0, view.width, view.height);

  // THE FLOOR, in screen space: the level's ground layer is baked already
  // foreshortened, so the visible slice copies across one-to-one and the tilt
  // costs the biggest surface in the frame no resampling at all (render/tilt.ts
  // and `groundLayer`).
  drawGround(ctx, state, sprites, camera, view);

  // THE BLOOD the fight left on it, ON the floor and UNDER the rocks standing on
  // it. Deliberately not baked into the ground layer itself: `groundColorAt`
  // samples that layer to colour the dust a jump kicks up, and a boot throwing
  // red dust because something died there three minutes ago would be a bug
  // wearing a feature's clothes.
  //
  // Kept FLAT on the floor and deliberately: the whole decal system is a GRID
  // whose rungs, rims and washes are tuned against how far apart the cells sit
  // (render/blood-ground.ts). Standing each blot up would leave the art at full
  // height over cells that had drawn a quarter closer together, and a pool would
  // smear north. It takes the world rect for the same reason — it scans tiles,
  // not pixels.
  //
  // Flat, but in SCREEN space, exactly like the ground blit above and for
  // exactly that reason: the art is baked through the projection once and
  // blitted 1:1 at each blot's own whole-pixel seat, rather than resampled live
  // through the tilt every frame, which made the stains crawl against the floor
  // as the hero walked north (render/plane.ts `drawFloorDecal`).
  drawBloodGround(ctx, state, sprites, camera, worldView);
  // THE TRAIL, over the pools that made it and under everything that walks: the
  // hero's boots pick blood up off a soaked tile and print it onto clean ground
  // for the next few strides. Stepped here, immediately before it is drawn, for
  // the same reason the gait is stepped from the draw — it measures the stride
  // from the last frame, so it must be called exactly once per frame.
  stepBloodTracks(state);
  drawBloodTracks(ctx, state, sprites, camera, worldView);
  // …and the sound of the same boots. Stepped here beside the trail because it
  // is the same measurement — a stride since the last frame — and the two must
  // agree: a print without a step, or a step without a print, reads as two
  // characters walking. It draws nothing; the pairing is the point.
  stepFootsteps(state);

  // …and from here to `ctx.restore()` below, the world is drawn TILTED: the
  // ground plane rakes away from the eye, and anything with a body to it stands
  // back up through `billboard` in its own pass. Everything painted flat on the
  // floor — the burn scars, the pressure shadows, the AoE footprints —
  // foreshortens for free right here, which is why none of those passes has a
  // line about the tilt in it.
  ctx.save();
  applyWorldProjection(ctx);
  // BURNING FLOOR a boss's beam laid — on the ground plane, under everything
  // that walks, because a body stands ON burning ground rather than behind it.
  drawScorches(ctx, state, sprites, camera, inView, timeMs);
  drawDecor(ctx, state, sprites, camera, inView, timeMs);
  drawCraters(ctx, state, sprites, camera, inView);
  drawLandmarks(ctx, state, sprites, camera, inView);
  drawBossCorpseRing(ctx, state, camera, inView, timeMs);
  // …the half of them the hero is IN FRONT of. A piece carrying a `blockLift`
  // is tall enough to hide a man who walks round the back of it (the lawn's
  // trees), so the obstacle pass takes the same depth sort the machines do and
  // the other half goes on after him.
  drawObstacles(ctx, state, sprites, camera, inView, "under");
  // …AND EVERYTHING WITH A BODY GOES AFTER THE WALLS. A `plane: wall` obstacle
  // is no longer paint on the floor: it is EXTRUDED off its footprint
  // (render/plane.ts), so its face sweeps `rise` px UP the screen and covers
  // whatever was painted there — which is fine for the ground it is standing in
  // front of, and wrong for anything standing there too. Everything from here to
  // the bodies is in this pass for that one reason.
  //
  // THE LAMPS — the fittings themselves (render/night.ts): a barn light is
  // BOLTED to a wall, and painted any earlier its top half is cut off by the
  // stone in front of it. Drawn in daylight too — only the light it throws
  // belongs to the night.
  drawLamps(ctx, state, sprites, camera, inView);
  // THE TEARS IN SPACE, on the same footing as the lamps: a rift is set INTO a
  // wall (the garage's seam hums on the bay wall), so painted with the other
  // landmarks the stone goes straight over it.
  drawRiftPortals(ctx, state, sprites, camera, inView, timeMs);
  // The car and the garage ship, assembled part by part in place of their
  // landmarks (wheels + sprung body; hull + thrust flame) — and a machine is a
  // BODY, not floor furniture. Drawn with the landmarks it was assembled from,
  // a car parked at the bay's north wall was swallowed whole by that wall's
  // face, wheels down; the hero, the horde and the loot were never at risk
  // because their passes were always down here.
  // …the half of them the hero is IN FRONT of. The machines are the one thing on
  // the field with a depth sort (`VehicleLayer`): the rest of this pass is drawn
  // over them, so a rocket four times a man's height had the hero painted up its
  // hull whenever he walked round the back. The other half goes on after him.
  drawVehicles(ctx, state, sprites, camera, inView, timeMs, "under");
  drawWells(ctx, state, sprites, camera, inView, timeMs);
  // The door on an occupied house, over the structure it is set into.
  drawLairs(ctx, state, sprites, camera, inView);
  // THE LIFT — the plate that is the only way to the boss, so it advertises
  // itself with a call light until it has been ridden (see render/elevators.ts).
  drawElevators(ctx, state, sprites, camera, inView, timeMs);
  // THE FAUNA — cattle and critters milling about, over the ground furniture and
  // under everything that fights (see render/fauna.ts). Nothing here collides,
  // and the wander comes off the render clock, so the layer is free.
  drawFauna(ctx, state, sprites, camera, inView, timeMs);
  // Where an escort is being walked TO — a ring on the GROUND plane, drawn with
  // the floor furniture rather than with the bodies, because it is a place.
  drawEscortDestinations(ctx, state, camera, timeMs);
  ctx.restore();

  // THE HALF OF THE EFFECT LAYER THAT BELONGS TO THE WORLD PICTURE
  // (`drawnUnderActors`) — what the fight left lying there (the corpses, the
  // gibs and the cleaved halves that have already landed), and the garage door
  // rolling up. The rest of the layer is drawn over the finished frame by the
  // run's loop, because almost all of it happens in the AIR; these do not, and
  // drawn up there a chunk of somebody was painted over the hero every time he
  // walked across the spot it lay in — and a door that started moving left the
  // night wash and every lamp pool BELOW it, so it changed colour on the tick it
  // opened. Under the loot and the bodies, over the floor furniture: gore is a
  // thing on the ground, and a find that dropped on top of it has to stay
  // visible.
  //
  // Screen space, like the rest of its layer — the pass billboards its own
  // anchors, so it goes OUTSIDE the tilt (which is reopened for the actors right
  // below, each of which stands itself back up).
  drawUnderActors(
    ctx,
    effects,
    camera,
    effectsClockMs(state),
    assets,
    noiseFade,
  );
  ctx.save();
  applyWorldProjection(ctx);

  // Loot, shots in flight, and the horde.
  // BAIT a boss threw down — drawn in with the LOOT, on purpose: it is meant to
  // be indistinguishable from a pickup at a glance, and drawing it anywhere else
  // in the stack would quietly give it away.
  drawBaits(ctx, state, sprites, camera, inView, timeMs);
  // A FALLEN PARTY MEMBER'S BODY — under the loot: it is the walk-back
  // target holding its owner's gear, advertised by the same rarity aura a find
  // on the floor wears. Solo runs never have one.
  drawPlayerCorpses(ctx, state, sprites, camera, inView, timeMs);
  drawItems(ctx, state, sprites, camera, inView, timeMs);
  drawProjectiles(ctx, state, sprites, camera, inView, noiseFade);
  drawEnemies(ctx, state, sprites, camera, inView, timeMs, field, noiseFade);
  // The boss mid-RITE — the one body not in `state.enemies` (the kill spliced it
  // out). Drawn with the actors so it sorts among them rather than over them.
  drawBossRite(ctx, state, sprites, camera, timeMs);

  // The friendly cast, then the hero himself. The ding burn wraps the hero:
  // the pillar and ground ring glow behind the sprite, the rising embers float
  // over it, so the light reads as engulfing the character rather than a decal
  // pasted on top.
  drawMerchant(ctx, state, assets, camera, timeMs);
  // The errand-givers and the people they hand over — drawn with the friendly
  // cast, one layer under the hero, so a giver never covers him.
  drawQuestGivers(ctx, state, assets, camera, timeMs);
  drawEscorts(ctx, state, assets, camera, timeMs);
  drawCompanions(ctx, state, assets, camera, timeMs);
  drawAbilities(ctx, state, assets, camera, timeMs);
  drawLevelUpBurn(ctx, state, camera, timeMs, "under");
  // THE XP SCROLL'S VEIL straddles the hero exactly as the ding's burn does,
  // and for the same reason — the halo behind him, the wash and motes in front
  // — so the blue wraps the character instead of sitting behind him. Far
  // fainter than the burn on purpose: this one is up for thirty seconds.
  drawXpBoostVeil(ctx, state, camera, timeMs, "under");
  drawPlayer(ctx, state, assets, camera, timeMs, playerAction, heroImpact);
  drawXpBoostVeil(ctx, state, camera, timeMs, "over");
  drawLevelUpBurn(ctx, state, camera, timeMs, "over");
  // …and the machines standing NEARER THE EYE than the hero, which is the whole
  // of the field's depth sort (see the "under" call above). Over the ding's burn
  // too: a car parked between the player and a hero who is levelling up is
  // between him and the light as well.
  drawVehicles(ctx, state, sprites, camera, inView, timeMs, "over");
  // …and the lifted furniture standing NEARER THE EYE than the hero, on the
  // same footing and for the same reason: a canopy he has walked under is
  // between him and the player.
  drawObstacles(ctx, state, sprites, camera, inView, "over");
  // …and LAST of the world's furniture, the towers: a hull too tall for the
  // depth sort to mean anything (render/vehicles.ts, `HULL_LOOMS_PX`). The
  // garage's booster stands on one point of grass and runs sixty feet up the
  // screen, so the lawn's trees — the two behind it included — are all within a
  // stride of its base and every one of them won the sort. It goes on after
  // them, and only on the side of the hero the sort already put it.
  drawLoomingShips(ctx, state, sprites, camera, inView, timeMs);

  // Hazards sweeping the field — the storms and stampedes drawn AFTER the hero
  // so they visibly pass OVER him (he lies knocked out beneath them).
  // A BOSS'S BEAM — over the actors, because it is light in the air between
  // his eyes and the far wall, and light passes in front of a body.
  drawBeams(ctx, state, sprites, camera, inView, timeMs);
  // THE REPAIR TETHER — over the actors like the beam, and for the same reason:
  // it is light running between two bodies, and it has to be seen.
  drawTethers(ctx, state, sprites, camera, inView, timeMs);
  // THE ELITE TIER's LIVE AURAS — the ring of motes turning, the shell that is
  // up, the drain that is holding (see render/elite-fx.ts). Over the actors
  // with the beam and the repair tether, and for the identical reason: all
  // three are light standing about a body, and light that a body occluded
  // would be a mechanic the player could not see coming.
  drawEliteAuras(ctx, state, sprites, camera, inView, timeMs);

  drawAsteroids(ctx, state, sprites, camera, inView, timeMs);
  drawHayBalls(ctx, state, sprites, camera, inView, timeMs);
  drawSandstorms(ctx, state, sprites, camera, inView, timeMs);
  // The APPROACH TELEGRAPH — a line of dust kicking up along the lane a herd is
  // about to charge down, drawn under the runners so the wall rolls in over its
  // own warning. Grows as the spawn nears (its `ageMs / leadMs` fade).
  if (state.stampedeWarn) {
    drawStampedeWarn(ctx, state.stampedeWarn, camera, worldView, timeMs);
  }
  drawStampedes(ctx, state, sprites, camera, inView, timeMs);

  // THE CANOPY — junk drifting between the eye and the ground, over everything
  // that fights (see render/canopy.ts). Under the fog on purpose: the hero has
  // not seen the sky over ground he has not walked either.
  drawCanopy(ctx, state, sprites, camera, view, timeMs);

  // "Go this way" — a blinking arrow toward the next intended-path waypoint,
  // shown once the hero's immediate area is clear, to point him onward.
  drawGuidanceArrow(ctx, state, camera, timeMs);

  // The tilted world ends here: what follows covers the SCREEN.
  ctx.restore();

  // NIGHTFALL — on a venue that stands under a sky (the garage, and nothing
  // else the game ships), the whole picture washes down toward the dark and the
  // map's own lamps burn holes back in it (render/night.ts). Before the fog and
  // after everything that walks, because it is the LIGHT on the field: a body
  // standing in an unlit corner is dim, and the fog on top of it is the
  // separate darkness of ground nobody has walked yet. Costs nothing in
  // daylight, and nothing at all on a venue with no sky.
  drawNight(ctx, state, camera, view, timeMs);

  // Fog of war — over the world, under the HUD/flash (StarCraft/Warcraft): the
  // unwalked map is dark, terrain seen-but-out-of-sight dims, and the hero's
  // live sight circle stays clear. Composited in screen space and projected as
  // it samples (a stipple squashed after the fact would crawl), so it takes the
  // canvas rect rather than the world one.
  drawFog(ctx, camera, view, field);

  // The DEATH SCENE's rolling clouds + darkening pall — over the whole field
  // (fog included), swallowing the tableau as the YOU DIED modal approaches.
  drawDeathClouds(ctx, state, view, timeMs);

  // Red flash while recently hurt.
  if (localHero(state).hurtFlashMs > 0) {
    ctx.fillStyle = `rgba(216, 58, 58, ${(0.25 * localHero(state).hurtFlashMs) / 250})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }
}
