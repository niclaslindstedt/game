// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FAUNA — the cattle, chickens and jackrabbits milling about on the ground
// plane (see `LevelDef.fauna` / `Critter`).
//
// The canopy's twin, and it works the same way: the ENGINE decides what is alive
// and where each animal calls home, and the RENDERER derives where it is right
// now from the render clock. Nothing is stepped, so a herd of forty costs the
// simulation exactly nothing and cannot desync a replay.
//
// The wander is a closed form rather than an integrated velocity, which is the
// whole reason this can be free:
//
//   x = home.x + range · sin(speed·t/range + phase.x)
//   y = home.y + range · sin(π·speed·t/range + phase.y) · 0.7
//
// The two axes are driven at INCOMMENSURATE rates (one scaled by π), so the path
// is a Lissajous figure that never closes and never repeats — it reads as an
// animal ambling about rather than as one pacing a circuit. Dividing the rate by
// the range keeps the SPEED honest: a critter with a big range takes
// proportionally longer to cross it instead of whipping about faster.
//
// A critter is not an actor. It cannot be hurt, it collides with nothing, and it
// never blocks a shot — so it is drawn under everything that fights, right on top
// of the ground furniture.

import type { GameState } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { drawSpriteFacing } from "./shared.ts";
import { type Camera } from "./view.ts";

type InView = (x: number, y: number, margin: number) => boolean;

/** Where a critter is at `t` seconds, and which way it is facing. */
function critterAt(
  critter: GameState["critters"][number],
  t: number,
): { x: number; y: number; faceLeft: boolean } {
  const rate = critter.speed / Math.max(1, critter.range);
  const ax = rate * t + critter.phase.x;
  const x = critter.home.x + critter.range * Math.sin(ax);
  const y =
    critter.home.y +
    // 0.7 on the y sweep: seen from above, an animal grazing a field covers more
    // ground across the screen than up it, and an even circle reads as an orbit.
    critter.range * 0.7 * Math.sin(Math.PI * rate * t + critter.phase.y);
  // Facing follows the sign of dx/dt — the cosine of the same angle.
  return { x, y, faceLeft: Math.cos(ax) < 0 };
}

/**
 * Draw the level's fauna.
 *
 * Animated lines flip between `<sprite>_0` and `<sprite>_1` on the critter's own
 * `stepSec`, so a herd is never in lockstep — the single tell that would give the
 * whole layer away as one thing drawn many times.
 */
export function drawFauna(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  const critters = state.critters;
  if (!critters || critters.length === 0) return;
  const t = timeMs / 1000;
  for (const critter of critters) {
    const at = critterAt(critter, t);
    if (!inView(at.x, at.y, 40)) continue;
    const name = critter.animated
      ? `${critter.sprite}_${Math.floor(t / critter.stepSec) % 2}`
      : critter.sprite;
    const sprite = spriteByName(sprites, name);
    if (!sprite) continue;
    const w = sprite.width * critter.scale;
    const h = sprite.height * critter.scale;
    const x = Math.round(at.x - camera.x - w / 2);
    const y = Math.round(at.y - camera.y - h / 2);
    if (critter.scale === 1) {
      drawSpriteFacing(ctx, sprite, x, y, at.faceLeft);
      continue;
    }
    // A scaled critter (the calves in a herd) needs its own transform, so the
    // common unscaled case keeps the plain blit above.
    ctx.save();
    ctx.translate(at.faceLeft ? x + w : x, y);
    ctx.scale(at.faceLeft ? -critter.scale : critter.scale, critter.scale);
    ctx.drawImage(sprite, 0, 0);
    ctx.restore();
  }
}
