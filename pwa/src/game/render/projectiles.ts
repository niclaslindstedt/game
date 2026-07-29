// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// In-flight projectiles: each weapon's own shot sprite, plus the hero's
// signature glow trail riding his own rounds (weapon-fx.ts).

import { type GameState } from "@game/core";

import { drawFaded } from "@ui/lib/canvas-fade.ts";

import { spriteByName, type Sprites } from "../assets.ts";
import { drawProjectileTrail, shotStyleFor } from "../weapon-fx.ts";
import { beginBillboard, endBillboard } from "./tilt.ts";
import { type Camera } from "./view.ts";

type InView = (x: number, y: number, margin: number) => boolean;

/**
 * Draw every shot in flight. `fade` (default 1) dims them as one — the sim
 * stops the instant the hero falls, so without it the volley he died to hangs
 * motionless in the air over the whole death scene (render/death.ts
 * `combatNoiseFade`). The signature glow trails set their own alpha, so the
 * fade composites through a scratch layer (`drawFaded`).
 */
export function drawProjectiles(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  fade = 1,
): void {
  if (fade < 1) {
    drawFaded(ctx, fade, (target) =>
      drawProjectilePass(target, state, sprites, camera, inView),
    );
    return;
  }
  drawProjectilePass(ctx, state, sprites, camera, inView);
}

function drawProjectilePass(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
): void {
  for (const projectile of state.projectiles) {
    if (!inView(projectile.pos.x, projectile.pos.y, 16)) continue;
    // A shot is in the AIR: its `z` is a height, not a distance north, so it
    // stands clear of the foreshortening the ground under it takes — and so
    // does the signature trail streaming behind it.
    beginBillboard(ctx, projectile.pos.x, projectile.pos.y, camera.x, camera.y);
    const px = Math.round(projectile.pos.x - camera.x);
    const py = Math.round(projectile.pos.y - camera.y - projectile.z);
    // The hero's own round/bolt carries its weapon's signature glow trail —
    // drawn UNDER the sprite. Only his shots (not hostile, not a companion's).
    // Uses the CURRENTLY held weapon's shot style (an in-flight round can't
    // re-ask what fired it).
    if (!projectile.hostile && projectile.companionId == null) {
      drawProjectileTrail(
        ctx,
        px,
        py,
        projectile.dir,
        shotStyleFor(
          state.player.equipment.weapon.uniqueId,
          projectile.weaponClass === "magic" ? "magic" : "ranged",
        ),
      );
    }
    // Each weapon names its own shot sprite (staple, zap, vial, ray…) — the
    // stapler throws staples, the taser arcs, the beaker sloshes. Fall back
    // to the class default if a name is ever unknown.
    const sprite =
      spriteByName(sprites, projectile.sprite) ??
      (projectile.weaponClass === "magic" ? sprites.spark : sprites.bolt);
    // Shots fired mid-jump draw at their height, sinking back in flight.
    ctx.drawImage(
      sprite,
      Math.round(px - sprite.width / 2),
      Math.round(py - sprite.height / 2),
    );
    endBillboard(ctx);
  }
}
