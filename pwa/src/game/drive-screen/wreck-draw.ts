// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DRAWING A CAR THAT HAS BEEN HIT — the fold, the yaw, the flight and the
// glass.
//
// WHY IT IS ITS OWN FILE. The traffic used to be a blit: pick the damage rung's
// sprite and put it down at the vehicle's own place. Everything the collision
// now does to a vehicle (`engine/game/drive/crush.ts`) is a change to its POSE
// rather than to its picture — it is shorter at one end, it is turned, it is off
// the ground, and there is blood on the inside of its windows — and none of
// those is expressible as "which sprite". So the vehicle pass grew a transform
// stack, and a transform stack living inside the road's 900-line painter is how
// the road's painter becomes a 1200-line painter.
//
// FOUR THINGS, AND EACH IS THE SIM'S ANSWER RATHER THAN THIS FILE'S:
//
//   THE FOLD   `crushShare` — how much of each END the physics says is gone,
//              drawn by compressing that half of the sprite toward the middle.
//              A car rear-ended at speed is visibly SHORT at the back and
//              straight at the front, which is the one thing three whole-body
//              dent rungs can never say.
//   THE YAW    `DriveTraffic.angle` — a car clipped off its centre of mass is
//              turning, and it turns about its own middle.
//   THE FLIGHT `z` — a vehicle that has gone over leaves the ground.
//   THE GLASS  `gore` — the derived `<sprite>_gore` overlay
//              (`asset-tools/wreck.mjs`), laid over whichever damage rung is
//              showing, which is why it is ONE grid per vehicle rather than one
//              per rung.
//
// THE FOLD IS DRAWN IN THE SPRITE'S OWN FRAME, before the facing flip — which
// is what makes it correct for the half of the traffic that is drawn mirrored.
// `crushNose` is the nose's, the nose is on the sprite's RIGHT because every
// vehicle here is authored facing right, and the flip is a transform around the
// finished picture. Fold after mirroring and every oncoming car in the game
// crumples at the wrong end.

import { crushShare, vehicleDef, type DriveTraffic } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { seatX, seatY } from "../render/shared.ts";
import { billboard } from "../render/tilt.ts";
import type { Camera } from "../render/view.ts";
import { trafficSprite } from "./scenery.ts";

/**
 * How far a fold may push the two halves into each other, as a share of the
 * sprite's own half-width.
 *
 * The compression is drawn as each half being squeezed toward the middle, and
 * squeezing a half to nothing leaves a car half the length it was, which reads
 * as a different (smaller) vehicle rather than as a damaged one. Two thirds is
 * the point at which it still plainly reads as the same car with its end pushed
 * in.
 */
const MAX_FOLD = 0.66;

/** Draw one vehicle's body — folded, turned, lifted and bloodied as the sim
 * says. `lift` is its height off the road in screen px. */
export function drawTrafficBody(
  ctx: CanvasRenderingContext2D,
  other: DriveTraffic,
  sprites: Sprites,
  camera: Camera,
): void {
  const name = trafficSprite(other.variant, other.rung);
  const sprite = spriteByName(sprites, name);
  if (!sprite) return;
  const gore =
    other.gore > 0
      ? spriteByName(sprites, `${vehicleDef(other.variant).id}_gore`)
      : undefined;
  const fold = crushShare(other);
  billboard(ctx, other.pos.x, other.pos.y, camera.x, camera.y, () => {
    ctx.save();
    ctx.translate(
      seatX(other.pos.x, camera.x),
      seatY(other.pos.y, camera.y) - Math.round(other.z),
    );
    if (other.angle !== 0) ctx.rotate(other.angle);
    if (other.faceLeft) ctx.scale(-1, 1);
    // The sprite is drawn about its own bottom-centre, which is where every
    // other body on this road is seated (`drawSpriteFacing`) — so a turned car
    // pivots about the middle of itself rather than about a corner.
    const ox = -Math.round(sprite.width / 2);
    const oy = -Math.round(sprite.height - 2);
    drawFolded(ctx, sprite, ox, oy, fold.nose, fold.tail);
    if (gore) {
      ctx.globalAlpha = Math.min(1, other.gore);
      drawFolded(ctx, gore, ox, oy, fold.nose, fold.tail);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  });
}

/**
 * Blit a sprite in two halves, each squeezed toward the middle by its own end's
 * fold.
 *
 * WHY TWO HALVES RATHER THAN ONE SCALE. A car that has been rear-ended is short
 * at the BACK; scaling the whole sprite shortens it at both ends equally and
 * moves the wheels, which reads as the car being further away. Compressing one
 * half leaves the other half — and the axle under it — exactly where the eye
 * last saw it, so what changed is the end that was hit.
 *
 * The nose half is the sprite's RIGHT (everything on this road is authored
 * facing right); the caller has not flipped yet, so this is always true here.
 */
function drawFolded(
  ctx: CanvasRenderingContext2D,
  sprite: ImageBitmap,
  ox: number,
  oy: number,
  nose: number,
  tail: number,
): void {
  const w = sprite.width;
  const h = sprite.height;
  if (nose <= 0 && tail <= 0) {
    ctx.drawImage(sprite, ox, oy);
    return;
  }
  const half = Math.floor(w / 2);
  const tailW = Math.max(1, Math.round(half * (1 - Math.min(MAX_FOLD, tail))));
  const noseW = Math.max(
    1,
    Math.round((w - half) * (1 - Math.min(MAX_FOLD, nose))),
  );
  // Both halves stay against the vehicle's own middle, so what a fold takes is
  // taken off the OUTSIDE ends — which is where the collision took it.
  const midX = ox + half;
  ctx.drawImage(sprite, 0, 0, half, h, midX - tailW, oy, tailW, h);
  ctx.drawImage(sprite, half, 0, w - half, h, midX, oy, noseW, h);
}
