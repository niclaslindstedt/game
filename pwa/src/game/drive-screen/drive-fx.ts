// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A COLLISION LOOKS AND FEELS LIKE ON THE ROAD — the drive's own little
// effect layer.
//
// WHY IT IS ITS OWN LAYER AND NOT THE RUN'S. `render/effects.ts` is a fine
// effect system and this deliberately does not use it: every one of its lives
// is measured against `state.stats.timeMs`, and a drive has no `GameState` to
// read a clock off. The road's clock is `DriveState.ms` — which stops while a
// monologue is up, exactly as the sim does — so an effect here ages on that,
// and the freeze the speech box already applies to the world applies to the
// sparks over it for free.
//
// EVERYTHING IN HERE IS PRESENTATION. The engine solves the collision and says
// so (`DriveEvent`); this file decides what that looks like and nothing else. A
// drive with the effect layer torn out plays identically — which is the test to
// apply to anything added here.
//
// THE FORCE COMES FROM THE PHYSICS, never from a per-effect constant: a burst is
// sized by the collision's own absorbed energy (`DriveEvent.joules`, the same
// number the gore burst is priced off), so a body clipped at 40 mph throws a few
// grains of grit and a van met square at 120 throws the screen about. Nobody has
// to tune "a big hit" — the sum already knows.

import { DRIVE } from "@game/core";

import { bodyAnchorX, bodyAnchorY } from "../render/tilt.ts";
import type { Camera } from "../render/view.ts";

/** What the road can throw. */
type DriveFxKind =
  /** Grit and road dust off a body meeting the bumper. */
  | "grit"
  /** Scraped metal — the shower a car trades with a car. */
  | "spark"
  /** A panel giving, or a part tearing off: dark shards, no light. */
  | "shard"
  /** The dead engine's smoke, rising off the bonnet. */
  | "smoke";

/** One live effect on the road. */
type DriveFx = {
  kind: DriveFxKind;
  x: number;
  y: number;
  /** Drive-clock ms when it was born, and how long it lives. */
  bornMs: number;
  lifeMs: number;
  /** 0→1-ish, off the collision's own joules — how many pieces and how far. */
  force: number;
  /** Per-effect scatter seed, so two sparks in the same tick differ. */
  seed: number;
  /**
   * RIDE THE CAR instead of staying where it happened.
   *
   * Everything else here is anchored to the ROAD, which is right for every one
   * of them: grit, sparks and shards are thrown off at a point and left behind,
   * and watching them recede is most of what makes speed read. The dead engine's
   * SMOKE is the one exception, and it was wrong until this existed — a
   * breakdown does not stop the car, it kills it, and the wreck then coasts the
   * better part of a screen and a half before it comes to rest
   * (`breakdownCoastPx`). Pinned to the road, the column stood over the spot the
   * engine died and the wreck rolled silently out from under it.
   */
  follow?: boolean;
};

/** The road's live effects, its shake and its flash — one object the screen
 * keeps on a ref. */
export type DriveFxState = {
  fx: DriveFx[];
  /** Camera shake, in world px of amplitude, decaying every step. */
  shake: number;
  /** The white bloom over a heavy hit, 0→1, decaying every step. */
  flash: number;
  /** True where the viewer has asked for less motion: no shake, no flash, and
   * the pieces stay put. The picture still says a hit happened — it says it
   * with the grit and the sparks rather than by moving the whole frame. */
  calm: boolean;
};

/** How much a hit's energy counts as "force" — `wearJoules` is the collision
 * that totals the car, so a full-force burst is one that would have done it. */
function forceOf(joules: number): number {
  return Math.min(1, joules / (DRIVE.impact.wearJoules * 0.12));
}

/** How hard the frame is shaken by a hit of this force (world px). Well under
 * a lane's width at its worst: the road must stay readable while it is being
 * hit, or the shake is punishing the player twice. */
const SHAKE_PER_FORCE = 3.4;
/** How fast the shake and the flash die (per second) — a couple of frames of
 * bloom, a third of a second of shudder. */
const SHAKE_DECAY = 7;
const FLASH_DECAY = 9;

