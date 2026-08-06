// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SOMEBODY AT THE WHEEL — the drive's auto-driver.
//
// WHY IT IS IN THE ENGINE AND NOT THE SCREEN. Everything that wants to watch
// this road rather than play it is headless or nearly so: the attract loop, a
// `?bot=` playtest, the store-shot recipes, and the bench that finally measures
// what a minute of tarmac actually costs across the ladder. An app-side driver
// would serve exactly one of those. It also has to REPLAY — a drive is
// deterministic and a road that steered differently on the second run would
// take the whole guarantee down with it — and determinism is a property of the
// sim, so the decision belongs beside the sim.
//
// WHAT IT IS FOR is the same bar the run's own autopilot is held to (see the
// `bot-improvement` skill): the decisions a decent human makes, no artificial
// handicaps and no cheating either. It holds the throttle where the line ahead
// is clear, reads the road ACROSS rather than by lane so it finds the gap two
// bodies leave between them, treats another car as five people (a shunt does
// 2.6× the damage and can end the leg in three), and nurses a bent wagon home
// instead of trying to win a leg it has already lost. It arrives with bodies on
// the count, because everybody does — that is the joke, and a driver that
// threaded this road clean would be evidence the crowd was too thin.
//
// ── IT NEVER TOUCHES THE DICE ───────────────────────────────────────────────
// Not one `drive.rng()` draw, ever. The road's stream lays down every body,
// every variant and every wander phase in a fixed order, so a single draw spent
// on a steering decision would move every person the car meets after it — and a
// driver that changed the road by driving on it is not a driver, it is a second
// spawner. Everything below is read off the state or off the clock.
//
// ── AND IT IS A PARAMETER, NOT A MODE ───────────────────────────────────────
// `DriveState` knows nothing about this file. The driver is a small object the
// CALLER owns and hands back each tick (it holds only what hysteresis needs:
// the line it has committed to and when it took it), so a drive that is being
// driven by a person and a drive that is being driven by this are the same
// drive.

import { clamp } from "@game/lib/vec.ts";

import { DRIVE_BOT_OVERRIDES } from "../../generated/botTuning.ts";
import { CAR } from "../vehicles.ts";
import { DRIVE, DRIVE_OUTCOME } from "./config.ts";
import { laneAt, roadEdges } from "./crowd.ts";
import { laneRunsWithHero } from "./traffic.ts";
import {
  DRIVE_BOT_DEFAULTS,
  resolveDriveBotTuning,
  type DriveBotPatch,
  type DriveBotTuning,
} from "./driver-tuning.ts";
import { IDLE_DRIVE_INPUT, type DriveInput, type DriveState } from "./types.ts";

export {
  DRIVE_BOT_DEFAULTS,
  resolveDriveBotTuning,
  type DriveBotPatch,
  type DriveBotTuning,
};

/**
 * THE DRIVER — what it is thinking, which is almost nothing.
 *
 * A committed line and the moment it was taken. That is the whole memory, and
 * it exists for one reason: two gaps in a crowd are frequently within a
 * hair of each other, and an argmax with no memory trades between them every
 * tick and crabs down the road hitting both. `holdCost` and `lineCommitMs` are
 * the two halves of the fix.
 */
export type DriveDriver = {
  tune: DriveBotTuning;
  /** The world y he is steering for, or null before the first decision. */
  targetY: number | null;
  /** Drive-clock ms at which the current line was committed to. */
  committedMs: number;
};

/**
 * Take the wheel. The tuning is the shipped `content/bot.yaml` `drive:` block
 * unless a caller (a bench sweeping a knob, a test pinning one) says otherwise.
 */
export function createDriveDriver(patch?: DriveBotPatch): DriveDriver {
  return {
    tune: resolveDriveBotTuning({ ...DRIVE_BOT_OVERRIDES, ...patch }),
    targetY: null,
    committedMs: 0,
  };
}

/** The car's own half-width across the road — the same radius the impact model
 * measures its flank with, so the berth asked for here is the berth that
 * actually decides a collision. */
const CAR_HALF_W = CAR.footprint.radius;

