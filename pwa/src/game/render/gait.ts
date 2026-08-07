// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GAIT — how a body on the field carries itself while it crosses the floor.
// Two ways of moving, one module, shared by every actor the renderer draws (the
// hero, the horde, the companions, the merchant, the fauna).
//
// WALKING tips the body softly left and right about its FEET, and the tip is
// driven by GROUND COVERED rather than by the clock: the phase advances by
// `distance / STRIDE_PX`, so the rock speeds up exactly as the walker does,
// slows to a crawl at a nudged-stick creep, and stops dead when he stops — for
// free, with no notion of "how fast is he supposed to be going" anywhere in it.
// A body at rest breathes instead, so a mob standing through its own dialogue is
// still visibly alive.
//
// FLOATING is for the things with no legs to do any of that with — ghosts,
// wisps, drifting cores. They ride a few px off the ground on a slow drift and
// cast a SHADOW under them, which is the whole read: without one a hovering
// sprite is just a sprite drawn slightly too high.
//
// Everything here is presentation. The engine knows a monster's `locomotion`
// (an authored field, like `gore`) and nothing else — no gait state reaches the
// simulation, and a paused game simply stops covering ground, which stops the
// walk on its own.

import { clamp01 } from "./shared.ts";

/** World px of ground covered per full left-right cycle (two steps) — so half of
 * it is one step. Set a touch under the distance the hero's two-frame walk
 * sprite used to cover per flip, because everything now hangs off this one
 * phase: the legs, the tip and the rise share a cadence, and a slightly quicker
 * one reads as walking where a longer stride reads as wading. */
const STRIDE_PX = 24;

/** Speed (world px/s) that reads as a full-effort run — the hero's own top
 * speed. The lean grows toward `TILT_RUN` as a body approaches it; a plodding
 * mob at a fraction of it only ever tips gently. */
const RUN_SPEED = 84;

/** Below this (world px/s) a body is standing, not walking: the tilt has eased
 * out entirely and the idle breath has the floor. */
const REST_SPEED = 5;

/** The lean, in radians, at a walk and at a full run. Small on purpose — this is
 * a soft tip of a 16px-tall body, not a stagger. */
const TILT_WALK = 0.035;
const TILT_RUN = 0.08;

/** How SHARP the tip is. A plain sine spends most of its time near an extreme,
 * so the body reads as leaning left for half the stride and right for the other
 * half — a slow sway, which is not what walking looks like. Cubing it keeps the
 * same peaks in the same places and flattens everything between them, so the
 * body stands UPRIGHT most of the time and tips once, briefly, on each step —
 * one tip per rise, because a rise IS a step. */
const TILT_SHARPNESS = 3;

/** How far the body RISES on each step, and how far it drifts while breathing
 * (world px; the screen doubles both, and a large display doubles them again).
 * A walk is not a tilt — a body on legs vaults over each planted foot and drops
 * back between them, and without that rise and fall the tip alone reads as a
 * sprite being rocked rather than as somebody walking. */
const BOUNCE_PX = 1.8;
const BREATHE_PX = 0.5;
/** One full breath, standing still (ms). Slow — this is respiration, not a bob. */
const BREATHE_MS = 1900;

/** The speed reading is smoothed over this window (ms) so one stuttered frame,
 * or a step half-eaten by a wall, doesn't jolt the lean. */
const SPEED_SMOOTH_MS = 90;

/** A position jump beyond this (world px in one frame) is a TELEPORT, not a
 * stride — a level warp, an elevator, a mob re-homed by its leash. It advances
 * no phase, so nobody arrives mid-sprint from having been moved. */
const TELEPORT_PX = 24;

/** Gap (ms) after which a tracked body is treated as new: it was culled behind
 * cover, the run was parked in a menu, or the id has been recycled by a fresh
 * level. Whatever the reason, its last known position is no longer a place it
 * just walked from. */
const RESUME_MS = 400;

/** How often the tracker drops bodies it hasn't seen (ms), and how stale an
 * entry must be to go. The map holds one small record per visible actor, so this
 * is housekeeping against a long run's worth of dead mobs, not a hot path. */
const SWEEP_EVERY_MS = 4000;
const STALE_MS = 2000;

/** The hover the floaters ride at (world px above their feet) and the slow drift
 * they ride it with. The drift is per-body phased so a haunting never bobs in
 * lockstep. */
const FLOAT_LIFT_PX = 4;
const FLOAT_DRIFT_PX = 1.6;
const FLOAT_PERIOD_MS = 2300;

/** How dark the ground shadow under a floating body is, and how much of that it
 * loses at the top of its drift — a shadow that never changes reads as a decal
 * glued to the sprite rather than as light being blocked. */
