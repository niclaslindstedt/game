// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WORLD PROJECTION — how the flat, top-down simulation is put on screen.
//
// The simulation never changes and stays perfectly square: a circle is a
// circle, a wall is an axis-aligned box, `pos.y` is a distance north. This is a
// PRESENTATION transform laid over it, and it has exactly two knobs, which
// together are what separates a top-down game from Diablo's:
//
//   PITCH — the camera looks DOWN at an angle, so the ground plane
//           foreshortens: a step north covers less screen than a step east and
//           the floor rakes away from the eye. Pitch alone leaves the floor
//           grid square-on — horizontal seams merely pack closer together,
//           vertical ones stay perfectly vertical.
//
//   YAW   — the camera also stands at a CORNER of the world rather than square
//           to it. This is the half that makes a tiled floor read as DIAMONDS
//           instead of rectangles, and it is what people are actually pointing
//           at when they call a game isometric. Pitch 0.5 with yaw 45° is the
//           classic 2:1 isometric floor.
//
// Two halves make the result read as depth rather than as a distorted picture:
//
//   THE FLOOR LIES DOWN. Everything painted ON the ground — the baked ground
//   layer, the blood, the burn scars, the craters, the AoE footprints — is
//   drawn through the projection and takes it whole. A ground ring becoming an
//   ellipse is not a bug to work around; it is the effect, and it is why those
//   passes needed no edit.
//
//   THE BODIES STAND UP. A character, a rock, a shot in flight, a floating
//   damage number: anchored at its projected spot on the floor, then drawn
//   upright at FULL size — see `billboard`. Projecting them too would just be a
//   distorted picture of the same top-down game, and would resample every
//   sprite in the atlas into mush besides.
//
// The projection is a RUNTIME knob (DEVELOPER → VISUALS), not a constant, so
// the look can be dialled and judged in the running game instead of rebuilt to
// be looked at. Everything derived from it is recomputed in
// `setWorldProjection` and read from there, so no hot path does trigonometry
// per draw.
//
// This module is a LEAF — no imports at all — so anything in the renderer may
// reach it.

/** Pitch: how much of a world unit's height survives, i.e. the cosine of the
 * camera's downward angle. 1 is straight down; 0.5 is a 2:1 floor. */
export const DEFAULT_PITCH = 0.75;

/** Yaw in DEGREES: how far the camera stands round from square-on. 0 keeps the
 * floor grid axis-aligned; 45 turns it into diamonds (true isometric). */
export const DEFAULT_YAW = 0;

/** What the pitch knob may be set to. Below the floor the world goes edge-on
 * and the game stops being readable; above 1 the floor would stretch away from
 * the eye rather than recede toward it. */
export const PITCH_RANGE = { min: 0.25, max: 1 } as const;
/** …and the yaw, from square-on to the full isometric quarter turn. */
export const YAW_RANGE = { min: 0, max: 45 } as const;

// The live projection, as the matrix `[a c; b d]` mapping a camera-relative
// world offset to a screen offset, plus its inverse. Kept as plain numbers
// because every draw in the frame reads them.
//
// Derived as ROTATE-THEN-SQUASH: yaw turns the world about the eye, pitch then
// flattens what the eye sees. Composing them in that order is what keeps the
// determinant equal to the pitch alone — so turning the camera changes the
// SHAPE of the visible region without changing how much world is in it, and the
// yaw knob can be swept without quietly handing the player a bigger map.
let pitch = DEFAULT_PITCH;
let yawDeg = DEFAULT_YAW;
// The forward matrix: screen = (a·dx + c·dy, b·dx + d·dy).
let a = 1;
let b = 0;
let c = 0;
let d = DEFAULT_PITCH;
// …and its inverse: world = (ia·sx + ic·sy, ib·sx + id·sy).
let ia = 1;
let ib = 0;
let ic = 0;
let id = 1 / DEFAULT_PITCH;

function recompute(): void {
  const rad = (yawDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  a = cos;
  c = -sin;
  b = sin * pitch;
  d = cos * pitch;
  const det = a * d - b * c; // == pitch, for any yaw
  ia = d / det;
  ib = -b / det;
  ic = -c / det;
  id = a / det;
}
recompute();

/**
 * Set the live projection. Out-of-range values are CLAMPED rather than refused
 * — this is a pair of sliders, and a knob that silently does nothing near its
 * own end stop is worse than one that stops.
 */
export function setWorldProjection(next: {
  pitch?: number;
  yaw?: number;
}): void {
  if (next.pitch !== undefined) {
    pitch = Math.min(PITCH_RANGE.max, Math.max(PITCH_RANGE.min, next.pitch));
  }
  if (next.yaw !== undefined) {
    yawDeg = Math.min(YAW_RANGE.max, Math.max(YAW_RANGE.min, next.yaw));
  }
  recompute();
}

/** The live pitch and yaw — read by the settings UI, and by anything that has
 * to drop a bake when the look changes (see `groundLayer`). */
export function worldPitch(): number {
  return pitch;
}
export function worldYaw(): number {
  return yawDeg;
}

/** A cheap identity for the current projection, for cache keys. */
export function projectionKey(): string {
  return `${pitch}/${yawDeg}`;
}

/** Project a camera-relative world offset onto the screen. */
export function projectX(dx: number, dy: number): number {
  return a * dx + c * dy;
}
export function projectY(dx: number, dy: number): number {
  return b * dx + d * dy;
}

/** …and back: the camera-relative world offset a screen offset stands on. This
 * is the inverse the pointer runs to find what the player is pointing AT. */
export function unprojectX(sx: number, sy: number): number {
  return ia * sx + ic * sy;
}
export function unprojectY(sx: number, sy: number): number {
  return ib * sx + id * sy;
}

/**
 * The AXIS-ALIGNED WORLD RECT a screen of this size can show, relative to the
 * camera point.
 *
 * Square-on this is just the screen with its height divided by the pitch. Under
 * a yaw it is the bounding box of a DIAMOND, so it is deliberately generous:
 * some world points inside it sit off screen at the corners. Everything that
 * culls uses it, and a cull that is a little too generous costs a few draw
 * calls, while one that is too tight pops bodies out of existence at the rim.
 */
export function worldViewRect(
  viewWidth: number,
  viewHeight: number,
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [sx, sy] of [
    [0, 0],
    [viewWidth, 0],
    [0, viewHeight],
    [viewWidth, viewHeight],
  ] as const) {
    const wx = unprojectX(sx, sy);
    const wy = unprojectY(sx, sy);
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  }
  return {
    x: minX,
    y: minY,
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
  };
}

