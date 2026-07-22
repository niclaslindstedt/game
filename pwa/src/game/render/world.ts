// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ground plane and everything bolted to it: the baked ground layer,
// decor, meteor craters, landmarks, the fallen-boss exit ring, obstacles,
// and gravity wells — all drawn under the moving actors.

import { ASTEROIDS, type GameState } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import {
  DECOR_FRAME_MS,
  decorFrames,
  funnelSprite,
  groundLayer,
  groundTile,
} from "./caches.ts";
import { TILE, type ViewSize } from "./shared.ts";
import { type Camera } from "./view.ts";

type InView = (x: number, y: number, margin: number) => boolean;

/** Ground: one blit of the visible rect from the baked level layer, falling
 * back to per-tile draws if the offscreen layer has no 2D context. */
export function drawGround(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  view: ViewSize,
): void {
  const ground = groundLayer(state, sprites);
  if (ground) {
    const sx = Math.max(0, camera.x);
    const sy = Math.max(0, camera.y);
    const dx = sx - camera.x;
    const dy = sy - camera.y;
    const sw = Math.min(view.width - dx, state.level.width - sx);
    const sh = Math.min(view.height - dy, state.level.height - sy);
    if (sw > 0 && sh > 0) {
      ctx.drawImage(ground, sx, sy, sw, sh, dx, dy, sw, sh);
    }
  } else {
    // No 2D context for the offscreen layer: tile the view directly.
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
        ctx.drawImage(
          groundTile(sprites, state.level.tiles, tx, ty),
          tx * TILE - camera.x,
          ty * TILE - camera.y,
        );
      }
    }
  }
}

/** Decor: craters and rocks under everything else. Each piece names its own
 * sprite (defs/levels.ts), so a new decor kind needs no edit here. A name
 * with numbered atlas frames animates (see decorFrames) — the conveyor
 * belts roll; every piece shares the clock, so a belt's segments move as
 * one machine. */
export function drawDecor(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  for (const decor of state.decor) {
    if (!inView(decor.pos.x, decor.pos.y, 32)) continue;
    const frames = decorFrames(sprites, decor.sprite);
    const sprite = frames
      ? frames[Math.floor(timeMs / DECOR_FRAME_MS) % frames.length]!
      : (spriteByName(sprites, decor.sprite) ?? sprites.rocks);
    ctx.drawImage(
      sprite,
      Math.round(decor.pos.x - sprite.width / 2 - camera.x),
      Math.round(decor.pos.y - sprite.height / 2 - camera.y),
    );
  }
}

/** Meteor craters: ground scars left by past strikes, on the ground plane
 * under everything that moves. Each fades out over the last stretch of its
 * life (ASTEROIDS.craterFadeMs) as the dust settles and the surface heals. */
export function drawCraters(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
): void {
  for (const crater of state.craters) {
    if (!inView(crater.pos.x, crater.pos.y, crater.radius + 16)) continue;
    const sprite = spriteByName(sprites, crater.sprite);
    if (!sprite) continue;
    const left = crater.ttlMs - crater.ageMs;
    const fade =
      left >= ASTEROIDS.craterFadeMs
        ? 1
        : Math.max(0, left / ASTEROIDS.craterFadeMs);
    // A fresh scar flashes in over its first beats, then holds; the sprite is
    // sized to roughly twice the scar radius so the rim reads.
    const grow = Math.min(1, crater.ageMs / 180);
    const size = Math.max(10, Math.round(crater.radius * 2.2));
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(
      Math.round(crater.pos.x - camera.x),
      Math.round(crater.pos.y - camera.y),
    );
    ctx.rotate(crater.angle);
    const half = (size * grow) / 2;
    ctx.drawImage(sprite, -half, -half, size * grow, size * grow);
    ctx.restore();
  }
}

/** Landmarks: `anchor` (from the def) decides whether the sprite's foot or
 * its center sits on the pos — no per-kind special-casing. */
export function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
): void {
  for (const landmark of state.landmarks) {
    if (!inView(landmark.pos.x, landmark.pos.y, 48)) continue;
    const sprite = spriteByName(sprites, landmark.sprite) ?? sprites.rocks;
    const yAnchor =
      landmark.anchor === "base" ? sprite.height - 2 : sprite.height / 2;
    ctx.drawImage(
      sprite,
      Math.round(landmark.pos.x - sprite.width / 2 - camera.x),
      Math.round(landmark.pos.y - yAnchor - camera.y),
    );
  }
}

/** The fallen boss, left as a tap target once the player chooses STAY on a
 * cleared field (see stayOnField). A pulsing amber ring marks the boss's own
 * corpse — the persistent `corpse` effect keeled over at the same spot when it
 * died — as the way out; tapping it re-opens the victory menu (GameScreen). We
 * draw ONLY the ring, never a second body: the dead boss is already on the
 * field, so minting another sprite here just stacks a duplicate boss on top of
 * it. Drawn under the moving actors so loot dropped over the corpse reads on
 * top. */
export function drawBossCorpseRing(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  if (!state.staying || !state.bossCorpse) return;
  const bc = state.bossCorpse;
  if (!inView(bc.pos.x, bc.pos.y, 48)) return;
  const cx = Math.round(bc.pos.x - camera.x);
  const cy = Math.round(bc.pos.y - camera.y);
  const pulse = 0.5 + 0.5 * Math.sin(timeMs / 340);
  ctx.save();
  ctx.globalAlpha = 0.3 + 0.4 * pulse;
  ctx.strokeStyle = "#ffd75e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 13 + pulse * 3, 6.5 + pulse * 1.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Obstacles sit on the ground plane, under everything that moves. Each
 * carries its sprite name from the def. */
export function drawObstacles(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
): void {
  for (const obstacle of state.obstacles) {
    if (!inView(obstacle.pos.x, obstacle.pos.y, 32)) continue;
    const sprite = spriteByName(sprites, obstacle.sprite) ?? sprites.rock;
    ctx.drawImage(
      sprite,
      Math.round(obstacle.pos.x - sprite.width / 2 - camera.x),
      Math.round(obstacle.pos.y - sprite.height / 2 - camera.y),
    );
  }
}

/** Gravity wells: a darkening funnel over the ground plane (the visual
 * warning of the pull's reach) around the animated hole itself. Drawn
 * before items/enemies so the loot hoarded on the rim sits readable on
 * top of the swirl. */
export function drawWells(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  for (const well of state.wells) {
    if (!inView(well.pos.x, well.pos.y, well.pullRadius)) continue;
    const cx = Math.round(well.pos.x - camera.x);
    const cy = Math.round(well.pos.y - camera.y);
    const funnel = funnelSprite(well.coreRadius, well.pullRadius);
    if (funnel) {
      ctx.drawImage(
        funnel,
        cx - Math.round(funnel.width / 2),
        cy - Math.round(funnel.height / 2),
      );
    }
    const frame = Math.floor(timeMs / 240 + well.id) % 2;
    const sprite = spriteByName(sprites, `blackhole_${frame}`);
    if (sprite) {
      ctx.drawImage(
        sprite,
        Math.round(well.pos.x - sprite.width / 2 - camera.x),
        Math.round(well.pos.y - sprite.height / 2 - camera.y),
      );
    }
  }
}