const SHADOW_ALPHA = 0.5;
const SHADOW_RISE_FADE = 0.3;

/** One tracked body's stride. `phase` is 0..1 through the left-right cycle;
 * `speed` is the smoothed world px/s it is covering ground at. */
type Stride = {
  x: number;
  y: number;
  timeMs: number;
  phase: number;
  speed: number;
};

const strides = new Map<string, Stride>();
let lastSweepMs = 0;

/** How a body is carrying itself this frame. */
export type Gait = {
  /** 0..1 through the left-right cycle — also what the two-frame walk sprite
   * flips on, so the legs and the lean are one motion. */
  phase: number;
  /** Screen-space roll about the feet (radians). 0 while standing. */
  tilt: number;
  /** Vertical offset in world px; negative lifts. The step's bounce while
   * walking, the breath while standing. */
  lift: number;
  /** Smoothed ground speed, world px/s. */
  speed: number;
};

const STILL: Gait = { phase: 0, tilt: 0, lift: 0, speed: 0 };

/**
 * Advance `key`'s stride to where it now stands and read off its gait.
 *
 * Call once per frame per drawn body — the tracker measures the step from the
 * last call, so a second call in the same frame reads a step of zero. `key` must
 * be stable for the body's life and distinct across kinds (`e12` is not `c12`).
 */
export function walkGait(
  key: string,
  pos: { x: number; y: number },
  timeMs: number,
): Gait {
  sweep(timeMs);
  const prev = strides.get(key);
  // No history worth the name: seed the body standing, at its own point in the
  // breath cycle so a crowd of idle mobs isn't one organism.
  if (!prev || timeMs <= prev.timeMs || timeMs - prev.timeMs > RESUME_MS) {
    strides.set(key, { x: pos.x, y: pos.y, timeMs, phase: 0, speed: 0 });
    return { ...STILL, lift: breathe(key, timeMs) };
  }
  const dtMs = timeMs - prev.timeMs;
  const moved = Math.hypot(pos.x - prev.x, pos.y - prev.y);
  const step = moved > TELEPORT_PX ? 0 : moved;
  const instant = (step / dtMs) * 1000;
  prev.phase = (prev.phase + step / STRIDE_PX) % 1;
  prev.speed += (instant - prev.speed) * Math.min(1, dtMs / SPEED_SMOOTH_MS);
  prev.x = pos.x;
  prev.y = pos.y;
  prev.timeMs = timeMs;

  // `stance` is how much of the walk is showing: it fades the whole gait out as
  // the body slows, so one stopped mid-stride settles upright instead of holding
  // whatever lean the last frame caught it in.
  const stance = clamp01((prev.speed - REST_SPEED) / (RUN_SPEED * 0.35));
  if (stance <= 0) {
    return {
      phase: prev.phase,
      tilt: 0,
      lift: breathe(key, timeMs),
      speed: prev.speed,
    };
  }
  const effort = clamp01(prev.speed / RUN_SPEED);
  const swing = Math.sin(prev.phase * Math.PI * 2);
  // The tip, sharpened (see TILT_SHARPNESS): upright between steps, a quick
  // lean over the foot he is vaulting over, and the other way on the next step.
  const tip = swing ** TILT_SHARPNESS;
  const tilt = (TILT_WALK + (TILT_RUN - TILT_WALK) * effort) * stance * tip;
  // THE RISE AND FALL. One lift per STEP — two to a full left-right cycle — and
  // `|sin|` puts each peak exactly where the LEAN peaks, because they are the
  // same moment: a body is highest and tipped furthest as it vaults over the
  // planted foot, and lowest and upright between them with both feet down. Drive
  // it at twice the tilt instead and it bobs twice a step, which reads as a
  // trot. The rise stays a plain `|sin|` while the tip is sharpened — the body
  // really does float up and settle over the whole step, it is only the LEAN
  // that should be brief.
  const bounce = -BOUNCE_PX * stance * Math.abs(swing);
  const rest = breathe(key, timeMs) * (1 - stance);
  return { phase: prev.phase, tilt, lift: bounce + rest, speed: prev.speed };
}

/** The standing breath: a slow rise and settle, phased off the body's own key so
 * a line of idle mobs doesn't inhale together. */
function breathe(key: string, timeMs: number): number {
  const phase = keyPhase(key);
  return (
    -BREATHE_PX *
    (0.5 + 0.5 * Math.sin((timeMs / BREATHE_MS + phase) * Math.PI * 2))
  );
}

/**
 * Where a floating body sits this frame: its steady hover plus a slow drift,
 * as a NEGATIVE world-px offset (up). Rides the render clock, not the ground it
 * covers — a ghost hangs there whether or not it is going anywhere.
 */
