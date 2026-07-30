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

/** Top-left screen position (rounded) that centres `sprite` on world `pos`. */
export function spriteTopLeft(
  pos: { x: number; y: number },
  sprite: { width: number; height: number },
  camera: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: Math.round(pos.x - sprite.width / 2 - camera.x),
    y: Math.round(pos.y - sprite.height / 2 - camera.y),
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
