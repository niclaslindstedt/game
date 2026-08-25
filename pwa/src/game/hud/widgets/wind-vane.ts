// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WIND VANE'S ARITHMETIC — how hard the wind is pushing and which way, how
// fast that reading catches up, how quickly the streaks blow past, and how hard
// the instrument is being shaken.
//
// A plain `.ts` leaf beside the widget rather than four functions inside it,
// for the reason every such leaf in this tree exists: a test under `tests/`
// cannot import a `.tsx` (the root tsconfig sets no `jsx`, so `make lint`
// refuses it while vitest happily passes), and this is the half of the vane
// worth asserting. The widget keeps the SVG and the animation frame.

/** How much of the gap to the reading the arrow closes each frame at 60 Hz.
 * Low enough to swell and fade rather than snap, high enough that a gust is not
 * news by the time the arrow admits it. It is also what smooths the binding's
 * own quantisation — `rocket.windFrac` arrives in 24 steps (`dials.ts`), and an
 * arrow that took them literally would tick like a clock. */
export const CHASE = 0.14;

/** Below this share of the profile's worst there is no direction worth
 * drawing: the arrow loses its head and the instrument reads as a flat bar,
 * which is what CALM looks like. An arrow pointing somewhere in still air is a
 * reading the player would act on. */
export const CALM_BELOW = 0.06;

/** Where the tremble starts, as a share of the profile's worst — the SHEAR
 * rung of the Lua ladder (`content/hud/scripts/rocket.lua`). Below it the air
 * is weather; above it, it is trying to take the ship. */
export const SHAKE_FROM = 0.55;

/** …and how far it throws the arrow at the very worst (px). Big, and meant to
 * be: this is the one warning on the HUD that costs no reading time at all, so
 * a jet stream has to look like something happening TO the ship rather than
 * like a dial with a nervous tick. The number under it stays perfectly still,
 * which is what keeps the reading legible while the picture comes apart. */
export const SHAKE_PX = 11;

/** …and how far it is twisted at the same moment (degrees, either way). An
 * arrow that only slides reads as a loose fitting; one that is also being
 * wrenched around reads as air trying to take it off the ship. */
export const SHAKE_SPIN_DEG = 12;

/** What the tremble is worth the INSTANT the shear line is crossed, as a share
 * of the worst. It steps rather than fading in from nothing: this is a
 * threshold alarm, and a warning that arrives so gently nobody can say when it
 * started is a warning that did not arrive. */
const SHAKE_ONSET = 0.3;

/** …and how sharply it climbs across the rest of the band. Squared rather than
 * straight, so SHEAR is a hard shiver and JET STREAM is the picture coming
 * apart — a linear ramp made the whole top half of the ladder look much the
 * same, which is the half where telling them apart matters. */
const SHAKE_CURVE = 2;

/** How fast the streaks blow past at the worst the profile deals, in units of
 * the SVG's own box per second. The arrow says where and how much; this is the
 * only part of the instrument that says it is HAPPENING. */
export const STREAK_MAX_SPEED = 46;

/** …and the crawl it keeps in air that is barely moving, so a live meter is
 * never mistaken for a frozen one. */
export const STREAK_MIN_SPEED = 4;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * WHICH WAY THE WIND IS BLOWING AND HOW HARD, as one signed reading: -1 is the
 * profile's worst pushing the ship to port, +1 the same to starboard, 0 dead
 * calm.
 *
 * `dir` is the shoulder the push is on (-1 / 0 / 1) and `frac` its share of the
 * worst. Two readings rather than one signed binding because that is what the
 * dials already publish, and the pair says exactly the same thing.
 */
export function windPush(dir: number, frac: number): number {
  return Math.sign(dir) * clamp01(frac);
}

/** One frame of the arrow catching up: it closes a share of the gap, so it
 * swells into a gust and falls away after it rather than blinking between two
 * readings. */
export function vaneStep(at: number, want: number): number {
  return at + (want - at) * CHASE;
}

/**
 * How hard the arrow is being thrown about, 0–1 across the band above the
 * shear line. Nothing at all below it — a tremble that is always on is a
 * tremble that says nothing — then a step onto `SHAKE_ONSET` and a squared
 * climb from there, so both facts land: that the air has just turned, and how
 * much worse than that it is getting.
 */
export function vaneShake(frac: number): number {
  const f = clamp01(frac);
  if (f <= SHAKE_FROM) return 0;
  const past = (f - SHAKE_FROM) / (1 - SHAKE_FROM);
  return SHAKE_ONSET + (1 - SHAKE_ONSET) * past ** SHAKE_CURVE;
}

/** …in px of throw. */
export function vaneShakePx(frac: number): number {
  return vaneShake(frac) * SHAKE_PX;
}

/** …and in degrees of twist. */
export function vaneShakeDeg(frac: number): number {
  return vaneShake(frac) * SHAKE_SPIN_DEG;
}

/** How fast the streaks travel, in box units per second, for a given share of
 * the worst. Never zero while there is any air at all: the streaks are what
 * make the picture read as wind rather than as an icon of one. */
export function streakSpeed(frac: number): number {
  const f = clamp01(frac);
  return STREAK_MIN_SPEED + f * (STREAK_MAX_SPEED - STREAK_MIN_SPEED);
}
