// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A CRASHED CAR SITS INSIDE — the cloud that goes up when a vehicle leaves
// its wheels, follows it while it grinds down the tarmac, and hangs over it
// after it has stopped.
//
// WHY IT IS A WALK OF THE ROAD RATHER THAN AN ANSWER TO AN EVENT. The engine
// raises `trafficRolled`, `machineDown` and `trafficWrecked` exactly once each,
// on the tick the thing happened — which is the right shape for a noise and the
// wrong shape for a cloud. A wreck is not an instant: it goes over, it slides
// the better part of a hundred px, it stops, and it sits there for the rest of
// the leg. A single burst fired on the event stands over the spot the roll
// STARTED and the wreck slides out from under it, which is the identical bug
// the hero's own breakdown smoke was given `DriveFx.follow` to fix. So this
// reads the road's own state every tick and issues where the vehicle IS.
//
// EVERYTHING HERE IS PRESENTATION and the drive plays identically without it —
// the same fence `drive-fx.ts` and `skid.ts` are drawn along. It walks
// `drive.traffic` for the same reason `stepSkids` reads `drive.car`: the fact
// that a car is on its roof and no longer moving is a fact the SIM owns, and
// re-deriving it out here from the events would be a second answer to a settled
// question.
//
// IT RUNS ON THE DRIVE'S OWN CLOCK, inside the fixed step, so a slow frame
// raises the same cloud a fast one does and a road frozen behind a monologue
// raises none.

import { vehicleDef, type DriveState, type DriveTraffic } from "@game/core";

import {
  driveWreckDust,
  driveWreckSmoke,
  type DriveFxState,
} from "./drive-fx.ts";

/**
 * HOW OFTEN A VEHICLE STILL SLIDING LETS GO OF A CLOUD (drive-clock ms).
 *
 * Fast, because this is the emission that has to cover GROUND: a car goes over
 * at 300 px/s and the puffs have to overlap into a continuous wall of dust
 * behind it rather than a dotted line of separate puffs, which is the same
 * cadence problem the skid marks solve by measuring in distance. Time is the
 * right unit here because the cloud a slide raises is proportional to how long
 * the tarmac has been scrubbing it, not to how far it got.
 */
const GRIND_EVERY_MS = 90;
/**
 * …ONCE IT HAS STOPPED AND THE DUST IT RAISED IS STILL COMING DOWN.
 *
 * Slower than the grind but not much, and that ratio is the thing worth getting
 * right rather than either number. A slide lays its clouds along a hundred px
 * of road, so they are spread thin by the travel; a wreck at rest lays them all
 * at ONE spot, and at a quarter of the cadence the trail was denser than the
 * pall — which reads as a car that skidded through some smoke and came out the
 * far side of it, rather than a car sitting in its own.
 */
const SETTLE_EVERY_MS = 150;
/** …and the dead engine afterwards, which is a wisp rather than a cloud. */
const IDLE_EVERY_MS = 900;

/** How long the settling lasts before the wreck is just a wreck (ms). */
const SETTLE_MS = 2200;

/** Under this much travel a downed vehicle counts as stopped (px/s). Above
 * this much, its cloud is at full force — a moped scraping along at walking
 * pace raises nothing like what a rolling estate does. */
const GRIND_MIN_PX = 12;
const GRIND_FULL_PX = 220;

/**
 * HOW FAR EITHER SIDE OF THE WAGON A WRECK KEEPS SMOKING (world px).
 *
 * The idle smoulder is unbounded in time — a car finished at the town gate is
 * still finished at the finish line — so it has to be bounded in SPACE or the
 * road ends the leg issuing puffs for every vehicle the player destroyed on the
 * way, none of which is in the picture. Measured off the hero rather than off
 * the camera on purpose: this module runs inside the fixed step and the camera
 * is a thing the frame has, and asking the sim's own tick what the renderer can
 * see is how the two end up disagreeing at different frame rates.
 *
 * Generous — comfortably past the far edge of the reference viewport — because
 * the failure it guards against is cost, not correctness, and a cloud that
 * blinked on as it came into frame would be far worse than a few wasted puffs.
 */
const NEAR_PX = 520;

/**
 * ONE TICK OF EVERY WRECK ON THE ROAD.
 *
 * Called from `drainDrive` beside the skids, inside the fixed step and on the
 * drive's own clock.
 */
