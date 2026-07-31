// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GOUT — the roaring cone of fire a flamethrower throws, world-anchored on
// the nozzle and pouring down the exact cone the engine's swing struck.
//
// It exists because `motion: shake` says a weapon is not SWUNG, and so is drawn
// with none of a swing's furniture — no blade riding a cone, no streak off the
// edge, no wedge of floor lighting up. That is right for a chainsaw, which is
// leaned into a body and juddered; it left the flamethrower firing in complete
// silence. A weapon whose whole identity is what comes out of the front of it
// has to have something come out of the front of it.
//
// IT IS A JET, NOT A BURST, and that is the whole difference in how it is built.
// A burst is N particles thrown once and watched until they die; a jet is a
// STREAM that has to look continuous for as long as the trigger is down, and
// look the same at the start of the swing as at the end. So every particle here
// runs on its OWN looping clock (`fract(phase + t · rate)`) rather than on the
// effect's: particle 7 is a third of the way down the cone while particle 8 has
// just left the nozzle and particle 9 is guttering out at the far end, and the
// picture is full from the first frame instead of blooming into existence.
//
// FOUR THINGS SELL IT, and each is a separate axis on purpose:
//
//  1. THE AGE LADDER. A particle's own age drives BOTH how far down the cone it
//     is and WHICH sprite it wears, through the authored five-stage ramp
//     (`flame_0` jet → `_1` bloom → `_2` body → `_3` cool → `_4` gutter). So the
//     stream visibly gets bigger, cooler and more ragged with distance without
//     one number anywhere saying "fire cools down" — it falls out of the art.
//  2. TWO SHAPES PER STAGE. Every rung is authored twice (`a`/`b`), picked per
//     particle off its hash. One shape per rung reads as a line of identical
//     stamps the moment two particles are near the same age, which is most of
//     the time in a stream.
//  3. THE TUMBLE. Each particle spins at its own rate and in its own direction
//     as it travels — quantized into eight baked buckets (`spunSprite`), because
//     a live rotation per particle per frame is how a spectacle becomes a
//     stutter. It is the tumble that stops the cone reading as a conveyor belt.
//  4. THE SMOKE. What the fire turns INTO, carrying on past the flames' reach,
//     rising and thinning. It is the one part drawn with plain alpha rather than
//     additively, and that is not a detail: fire is LIGHT and adds, smoke is
//     MATTER and covers. Drawn additively it comes out as a grey glow, which is
//     the opposite of smoke.
//
// Everything is seeded off the effect, never `Math.random` in a draw — the pass
// runs every frame for the same `t` and has to come out identical each time.

import { spriteByName, type Sprites } from "../assets.ts";
import { glowSprite, spinBucket, spunSprite } from "./caches.ts";
import { clamp01, fract } from "./shared.ts";
import { projectOffset } from "./tilt.ts";
import type { Effect } from "./effects.ts";

/** How long one gout burns (ms) — the length of the weapon's own pull, so the
 * stream is continuous while the trigger is down rather than a run of separate
 * puffs with gaps between them. */
export const FLAME_MS = 190;

/** The five authored rungs of the age ramp, each in its two shapes. A particle
 * walks this ladder as it travels, so distance IS temperature. */
const FLAME_FRAMES: readonly (readonly [string, string])[] = [
  ["flame_0a", "flame_0b"],
  ["flame_1a", "flame_1b"],
  ["flame_2a", "flame_2b"],
  ["flame_3a", "flame_3b"],
  ["flame_4a", "flame_4b"],
];

/**
 * Where each flame rung takes over, as a fraction of a particle's life. NOT five
 * even fifths: the jet and the gutter are the two rungs there is least to look
 * at, so they get a flash and a tail while the three burning rungs hold the
 * middle of the cone, which is where a gout's mass actually is.
 */
const RUNG_STOPS = [0.07, 0.2, 0.45, 0.74];

/** Which flame rung a particle of this age wears. */
function rungAt(age: number): number {
  for (let i = 0; i < RUNG_STOPS.length; i++) {
    if (age < RUNG_STOPS[i]!) return i;
  }
  return RUNG_STOPS.length;
}

/** How much of its full lane a particle has at the NOZZLE, before the cone opens
 * out with distance (see `drawJet`). Small, but never zero: fuel leaves a nozzle
 * as a throat, not as a point. */
const THROAT = 0.18;

/** The smoke ladder, walked the same way once a particle is past the fire. */
const SMOKE_FRAMES = ["flame_smoke_0", "flame_smoke_1", "flame_smoke_2"];

/** Flame particles in the stream. High enough that the cone reads as a solid
 * body of fire rather than as countable blobs, and low enough that a weapon
 * firing every 150ms never costs a frame. */
