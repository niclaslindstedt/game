// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE LEG WAS WORTH — the drive's arcade score, and the tally the
// high-score screen prints on the way to it.
//
// IT IS THE SECOND OF THE ROAD'S TWO END-OF-TRIP READINGS, and the pair are
// deliberately different questions asked of the same five numbers. `driveVerdict`
// (./index.ts) asks what the HERO made of the journey and answers with a line he
// says — the car, the clock, the other drivers, the council's lighting, and
// never a person. This asks what the CABINET made of it and answers with a
// number. They agree about what matters, because they are the same joke: the
// body count is on the card and it is worth nothing.
//
// IN THE ENGINE, beside the verdict it is twinned with, for the same two
// reasons that one is: a headless drive (`make drive-bench`, a balance pass, a
// soak) can ask what a leg was worth without a renderer, and the tests pin the
// arithmetic without mounting a screen. The app half is only the BOARD — where
// the number is kept and how it is entered (`pwa/src/game/drive-scores.ts`).
//
// NOT A SCRIPTING HOOK, and that is a decision rather than an oversight. The
// scripting seam's rule is that a hook reads its own static tuning out of
// `game.config` (see `script/bindings.ts`), and the drive's knob tree is
// deliberately NOT there: `DRIVE` lives beside the road in ./config.ts because
// the whole minigame is run-facing and must never be reachable from the startup
// path's budget. Wiring it into the sandbox's config view to pay for a
// scoreboard would spend that allowance on an interlude. So this sits exactly
// where `driveVerdict` sits, which is the nearest thing in the codebase to it —
// a whole-trip judgement, read once, in TypeScript, tunable from `DRIVE.score`.

import { cityLength, DRIVE } from "./config.ts";
import type { DriveState } from "./types.ts";

/**
 * The tally, itemised — every line the results card prints, plus the trip's own
 * numbers behind them.
 *
 * The BREAKDOWN is carried rather than recomputed by the screen because an
 * arcade end-of-game screen counts its bonuses up one at a time, and a card that
 * re-derived each line would be the formula written twice.
 */
export type DriveScorecard = {
  /** The number that goes on the board: the sum, floored at zero and rounded to
   * `DRIVE.score.round`. */
  score: number;

  // ── WHAT IT IS MADE OF ────────────────────────────────────────────────────
  /** Flat, for arriving. */
  arrival: number;
  /** Per second under par. Zero for a leg that took longer than par. */
  time: number;
  /** For the fastest the wagon went. */
  speed: number;
  /** For the paint still on it. */
  paint: number;
  /** What the lamp posts and the shoved cars cost, as a POSITIVE number the
   * card prints with a minus in front of it. */
  damage: number;

  // ── AND WHAT THE TRIP ACTUALLY WAS ────────────────────────────────────────
  /** The trip time (ms). */
  ms: number;
  /** Par for this leg's length (ms) — what the time bonus was measured
   * against. */
  parMs: number;
  /** The fastest it went, in the unit the dashboard says out loud. */
  topSpeedMph: number;
  /** How much of the wagon is gone, 0–100. */
  wearPercent: number;
  /** People hit. ON THE CARD AND WORTH NOTHING — see `DRIVE.score`. */
  bodies: number;
  /** Cars shoved. */
  shunts: number;
  /** Street lights felled. */
  posts: number;
};

/**
 * Par for a leg of this length (ms) — derived from the road rather than fixed,
 * so the attract loop's short course is scored against its own length.
 *
 * IT IS THE TOWN'S LENGTH AND NOT THE COURSE'S, because the town is what the
 * clock runs over (`cityLength`, and `DriveState.clockMs` beside it). Measured
 * against the whole course, par would include an approach the player is not
 * allowed to hurry and a run-in he does not drive, and every leg would come in
 * comfortably under it for nothing.
 */
export function drivePar(params: {
  coursePx?: number;
  cityPx?: number;
}): number {
  return (cityLength(params) / DRIVE.score.parSpeedPx) * 1000;
}

/**
 * HOW LONG THE TRIP ACTUALLY TOOK (ms) — the stopwatch in the corner of the
 * screen, from the town's gate to the finish line.
 *
 * IT IS THE ROAD'S OWN FIELD NOW (`DriveState.clockMs`) rather than a
 * subtraction off `ms`, and the difference is the whole of what the leg became.
 * `ms` is the ROAD's lifetime: it has been running since the first frame of an
 * opening the player cannot hurry — an empty stretch of outskirts with the car
 * sliding into it — and it goes on running through a run-in nobody drives. What
 * a driver would read off a stopwatch is the TOWN, which is exactly the stretch
 * the minigame is, and is the number the board ranks.
 *
 * The accessor stays because every caller wants "the trip time" without caring
 * where it is kept, and because a leg that has not reached the gate yet is
 * honestly zero rather than nearly-zero.
 */
export function driveTripMs(drive: DriveState): number {
  return Math.max(0, drive.clockMs);
}

/**
 * WHAT THIS LEG WAS WORTH, itemised.
 *
 * Called once, on a finished drive. It reads the whole journey and spends no
 * `drive.rng()` draw — a score that consumed one would shift the road it was
 * scoring, which is the same rule everything else on this tarmac obeys.
 */
export function driveScore(drive: DriveState): DriveScorecard {
  const S = DRIVE.score;
  const parMs = drivePar(drive.params);
  const tripMs = driveTripMs(drive);
  // FLOORED AT ZERO, not signed: par is a bonus a good driver earns, never a
  // penalty a slow one pays. A dawdler simply collects nothing here, which is
  // punishment enough on a board that ranks by total.
  const underS = Math.max(0, (parMs - tripMs) / 1000);
  const topSpeedMph = Math.round(
    (drive.topSpeed / DRIVE.topSpeedPx) * DRIVE.topSpeedMph,
  );
  // The wagon's wear runs past 1 on the way to a breakdown, so the paint bonus
  // clamps rather than going negative — a written-off car is worth nothing, not
  // worth less than nothing.
  const intact = Math.max(0, 1 - Math.min(1, drive.car.wear));

  const arrival = S.arrival;
  const time = Math.round(underS * S.perSecondUnderPar);
  const speed = Math.round(topSpeedMph * S.perTopMph);
  const paint = Math.round(intact * S.paint);
  const damage = drive.posts * S.perPost + drive.shunts * S.perShunt;

  const raw = arrival + time + speed + paint - damage;
  const score = Math.max(0, Math.round(raw / S.round) * S.round);

  return {
    score,
    arrival,
    time,
    speed,
    paint,
    damage,
    ms: tripMs,
    parMs,
    topSpeedMph,
    wearPercent: Math.round(Math.min(1, drive.car.wear) * 100),
    bodies: drive.bodies,
    shunts: drive.shunts,
    posts: drive.posts,
  };
}
