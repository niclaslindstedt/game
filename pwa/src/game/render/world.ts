// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ground plane and everything bolted to it: the baked ground layer,
// decor, meteor craters, landmarks, the fallen-boss exit ring, obstacles,
// and gravity wells — all drawn under the moving actors.

import {
  ASTEROIDS,
  CACHE,
  cacheRungFor,
  cacheStanding,
  type GameState,
} from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import {
  DECOR_FRAME_MS,
  decorFrames,
  funnelSprite,
  groundLayer,
  groundLayerOrigin,
} from "./caches.ts";
import { drawConjuringSprite } from "./conjure.ts";
import { isLandmarkHidden } from "./hidden-landmarks.ts";
import { drawWorldSprite } from "./plane.ts";
import {
  drawRiftPortal,
  riftPortalBob,
  riftPortalLook,
} from "./rift-portal.ts";
import { drawSpriteCentered, seatX, seatY, type ViewSize } from "./shared.ts";
import { TIER_RGB } from "../tiers.ts";
import {
  beginBillboard,
  billboard,
  cameraAnchorX,
  cameraAnchorY,
  endBillboard,
} from "./tilt.ts";
import { VEHICLE_LANDMARK_KINDS } from "./vehicles.ts";
import { type Camera } from "./view.ts";

export type InView = (x: number, y: number, margin: number) => boolean;

/**
 * Ground: one blit of the visible rect from the baked level layer, falling
 * back to per-tile draws if the offscreen layer has no 2D context.
 *
 * Drawn in SCREEN space, outside the world tilt — the layer is baked
 * foreshortened already (see `groundLayer`), so the visible slice copies across
 * one-to-one with no resampling at all. `view` is therefore the canvas rect in
 * screen px here, not the taller world rect every other pass culls against.
 */
export function drawGround(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  view: ViewSize,
): void {
  const ground = groundLayer(state, sprites);
  if (!ground) return;
  // Which pixel of the baked layer the screen's top-left corner is looking at.
  // Both the layer and the screen are in PROJECTED space, so the two differ by
  // a translation and nothing else — the copy is 1:1, at any pitch or yaw.
  //
  // The translation is the CAMERA'S SEAT ON THE PROJECTED GRID (render/tilt.ts),
  // which is the same whole-pixel lattice the standing bodies and the fog's
  // dither register against — so the floor, the horde and the fog all step
  // together rather than sliding against each other as the hero walks. The
  // origin is a whole number (see `bakeOrigin`), so this stays an integer and
  // the blit stays a 1:1 copy.
  const origin = groundLayerOrigin();
  const left = origin.x + cameraAnchorX(camera.x, camera.y);
  const top = origin.y + cameraAnchorY(camera.x, camera.y);
  // Clip the copy to the layer: past the level's projected edge there is
  // nothing to draw and the letterbox behind it shows through, which is what
  // the corners of a turned map look like.
  const sx = Math.max(0, left);
  const sy = Math.max(0, top);
  const sw = Math.min(view.width - (sx - left), ground.width - sx);
  const sh = Math.min(view.height - (sy - top), ground.height - sy);
  if (sw <= 0 || sh <= 0) return;
  ctx.drawImage(ground, sx, sy, sw, sh, sx - left, sy - top, sw, sh);
}

/** Decor: craters and rocks under everything else. Each piece names its own
 * sprite (defs/levels.ts), so a new decor kind needs no edit here. A name
 * with numbered atlas frames animates (see decorFrames) — the conveyor
 * belts roll; every piece shares the clock, so a belt's segments move as
 * one machine.
 *
 * The art says which plane it belongs to (./plane.ts): a bush or a machine
 * stands up, a painted marking or a run of conduit laid flush along the floor
 * lies down with the tiles. An ANIMATED piece is judged per FRAME name, which
 * is what a belt wants — each of `conveyor_0..4` is its own authored file. */
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
    const frame = frames
      ? Math.floor(timeMs / DECOR_FRAME_MS) % frames.length
      : -1;
    const name = frames ? `${decor.sprite}_${frame}` : decor.sprite;
    const sprite = frames
      ? frames[frame]!
      : (spriteByName(sprites, decor.sprite) ?? sprites.rocks);
    drawWorldSprite(ctx, name, sprite, decor.pos, camera);
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
 * its center sits on the pos — no per-kind special-casing. Standing up by
 * default: a landmark is the tallest thing on most maps, and the one whose
 * height is the point of it. A landmark authored in PLAN (a hatch, a pad)
 * lies down instead, which is ./plane.ts's call rather than this pass's. */