/**
 * WHERE A WORLD POINT IS ON THE CANVAS, in canvas px — and its inverse, the
 * world point a canvas pixel is looking at.
 *
 * The CAMERA POINT is whatever world position maps to the canvas origin, and
 * it needs no fudge term to make that true at any yaw: the projection is a
 * linear map, so it carries the centre of the visible parallelogram to the
 * centre of the screen on its own, and `computeCamera` puts the hero there.
 *
 * These are the app's door into the projection. Everything outside the renderer
 * that has to cross between the two spaces goes through this pair: where the
 * player is pointing, which foe the cursor is aiming at, whether a tap landed on
 * the merchant, and where a floating DOM label pins itself over a world point.
 * They were a pair of scalars before the yaw existed, which worked only for as
 * long as the two axes stayed independent.
 */
export function worldToCanvas(
  worldX: number,
  worldY: number,
  camera: { x: number; y: number },
): { x: number; y: number } {
  const dx = worldX - camera.x;
  const dy = worldY - camera.y;
  return { x: projectX(dx, dy), y: projectY(dx, dy) };
}

export function canvasToWorld(
  canvasX: number,
  canvasY: number,
  camera: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: camera.x + unprojectX(canvasX, canvasY),
    y: camera.y + unprojectY(canvasX, canvasY),
  };
}

/**
 * Rake the world: everything drawn after this until the matching `restore` is
 * in PROJECTED space, so a pass may go on writing plain `pos - camera` offsets
 * and have them land on the tilted floor. Composed onto whatever transform is
 * already in place (the death scene's push-in), never assigned over it.
 */
export function applyWorldProjection(ctx: CanvasRenderingContext2D): void {
  ctx.transform(a, b, c, d, 0, 0);
}

/**
 * Draw a body STANDING at world (`worldX`, `worldY`), inside the projected
 * world transform.
 *
 * The caller's code inside `draw` is written exactly as it was before any of
 * this existed — screen coordinates as `pos.x - camera.x` / `pos.y - camera.y`,
 * sprite sizes, jump heights, health bars, `withStance` poses, all in plain
 * unprojected px. This wraps it in the counter-transform that pins that spot to
 * its projected place and hands back an axis-aligned, 1:1 space for everything
 * drawn around it. That is why billboarding a pass is a one-line wrap rather
 * than a rewrite of its arithmetic — and why adding the yaw knob afterwards did
 * not touch a single one of those passes.
 *
 * The composite comes out as EXACTLY the identity (the projection outside
 * multiplied by its inverse here) at a whole-pixel offset, so an integer
 * coordinate inside still lands on an integer device pixel: the pixel art stays
 * as crisp as it was, which a naive counter-transform about a fractional anchor
 * would not manage.
 */
export function billboard(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  draw: () => void,
): void {
  beginBillboard(ctx, worldX, worldY, cameraX, cameraY);
  draw();
  endBillboard(ctx);
}

/**
 * The same thing as a matched PAIR, for the passes whose per-body draw is a
 * long imperative block (the horde, the hero, loot). Folding those into the
 * callback above would re-indent a couple of hundred lines of unrelated code to
 * say one thing about the camera; `billboard` is the form to reach for wherever
 * the body is an expression or two.
 */
export function beginBillboard(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
): void {
  const relX = worldX - cameraX;
  const relY = worldY - cameraY;
  // How far the body's projected place sits from where an unprojected draw
  // would have put it — a WHOLE number of pixels on each axis, which is what
  // keeps an integer coordinate inside landing on an integer device pixel.
  const shiftX = Math.round(projectX(relX, relY)) - Math.round(relX);
  const shiftY = Math.round(projectY(relX, relY)) - Math.round(relY);
  ctx.save();
  ctx.translate(unprojectX(shiftX, shiftY), unprojectY(shiftX, shiftY));
  ctx.transform(ia, ib, ic, id, 0, 0);
}

export function endBillboard(ctx: CanvasRenderingContext2D): void {
  ctx.restore();
}
