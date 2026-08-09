// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE DASHBOARD READS — one drive, turned into the handful of numbers the
// authored dials are resolved against (`content/hud/elements/drive_*.yaml`).
//
// IT IS ITS OWN MODULE BECAUSE THERE ARE TWO HOSTS. The minigame's screen
// publishes these, and so does the GALLERY's drivetrain exhibit — and a second
// copy of "how do you round the revs" is exactly how a display case ends up
// showing a dashboard the game does not have. Same rule the drain and the draw
// already follow (`loop.ts`): the two hosts share every function and disagree
// only about what is standing in front of the bumper.
//
// EVERYTHING CONTINUOUS IS QUANTISED, on purpose. A needle wants smooth, but
// each of these is a React publish: at sixty frames a second an unrounded rev
// counter would re-resolve the whole HUD every frame, for a change nobody can
// see. (A genuinely 60fps needle is a render-loop handle, the way the stamina
// bar is.)

import {
  driveDashUp,
  driveInCity,
  driveMph,
  engineRpm,
  gearFor,
  gearRev,
  rungTopSpeedPx,
  DRIVE,
  DRIVETRAIN,
  GEAR_COUNT,
  type DriveState,
} from "@game/core";

import type { DriveDials } from "../hud/bindings.ts";

/**
 * Where the damage readout stops being a scratch and starts being trouble.
 *
 * The wagon takes cosmetic knocks the whole way down, and a dial that alarmed
 * at the first one would teach the player to ignore it — so this is the point
 * where the next real hit ends the trip. What the dial DOES about it is the
 * content's call (`hud/scripts/drive.lua`); this is only the fact.
 */
export const FAILING_WEAR_PERCENT = 70;

/**
 * WHAT THE WAGON HAD BEFORE THE LAST FEW HITS — the anchor the damage dial's
 * fresh slice is measured from, and how long it has been held there.
 *
 * It is the XP strip's KILL HEAT, on the other dial and for the other reason
 * (`game-screen/event-fx.ts` — a kill lights the slice it just earned). Damage
 * on this road arrives as a number that ticks up while the player is busy
 * watching the crowd, and a percentage that is one point higher than it was is
 * a percentage nobody notices: the hit is the thing worth showing, so the arc
 * the last second put on is drawn in its own colour and only THEN folds into
 * the rest.
 */
export type WearTrail = {
  /** The wear the calm arc is drawn to and the FIGURE reads — behind the live
   * damage while a hit is fresh, then climbing to meet it. */
  settled: number;
  /** Drive-clock ms of the most recent hit. */
  hitMs: number;
  /** Where the climb started, and when — a catch-up is played out from these
   * rather than eased per tick, so it takes the same time however often the
   * host happens to ask. */
  fromWear: number;
  fromMs: number;
  /**
   * The live wear last time this was asked.
   *
   * A HIT IS A CHANGE IN THE DAMAGE, not a gap between the damage and the dial
   * — and telling the two apart is the whole of this field. Re-arming the hold
   * whenever `wear > settled` re-armed it on every frame of the climb, which
   * held the highlight lit for the rest of the trip and never let the figure
   * move.
   */
  lastWear: number;
};

export function createWearTrail(): WearTrail {
  return {
    settled: 0,
    hitMs: -Infinity,
    fromWear: 0,
    fromMs: -Infinity,
    lastWear: 0,
  };
}

/**
 * How long the fresh slice stays lit after the last hit (ms).
 *
 * A second, which is the XP strip's own figure and about the shortest beat a
 * player can be relied on to catch out of the corner of an eye while steering.
 * CHAINED HITS EXTEND IT rather than restarting the highlight from the new
 * total, exactly as a kill streak extends the XP heat — drive into a crowd and
 * the whole cost of that crowd lights up as one slice.
 */
const WEAR_HOT_MS = 1000;

/**
 * …and how long it then takes to catch up (ms).
 *
 * THE FIGURE COUNTS UP WITH THE ARC, which is the whole reason this is a tween
 * in here rather than a CSS transition on the arc alone: a dial whose ring
 * glided while its percentage snapped read as two readouts disagreeing. Both
 * are drawn from `wearSettled`, so the number ticks 1% at a time round the
 * sweep and lands exactly as the arc does.
 */
const WEAR_CATCH_MS = 420;

