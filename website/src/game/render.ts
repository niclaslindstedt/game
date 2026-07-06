// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Canvas renderer: draws one frame of the engine state. The canvas backing
// store is in world units (1 canvas px = 1 world unit) and the browser
// upscales it with image-rendering: pixelated, so all coordinates here stay
// integers and the pixel art stays crisp. Draw order: ground → items →
// projectiles → enemies → player → hurt flash.

import type { GameState } from "@game/core";

import type { GameAssets } from "./assets.ts";

/** CSS pixels per world unit — the app's zoom level. */
export const VIEW_SCALE = 2;

const TILE = 16;

export type Camera = { x: number; y: number };

/** Top-left of the view rect: player-centered, clamped to the level. */
export function computeCamera(
  state: GameState,
  viewWidth: number,
  viewHeight: number,
): Camera {
  const clampAxis = (center: number, view: number, level: number) => {
    // A view larger than the level parks the level centered inside it.
    if (view >= level) return Math.round((level - view) / 2);
    return Math.round(Math.min(Math.max(center - view / 2, 0), level - view));
  };
  return {
    x: clampAxis(state.player.pos.x, viewWidth, state.level.width),
    y: clampAxis(state.player.pos.y, viewHeight, state.level.height),
  };
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  const { sprites } = assets;
  const view = { width: ctx.canvas.width, height: ctx.canvas.height };
  ctx.imageSmoothingEnabled = false;

  // Letterbox backdrop (visible when the view outgrows the level).
  ctx.fillStyle = "#0b0d10";
  ctx.fillRect(0, 0, view.width, view.height);

  // Ground: only the tiles overlapping the view, variant picked by a cheap
  // deterministic hash so the floor doesn't repeat visibly.
  const x0 = Math.floor(Math.max(camera.x, 0) / TILE);
  const y0 = Math.floor(Math.max(camera.y, 0) / TILE);
  const x1 = Math.ceil(
    Math.min(camera.x + view.width, state.level.width) / TILE,
  );
  const y1 = Math.ceil(
    Math.min(camera.y + view.height, state.level.height) / TILE,
  );
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const hash = (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0;
      const variant = hash % 31 === 0 ? sprites.grass_1 : sprites.grass_0;
      ctx.drawImage(variant, tx * TILE - camera.x, ty * TILE - camera.y);
    }
  }

  for (const item of state.items) {
    ctx.drawImage(
      sprites.medkit,
      Math.round(item.pos.x - sprites.medkit.width / 2 - camera.x),
      Math.round(item.pos.y - sprites.medkit.height / 2 - camera.y),
    );
  }

  for (const projectile of state.projectiles) {
    ctx.drawImage(
      sprites.bolt,
      Math.round(projectile.pos.x - sprites.bolt.width / 2 - camera.x),
      Math.round(projectile.pos.y - sprites.bolt.height / 2 - camera.y),
    );
  }

  for (const enemy of state.enemies) {
    // Offset the bounce phase per enemy so the pack doesn't hop in sync.
    const frame = Math.floor(timeMs / 280 + enemy.id) % 2 === 0;
    ctx.drawImage(
      frame ? sprites.slime_0 : sprites.slime_1,
      Math.round(enemy.pos.x - TILE / 2 - camera.x),
      Math.round(enemy.pos.y - TILE / 2 - camera.y),
    );
  }

  drawPlayer(ctx, state, assets, camera, timeMs);

  // Red flash while recently hurt.
  if (state.player.hurtFlashMs > 0) {
    ctx.fillStyle = `rgba(216, 58, 58, ${(0.25 * state.player.hurtFlashMs) / 250})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  const player = state.player;
  const sprite =
    player.moving && Math.floor(timeMs / 160) % 2 === 1
      ? assets.sprites.player_1
      : assets.sprites.player_0;
  const x = Math.round(player.pos.x - TILE / 2 - camera.x);
  const y = Math.round(player.pos.y - TILE / 2 - camera.y);

  // Blink during the post-hit flash so damage is legible on the character.
  if (player.hurtFlashMs > 0 && Math.floor(timeMs / 60) % 2 === 0) return;

  if (player.facing.x < 0) {
    ctx.save();
    ctx.translate(x + TILE, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(sprite, x, y);
  }
}
