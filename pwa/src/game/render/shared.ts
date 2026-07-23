// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Tiny helpers shared across the render modules.

/** World units per ground tile (and the hero sprite's cell size). */
export const TILE = 16;

/** The visible canvas rect, in world units (1 canvas px = 1 world unit). */
export type ViewSize = { width: number; height: number };

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
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