/** This instant's dashboard. */
export function driveDials(
  drive: DriveState,
  paused: boolean,
  /** The damage dial's fresh-slice anchor, carried by the host across ticks.
   * Omitted (a still shot, a test) draws the dial with nothing lit. */
  trail?: WearTrail,
): DriveDials {
  // THE FACE IS THE RUNG'S, NOT THE CAR'S. The gentle rungs cap the wagon well
  // short of its own top end (`rungTopSpeedPx`), and a speedometer still drawn
  // to 174 on a road that stops at 120 would leave the needle dying two thirds
  // of the way round every straight — which reads as a broken car rather than
  // as a kind road. So the dial's last figure and the arc it sweeps are both
  // what this rung actually allows; `mph` underneath is the same real miles an
  // hour it always was, because the world does not change size with the rung.
  const topSpeedPx = rungTopSpeedPx(drive.params.difficulty);
  const speedFrac = Math.min(1, Math.abs(drive.car.speed) / topSpeedPx);
  // The gearbox and the crank, read straight off the drivetrain the physics is
  // using this tick — the same functions the engine note is voiced from
  // (`sfx/drive.ts`), so the tachometer and the speaker cannot disagree.
  const speed = drive.car.speed;
  const wearPercent = Math.round(drive.car.wear * 100);
  const wear = wearPercent / 100;
  return {
    mph: driveMph(drive),
    topSpeedMph: Math.round(
      (topSpeedPx / DRIVE.topSpeedPx) * DRIVE.topSpeedMph,
    ),
    speedFrac: Math.round(speedFrac * 64) / 64,
    gear: gearFor(speed),
    gearCount: GEAR_COUNT,
    rev: Math.round(gearRev(speed) * 16) / 16,
    rpm: Math.round(engineRpm(speed) / 50) * 50,
    shiftUpRpm: DRIVETRAIN.shiftUpRpm,
    redlineRpm: DRIVETRAIN.redlineRpm,
    reversing: drive.car.speed < 0,
    bodies: drive.bodies,
    // THE STOPWATCH. Published in TENTHS rather than raw, which is the same
    // rule every continuous dial on this dashboard follows and matters most
    // here: a clock republished on the millisecond would re-resolve the whole
    // HUD sixty times a second for a digit nobody can read, and the figure the
    // player is watching only ever changes ten times a second anyway.
    clockMs: Math.floor(drive.clockMs / 100) * 100,
    // …and whether it is RUNNING, which is a different fact from the time being
    // non-zero: the clock reads its final figure for the whole run-in, and a
    // dashboard wants to be able to say so (stop flashing it, dim it, print
    // FINISH under it) without inferring it from a number that has stopped
    // moving.
    clockRunning: driveInCity(drive),
    // …and whether it exists on screen AT ALL, which is a third fact again: the
    // clock arrives with the town and then stays, holding its final figure
    // through the run-in. The opening has nothing over it.
    clockStarted: drive.cityDone,
    // …and whether the DASHBOARD is up, which arrives before either of them:
    // the instruments settle a short way out of town so they are not landing on
    // the same frame the clock starts on.
    dashLive: driveDashUp(drive),
    wear,
    wearSettled: settledWear(drive, wear, trail),
    failing: wearPercent > FAILING_WEAR_PERCENT,
    paused,
  };
}

/**
 * The wear the CALM arc and the FIGURE are drawn to — where the dial stood
 * before the last second's hits while those are still lit, then climbing to
 * meet the live damage over `WEAR_CATCH_MS`.
 *
 * The trail is advanced here rather than by the host, because the answer and
 * the bookkeeping are the same question and a host that forgot to tick it would
 * leave the highlight lit for the rest of the trip. A wagon that has somehow got
 * BETTER (a restart lays a fresh car) snaps rather than animating down.
 */
function settledWear(
  drive: DriveState,
  wear: number,
  trail: WearTrail | undefined,
): number {
  if (!trail) return wear;
  const hit = wear > trail.lastWear;
  trail.lastWear = wear;
  if (wear < trail.settled) {
    trail.settled = wear;
    trail.fromWear = wear;
  } else if (hit) {
    // A fresh hit: hold where the dial is, and start any climb from HERE rather
    // than from wherever the last one began.
    if (drive.ms - trail.hitMs > WEAR_HOT_MS) trail.fromWear = trail.settled;
    trail.hitMs = drive.ms;
    trail.fromMs = drive.ms + WEAR_HOT_MS;
  }
  const climbed = (drive.ms - trail.fromMs) / WEAR_CATCH_MS;
  if (climbed >= 1) trail.settled = wear;
  else if (climbed > 0) {
    // Ease out: quick off the mark and settling onto the figure, which is what
    // makes a counter read as arriving somewhere rather than as scrolling.
    const t = 1 - Math.pow(1 - climbed, 3);
    trail.settled = trail.fromWear + (wear - trail.fromWear) * t;
  }
  // Quantised finer than the figure it feeds (which is whole percent), so the
  // arc sweeps smoothly while the number still only ever changes by one.
  return Math.min(wear, Math.round(trail.settled * 1000) / 1000);
}

/** Have any of the dials actually moved? Compared field by field rather than by
 * a key string: this runs every frame of a drive. */
export function sameDials(a: DriveDials, b: DriveDials): boolean {
  return (
    a.mph === b.mph &&
    a.speedFrac === b.speedFrac &&
    a.gear === b.gear &&
    a.rev === b.rev &&
    a.rpm === b.rpm &&
    a.reversing === b.reversing &&
    a.bodies === b.bodies &&
    a.clockMs === b.clockMs &&
    a.clockRunning === b.clockRunning &&
    a.clockStarted === b.clockStarted &&
    a.dashLive === b.dashLive &&
    a.wear === b.wear &&
    a.wearSettled === b.wearSettled &&
    a.failing === b.failing &&
    a.paused === b.paused
  );
}