/**
 * ONE TICK'S WORTH OF DRIVING — hand the result straight to `stepDrive`.
 *
 * Pure but for the driver's own two fields: given the same drive and the same
 * driver it answers the same thing, which is what lets a bench replay a seed
 * and get the leg it got last time.
 */
export function driveDriverInput(
  driver: DriveDriver,
  drive: DriveState,
): DriveInput {
  // A RESTART REWINDS THE CLOCK. `restartDrive` rebuilds the same seed's road
  // with `ms` back at zero and hands the same driver the wheel again, so the
  // line he was committed to belongs to a crowd that no longer exists and his
  // commit timer sits in the future — which would hold that dead line for the
  // whole of the first minute. A clock that went backwards is a new road.
  if (drive.ms < driver.committedMs) {
    driver.targetY = null;
    driver.committedMs = drive.ms;
  }

  // A finished road wants nothing: the wreck is coasting to a stop and the
  // arrival beat is a held picture. Steering either would be a man wrestling a
  // car that is no longer his problem.
  if (drive.outcome !== DRIVE_OUTCOME.driving) return IDLE_DRIVE_INPUT;

  const { tune } = driver;
  const { car } = drive;
  const speed = Math.abs(car.speed);

  // ── HOW FAR AHEAD HE CAN SEE ──────────────────────────────────────────────
  // Seconds of his own travel, floored so a nearly-stopped car still looks a
  // useful distance up the road, and capped at what the sim has actually laid
  // down: past `spawnAheadPx` there is nothing there YET, and reading further
  // would be reading an empty road as a clear one.
  const aheadPx = Math.min(
    DRIVE.spawnAheadPx,
    Math.max(DRIVE.laneWidth * 4, speed * tune.lookaheadSec),
  );
  const horizonSec = aheadPx / Math.max(1, speed);

  // ── PICK THE LINE ─────────────────────────────────────────────────────────
  const edges = roadEdges();
  let bestY = car.pos.y;
  let bestCost = Infinity;
  for (let y = edges.top; y <= edges.bottom; y += tune.probePitchPx) {
    const cost = lineCost(drive, tune, y, aheadPx, horizonSec);
    if (cost < bestCost) {
      bestCost = cost;
      bestY = y;
    }
  }
  const held = driver.targetY;
  const heldCost =
    held === null ? Infinity : lineCost(drive, tune, held, aheadPx, horizonSec);
  const mayChange = drive.ms - driver.committedMs >= tune.lineCommitMs;
  if (
    held === null ||
    (mayChange && bestCost < heldCost - tune.lineSwitchMargin)
  ) {
    driver.targetY = bestY;
    driver.committedMs = drive.ms;
  }
  const targetY = driver.targetY ?? bestY;
  const lineCostNow = targetY === bestY ? bestCost : heldCost;

  // ── THE WHEEL ─────────────────────────────────────────────────────────────
  const wheel = clamp((targetY - car.pos.y) / tune.steerGainPx, -1, 1);

  // ── THE PEDAL ─────────────────────────────────────────────────────────────
  // The car's top end is already cut by wear (`stepDrive`), so cruising at a
  // fraction of it is cruising at a fraction of what the wagon still has.
  const top = DRIVE.topSpeedPx * (1 - car.wear * DRIVE.wearTopSpeedLoss);
  let want = top * tune.cruiseFrac;
  // NURSE IT HOME. Past the ease point every further point of wear buys a
  // slower leg, because a car that breaks down has not arrived at all and the
  // clock it saved was spent twice over on the restart.
  if (car.wear > tune.wearEaseFrom) {
    const gone = Math.min(
      1,
      (car.wear - tune.wearEaseFrom) / Math.max(1e-3, 1 - tune.wearEaseFrom),
    );
    want *= 1 - (1 - tune.wearEaseFloor) * gone;
  }
  // A DIRTY LINE BUYS TIME, not a swerve: slowing widens every gap ahead in the
  // only currency that matters, which is how long there is to reach it.
  want *= 1 - tune.threatSlowFrac * Math.min(1, lineCostNow);
  // …but never a crawl. Slow is not safe on this road — the crowd LEADS the
  // car (`DRIVE.leadSeconds`), so a dawdling wagon is one they can all reach.
  want = Math.max(want, DRIVE.topSpeedPx * tune.floorFrac);

  // Bang-bang with a deadband, which is also how a person drives: foot down,
  // foot off, brake — never a millimetre of throttle modulation.
  const pedal = speed < want * 0.97 ? 1 : speed > want * 1.05 ? -1 : 0;
  return { pedal, wheel };
}