const JET_PARTICLES = 42;
/** Smoke puffs trailing it. Far fewer: smoke is the aftertaste, and it is the
 * one part here that OCCLUDES, so too much of it hides the fight. */
const SMOKE_PUFFS = 13;

/** How many times the stream recycles over one gout. Above 1 the particles that
 * started at the nozzle reach the end and are replaced, which is what makes a
 * short pull look like a continuous jet rather than one thrown handful. */
const JET_CYCLES = 1.9;

/** The spread of per-particle speeds, as a fraction either side of the mean. A
 * jet in which every particle travels at the same rate arrives in ranks. */
const SPEED_SPREAD = 0.3;

/** How far past the flames' own reach the smoke carries, as a fraction of it.
 * Smoke has no fuel left to push it, so it barely outruns the fire — but it
 * must outrun it a little, or it reads as being ON the flames rather than as
 * what they left behind. */
const SMOKE_OVERRUN = 1.22;

/** World px a smoke puff climbs over its life. A true SCREEN vertical: up is up
 * whatever the camera is doing (see AGENTS.md § projectOffset — a vertical is
 * the exception the projection does not touch). */
const SMOKE_RISE = 9;

/** Turns per unit of travel a particle tumbles through, before its own seeded
 * direction and rate. */
const SPIN_TURNS = 1.15;

/** The nozzle's own heat: a baked glow pinned at the muzzle so the fire has a
 * source rather than appearing a few px in front of the hero out of nothing. */
const MUZZLE_RGB = "255, 190, 90";
const MUZZLE_RADIUS = 13;

/** The warm wash the stream throws on the floor it is crossing (`drawCast`).
 * Deeper and redder than the muzzle's: this is the light a body of fire gives
 * off, not the white heart of the nozzle. */
const CAST_RGB = "255, 132, 48";

/** How far ahead of the hero's centre the nozzle sits (world px) — he holds the
 * lance out in front of him, and fire that starts at his navel reads as a man
 * who is himself on fire. */
const NOZZLE_REACH = 7;

/**
 * Draw one gout at screen (`x`, `groundY`). Returns false when the effect is
 * not a gout, so the caller's main pass falls through to its own branches.
 */
export function drawFlameGout(
  ctx: CanvasRenderingContext2D,
  effect: Effect,
  x: number,
  groundY: number,
  timeMs: number,
  sprites: Sprites,
): boolean {
  if (effect.kind !== "flame") return false;
  const duration = effect.durationMs ?? FLAME_MS;
  const t = 1 - (effect.untilMs - timeMs) / duration;
  if (t < 0 || t > 1) return true;

  const aim = effect.angle ?? 0;
  const reach = Math.max(10, effect.radius ?? 60);
  // The engine's own cone, halved — the fire covers exactly the ground the blow
  // struck, which is the whole reason a player can learn where this weapon
  // reaches. A saturated (π) arc fills the half-disc in front of him.
  const half = Math.min(Math.PI, (effect.arc ?? 1.6) / 2);
  const seed = effect.seed ?? 0;
  // The nozzle, a little ahead of him down the aim.
  const muzzle = projectOffset(
    Math.cos(aim) * NOZZLE_REACH,
    Math.sin(aim) * NOZZLE_REACH,
  );
  const mx = x + muzzle.x;
  const my = groundY + muzzle.y;

  const g: Gout = { mx, my, aim, half, reach, seed, t };
  // THE LIGHT IT CASTS goes down additively — a soft warm wash under the art,
  // which is what makes the floor around the stream visibly lit rather than
  // merely covered in orange. It is kept deliberately faint: this is the GLOW,
  // not the fire.
  ctx.globalCompositeOperation = "lighter";
  drawMuzzle(ctx, mx, my, t);
  drawCast(ctx, g);
  // THE FIRE ITSELF goes down with PLAIN ALPHA, and that is the one decision in
  // this file most worth not undoing. Additive is the obvious choice for flame
  // and it is wrong here for the same reason it was wrong for the blood cloud:
  // it is only ever right against a DARK backdrop. The authored ramp already
  // runs white-hot → yellow → orange → red, so adding it to anything pale takes
  // every rung of that ramp straight to white — measured on GOODCO's own lab
  // deck, the whole gout came out as one white cloud with no fire in it at all,
  // and the smoke drawn over it was invisible. Plain alpha lets the art be the
  // art on a moon's dark regolith and on a bright factory floor alike, and the
  // additive wash above supplies the light that the compositing no longer does.
  ctx.globalCompositeOperation = "source-over";
  drawJet(ctx, g, sprites);
  // SMOKE LAST, AND OVER. Matter, not light — it covers.
  drawSmoke(ctx, g, sprites);
  ctx.globalAlpha = 1;
  return true;
}