export function createDriveFx(): DriveFxState {
  return {
    fx: [],
    shake: 0,
    flash: 0,
    calm:
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

/** A body went under the car: grit off the tarmac, and a shove of the frame. */
export function driveBodyHit(
  state: DriveFxState,
  x: number,
  y: number,
  joules: number,
  nowMs: number,
): void {
  const force = forceOf(joules);
  push(state, "grit", x, y, nowMs, 520, force);
  kick(state, force * 0.55, force * 0.35);
}

/** Paint traded with another car: sparks, shards, and a much harder shove. */
export function driveTrafficHit(
  state: DriveFxState,
  x: number,
  y: number,
  joules: number,
  nowMs: number,
): void {
  const force = forceOf(joules);
  push(state, "spark", x, y, nowMs, 420, force);
  push(state, "shard", x, y, nowMs, 700, force);
  kick(state, force, force);
}

/** A panel climbed a rung, or a part worked free: shards off the car. */
export function drivePartHit(
  state: DriveFxState,
  x: number,
  y: number,
  nowMs: number,
  shed: boolean,
): void {
  push(state, "shard", x, y, nowMs, shed ? 900 : 520, shed ? 0.8 : 0.45);
  kick(state, shed ? 0.5 : 0.25, 0);
}

/** The engine has died: smoke off the bonnet for as long as the wreck rolls and
 * then sits. It RIDES the car (see `DriveFx.follow`) — a dead engine's smoke
 * belongs to the engine, not to the patch of road it gave up on. */
export function driveBreakdown(
  state: DriveFxState,
  x: number,
  y: number,
  nowMs: number,
): void {
  push(state, "smoke", x, y, nowMs, DRIVE.breakdownHoldMs, 1, true);
  kick(state, 0.7, 0.2);
}

/** Everything the road throws away when the leg restarts. */
export function clearDriveFx(state: DriveFxState): void {
  state.fx.length = 0;
  state.shake = 0;
  state.flash = 0;
}

function push(
  state: DriveFxState,
  kind: DriveFxKind,
  x: number,
  y: number,
  bornMs: number,
  lifeMs: number,
  force: number,
  follow = false,
): void {
  state.fx.push({
    kind,
    x,
    y,
    bornMs,
    lifeMs,
    force,
    follow,
    // The seed is the spawn POSITION rather than a draw — a `Math.random` here
    // would be fine (it is spawn-time, not per-frame), but deriving it means an
    // identical road replays with an identical picture, which is what makes a
    // filmstrip of a tuning change worth comparing.
    seed: Math.abs(Math.round(x * 7 + y * 13 + bornMs)) % 1024,
  });
}

/** Shove the frame and bloom it, unless the viewer asked for calm. */
function kick(state: DriveFxState, shake: number, flash: number): void {
  if (state.calm) return;
  state.shake = Math.min(1.6, state.shake + shake);
  state.flash = Math.min(0.5, state.flash + flash * 0.35);
}

/** Age everything by one step of the DRIVE's own clock. */
export function stepDriveFx(
  state: DriveFxState,
  dtMs: number,
  nowMs: number,
): void {
  const dt = dtMs / 1000;
  state.shake = Math.max(0, state.shake - state.shake * SHAKE_DECAY * dt);
  state.flash = Math.max(0, state.flash - state.flash * FLASH_DECAY * dt);
  if (state.shake < 0.01) state.shake = 0;
  if (state.flash < 0.004) state.flash = 0;
  state.fx = state.fx.filter((fx) => nowMs - fx.bornMs < fx.lifeMs);
}

/**
 * THE RIDE ITSELF — how hard the frame trembles at a given fraction of top
 * speed, before any collision is counted.
 *
 * A wagon this old at 120 mph is not a smooth place to sit, and the tremble is
 * the only thing on screen that says so: the road's own art is four flat
 * colours and the car is drawn dead level, so without this the difference
 * between 30 and 120 is a number in the corner. It rises with the SQUARE of
 * speed — barely there at a crawl, unmistakable at the top end — and it is
 * capped well under a collision's shove so a hit still lands as an event.
 */
const RUMBLE_MAX = 0.62;
export function roadRumble(speedFrac: number): number {
  const frac = Math.min(1, Math.max(0, speedFrac));
  return frac * frac * RUMBLE_MAX;
}

/**
 * Where the camera actually stands this frame — the shake, applied to the
 * camera rather than to a `ctx.translate`, so the effects, the gore and the
 * road all move together instead of sliding against each other.
 *
 * `speedFrac` folds the ride's own tremble in with whatever the last hit left
 * behind, so the two are one motion rather than two shakes fighting.
 */
export function shakeCamera(
  state: DriveFxState,
  camera: Camera,
  nowMs: number,
  speedFrac = 0,
): Camera {
  const amount = state.calm ? 0 : state.shake + roadRumble(speedFrac);
  if (amount <= 0) return camera;
  const amp = amount * SHAKE_PER_FORCE;
  // Two incommensurate rates, so the shudder never settles into a wobble.
  return {
    x: camera.x + Math.sin(nowMs * 0.09) * amp,
    y: camera.y + Math.sin(nowMs * 0.137 + 1.7) * amp * 0.6,
  };
}

/** Deterministic scatter: the seeded hash every canvas draw in the game uses
 * instead of `Math.random`, which would reshuffle the picture every frame. */
function fract(n: number): number {
  return n - Math.floor(n);
}
function scatter(seed: number, i: number, salt: number): number {
  return fract(Math.sin(seed * 0.017 + i * 12.9898 + salt) * 43758.5453);
}

/** Draw everything the road has thrown, over the finished picture. */
export function drawDriveFx(
  ctx: CanvasRenderingContext2D,
  state: DriveFxState,
  camera: Camera,
  nowMs: number,
  viewW: number,
  viewH: number,
  /** Where the car is NOW — where a `follow` effect is drawn instead of where it
   * was born. Omitted leaves every effect on the road, which is what all but one
   * of them want. */
  carAt?: { x: number; y: number },
): void {
  for (const fx of state.fx) {
    const t = Math.min(1, Math.max(0, (nowMs - fx.bornMs) / fx.lifeMs));
    const at = fx.follow && carAt ? carAt : fx;
    // THROUGH THE PROJECTION, like everything else with a place on this road.
    // The world is drawn raked (`applyWorldProjection`, pitch 0.75) and every
    // body is seated by `bodyAnchor*`; an effect that took the raw camera
    // offset instead would sit a lane and a half below the collision it came
    // from — invisible on a flat road, glaring the moment the pitch is dialled.
    const sx = bodyAnchorX(at.x, at.y, camera.x, camera.y);
    const sy = bodyAnchorY(at.x, at.y, camera.x, camera.y);
    if (fx.kind === "spark") drawSparks(ctx, fx, t, sx, sy);
    else if (fx.kind === "grit") drawGrit(ctx, fx, t, sx, sy);
    else if (fx.kind === "shard") drawShards(ctx, fx, t, sx, sy);
    else drawSmoke(ctx, fx, t, sx, sy);
  }
  // THE BLOOM GOES LAST AND GOES ADDITIVE: a heavy hit whites the frame out
  // rather than laying a grey sheet over it. `lighter` over a dark road is a
  // flash; `source-over` would be a fog.
  if (state.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255, 244, 214, ${(state.flash * 0.5).toFixed(3)})`;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }
}

/** Scraped metal — the one effect that is LIGHT, so it is drawn additively and
 * fades from white through the orange a steel scrape actually throws. */
function drawSparks(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const count = Math.round(6 + fx.force * 22);
  const ease = t * (2 - t);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < count; i++) {
    const angle = scatter(fx.seed, i, 0) * Math.PI * 2;
    const reach = (6 + scatter(fx.seed, i, 1) * 26) * (0.4 + fx.force);
    const lift = scatter(fx.seed, i, 2) * 9;
    const px = sx + Math.cos(angle) * reach * ease;
    const py = sy + Math.sin(angle) * reach * ease * 0.45 - lift * ease;
    const heat = 1 - t;
    ctx.fillStyle = `rgba(255, ${Math.round(150 + heat * 90)}, ${Math.round(
      60 + heat * 70,
    )}, ${(heat * 0.9).toFixed(3)})`;
    ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
  }
  ctx.restore();
}

/**
 * Road grit and dust off a body meeting the bumper.
 *
 * PALE, NOT DARK, and that is the whole lesson of the first cut: dust drawn in
 * its own honest colour is a dark speck on dark tarmac at night, and a dozen of
 * them are invisible. The road is lit by one pair of headlights, so what is
 * thrown up in front of a car is LIT — pale, and briefly the brightest thing
 * near the wheel. The puff also grows and thins rather than merely fading, so it
 * reads as dust rather than as pixels being turned off.
 */
function drawGrit(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const count = Math.round(7 + fx.force * 16);
  const ease = t * (2 - t);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const angle = scatter(fx.seed, i, 3) * Math.PI * 2;
    const reach = (5 + scatter(fx.seed, i, 4) * 20) * (0.5 + fx.force);
    const px = sx + Math.cos(angle) * reach * ease;
    const py = sy + Math.sin(angle) * reach * ease * 0.4 - ease * 4;
    const size = scatter(fx.seed, i, 9) > 0.6 ? 2 : 1;
    ctx.fillStyle = `rgba(206, 198, 178, ${((1 - t) * 0.55).toFixed(3)})`;
    ctx.fillRect(Math.round(px), Math.round(py), size, size);
  }
  ctx.restore();
}

/** Panel shards — bigger, darker, and they fall: what comes off a car is
 * heavier than what comes off the road. */
function drawShards(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const count = Math.round(3 + fx.force * 9);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const angle = scatter(fx.seed, i, 5) * Math.PI * 2;
    const reach = (8 + scatter(fx.seed, i, 6) * 30) * (0.4 + fx.force);
    // Thrown out and DOWN: the arc is a lob, so the pieces read as having
    // weight rather than as a flat expanding ring.
    const px = sx + Math.cos(angle) * reach * t;
    const hop = Math.sin(Math.min(1, t * 1.4) * Math.PI) * (6 + fx.force * 10);
    const py = sy + Math.sin(angle) * reach * t * 0.4 - hop;
    ctx.fillStyle = `rgba(58, 60, 68, ${((1 - t) * 0.85).toFixed(3)})`;
    ctx.fillRect(Math.round(px), Math.round(py), 2, 1);
  }
  ctx.restore();
}

/** The dead engine's smoke: a slow column that widens and thins as it climbs. */
function drawSmoke(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const puffs = 14;
  ctx.save();
  for (let i = 0; i < puffs; i++) {
    // Each puff has its own phase, so the column keeps issuing rather than
    // rising once and stopping.
    const phase = fract(t * 1.6 + scatter(fx.seed, i, 7));
    const rise = phase * 34;
    const drift = (scatter(fx.seed, i, 8) - 0.5) * 14 * phase;
    const r = 1.5 + phase * 5;
    ctx.fillStyle = `rgba(126, 124, 120, ${((1 - phase) * 0.34).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(
      Math.round(sx + drift),
      Math.round(sy - 6 - rise),
      r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}
