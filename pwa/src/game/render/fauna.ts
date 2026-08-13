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
//   y = home.y + range · sin(π·speed·t/range + phase.y) · FAUNA.ySweep
//
// The two axes are driven at INCOMMENSURATE rates (one scaled by π), so the path
// is a Lissajous figure that never closes and never repeats — it reads as an
// animal ambling about rather than as one pacing a circuit. Dividing the rate by
// the range keeps the SPEED honest: a critter with a big range takes
// proportionally longer to cross it instead of whipping about faster.
//
// `FAUNA.ySweep` IS THE ENGINE'S OWN NUMBER, not a local one, because the
// placement fences this exact box inside the animal's district (`fitWander`,
// engine/game/fauna.ts) — nothing collides with a critter, so that fence is the
// only thing keeping a sparrow off the garage's cement, and a second copy of the
// sweep that drifted would put half of every lap through the wall.
//
// A critter is not an actor. It cannot be hurt, it collides with nothing, and it
// never blocks a shot — so it is drawn under everything that fights, right on top
// of the ground furniture.

import { FAUNA, PERCH_CYCLE_SEC } from "@game/core";
import type { GameState } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { withStance } from "./gait.ts";
import { drawSpriteFacing, seatX, seatY } from "./shared.ts";
import { beginBillboard, endBillboard } from "./tilt.ts";
import { type Camera } from "./view.ts";

type InView = (x: number, y: number, margin: number) => boolean;

/** How far a critter tips at the top of its amble (radians), and how many left-
 * right rocks it makes per lap of its own wander. Every animal down here walks
 * on legs, so it rocks like everything else that does — but gently: a herd is
 * scenery, and scenery that wobbles hard is scenery you end up watching. */
const FAUNA_TILT = 0.055;
const FAUNA_STEPS_PER_LAP = 9;

/**
 * HOW FAR INTO THE TREE THIS ONE IS at `t` seconds: 0 on the ground, 1 sitting,
 * and the hop in between (`Critter.perch`, `FAUNA.perchSec`/`roamSec`/`flySec`).
 *
 * Phased off the animal's OWN `phase.x`, which the wander already uses for its
 * own offset: two birds sharing a tree are almost never on it together, and the
 * few frames a year they are read as two birds sharing a tree.
 *
 * SMOOTHSTEPPED, because the hop is the only part of this an eye actually
 * follows — a linear slide between the grass and the branch reads as a sprite
 * being dragged, where an eased one reads as taking off and landing.
 */
function perchedness(
  critter: GameState["critters"][number],
  t: number,
): number {
  const { perchSec, flySec } = FAUNA;
  const offset = (critter.phase.x / (Math.PI * 2)) * PERCH_CYCLE_SEC;
  const u =
    (((t + offset) % PERCH_CYCLE_SEC) + PERCH_CYCLE_SEC) % PERCH_CYCLE_SEC;
  const raw =
    u < flySec
      ? u / flySec
      : u < flySec + perchSec
        ? 1
        : u < 2 * flySec + perchSec
          ? 1 - (u - flySec - perchSec) / flySec
          : 0;
  return raw * raw * (3 - 2 * raw);
}

/** Where a critter is at `t` seconds, which way it is facing, and how far its
 * amble has it tipped. */
function critterAt(
  critter: GameState["critters"][number],
  t: number,
): { x: number; y: number; faceLeft: boolean; tilt: number } {
  const rate = critter.speed / Math.max(1, critter.range);
  const ax = rate * t + critter.phase.x;
  const x = critter.home.x + critter.range * Math.sin(ax);
  const y =
    critter.home.y +
    critter.range *
      FAUNA.ySweep *
      Math.sin(Math.PI * rate * t + critter.phase.y);
  // The gait, in closed form like everything else here: the walk-tracker the
  // actors use measures ground covered frame to frame, and a critter's ground is
  // already a known function of `t` — so the rock comes straight off its own
  // wander angle, and stalls to nothing at the turns, where it is doubling back
  // and barely moving. Costs the herd nothing.
  const pace = Math.abs(Math.cos(ax));
  const tilt = FAUNA_TILT * pace * Math.sin(ax * FAUNA_STEPS_PER_LAP);
  // Facing follows the sign of dx/dt — the cosine of the same angle.
  if (!critter.perch) return { x, y, faceLeft: Math.cos(ax) < 0, tilt };
  // THE SIT. The wander never stops running underneath — it is a function of
  // `t`, not a state — so the bird comes back DOWN to wherever its lap had got
  // to rather than to the twig it left, which is the whole difference between an
  // animal and a thing on a track.
  const up = perchedness(critter, t);
  if (up <= 0) return { x, y, faceLeft: Math.cos(ax) < 0, tilt };
  const px = x + (critter.perch.x - x) * up;
  const py = y + (critter.perch.y - y) * up;
  return {
    x: px,
    y: py,
    // Facing the way it is travelling while it moves; on the branch it keeps
    // looking back over the ground it came off.
    faceLeft: up >= 1 ? critter.perch.x > critter.home.x : critter.perch.x < x,
    // A sitting bird does not walk, so the amble's rock fades out with the hop.
    tilt: tilt * (1 - up),
  };
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
    const x = seatX(at.x, camera.x) - Math.round(w / 2);
    const y = seatY(at.y, camera.y) - Math.round(h / 2);
    // An animal stands on the field like everything else with legs — and its
    // WANDER foreshortens with the floor, which is what makes a herd read as
    // spread across the ground rather than stacked up a wall.
    beginBillboard(ctx, at.x, at.y, camera.x, camera.y);
    // The amble's rock, over the animal's own feet, same as every other walker.
    withStance(
      ctx,
      { x: Math.round(x + w / 2), y: y + h },
      { tilt: at.tilt },
      () => {
        if (critter.scale === 1) {
          drawSpriteFacing(ctx, sprite, x, y, at.faceLeft);
          return;
        }
        // A scaled critter (the calves in a herd) needs its own transform, so the
        // common unscaled case keeps the plain blit above.
        ctx.save();
        ctx.translate(at.faceLeft ? x + w : x, y);
        ctx.scale(at.faceLeft ? -critter.scale : critter.scale, critter.scale);
        ctx.drawImage(sprite, 0, 0);
        ctx.restore();
      },
    );
    endBillboard(ctx);
  }
}
