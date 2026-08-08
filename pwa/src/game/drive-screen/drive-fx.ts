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
  | "smoke"
  /**
   * Locked tyres burning off under the handbrake — a pale, low, fast cloud
   * boiling sideways off the back axle.
   *
   * Its own kind rather than the engine's smoke tuned down, because the two are
   * different sights and only one of them is about a column: a dead engine
   * issues a slow dark plume that CLIMBS for four seconds, and burning rubber
   * dumps a wide pale mass at road level that is gone in half of one. Sharing
   * the draw would have meant one of them looking wrong for the whole of a leg.
   */
  | "tyresmoke"
  /**
   * A STREET LIGHT'S LENS GOING — the one burst on this road thrown from up in
   * the AIR rather than off the tarmac, and the only one that was LIT a moment
   * before it existed.
   */
  | "glass";

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
  /**
   * WHICH WAY DOWN THE ROAD IT FALLS AWAY, as a sign (+1 world east, -1 west).
   *
   * Only the tyre smoke wants one, and it is the difference between a cloud the
   * car is leaving behind and a cloud stuck to its back bumper. A constant would
   * have been right on the leg OUT and exactly backwards on the leg HOME, where
   * the same road is driven the other way — the class of bug the drive's
   * `direction` exists to stop, and the reason this is a field rather than a
   * `-1` written into the draw.
   */
  drift?: number;
  /**
   * HOW FAR OFF THE ROAD IT WAS THROWN FROM (world px).
   *
   * Everything else here happens at bumper height, which is near enough to the
   * ground that nothing had to say so. A lamp's lens is up a column — four feet
   * for a yard light and the better part of a storey for a street-lighting mast
   * — and glass raised at road level reads as something falling out from under
   * the car rather than as a light being taken off its post.
   */
  lift?: number;
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

/**
 * How much a hit's energy counts as "force" — `wearJoules` is the collision
 * that totals the car, so `full` is the share of the car a full-force hit of
 * this KIND costs.
 *
 * IT IS A PARAMETER BECAUSE THE ROAD'S COLLISIONS SPAN THREE ORDERS OF
 * MAGNITUDE. One yardstick for a wagon meeting a bus and a wagon meeting a
 * person prices the top of that range or the bottom, never both — and it was
 * pricing the top, so every single body under the bumper landed in the bottom
 * fifteenth of the scale and came out as a puff of dust and a tenth of a pixel
 * of shudder. It is the same complaint, and the same answer, as
 * `DRIVE.impact.crowdSpeedLossScale` on the physics side of the glass.
 */
function forceOf(joules: number, full = SMASH_FULL_SHARE): number {
  return Math.min(1, joules / (DRIVE.impact.wearJoules * full));
}

/** What a full-force hit costs the car, for the two things this road hits.
 *
 * STEEL is the collision that takes an eighth of the wagon — trading paint at
 * speed, and everything above it is off the top of the scale anyway. A BODY is
 * priced on the crowd's own worst case instead: a person met DEAD SQUARE AT THE
 * TOP OF THE DIAL on MEDIUM, which is about 6.8% of the car. So the ladder a
 * player actually sees runs the whole way from a clip at walking pace to the
 * worst thing that can happen to somebody, rather than sitting flat at nothing.
 *
 * THE BODY FIGURE MOVES WITH THE TOP SPEED and it is not optional. It was 3.6%
 * against a 120 mph dial, and absorbed energy goes as the SQUARE of the closing
 * speed — so on a 174 mph one the same number saturates barely past halfway up
 * the speedometer, and the top half of the range shakes the frame by exactly as
 * much as the middle of it. That is the scale silently going flat at precisely
 * the speeds the whole change was made for.
 */
const SMASH_FULL_SHARE = 0.12;
const BODY_FULL_SHARE = 0.068;

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

/**
 * A body went under the car: grit off the tarmac, and a shove of the frame.
 *
 * ON THE CROWD'S OWN SCALE (`BODY_FULL_SHARE`), which is the whole of the
 * picture's answer to "they should be felt". The shove is worth more of that
 * scale than steel is worth of its own, and that is not the crowd being made
 * more important than a car — it is the two scales being different sizes. A
 * body at the top of the dial shoves the frame about three px; a wreck still
 * reaches five and a half, and nothing about the ordering has moved.
 *
 * The BLOOM stays small on purpose. A crowd is met thirty-odd times a trip and
 * a blockade several times a second, and a white flash on every one of them
 * would leave the road unreadable at exactly the moment it most needs reading.
 */