/**
 * WHAT THIS LINE DOWN THE ROAD WOULD COST — the whole of the read, and the one
 * function worth understanding here.
 *
 * It is deliberately SMOOTH rather than a blocked/clear verdict. A hard test
 * ("is anything within a car's width of this y") answers the same for a line
 * with a body dead on it and a line with one a whisker off the wing, so the
 * argmax picks the first clear sample rather than the WIDEST gap and the car
 * shaves everybody it passes. Falling off with clearance makes the best line
 * the middle of the biggest hole in the crowd, which is where a person would
 * put it.
 *
 * Everything is weighted by URGENCY — how soon the car is level with it — so a
 * knot of people a screen ahead shapes the line without overruling the body
 * about to be met, and the crossings read as the rhythm they are.
 */
function lineCost(
  drive: DriveState,
  tune: DriveBotTuning,
  y: number,
  aheadPx: number,
  horizonSec: number,
): number {
  const { car } = drive;
  const dir = drive.params.direction;
  const speed = Math.max(1, Math.abs(car.speed));
  let cost = 0;

  // WHOSE SIDE OF THE ROAD THIS IS. An oncoming lane closes at the sum of both
  // speeds, so it is somewhere to pass THROUGH — never somewhere to settle.
  if (!laneRunsWithHero(laneAt(y), dir)) cost += tune.oncomingCost;
  // …and leaving the line he is on is not free either.
  cost += (tune.holdCost * Math.abs(y - car.pos.y)) / DRIVE.laneWidth;

  const bodyNeed = tune.clearancePx + DRIVE.pedestrianRadiusPx + CAR_HALF_W;
  for (const ped of drive.pedestrians) {
    // A body already in the gutter is somebody else's morning.
    if (ped.mode !== "afoot") continue;
    const along = (ped.pos.x - car.pos.x) * dir;
    if (along <= 0 || along > aheadPx) continue;
    const eta = along / speed;
    // Where they will BE when the car gets there, not where they are standing.
    // The crowd leads the car and a body already walking across is a body that
    // will not be where it looks.
    const predY = ped.pos.y + ped.vel.y * eta;
    cost +=
      tune.bodyCost * proximity(predY - y, bodyNeed) * urgency(eta, horizonSec);
  }

  const carNeed = tune.clearancePx + CAR_HALF_W * 2;
  for (const other of drive.traffic) {
    const along = (other.pos.x - car.pos.x) * dir;
    if (along <= 0 || along > aheadPx * 2) continue;
    // How fast the gap is actually shutting. Traffic on the hero's own side
    // that he is not catching is not in the way at all; oncoming traffic closes
    // at the sum of both, which is why it is read twice as far out.
    const closing = (dir * car.speed - other.speed) * dir;
    if (closing <= 0) continue;
    const eta = along / closing;
    if (eta > horizonSec) continue;
    const predY = other.pos.y + other.slew * eta;
    cost +=
      tune.trafficCost *
      proximity(predY - y, carNeed) *
      urgency(eta, horizonSec);
  }
  return cost;
}

/** How much a thing this far off the line matters: 1 dead on it, 0 at twice the
 * berth asked for, and squared in between so the middle of a gap is genuinely
 * the cheapest place to be rather than merely tied. */
function proximity(offset: number, need: number): number {
  const reach = need * 2;
  const gap = Math.abs(offset);
  if (gap >= reach) return 0;
  const near = 1 - gap / reach;
  return near * near;
}

/** …and how much SOONER matters. Linear from 1 (about to happen) to 0 (at the
 * edge of what he can see). */
function urgency(eta: number, horizonSec: number): number {
  return Math.max(0, 1 - eta / Math.max(1e-3, horizonSec));
}