/** The shape one gout is drawn from, resolved once and shared by the passes. */
type Gout = {
  /** The nozzle, in screen px. */
  mx: number;
  my: number;
  /** Aim bearing (world radians) and the cone's half-angle. */
  aim: number;
  half: number;
  /** How far the fire carries, in world px. */
  reach: number;
  seed: number;
  /** Progress through the gout, 0→1. */
  t: number;
};

/** The heat at the nozzle — a baked glow that swells as the pull opens and
 * settles, so the stream has somewhere to come FROM. */
function drawMuzzle(
  ctx: CanvasRenderingContext2D,
  mx: number,
  my: number,
  t: number,
): void {
  // Peaks early: a trigger pull lights the nozzle before the fire has travelled
  // anywhere, and holds while the stream runs.
  const heat = Math.min(1, t * 5) * (1 - 0.45 * t);
  const glow = glowSprite(MUZZLE_RGB, MUZZLE_RADIUS);
  if (!glow) return;
  const size = MUZZLE_RADIUS * 2 * (0.75 + 0.45 * heat);
  ctx.globalAlpha = 0.26 * heat;
  ctx.drawImage(
    glow,
    Math.round(mx - size / 2),
    Math.round(my - size / 2),
    Math.round(size),
    Math.round(size),
  );
}

/**
 * THE LIGHT THE GOUT CASTS — three baked glows spaced down the cone, widening
 * and dimming with distance, laid under the art.
 *
 * It is what stops the fire reading as a decal: a stream of burning fuel lights
 * the floor it is crossing, and the flames themselves are drawn with plain alpha
 * (see the note at the call site) so they no longer do that on their own. Three
 * is enough — the eye reads a gradient of heat, not the number of stops in it —
 * and cheap, because each is a cached bake.
 */
function drawCast(ctx: CanvasRenderingContext2D, g: Gout): void {
  const CAST_STOPS = 3;
  for (let i = 0; i < CAST_STOPS; i++) {
    const along = (i + 0.6) / CAST_STOPS;
    const dist = g.reach * along;
    const off = projectOffset(Math.cos(g.aim) * dist, Math.sin(g.aim) * dist);
    // The cone widens as it goes, so the light it throws widens with it.
    const radius = Math.max(6, g.reach * (0.16 + 0.34 * along) * (1 + g.half));
    const glow = glowSprite(CAST_RGB, radius);
    if (!glow) continue;
    const size = radius * 2;
    // Dimmer further out (the fuel is spent) and fading with the pull itself.
    ctx.globalAlpha = 0.15 * (1 - 0.55 * along) * Math.min(1, t01(g.t) * 4);
    ctx.drawImage(
      glow,
      Math.round(g.mx + off.x - size / 2),
      Math.round(g.my + off.y - size / 2),
      Math.round(size),
      Math.round(size),
    );
  }
}

/** The pull's own envelope: up fast, held, then out with the last of the fuel. */
function t01(t: number): number {
  return 1 - clamp01((t - 0.6) / 0.4);
}

/**
 * The stream itself. Each particle owns a looping clock, a lane across the cone,
 * a speed, a shape and a spin — all off its own hash, so the jet is dense and
 * irregular and never repeats, and it is FULL from the first frame rather than
 * blooming out of nothing.
 */