export function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
): void {
  for (const landmark of state.landmarks) {
    if (!inView(landmark.pos.x, landmark.pos.y, 48)) continue;
    // A VEHICLE's landmark is its tap anchor, not its picture: the machine
    // is drawn ASSEMBLED by ./vehicles.ts (wheels, springs, flame), so the
    // flat sprite here would just stack a second car under the real one.
    if (VEHICLE_LANDMARK_KINDS.has(landmark.kind)) continue;
    // A sealed travel door's landmark (the rift seam before the RIFT
    // CREATOR is home) is not there yet as far as this character knows.
    if (isLandmarkHidden(landmark.kind)) continue;
    // A TEAR IN SPACE is drawn with the WALLS, not with the landmarks — see
    // `drawRiftPortals` below for why.
    if (riftPortalLook(landmark.sprite)) continue;
    const sprite = spriteByName(sprites, landmark.sprite) ?? sprites.rocks;
    // THE CACHE is the one landmark whose PRESENCE is a fact about the hero
    // rather than about the map (src/game/cache.ts): the garage always reserves
    // the spot, and the chest only stands in it once Ruth has handed it over.
    // Unlike a sealed door's seam this is engine state, not roster knowledge,
    // so it is asked here rather than through `isLandmarkHidden`.
    if (landmark.kind === "cache") {
      if (!cacheStanding(state)) continue;
      // WHICH chest stands there is the hero's EARNED rung, not the blueprint's
      // sprite: Ruth brings a grander piece of furniture each difficulty she is
      // paid on (`DifficultyDef.cache`), and the map cannot know which one this
      // character has climbed to. The authored sprite is the fallback.
      const rung = cacheRungFor(state.cacheSlots);
      const chest = (rung && spriteByName(sprites, rung.sprite)) || sprite;
      // …and while it is still ARRIVING, it is drawn coming into being instead
      // of standing there (./conjure.ts). The burst of light around it is a
      // transient effect off the `cacheGiven` event; this is the chest itself.
      const arriving = state.cacheArriveMs ?? 0;
      if (arriving > 0) {
        beginBillboard(ctx, landmark.pos.x, landmark.pos.y, camera.x, camera.y);
        drawConjuringSprite(
          ctx,
          chest,
          landmark.pos.x - camera.x,
          landmark.pos.y - camera.y - chest.height / 2,
          1 - arriving / CACHE.arriveMs,
          TIER_RGB.unique,
        );
        endBillboard(ctx);
        continue;
      }
      drawWorldSprite(
        ctx,
        rung?.sprite ?? landmark.sprite,
        chest,
        landmark.pos,
        camera,
        landmark.anchor === "base" ? "base" : "center",
      );
      continue;
    }
    drawWorldSprite(
      ctx,
      landmark.sprite,
      sprite,
      landmark.pos,
      camera,
      landmark.anchor === "base" ? "base" : "center",
    );
  }
}

/**
 * THE RIFT PORTALS — the landmark and the churn inside it (./rift-portal.ts).
 *
 * A pass of its own, run AFTER the obstacles, for the reason the lamps are:
 * **a tear is IN a wall, not behind one.** The garage's seam hums on the bay
 * wall a step off the hero's landing, and drawn with the rest of the landmarks
 * — before the walls — the stone painted straight over it and left a hole in
 * the world you could see about a third of. It takes the same trade the barn
 * lights take: anything drawn after the walls is drawn over ALL of them,
 * including one genuinely standing in front, and a fixture bolted to masonry is
 * better always-visible than sometimes-erased.
 *
 * The tear's own animation is drawn inside the landmark's billboard so it
 * stands with the art rather than lying down on the tilted floor, and is seeded
 * off the tear's own position so a map with two of them never has them folding
 * in step.
 */
export function drawRiftPortals(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  for (const landmark of state.landmarks) {
    if (!inView(landmark.pos.x, landmark.pos.y, 48)) continue;
    if (isLandmarkHidden(landmark.kind)) continue;
    const look = riftPortalLook(landmark.sprite);
    if (!look) continue;
    const sprite = spriteByName(sprites, landmark.sprite) ?? sprites.rocks;
    const base = landmark.anchor === "base";
    const seed = landmark.pos.x * 0.017 + landmark.pos.y * 0.031;
    // THE TEAR HANGS, so it rides. The ART moves with it — the bob wraps the
    // sprite AND the churn inside it, because shifting only one slides the
    // throat out of its own lips.
    const bob = riftPortalBob(look, timeMs, seed);
    ctx.save();
    ctx.translate(0, -bob);
    drawWorldSprite(
      ctx,
      landmark.sprite,
      sprite,
      landmark.pos,
      camera,
      base ? "base" : "center",
    );
    // Where the sprite's own centre ends up, given the anchor `drawWorldSprite`
    // just used: a base-anchored piece stands its feet on the pos, so its
    // middle is half a sprite up from it.
    const midY = base ? -Math.round(sprite.height / 2) + 2 : 0;
    billboard(ctx, landmark.pos.x, landmark.pos.y, camera.x, camera.y, () =>
      drawRiftPortal(
        ctx,
        look,
        seatX(landmark.pos.x, camera.x),
        seatY(landmark.pos.y, camera.y) + midY,
        timeMs,
        seed,
      ),
    );
    ctx.restore();
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
 * carries its sprite name from the def, and the ART decides which plane it is
 * drawn on (./plane.ts): a boulder or a house front stands up, a wall panel or
 * a top-down crate lies down with the floor it is set into. */
export function drawObstacles(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
): void {
  for (const obstacle of state.obstacles) {
    if (!inView(obstacle.pos.x, obstacle.pos.y, 32)) continue;
    // A vehicle's footprint blockers are collision only — the machine over
    // them is ./vehicles.ts's to draw.
    if (obstacle.kind === "vehicle") continue;
    const sprite = spriteByName(sprites, obstacle.sprite) ?? sprites.rock;
    drawWorldSprite(ctx, obstacle.sprite, sprite, obstacle.pos, camera);
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
      drawSpriteCentered(ctx, sprite, well.pos, camera);
    }
  }
}
