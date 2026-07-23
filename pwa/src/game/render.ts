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

import { type GameState } from "@game/core";

import { type GameAssets } from "./assets.ts";
import {
  drawAbilities,
  drawCompanions,
  drawMerchant,
} from "./render/actors.ts";
import { ensureCaches } from "./render/caches.ts";
import { drawEnemies } from "./render/enemies.ts";
import { drawFog, ensureFogField } from "./render/fog.ts";
import { drawGuidanceArrow } from "./render/guidance.ts";
import {
  drawAsteroids,
  drawHayBalls,
  drawSandstorms,
  drawStampedes,
  drawStampedeWarn,
} from "./render/hazards.ts";
import { drawItems } from "./render/items.ts";
import {
  drawLevelUpBurn,
  drawPlayer,
  type PlayerAction,
} from "./render/player.ts";
import { drawProjectiles } from "./render/projectiles.ts";
import { makeInView } from "./render/shared.ts";
import { type Camera } from "./render/view.ts";
import {
  drawBossCorpseRing,
  drawCraters,
  drawDecor,
  drawGround,
  drawLandmarks,
  drawObstacles,
  drawWells,
} from "./render/world.ts";

export {
  applyCameraShake,
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
export { drawEffects, type Effect } from "./render/effects.ts";
export { MELEE_SWING_MS, type PlayerAction } from "./render/player.ts";

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
  playerAction?: PlayerAction,
): void {
  const { sprites } = assets;
  ensureCaches(sprites);
  const view = { width: ctx.canvas.width, height: ctx.canvas.height };
  ctx.imageSmoothingEnabled = false;
  const inView = makeInView(camera, view);

  // The fog's distance-to-frontier field, computed once per frame and shared by
  // the mob cull (drawEnemies) and the fog draw (bottom): a mob is only drawn
  // on ground the hero has actually uncovered, never through the frontier
  // stipple.
  const field = ensureFogField(state);

  // Letterbox backdrop (visible when the view outgrows the level).
  ctx.fillStyle = "#0b0d10";
  ctx.fillRect(0, 0, view.width, view.height);

  // The ground plane and everything bolted to it, under all that moves.
  drawGround(ctx, state, sprites, camera, view);
  drawDecor(ctx, state, sprites, camera, inView, timeMs);
  drawCraters(ctx, state, sprites, camera, inView);
  drawLandmarks(ctx, state, sprites, camera, inView);
  drawBossCorpseRing(ctx, state, camera, inView, timeMs);
  drawObstacles(ctx, state, sprites, camera, inView);
  drawWells(ctx, state, sprites, camera, inView, timeMs);

  // Loot, shots in flight, and the horde.
  drawItems(ctx, state, sprites, camera, inView, timeMs);
  drawProjectiles(ctx, state, sprites, camera, inView);
  drawEnemies(ctx, state, sprites, camera, inView, timeMs, field);

  // The friendly cast, then the hero himself. The ding burn wraps the hero:
  // the pillar and ground ring glow behind the sprite, the rising embers float
  // over it, so the light reads as engulfing the character rather than a decal
  // pasted on top.
  drawMerchant(ctx, state, assets, camera, timeMs);
  drawCompanions(ctx, state, assets, camera, timeMs);
  drawAbilities(ctx, state, assets, camera, timeMs);
  drawLevelUpBurn(ctx, state, camera, timeMs, "under");
  drawPlayer(ctx, state, assets, camera, timeMs, playerAction);
  drawLevelUpBurn(ctx, state, camera, timeMs, "over");

  // Hazards sweeping the field — the storms and stampedes drawn AFTER the hero
  // so they visibly pass OVER him (he lies knocked out beneath them).
  drawAsteroids(ctx, state, sprites, camera, inView, timeMs);
  drawHayBalls(ctx, state, sprites, camera, inView, timeMs);
  drawSandstorms(ctx, state, sprites, camera, inView, timeMs);
  // The APPROACH TELEGRAPH — a line of dust kicking up along the lane a herd is
  // about to charge down, drawn under the runners so the wall rolls in over its
  // own warning. Grows as the spawn nears (its `ageMs / leadMs` fade).
  if (state.stampedeWarn) {
    drawStampedeWarn(ctx, state.stampedeWarn, camera, view, timeMs);
  }
  drawStampedes(ctx, state, sprites, camera, inView, timeMs);

  // "Go this way" — a blinking arrow toward the next intended-path waypoint,
  // shown once the hero's immediate area is clear, to point him onward.
  drawGuidanceArrow(ctx, state, camera, timeMs);

  // Fog of war — over the world, under the HUD/flash (StarCraft/Warcraft): the
  // unwalked map is dark, terrain seen-but-out-of-sight dims, and the hero's
  // live sight circle stays clear.
  drawFog(ctx, camera, view, field);

  // Red flash while recently hurt.
  if (state.player.hurtFlashMs > 0) {
    ctx.fillStyle = `rgba(216, 58, 58, ${(0.25 * state.player.hurtFlashMs) / 250})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }
}