function drawJet(
  ctx: CanvasRenderingContext2D,
  g: Gout,
  sprites: Sprites,
): void {
  for (let i = 0; i < JET_PARTICLES; i++) {
    const n = i + g.seed * 7.91;
    // THE LANE, biased to the middle. Two hashes averaged give a triangular
    // spread rather than a flat one, which is what a nozzle actually throws: a
    // dense core thinning toward the rim. A flat spread paints the cone's edges
    // as brightly as its middle and reads as a fan, not a jet.
    const lane =
      (fract(n * 1.73) - 0.5 + (fract(n * 5.29) - 0.5)) * g.half * 1.35;
    const rate = 1 + (fract(n * 3.11) - 0.5) * 2 * SPEED_SPREAD;
    // The particle's OWN age, looping — this is what makes a jet rather than a
    // burst. `fract` recycles it at the far end straight back to the nozzle.
    const age = fract(fract(n * 2.37) + g.t * JET_CYCLES * rate);
    // THE CONE OPENS, it does not START open — and this is the single line that
    // decides whether the thing reads as a jet or as a starburst. Given its full
    // lane from birth, a particle one frame old is already 45° off the aim, so
    // the fire leaves the nozzle as a fan of separate blobs with a hole in the
    // middle of it. Scaling the lane by the particle's own age instead gives the
    // shape a nozzle actually throws: a tight throat that widens with distance.
    const bearing = g.aim + lane * (THROAT + (1 - THROAT) * age);
    // Fire slows as it spreads and cools, so travel eases out — but only
    // MILDLY. A full ease-out (`age·(2−age)`) crams two thirds of the stream
    // into the last third of the cone and leaves the throat visibly empty,
    // which reads as blobs arriving from somewhere rather than as fire leaving
    // a weapon.
    const travel = age * (1.34 - 0.34 * age);
    // The far end of the cone is narrower in FUEL, not in angle: a particle that
    // wandered wide has less push behind it, so it does not reach as far.
    const laneFalloff =
      1 - 0.28 * Math.min(1, Math.abs(lane) / (g.half + 1e-6));
    const dist = g.reach * travel * laneFalloff;
    const off = projectOffset(
      Math.cos(bearing) * dist,
      Math.sin(bearing) * dist,
    );
    // WHICH RUNG: distance is temperature — but on the AUTHORED stops below
    // rather than in five even fifths. Even fifths spend a fifth of the cone on
    // the 6px jet and a fifth on the hollow gutter, which are the two rungs
    // there is least to see in; the stops give the throat a brief flash of white
    // and hand the middle of the cone to the big burning rungs, where the fire
    // actually is.
    const pair = FLAME_FRAMES[rungAt(age)]!;
    const name = (fract(n * 9.37) < 0.5 ? pair[0] : pair[1])!;
    const art = spriteByName(sprites, name);
    if (!art) continue;
    // THE TUMBLE, quantized and baked (see `spunSprite`).
    const spinDir = fract(n * 4.43) < 0.5 ? -1 : 1;
    const spun = spunSprite(
      art,
      name,
      spinBucket(spinDir * age * SPIN_TURNS * Math.PI * 2 + n),
    );
    // Fades in over the first sliver (the fuel catching) and out over the last
    // quarter (the flame going hollow), so nothing pops into or out of being.
    const alpha =
      Math.min(1, age * 14) * (1 - clamp01((age - 0.78) / 0.22)) * 0.92;
    if (alpha <= 0.01) continue;
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      spun,
      Math.round(g.mx + off.x - spun.width / 2),
      Math.round(g.my + off.y - spun.height / 2),
    );
  }
}

/**
 * What the fire turns into — puffs carrying on past the flames' reach, climbing
 * and thinning. Drawn with plain alpha (see the header): smoke covers.
 */
function drawSmoke(
  ctx: CanvasRenderingContext2D,
  g: Gout,
  sprites: Sprites,
): void {
  for (let i = 0; i < SMOKE_PUFFS; i++) {
    const n = i + g.seed * 3.47 + 101;
    const lane =
      (fract(n * 1.91) - 0.5 + (fract(n * 6.13) - 0.5)) * g.half * 1.2;
    const bearing = g.aim + lane;
    const rate = 1 + (fract(n * 3.53) - 0.5) * 2 * SPEED_SPREAD;
    const age = fract(fract(n * 2.09) + g.t * JET_CYCLES * rate * 0.8);
    // Smoke only exists where the fire has ALREADY gone out, so a puff younger
    // than the flames' own gutter has not been made yet.
    if (age < 0.62) continue;
    const life = (age - 0.62) / 0.38;
    const travel = age * (2 - age);
    const dist = g.reach * SMOKE_OVERRUN * travel;
    const off = projectOffset(
      Math.cos(bearing) * dist,
      Math.sin(bearing) * dist,
    );
    const rung = Math.min(
      SMOKE_FRAMES.length - 1,
      Math.floor(life * SMOKE_FRAMES.length),
    );
    const name = SMOKE_FRAMES[rung]!;
    const art = spriteByName(sprites, name);
    if (!art) continue;
    const spinDir = fract(n * 4.87) < 0.5 ? -1 : 1;
    const spun = spunSprite(
      art,
      name,
      spinBucket(spinDir * life * 0.6 * Math.PI * 2 + n),
    );
    // Thin as it goes, and never heavy: this is drawn OVER the fight, and smoke
    // the player cannot see through is smoke in the way.
    ctx.globalAlpha = 0.46 * (1 - life * life);
    ctx.drawImage(
      spun,
      Math.round(g.mx + off.x - spun.width / 2),
      // The rise is a TRUE SCREEN VERTICAL — up is up whatever the camera is
      // doing, so it is deliberately not put through the projection.
      Math.round(g.my + off.y - spun.height / 2 - life * SMOKE_RISE),
    );
  }
}