export function driveBodyHit(
  state: DriveFxState,
  x: number,
  y: number,
  joules: number,
  nowMs: number,
): void {
  const force = forceOf(joules, BODY_FULL_SHARE);
  push(state, "grit", x, y, nowMs, 520, force);
  kick(state, force * 0.9, force * 0.2);
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

/**
 * THE BIG ONE — a car folded up, put on its roof, or destroyed outright.
 *
 * ITS OWN FUNCTION BECAUSE IT HAS ITS OWN CEILING. Every other effect on this
 * road shares one shake clamp, and it is set where it is on purpose: the road
 * has to stay readable while it is being hit, and a frame thrown about by every
 * body under the bumper is punishing the player twice. But the same clamp
 * applied to a wreck meant the largest thing that can happen out here shoved the
 * frame exactly as hard as clipping a lamp post did — which is the picture's
 * half of "the crashes feel thin". So the terminal events get a ceiling of their
 * own, a third higher, and nothing else can reach it.
 *
 * It is also three effects rather than one: sparks off the contact, shards off
 * the bodywork, and glass out of the air where the windows were.
 */
export function driveSmash(
  state: DriveFxState,
  x: number,
  y: number,
  joules: number,
  nowMs: number,
): void {
  const force = forceOf(joules);
  push(state, "spark", x, y, nowMs, 520, 1);
  push(state, "shard", x, y, nowMs, 1100, 1);
  push(state, "glass", x, y, nowMs, 900, 0.9, false, 0, WRECK_GLASS_LIFT);
  kick(state, 1.1 + force, 0.8, SMASH_SHAKE_MAX);
}

/** How far off the road a car carries its windows (world px) — where the
 * shards come out of when a wreck loses them. The same figure the ejection's
 * own screen burst uses, kept here because a wreck's glass and a body's exit
 * are the same pane at the same height. */
const WRECK_GLASS_LIFT = 12;

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

/**
 * A LOCKED TYRE, BURNING — one puff off the back axle, raised on a cadence for
 * as long as the handbrake is dragging the car down (`stepSkids`).
 *
 * It shakes NOTHING. Every other effect on this road is a collision and shoves
 * the frame to say so; a stop is the player getting something RIGHT, and a
 * camera that punished a good handbrake exactly as it punishes hitting a van
 * would be telling him the opposite of what happened. The picture says it with
 * smoke, the rubber on the road and the nose going down.
 */
export function driveTyreSmoke(
  state: DriveFxState,
  x: number,
  y: number,
  nowMs: number,
  force: number,
  /** Which way the car is going, so the cloud falls away BEHIND it. */
  direction: 1 | -1,
): void {
  push(state, "tyresmoke", x, y, nowMs, 620, force, false, -direction);
}

/**
 * A STREET LIGHT HAS BEEN TAKEN OFF ITS POST: its lens, in pieces, out of the
 * air where the lamp head was.
 *
 * The force is not the collision's. A lamp is glass on the end of a lever, and
 * what shatters it is the column whipping over rather than the joules the
 * bumper spent — so a light clipped at forty comes apart much like one hit at a
 * hundred, and tying the burst to the impact made a slow nudge produce three
 * apologetic specks.
 */
export function driveLampGlass(
  state: DriveFxState,
  x: number,
  y: number,
  lift: number,
  nowMs: number,
): void {
  push(state, "glass", x, y, nowMs, 1100, 0.85, false, 0, lift);
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
  drift = 0,
  lift = 0,
): void {
  state.fx.push({
    kind,
    x,
    y,
    bornMs,
    lifeMs,
    force,
    follow,
    drift,
    lift,
    // The seed is the spawn POSITION rather than a draw — a `Math.random` here
    // would be fine (it is spawn-time, not per-frame), but deriving it means an
    // identical road replays with an identical picture, which is what makes a
    // filmstrip of a tuning change worth comparing.
    seed: Math.abs(Math.round(x * 7 + y * 13 + bornMs)) % 1024,
  });
}

/**
 * Shove the frame and bloom it, unless the viewer asked for calm.
 *
 * `most` is the ceiling this particular event may push the shake to — the
 * ordinary one for everything, and a higher one for the handful of terminal
 * events that are allowed to be the biggest thing that has happened (see
 * `driveSmash`). It is a ceiling rather than a multiplier so a wreck landing in
 * the middle of a blockade cannot stack the two into something unreadable.
 */
function kick(
  state: DriveFxState,
  shake: number,
  flash: number,
  most = SHAKE_MAX,
): void {
  if (state.calm) return;
  state.shake = Math.min(most, state.shake + shake);
  state.flash = Math.min(0.5, state.flash + flash * 0.35);
}

/** The ordinary shake ceiling, and the one a wreck may reach. Both in the same
 * units `SHAKE_PER_FORCE` turns into world px — so the everyday worst is about
 * a fifth of a lane and a rollover is about a third of one. */
const SHAKE_MAX = 1.6;
const SMASH_SHAKE_MAX = 2.4;

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
 * Where the camera actually stands this frame — the shake, applied to the
 * camera rather than to a `ctx.translate`, so the effects, the gore and the
 * road all move together instead of sliding against each other.
 *
 * A COLLISION IS THE ONLY THING THAT MOVES THIS CAMERA, and that is a decision
 * rather than an omission. The road used to carry a permanent SPEED TREMBLE as
 * well — a wobble rising with the square of the speed, meant to say "this wagon
 * is thirty years old and doing 120". What it actually said was that the game
 * was broken: at the top end every house, every lamp post and the car itself
 * jittered a pixel back and forth several times a second, and a picture made of
 * hard-edged pixel art has no motion blur to hide that in. It read as a bad
 * frame rate, not as a fast car — and worse, it left nothing for a real hit to
 * do, because the frame was already shaking before anything was struck. Silence
 * between the blows is what makes a blow land.
 */
export function shakeCamera(
  state: DriveFxState,
  camera: Camera,
  nowMs: number,
): Camera {
  const amount = state.calm ? 0 : state.shake;
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
    else if (fx.kind === "tyresmoke") drawTyreSmoke(ctx, fx, t, sx, sy);
    else if (fx.kind === "glass") drawGlass(ctx, fx, t, sx, sy);
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

/**
 * A LAMP'S LENS, COMING APART IN THE AIR.
 *
 * Three things separate it from the panel shards below, and each is the
 * difference between glass and steel. It starts UP (`fx.lift`) and falls the
 * whole way down under gravity rather than lobbing, so the eye follows it off
 * the post. It is PALE and lit — the pieces were burning a moment ago, so they
 * open warm and cool to a cold glitter as they drop, which is also the only way
 * a fragment reads at all against night tarmac. And it TWINKLES: each piece
 * catches the light on its own cycle, because a tumbling shard is only bright
 * when a face happens to point at you, and a field of steady dots reads as
 * confetti.
 */
function drawGlass(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const count = Math.round(14 + fx.force * 18);
  const lift = fx.lift ?? 0;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < count; i++) {
    const angle = scatter(fx.seed, i, 11) * Math.PI * 2;
    const reach = (4 + scatter(fx.seed, i, 12) * 22) * (0.4 + fx.force);
    const px = sx + Math.cos(angle) * reach * t;
    // Out of the head, then down: a small upward kick spent almost at once, and
    // the whole drop from the lens to the road underneath it.
    const kick = 5 + scatter(fx.seed, i, 13) * 7;
    const fall = lift - kick * t * 2 + (lift + 20) * t * t;
    const py =
      sy + Math.sin(angle) * reach * t * 0.4 - Math.max(0, lift - fall);
    const spin = Math.sin(t * (7 + scatter(fx.seed, i, 14) * 9) * Math.PI);
    const glint = Math.max(0, spin) * (1 - t * 0.7);
    const warm = Math.max(0, 1 - t * 2.4);
    ctx.fillStyle = `rgba(255, ${Math.round(240 - warm * 24)}, ${Math.round(
      214 + warm * 20,
    )}, ${(glint * 0.85).toFixed(3)})`;
    ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
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

/**
 * BURNING RUBBER — a low pale cloud that boils OUT rather than up, and is gone
 * in half a second.
 *
 * Everything about it is the dead engine's smoke inverted, because a locked tyre
 * is the opposite event: it spreads wide instead of climbing (the smoke comes
 * off a contact patch on the road, not out of a bonnet), it is PALE rather than
 * grey (it is lit by the same headlights the road grit is, and dark smoke on
 * dark tarmac is nothing at all — the lesson `drawGrit` learned first), and it
 * dies fast, because a stop lasts under a second and smoke still hanging there
 * afterwards reads as a fire.
 *
 * It also DRIFTS BACKWARD along the road, which is the cheap trick that sells it
 * at speed: the car is still moving, so what it left behind is falling away
 * from it, and a cloud pinned dead over the axle would read as attached.
 */
function drawTyreSmoke(
  ctx: CanvasRenderingContext2D,
  fx: DriveFx,
  t: number,
  sx: number,
  sy: number,
): void {
  const puffs = Math.round(8 + fx.force * 10);
  const drift = fx.drift ?? -1;
  ctx.save();
  for (let i = 0; i < puffs; i++) {
    // EVERY PUFF HAS ITS OWN AGE. Aged together they are one expanding ring of
    // circles — a handful of grey balloons rather than smoke — because a dozen
    // hard-edged discs that grow and fade in lockstep read as exactly what they
    // are. Staggered, the tyre keeps ISSUING for the whole life of the effect
    // and the mass is built out of overlap, which is the same trick the road's
    // blood marks use to make a pool.
    const phase = Math.min(1, t + scatter(fx.seed, i, 10) * 0.7);
    const ease = phase * (2 - phase);
    const back = (4 + scatter(fx.seed, i, 11) * 26) * drift;
    const spread = (scatter(fx.seed, i, 12) - 0.5) * 14;
    const r = 1.5 + ease * (3 + fx.force * 3);
    ctx.fillStyle = `rgba(198, 194, 188, ${((1 - phase) * 0.19).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(
      Math.round(sx + back * ease),
      Math.round(sy - 2 - ease * 4 + spread * ease * 0.4),
      r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
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
