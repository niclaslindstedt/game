// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Tiny helpers shared across the render modules.

/** World units per ground tile (and the hero sprite's cell size). */
export const TILE = 16;

/** A rect in SCREEN px — the canvas itself, or a slice of it. */
export type ViewSize = { width: number; height: number };

/**
 * The world a screen covers, as an axis-aligned rect RELATIVE TO THE CAMERA
 * POINT — which is NOT the canvas's own size, because the ground plane is
 * projected (render/tilt.ts): the world a screen shows is taller than the
 * canvas, and under a yaw it is offset west of the camera as well. Everything
 * that culls or scans tiles is asked about this rect, never about the canvas.
 */
export type WorldRect = { x: number; y: number; width: number; height: number };

/** The world rect a canvas covers. */
export function worldViewOf(canvas: {
  width: number;
  height: number;
}): WorldRect {
  return worldViewRect(canvas.width, canvas.height);
}

export { clamp01 } from "@game/lib/vec.ts";

import { worldViewRect } from "./tilt.ts";

/**
 * THE SEAT — the whole-pixel spot a world point takes inside its own billboard,
 * and THE ONLY PLACE A CAMERA-RELATIVE OFFSET MAY BE ROUNDED.
 *
 * `beginBillboard` (render/tilt.ts) hands each body a 1:1 space shifted by
 * `bodyAnchor − Math.round(pos − camera)`, and that subtraction is the whole
 * contract: it CANCELS the caller's own `Math.round(pos − camera)`, leaving the
 * body sitting exactly on the rigid, separately-quantized anchor. So the rule
 * every pass has to obey is:
 *
 *   **Round the seat, then add WHOLE pixels.** Never round the seat and an
 *   offset together — `Math.round(pos.x − sprite.width / 2 − camera.x)`.
 *
 * Folding a fractional offset inside that round is THE WOBBLE, and it is a
 * one-pixel jitter that only shows on SOME of the art, which is what makes it so
 * confusing to look at. `Math.round(rel − w/2)` equals `Math.round(rel) − w/2`
 * for an EVEN `w` — the half is an integer, so it factors straight out and the
 * cancellation still holds. For an ODD `w` the half is `k + 0.5`, the two rounds
 * step at different fractions of `rel`, and their difference flips between two
 * values as the camera moves. `computeCamera` deliberately keeps the camera's
 * world point EXACT (view.ts), so `rel` sweeps continuously and the flip happens
 * several times a second: the sprite twitches a pixel against its own glow, its
 * shadow, and the rigid ground under it.
 *
 * That is why a 12×12 ammo box sat still while a 14×9 pile of coins shivered,
 * and why the axis it shivers on is the axis its odd dimension is on — an odd
 * WIDTH twitches as the camera tracks east/west, an odd HEIGHT as it tracks
 * north/south. Under a YAW both screen axes are mixtures of both world ones, so
 * every direction of travel moves both seats and an isometric camera makes every
 * odd-dimensioned sprite in the atlas shiver at once.
 *
 * Half a sprite, half a health bar, a hover, a lift, a height off the floor: all
 * of them are offsets, and all of them get rounded to a whole pixel of their own
 * BEFORE they are added to a seat.
 */
export function seatX(worldX: number, cameraX: number): number {
  return Math.round(worldX - cameraX);
}
export function seatY(worldY: number, cameraY: number): number {
  return Math.round(worldY - cameraY);
}

/** Top-left screen position (rounded) that centres `sprite` on world `pos`. */
export function spriteTopLeft(
  pos: { x: number; y: number },
  sprite: { width: number; height: number },
  camera: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: seatX(pos.x, camera.x) - Math.round(sprite.width / 2),
    y: seatY(pos.y, camera.y) - Math.round(sprite.height / 2),
  };
}

/** Draw `sprite` centred on world `pos` (screen-rounded). */
export function drawSpriteCentered(
  ctx: CanvasRenderingContext2D,
  sprite: ImageBitmap,
  pos: { x: number; y: number },
  camera: { x: number; y: number },
): void {
  const at = spriteTopLeft(pos, sprite, camera);
  ctx.drawImage(sprite, at.x, at.y);
}

/** Draw `sprite` with its top-left at (`x`, `y`), mirrored horizontally in
 * place when `faceLeft` — the shared facing-flip every actor renderer uses. */
export function drawSpriteFacing(
  ctx: CanvasRenderingContext2D,
  sprite: ImageBitmap,
  x: number,
  y: number,
  faceLeft: boolean,
): void {
  if (faceLeft) {
    ctx.save();
    ctx.translate(x + sprite.width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(sprite, x, y);
  }
}

/** Cheap deterministic hash → [0, 1) for particle variety (no Math.random —
 * every effect must draw identically for a given time). */
export function fract(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** A culling predicate for the current camera/view: is a world point within
 * `margin` of the visible rect? Built once per frame and handed to each draw
 * pass so they all cull against the same rect. */
export function makeInView(
  camera: { x: number; y: number },
  view: WorldRect,
): (x: number, y: number, margin: number) => boolean {
  const left = camera.x + view.x;
  const top = camera.y + view.y;
  return (x, y, margin) =>
    x >= left - margin &&
    x <= left + view.width + margin &&
    y >= top - margin &&
    y <= top + view.height + margin;
}
