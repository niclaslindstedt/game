// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS ON FIRE, AND WHAT IS GRINDING — the two things on this road that
// go on HAPPENING, drawn by walking the state rather than by answering an event.
//
// WHY IT IS A WALK. The engine raises `trafficFire` and `trafficExploded` once
// each, on the tick they happened, which is the right shape for a noise and the
// wrong shape for a fire: a burn takes hold over several seconds, travels with
// the car (which may be being pushed up the road by the player at the time), and
// is still going when he looks in his mirror. A single burst fired on the event
// stands over the spot the fire STARTED and the car drives out from under it —
// the identical bug `wreck-smoke.ts` was written to fix, and the reason
// `DriveFx.follow` is not the answer: that flag means THE HERO'S CAR.
//
// THE GRIND IS THE SAME SHAPE FOR THE SAME REASON. A wheel-less, tilted shell
// moving on its bare frame is a state, not an event, so the sparks coming off it
// are issued on a cadence at the grounded end for as long as it lasts.
//
// EVERYTHING HERE IS PRESENTATION and the drive plays identically without it —
// the same fence `drive-fx.ts`, `skid.ts` and `wreck-smoke.ts` are drawn along.
// It runs on the DRIVE'S OWN CLOCK, inside the fixed step, so a slow frame
// raises the same fire a fast one does and a road frozen behind a monologue
// raises none.

import { DRIVE, vehicleDef, type DriveState } from "@game/core";

import {
  driveGrindSparks,
  driveVehicleFire,
  type DriveFxState,
} from "./drive-fx.ts";

/**
 * HOW OFTEN A BURNING CAR IS RE-ISSUED (drive-clock ms).
 *
 * Short, and shorter than the flame's own life on purpose: the effect fades in
 * and out over its life, so consecutive issues OVERLAP into one continuous burn.
 * At a cadence longer than the life the fire would blink, which is the one thing
 * a fire may never do.
 */
const FIRE_EVERY_MS = 120;
/** …and how long one issue hangs about. Twice the cadence, so there are always
 * two overlapping. */
const FIRE_LIFE_MS = 260;

/**
 * HOW FAR OFF THE ROAD A CAR BURNS (world px).
 *
 * A bonnet, not the tarmac. The effect layer anchors everything at the GROUND,
 * which is right for a spark off a bumper and wrong for a fire that is supposed
 * to be coming out of an engine bay — the same lift the windscreen's own burst
 * takes, and for the same reason.
 */
const FIRE_LIFT_PX = 9;

/** How far either side of the wagon a fire is worth issuing (world px). The burn
 * is unbounded in time — a car set alight at the town gate is still alight at
 * the finish — so it has to be bounded in SPACE, exactly as the idle wreck smoke
 * is, and measured off the HERO rather than off the camera because this runs
 * inside the fixed step and the camera is a thing the frame has. */
const NEAR_PX = 520;

/**
 * ONE TICK OF EVERY FIRE AND EVERY GRIND ON THE ROAD.
 *
 * Called from `drainDrive` beside the skids and the wreck smoke, inside the
 * fixed step and on the drive's own clock.
 */
export function stepBurning(
  state: DriveFxState,
  drive: DriveState,
  /** SFW MODE — the burn is issued as a fountain of gold stars rather than as
   * flame (`star-fire.ts`). The GRIND is untouched: sparks off steel scraping
   * tarmac are what the mode already lets every collision throw, and dimming
   * them would leave a shell being bullied up the road with nothing to show for
   * it. */
  fairy = false,
): void {
  const live = new Set<number>();
  for (const other of drive.traffic) {
    const burning = other.fire > 0;
    const toNose = other.faceLeft ? -1 : 1;
    const bodyPitch = other.angle * toNose;
    const rearGrinding = (other.wheelsOff & 2) !== 0 && bodyPitch < -0.012;
    const frontGrinding = (other.wheelsOff & 1) !== 0 && bodyPitch > 0.012;
    // SPARKS REQUIRE METAL ON ROAD. A pushed but level car is rubber against
    // tarmac and stays dark; a shell whose missing axle has actually tipped an
    // end down sparks while that end is still moving, pushed or coasting.
    const grinding =
      (rearGrinding || frontGrinding) &&
      Math.abs(other.speed) > DRIVE.traffic.wreckRestPx;
    if (!burning && !grinding) continue;
    if (Math.abs(other.pos.x - drive.car.pos.x) > NEAR_PX) continue;
    live.add(other.id);
    const due = state.burns.get(other.id) ?? 0;
    if (drive.ms < due) continue;

    if (burning) {
      driveVehicleFire(
        state,
        other.pos.x,
        other.pos.y,
        drive.ms,
        other.fire,
        FIRE_LIFT_PX,
        FIRE_LIFE_MS,
        fairy,
      );
    }
    if (grinding) {
      // WHERE THE STEEL IS ACTUALLY GRINDING — the bumper, not the middle of
      // either car. It is the near END of the thing being pushed, which is the
      // one place on the pair the two of them are in contact.
      //
      // …AND THAT END MOVES WITH THE BODY. The offset used to be laid straight
      // down the road whatever the car was doing, so a vehicle knocked askew
      // threw its sparks from a point in mid-air beside itself — the further it
      // was turned, the further out they came. The end is the same distance
      // away, it is just no longer level: the sprite turns about its own seat
      // (`wreck-draw.ts`), and one world px across the road is one screen px
      // down (`seatY`), so the rotated offset is the honest place to put them.
      const def = vehicleDef(other.variant);
      const toward = rearGrinding ? -toNose : toNose;
      const reach = def.halfLengthPx * toward;
      driveGrindSparks(
        state,
        other.pos.x + reach * Math.cos(other.angle),
        other.pos.y + reach * Math.sin(other.angle),
        drive.ms,
        Math.min(
          1,
          0.25 + Math.abs(other.speed) / Math.max(1, DRIVE.topSpeedPx),
        ),
      );
    }
    state.burns.set(
      other.id,
      drive.ms +
        (grinding && !burning ? DRIVE.wreckage.grindEveryMs : FIRE_EVERY_MS),
    );
  }
  // A VEHICLE THE ROAD HAS FORGOTTEN IS FORGOTTEN HERE TOO — the same leak the
  // wreck smoke's own map has to be swept for, and worse if it is not: an id the
  // spawner reuses would inherit a dead car's cadence and go quiet.
  if (state.burns.size > live.size) {
    for (const id of state.burns.keys()) {
      if (!live.has(id)) state.burns.delete(id);
    }
  }
}