export function stepWreckSmoke(state: DriveFxState, drive: DriveState): void {
  const live = new Set<number>();
  for (const other of drive.traffic) {
    if (!other.downed && !other.wrecked) continue;
    live.add(other.id);
    const book = state.wrecks.get(other.id);
    if (!book) {
      // THE MOMENT IT WENT OVER: one cloud at full force, the whole vehicle
      // inside it. Raised here rather than off `trafficRolled` because this
      // walk is also what catches the two cases no event covers — a vehicle
      // wrecked while already down, and a road restored from a state the app
      // never saw the collisions for (the effects gallery's exhibits).
      //
      // ONLY FOR ONE THAT HAS GONE OVER, though. A car merely FINISHED is
      // still on its wheels and still rolling; what it does is die and coast,
      // which is a dead engine's column and no dust at all — there is nothing
      // grinding on the road to raise any. It falls through to the cadence
      // below and gets exactly that, and if a later blow puts it over it
      // starts throwing dust then, which is when it earns it.
      state.wrecks.set(other.id, {
        dueMs: drive.ms + GRIND_EVERY_MS,
        sinceMs: drive.ms,
      });
      if (other.downed) cloud(drive, state, other, 1, 1.7);
      continue;
    }
    if (drive.ms < book.dueMs) continue;
    const travel = Math.abs(other.speed) + Math.abs(other.slew);
    // STILL GOING — the tarmac is scrubbing it, so the cloud is at its biggest
    // and is being laid along the ground it covers. `z` is in it because a
    // vehicle still in the air is mid-cartwheel and about to land, and a cloud
    // that switched off for the airborne half of a roll would flicker.
    if (other.downed && (travel > GRIND_MIN_PX || other.z > 0)) {
      const force = Math.min(1, travel / GRIND_FULL_PX);
      cloud(drive, state, other, 0.45 + force * 0.55, 0.9 + force);
      book.dueMs = drive.ms + GRIND_EVERY_MS;
      // The settle clock runs from the moment it STOPS, not from the moment it
      // went over — a long slide would otherwise use its whole settling budget
      // up while it was still travelling and arrive at rest already clean.
      book.sinceMs = drive.ms;
      continue;
    }
    const age = drive.ms - book.sinceMs;
    // STOPPED, AND THE DUST IT RAISED IS STILL COMING DOWN AROUND IT. This is
    // the emission that makes the cloud SURROUND the thing: issued at one spot
    // over a couple of seconds, the billows pile into a pall with the wreck in
    // the middle of it.
    if (other.downed && age < SETTLE_MS) {
      const fade = 1 - age / SETTLE_MS;
      cloud(drive, state, other, 0.35 + fade * 0.5, 1.25 + fade * 0.45);
      book.dueMs = drive.ms + SETTLE_EVERY_MS;
      continue;
    }
    // …AND WHAT IS LEFT IS AN ENGINE THAT DIED. A slow dark column standing
    // where the car stopped, for as long as the player is anywhere near it.
    book.dueMs = drive.ms + IDLE_EVERY_MS;
    if (Math.abs(other.pos.x - drive.car.pos.x) > NEAR_PX) continue;
    driveWreckSmoke(
      state,
      other.pos.x,
      other.pos.y,
      drive.ms,
      // Just past the cadence, so consecutive columns overlap into one
      // continuous plume instead of pulsing.
      IDLE_EVERY_MS * 1.3,
    );
  }
  // A VEHICLE THE ROAD HAS FORGOTTEN IS FORGOTTEN HERE TOO. `stepTraffic` drops
  // everything far enough behind the wagon, and a map keyed on ids that were
  // never removed is a leak that grows for the whole leg — and worse, an id the
  // spawner reuses would inherit a dead wreck's clock.
  if (state.wrecks.size > live.size) {
    for (const id of state.wrecks.keys()) {
      if (!live.has(id)) state.wrecks.delete(id);
    }
  }
}

/**
 * Raise one cloud at a vehicle, as wide as the vehicle is.
 *
 * The SPREAD is the fleet's own `halfLengthPx` times whatever this moment is
 * worth, rather than a constant — which is the whole of why a bus vanishes into
 * its cloud and a bicycle raises a wisp. It is the same "their weight is of
 * great importance" the collision model is built on, asked of the picture this
 * time, and it needed no new authoring: the number is already in the def
 * because the physics needed it first.
 */
function cloud(
  drive: DriveState,
  state: DriveFxState,
  other: DriveTraffic,
  force: number,
  span: number,
): void {
  const def = vehicleDef(other.variant);
  driveWreckDust(
    state,
    other.pos.x,
    other.pos.y,
    drive.ms,
    force,
    Math.max(8, def.halfLengthPx * span),
  );
}
