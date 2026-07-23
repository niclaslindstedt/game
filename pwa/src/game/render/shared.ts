// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Tiny helpers shared across the render modules.

/** World units per ground tile (and the hero sprite's cell size). */
export const TILE = 16;

/** The visible canvas rect, in world units (1 canvas px = 1 world unit). */
export type ViewSize = { width: number; height: number };

export { clamp01 } from "@game/lib/vec.ts";

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
  view: ViewSize,
): (x: number, y: number, margin: number) => boolean {
  return (x, y, margin) =>
    x >= camera.x - margin &&
    x <= camera.x + view.width + margin &&
    y >= camera.y - margin &&
    y <= camera.y + view.height + margin;
}