export function floatLift(key: string, timeMs: number): number {
  const phase = keyPhase(key);
  return -(
    FLOAT_LIFT_PX +
    FLOAT_DRIFT_PX *
      (0.5 + 0.5 * Math.sin((timeMs / FLOAT_PERIOD_MS + phase) * Math.PI * 2))
  );
}

/**
 * The shadow a hovering body casts, drawn on the ground it is NOT standing on.
 * The authored `shadow` blob, scaled by whole pixels to the body's own size (so
 * it stays as crisp as everything else) and thinned as the body drifts up.
 *
 * `width` is the body's own opaque width in px; `lift` is its offset from
 * `floatLift` (negative); `groundY` is the screen row its feet would be on; `fade` dims it with whatever is dimming the
 * body above it (a dissolving apparition), since a shadow that outlives its
 * caster is a hole in the floor.
 */
export function drawFloatShadow(
  ctx: CanvasRenderingContext2D,
  shadow: ImageBitmap,
  cx: number,
  groundY: number,
  width: number,
  lift: number,
  fade = 1,
): void {
  // A shadow is as wide as the BODY that casts it — the art's own opaque width,
  // not the collision radius, which on a small mob is half again its silhouette
  // and lays down a slab wider than the thing standing on it. Rounded to a whole
  // multiple of the blob so its pixels stay square: everything minion-sized
  // takes it at 1×, and only a boss grows it.
  const scale = Math.max(1, Math.round(width / shadow.width));
  const w = shadow.width * scale;
  const h = shadow.height * scale;
  // Higher = fainter. Measured against the drift, so the fade is the drift's,
  // not a second animation of its own.
  const rise = clamp01((-lift - FLOAT_LIFT_PX) / FLOAT_DRIFT_PX);
  ctx.globalAlpha = SHADOW_ALPHA * (1 - SHADOW_RISE_FADE * rise) * fade;
  ctx.drawImage(
    shadow,
    Math.round(cx - w / 2),
    Math.round(groundY - h / 2),
    w,
    h,
  );
  ctx.globalAlpha = 1;
}

/**
 * Draw `body` posed about `pivot` — its FEET, so a walk tips it over them like a
 * walker rather than swinging it about its middle like a hanged man, and a jump
 * squashes it INTO the floor rather than through it.
 *
 * `tilt` rolls it (radians), `scaleY` squashes or stretches it vertically and
 * takes the inverse across, so a stretched body narrows and a squashed one
 * spreads and the volume holds. A neutral pose draws with no transform at all,
 * which is the common case — everything standing still, every wheeled thing
 * always, and every frame nobody is mid-jump on.
 */
export function withStance(
  ctx: CanvasRenderingContext2D,
  pivot: { x: number; y: number },
  pose: { tilt?: number; scaleY?: number },
  body: () => void,
): void {
  const tilt = pose.tilt ?? 0;
  const scaleY = pose.scaleY ?? 1;
  if (tilt === 0 && scaleY === 1) {
    body();
    return;
  }
  ctx.save();
  ctx.translate(pivot.x, pivot.y);
  if (tilt !== 0) ctx.rotate(tilt);
  if (scaleY !== 1) ctx.scale(1 / scaleY, scaleY);
  ctx.translate(-pivot.x, -pivot.y);
  body();
  ctx.restore();
}

/** Which two-frame walk sprite a gait phase is on. */
export function walkFrame(gait: Gait): 0 | 1 {
  return gait.phase < 0.5 ? 0 : 1;
}

/**
 * Is this body CROSSING GROUND, as against standing on it?
 *
 * The same threshold the tilt eases out at, published because the question is
 * no longer only the gait's own: a body with an authored WALK clip
 * (`render/clips.ts`) plays it while it is covering ground and its idle clip
 * while it is not, and that has to be the SAME reading the lean and the step
 * bounce are made from — or a mob would visibly finish a stride while standing
 * perfectly upright.
 *
 * Measured off the smoothed speed rather than off an engine flag on purpose:
 * the horde has no `moving` field, and one hero shoving another along has both
 * of them covering ground while only one of them is walking anywhere.
 */
export function walking(gait: Gait): boolean {
  return gait.speed > REST_SPEED;
}

/** A stable 0..1 offset for a body's own idle rhythms, hashed off its key. */
function keyPhase(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
  return h / 997;
}

/** Drop bodies that have stopped being drawn (killed, left behind on the last
 * level). Runs a few times a minute over a map of at most a screenful. */
function sweep(timeMs: number): void {
  if (timeMs - lastSweepMs < SWEEP_EVERY_MS) return;
  lastSweepMs = timeMs;
  for (const [key, stride] of strides) {
    if (timeMs - stride.timeMs > STALE_MS) strides.delete(key);
  }
}
