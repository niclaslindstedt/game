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
// ALMOST EVERYTHING CONTINUOUS IS QUANTISED, on purpose. Each of these is a
// React publish: at sixty frames a second an unrounded dial would re-resolve
// the whole HUD every frame, for a change nobody can see. (A genuinely 60fps
// needle is a render-loop handle, the way the stamina bar is.)
//
// THE CRANK IS THE EXCEPTION, and it earns it. Quantisation is invisible on an
// ARC and very visible on a FIGURE, and the rev counter is the one continuous
// value on this dashboard that is PRINTED as well as swept — so a step big
// enough to be free was a step big enough to read as a broken instrument. It is
// published whole; see `rpm` below for what that costs.

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

import { lapClock } from "@ui/lib/format-number.ts";

import type { HudValues } from "../hud/bindings.ts";

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
 *
 * IT IS THE ARC'S ALONE. The figure in the middle of the dial reads the live
 * wear and always has the current number; this exists so the RING can say which
 * part of its own sweep the last second is responsible for.
 */
export type WearTrail = {
  /** The wear the calm arc is drawn to — behind the live damage while a hit is
   * fresh, then climbing to meet it. The FIGURE is not drawn from this: it
   * reads the live wear, so the percentage moves on the tick the hit lands. */
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
 * A TWEEN IN HERE RATHER THAN A CSS TRANSITION ON THE ARC, because the anchor
 * has to be a NUMBER the whole dial can be resolved against: the fresh slice is
 * drawn from `wear` and the calm one from this, and a glide that lived in the
 * stylesheet would leave the two arcs with no shared account of where the
 * highlight currently ends.
 *
 * THE FIGURE NO LONGER WAITS FOR IT. The percentage is bound to the LIVE wear
 * (`content/hud/elements/drive_damage.yaml`) — a hit felt through the wheel has
 * to be on the dashboard by the time the player's eyes get there, and the
 * fresh arc is already the whole answer to which part of the sweep is new.
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
  // (`drive-screen/engine-note.ts`), so the tachometer and the speaker cannot disagree.
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
    // THE CRANK IS THE ONE CONTINUOUS DIAL PUBLISHED WHOLE, and it is an
    // exception to the rule above it rather than an oversight. It was quantised
    // to fifty, which is invisible on the ARC and very visible on the FIGURE:
    // the tacho's last two digits could only ever read 00 or 50, so a needle
    // sweeping the whole face was printed as a number stepping in hundreds, and
    // a rev counter that moves in hundreds reads as a rev counter that is
    // broken. The cost is real and bounded — the dials republish on every frame
    // the throttle is doing anything, rather than the ~30 times a second a
    // 50-rpm step allowed — and it buys the one readout on this dashboard whose
    // whole job is to be seen climbing.
    rpm: Math.round(engineRpm(speed)),
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
/**
 * THE ROAD'S DIALS. The drive minigame publishes its own handful of values and
 * nothing else — a drive has no hero, no bag and no horde — so its bindings are
 * built from the wagon rather than from a HUD snapshot.
 *
 * `failing` is the one judgement-shaped entry, and it is deliberately still a
 * read: WHERE the line sits is the Lua script's call (`drive.damage_color`), and
 * this only answers whether the wagon is past the point the engine itself treats
 * as trouble.
 *
 * IT PUBLISHES MORE THAN THE SHIPPED DASHBOARD READS, on purpose — the top end,
 * the gear count, the revs both ways. A dial that had to wait for the app to
 * start publishing its number would be a dial nobody could author, and they
 * cost one object per publish.
 *
 * THE CRANK IS PUBLISHED TWICE AND BOTH ARE READS. `rpm` is the number a
 * tachometer PRINTS and `rpmFrac` is the arc it SWEEPS, and neither is a
 * judgement: where the needle goes red, what the gate says at a standstill and
 * when the damage dial starts shouting are all the Lua's call
 * (`hud/scripts/drive.lua`).
 */
export type DriveDials = {
  mph: number;
  /** The wagon's authored top end, so a dial can print its own last number. */
  topSpeedMph: number;
  /** Road speed over that top end. */
  speedFrac: number;
  /** The engine's own gear reading, counting from zero. */
  gear: number;
  /** How many gears there are — the gate a gearbox draws. */
  gearCount: number;
  /** How far up THIS gear the wagon is: the revs. */
  rev: number;
  /** What the crank is actually turning at. */
  rpm: number;
  /** …where the box lets go of it and changes up. */
  shiftUpRpm: number;
  /** …and where it would stop being asked to — the tacho's last number, and a
   * limit rather than a target: the box hands over well short of it. */
  redlineRpm: number;
  reversing: boolean;
  bodies: number;
  /** THE STOPWATCH — ms of TOWN, which is the stretch the leg is scored over
   * (`DriveState.clockMs`). Quantised to tenths by the publisher, because that
   * is the last digit anybody reads off a moving car. */
  clockMs: number;
  /** …and whether it is still running. Distinct from the time being non-zero:
   * the clock holds its final figure through the whole arrival. */
  clockRunning: boolean;
  /** …and whether the leg has reached the town at all, which is what decides
   * whether there is a clock on screen. */
  clockStarted: boolean;
  /** …and whether the DASHBOARD is up. A third moment again, and the earliest:
   * the instruments arrive a short way BEFORE the town so they are settled by
   * the time the clock starts (`driveDashUp`). */
  dashLive: boolean;
  /** 0..1 — how worn the wagon is. */
  wear: number;
  /** …and how worn it was before the last second's hits — the anchor the
   * damage dial's FRESH slice is drawn from. Level with `wear` whenever nothing
   * has just happened. */
  wearSettled: number;
  failing: boolean;
  paused: boolean;
};

export function driveBindings(drive: DriveDials): HudValues {
  return {
    "drive.mph": Math.round(drive.mph),
    "drive.topSpeedMph": Math.round(drive.topSpeedMph),
    "drive.speedFrac": Math.max(0, Math.min(1, drive.speedFrac)),
    "drive.gear": drive.gear,
    // The dial counts from one, the engine counts from zero. Done here rather
    // than in the text, so an authored line never has to do arithmetic.
    "drive.gearLabel": drive.gear + 1,
    "drive.gearCount": drive.gearCount,
    "drive.rev": Math.max(0, Math.min(1, drive.rev)),
    "drive.rpm": Math.round(drive.rpm),
    "drive.shiftUpRpm": Math.round(drive.shiftUpRpm),
    "drive.redlineRpm": Math.round(drive.redlineRpm),
    // The tacho's own sweep — the crank against the LAST NUMBER ON THE FACE,
    // which is the redline and not the shift point. Worked out here rather than
    // authored as a division in every dial that wants it, and clamped, because
    // a rev limiter is a thing the engine has and an arc past its own end is
    // not. On the shipped wagon it tops out around two thirds: the box changes
    // up a thousand revs early, so the paint at the end of the dial is
    // something the player is shown rather than something they reach.
    "drive.rpmFrac": Math.max(
      0,
      Math.min(1, drive.redlineRpm > 0 ? drive.rpm / drive.redlineRpm : 0),
    ),
    // …and the crank against where the box will LET GO of it, which is the
    // reading a driver actually has: 1 is the upshift, and the approach to it is
    // the only thing on this dial worth warning about.
    "drive.shiftFrac": Math.max(
      0,
      Math.min(1, drive.shiftUpRpm > 0 ? drive.rpm / drive.shiftUpRpm : 0),
    ),
    "drive.reversing": drive.reversing,
    "drive.bodies": drive.bodies,
    // THE STOPWATCH, both ways round. The TEXT is what a dial prints and is
    // formatted here rather than in Lua — a clock is a format, not a judgement,
    // and a script that had to do the tenths would be four lines of arithmetic
    // in every conversion that wanted a timer. The MS is beside it so a judgement
    // that IS one (is this a good time, is it about to be a record) has a number
    // to work with.
    "drive.clock": lapClock(drive.clockMs),
    "drive.clockMs": Math.round(drive.clockMs),
    "drive.clockRunning": drive.clockRunning,
    "drive.clockStarted": drive.clockStarted,
    "drive.dashLive": drive.dashLive,
    "drive.wear": Math.max(0, Math.min(1, drive.wear)),
    "drive.wearSettled": Math.max(
      0,
      Math.min(1, Math.min(drive.wearSettled, drive.wear)),
    ),
    "drive.wearPercent": Math.round(100 * drive.wear),
    "drive.failing": drive.failing,
    "drive.paused": drive.paused,
  };
}
