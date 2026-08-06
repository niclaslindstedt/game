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
// A third switch rides along without being part of the transform:
//
//   ANTI-ALIASING — whether the art the yaw TURNS is smoothed as it is baked
//           through the projection. Nearest-neighbour turns a straight run of
//           pixels into a dotted, ragged staircase, which is the honest cost of
//           rotating pixel art and the thing that makes a yawed floor look
//           broken rather than drawn. It is a SETTING because the alternative
//           costs the floor a little of its crispness, and it is inert at yaw 0
//           because a square-on camera makes no staircase to smooth
//           (`projectionSmoothing`).
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

/** Whether the art the projection TURNS is smoothed on its way through — the
 * anti-aliasing knob, off by default. See `projectionSmoothing` below for the
 * half of it that matters to the renderer, and `groundLayer`
 * (render/caches.ts) for what it costs and buys. */
let antialias = false;

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
  antialias?: boolean;
}): void {
  if (next.pitch !== undefined) {
    pitch = Math.min(PITCH_RANGE.max, Math.max(PITCH_RANGE.min, next.pitch));
  }
  if (next.yaw !== undefined) {
    yawDeg = Math.min(YAW_RANGE.max, Math.max(YAW_RANGE.min, next.yaw));
  }
  if (next.antialias !== undefined) antialias = next.antialias;
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

/** The anti-aliasing KNOB as the player set it — what the settings row shows.
 * The renderer wants `projectionSmoothing` instead. */
export function worldAntialias(): boolean {
  return antialias;
}

/**
 * WHETHER THE PROJECTION IS SMOOTHING ANYTHING RIGHT NOW — the knob AND a
 * turned camera, which is the whole rule.
 *
 * The staircase this smooths is made by the YAW and by nothing else. A
 * square-on camera at any pitch is a pure vertical squash: every source column
 * stays a column, so nearest-neighbour drops whole ROWS and leaves the art's
 * horizontal detail exactly where it was — there is no diagonal to break up and
 * nothing to average, and averaging anyway would only soften a floor that was
 * already right. Turn the camera and every straight run of pixels crosses the
 * destination grid at an angle instead, which is where the dotted, ragged
 * staircase comes from.
 *
 * So the knob is deliberately inert at yaw 0 rather than merely pointless
 * there: a developer who leaves it on and dials the camera back to square-on
 * gets the crisp shipped floor, not a blurred one.
 */
export function projectionSmoothing(): boolean {
  return antialias && yawDeg > 0;
}

/** A cheap identity for the current projection, for cache keys — the smoothing
 * included, because it changes what a bake COMES OUT as, not just how it looks
 * on the way to the screen. */
export function projectionKey(): string {
  return `${pitch}/${yawDeg}/${projectionSmoothing() ? "aa" : "raw"}`;
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
 * THE CAMERA'S SEAT ON THE PROJECTED GROUND GRID, in whole screen px — and
 * WHERE A BODY STANDING ON THAT GRID SITS RELATIVE TO IT.
 *
 * Every pass in the game that puts something on a whole pixel has to quantize
 * SOMEWHERE, and the only rule that survives a moving camera is to quantize the
 * two ends SEPARATELY: the camera once per frame, each body once per body. A
 * body's own term then depends on nothing but where the body is, so panning the
 * camera moves the entire picture by the same whole number of pixels and the
 * scene is RIGID.
 *
 * Rounding the camera-relative offset instead — `round(project(world - camera))`
 * — is the bug this exists to prevent. The camera's world point is EXACT
 * (`computeCamera` deliberately does not round it: view.ts), so `world - camera`
 * sweeps continuously and each body crosses its own rounding boundary at its own
 * moment. Two props 16.4 units apart sit 12 px apart on one frame and 13 on the
 * next: the whole field visibly squeezes and stretches as the hero walks, while
 * the baked floor — one rigid blit — sits still underneath and gives it away.
 * It is loudest in y, where the pitch makes a world unit of travel 0.75 of a
 * screen pixel, but square-on x is no more exempt than y is.
 *
 * The MATCHING rule for everything drawn INSIDE the resulting billboard is
 * `seatX`/`seatY` (render/shared.ts): the shift below subtracts the caller's own
 * `Math.round(pos - camera)`, so that is the only rounding a pass may do, and
 * every offset it adds — half a sprite, a hover, a height off the floor — has to
 * be a whole pixel of its own. Folding a fractional one inside that round undoes
 * the cancellation and the body shivers a pixel against this rigid anchor.
 *
 * The camera half is also what the fog's dither lattice registers against
 * (`fogGridAnchor`) and what the ground layer's blit steps by, so all three sit
 * on ONE lattice and shift together, one whole pixel at a time.
 */
export function cameraAnchorX(cameraX: number, cameraY: number): number {
  return Math.round(projectX(cameraX, cameraY));
}
export function cameraAnchorY(cameraX: number, cameraY: number): number {
  return Math.round(projectY(cameraX, cameraY));
}

export function bodyAnchorX(
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
): number {
  return Math.round(projectX(worldX, worldY)) - cameraAnchorX(cameraX, cameraY);
}
export function bodyAnchorY(
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
): number {
  return Math.round(projectY(worldX, worldY)) - cameraAnchorY(cameraX, cameraY);
}

/**
 * A WORLD OFFSET ACROSS THE GROUND, as the screen offset it comes out as.
 *
 * This is `projectX`/`projectY` under a name that says what it is for, and it
 * exists because the billboarded EFFECTS layer keeps needing it. That layer
 * projects its ANCHOR and then draws everything else at full size in screen px
 * (render/effects.ts) — right for a thing happening in the AIR above a point (an
 * explosion, a rising damage number, a muzzle flash), wrong for anything that
 * measures a distance ACROSS THE FLOOR: a blood drop's travel, a jump's dust
 * spreading out from the boot, a corpse punted along a bearing, the ground a
 * swing sweeps.
 *
 * Getting it wrong is invisible square-on and glaring once the camera turns —
 * the geometry flies along the SCREEN's axes while the floor it belongs to runs
 * the other way. It is also why several passes carried a hand-rolled `FLATTEN`
 * squash: a hardcoded stand-in for the projection that ignored the live pitch.
 *
 * A VERTICAL — a drop's hop, a corpse's arc, dust drifting up — is NOT this: that
 * is height off the floor, and stays a true screen vertical.
 */
export function projectOffset(
  dx: number,
  dy: number,
): { x: number; y: number } {
  return { x: projectX(dx, dy), y: projectY(dx, dy) };
}

/**
 * THE DIRECTION ON THE FLOOR a push on the screen means — a unit vector.
 *
 * Every control that steers by pushing rather than by pointing (the touch dpad,
 * the stick, the WASD cluster) states its intent in SCREEN terms: "down" is down
 * the screen, whatever the camera is doing. A destination goes through
 * `canvasToWorld`, but a direction has no destination to convert, and passing
 * the raw screen vector to the simulation is the same bug the pointer would have
 * had without the inverse: under a yaw, down the screen is south AND west, so a
 * hero told to walk (0, 1) sets off at an angle to the way the player pushed.
 *
 * Only the BEARING is taken from the projection. The length is deliberately
 * normalized away, because the caller's own magnitude is the pace (how far the
 * thumb sits from the dpad centre, how far the stick is pushed) and the
 * foreshortening would otherwise make walking north slower than walking east.
 */
export function screenDirToWorld(
  sx: number,
  sy: number,
): { x: number; y: number } {
  const wx = unprojectX(sx, sy);
  const wy = unprojectY(sx, sy);
  const len = Math.hypot(wx, wy);
  return len > 0 ? { x: wx / len, y: wy / len } : { x: 0, y: 0 };
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
  //
  // The projected place comes from `bodyAnchor*`, which quantizes the body and
  // the camera separately: rounding `project(rel)` in one go is what made the
  // whole field ripple as the hero walked north (see the comment there).
  const shiftX =
    bodyAnchorX(worldX, worldY, cameraX, cameraY) - Math.round(relX);
  const shiftY =
    bodyAnchorY(worldX, worldY, cameraX, cameraY) - Math.round(relY);
  ctx.save();
  ctx.translate(unprojectX(shiftX, shiftY), unprojectY(shiftX, shiftY));
  ctx.transform(ia, ib, ic, id, 0, 0);
}

export function endBillboard(ctx: CanvasRenderingContext2D): void {
  ctx.restore();
}
