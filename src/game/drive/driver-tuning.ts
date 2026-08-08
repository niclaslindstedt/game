// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AUTO-DRIVER'S KNOBS — the numbers `driver.ts` reads, and nothing else.
//
// A LEAF ON PURPOSE, exactly like `src/game/bot/tuning.ts` beside it: the
// bot.yaml generator imports this module to learn what a knob is CALLED before
// it writes the file the driver reads, so anything this file imported would be
// dragged into that bootstrap. It has no imports and it never will.
//
// WHY THE KNOBS LIVE IN `content/bot.yaml` rather than as constants in the
// driver: the drive is the one part of the game a tuning pass cannot judge by
// eye — a road that reads fine over thirty seconds is a road that breaks the car
// four times out of ten over a whole leg, and the only way to know is to drive a
// few hundred of them (`make drive-bench`). That loop wants the knobs somewhere
// a person can move them without recompiling their meaning, which is the same
// argument that put the run autopilot's knobs there. Same file, its own block.

/**
 * WHAT THE AUTO-DRIVER IS TOLD. Distances are world px, times are seconds
 * unless the name says ms, and every `*Cost` is in the same arbitrary unit as
 * every other — only their RATIOS mean anything, which is why they are here
 * together rather than scattered.
 */
export type DriveBotTuning = {
  /**
   * HOW FAR AHEAD HE READS THE ROAD, in seconds of his own travel. The whole
   * character of the driver is in this one number: short and he threads the gap
   * in front of the bumper and is surprised by the crossing behind it; long and
   * he commits to a lane a screen early and cannot answer what walks into it.
   *
   * It is clamped by what the road actually KNOWS — the sim only populates
   * `DRIVE.spawnAheadPx` ahead of the car — so raising it past about two
   * seconds at the top end buys nothing but a slower scan.
   */
  lookaheadSec: number;
  /** How finely the road is sampled ACROSS (world px between candidate lines).
   * Finer finds the gap between two bodies standing a metre apart; coarser is
   * cheaper and steadier. A whisker under a person's diameter is the useful
   * floor. */
  probePitchPx: number;
  /** The berth he asks for beside anything he is not planning to hit (world
   * px), on top of both bodies' own radii. This is the difference between
   * clipping the crowd and threading it. */
  clearancePx: number;
  /** What a person standing on the chosen line is WORTH avoiding. The unit for
   * everything below. */
  bodyCost: number;
  /**
   * …and a LAMP POST, which is the one obstacle on this road that does not
   * move, does not flinch, and cannot be read as "he might step back".
   *
   * It sits between a body and a car, and nearer the car: a post costs about
   * three people's worth of wagon in one hit (`DRIVE_UNITS.lampPostMassKg`),
   * and unlike a person it is exactly where it looked. A driver blind to them
   * settles in the gutter — which is the emptiest-looking line on a road this
   * peopled, and the one that grinds a lamp standard every hundred pixels
   * until the car dies. That is not hypothetical: the first bench after the
   * kerb became solid arrived 0 legs out of 60 on every rung.
   *
   * A PARKED CAR uses `trafficCost` instead, because it is a car — and it is
   * the worse of the two, since it is met at the hero's whole speed rather than
   * the difference.
   */
  propCost: number;
  /** …and another car, which is far worse: a shunt does 2.6× the damage of a
   * body (`DRIVE.impact.trafficWearScale`) and can end the leg in three. */
  trafficCost: number;
  /** What sitting in a lane that runs the OTHER way costs. High: an oncoming
   * lane closes at the sum of both speeds, so it is a place to pass through and
   * never a place to settle. */
  oncomingCost: number;
  /** What LEAVING the line he is on costs, per lane-width of travel. The
   * anti-weave: without it the argmax jitters between two nearly-equal gaps and
   * the car crabs down the road hitting both. */
  holdCost: number;
  /** The least time between committed line changes (ms) — the second half of
   * the anti-weave, and the one that survives a genuinely better gap opening
   * every tick. */
  lineCommitMs: number;
  /** How much better a new line has to score before he takes it. */
  lineSwitchMargin: number;
  /** The lateral error (world px) that asks for full wheel. Small = snappy and
   * prone to overshoot; large = a lazy drift across the lane. */
  steerGainPx: number;
  /**
   * The speed he settles at on a CLEAR road, as a fraction of the car's current
   * top (which is itself cut by wear).
   *
   * IT WAS 1 — FLAT OUT — AND THAT WAS RIGHT WHILE THE DIAL STOPPED AT 120. The
   * argument then was that `threatSlowFrac` buys the time to thread a crowd
   * where the crowd is, so a blanket cruise under the top end pays for the whole
   * leg to insure the busy fifth of it; measured, dropping it to 0.9 cost six
   * seconds a leg on every rung and saved nothing.
   *
   * THE RE-ENGINED CAR MOVED THE ARGUMENT RATHER THAN THE REASONING. Damage
   * goes as the SQUARE of the closing speed, so a leg driven flat out at 174
   * carries a bit over twice the energy of one driven flat out at 120 — and the
   * bench went from arriving on every rung to breaking the car on most of them,
   * without a single damage number moving. The far end of the dial is now a
   * RISK a player may take on an empty straight, and a competent driver with a
   * town to get through does not take it: he settles at about 120, which is
   * where this wagon used to live and is still quick enough to hurt.
   *
   * Left in the driver rather than in `content/bot.yaml` because it is a fact
   * about the CAR — anybody re-gearing it again has to come past this line.
   */
  cruiseFrac: number;
  /** How hard a dirty line ahead backs the throttle off — the fraction of the
   * cruise speed a fully-blocked line gives up. Slowing is how a driver buys
   * time to thread rather than the brake being a failure. */
  threatSlowFrac: number;
  /** …and the floor he will never go below (fraction of the absolute top),
   * whatever the road looks like. A crawling car is a car the crowd simply
   * walks into: on this road, slow is not safe.
   *
   * MOVED WITH THE DIAL AND NOT WITH THE DRIVER. It was 0.34 of a 120 mph top —
   * about forty miles an hour — and a fraction of a 174 mph one is a different
   * speed entirely, so the number came down to keep the floor where it was. The
   * driver's caution did not change; the thing it was measured against did. */
  floorFrac: number;
  /** The wear fraction past which he stops trying to win the leg and starts
   * trying to FINISH it. */
  wearEaseFrom: number;
  /** …and how much of the cruise speed is left by the time the car is at the
   * point of failing. */
  wearEaseFloor: number;
};

/** Every knob a `bot.yaml` `drive:` block may bend — all of them, all optional. */
export type DriveBotPatch = Partial<DriveBotTuning>;

/**
 * The shipped driver. These are the numbers `make drive-bench` was measured on;
 * moving one is a measurement, not an opinion.
 */
export const DRIVE_BOT_DEFAULTS: DriveBotTuning = {
  lookaheadSec: 1.6,
  probePitchPx: 4,
  clearancePx: 6,
  bodyCost: 1,
  propCost: 3,
  trafficCost: 5,
  oncomingCost: 3,
  holdCost: 0.5,
  lineCommitMs: 260,
  lineSwitchMargin: 0.25,
  steerGainPx: 10,
  cruiseFrac: 0.69,
  threatSlowFrac: 0.5,
  floorFrac: 0.23,
  wearEaseFrom: 0.5,
  wearEaseFloor: 0.55,
};

/** One partial layer over the shipped defaults. */
export function resolveDriveBotTuning(patch?: DriveBotPatch): DriveBotTuning {
  return patch ? { ...DRIVE_BOT_DEFAULTS, ...patch } : DRIVE_BOT_DEFAULTS;
}
