// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TWO TERMINAL BEATS OF A LEG — the breakdown's restart and the arrival's
// crossing, and everything the first of them throws away.
//
// WHY THEY ARE NOT IN `loop.ts` with the rest of the drain: those three
// functions are what a tick LOOKS AND SOUNDS like, and both hosts that stand a
// `DriveState` up run them unchanged. These two are POLICY, and the hosts
// answer them differently — the minigame hands the crossing back to the game
// screen, the effects gallery's exhibit simply re-stages its show — so this is
// the SCREEN's answer and the exhibit does not import it.
//
// …AND WHY THEY ARE NOT IN `DriveScreen.tsx` EITHER, which is where they lived:
// a suite under `tests/` is compiled by the ROOT tsconfig, which has no `jsx`,
// so a policy function sitting in a `.tsx` cannot be tested without dragging
// the whole component's compile settings along with it. Policy is exactly the
// half worth pinning (`tests/drive_restart_test.ts`), so it lives in a plain
// module and the component stays the picture.

import {
  DRIVE,
  DRIVE_OUTCOME,
  restartDrive,
  type DriveState,
} from "@game/core";

import { clearDriveFx, type DriveFxState } from "./drive-fx.ts";
import { clearDriveGore, type DriveGoreState } from "./drive-gore.ts";
import { clearSkids, type SkidState } from "./skid.ts";
import type { Burst } from "./loop.ts";

/**
 * A BREAKDOWN puts the player back at the top of the SAME road (the seed is
 * kept, so the stretch that killed him is the stretch he gets to learn); an
 * ARRIVAL hands the crossing back to the game screen.
 */
export function endDrive(
  drive: DriveState,
  bursts: Burst[],
  fx: DriveFxState,
  gore: DriveGoreState,
  skids: SkidState,
  /** Take the speech box away — see the restart below. */
  clearSpeech: () => void,
  /** What the arrival hands the leg to — the screen's own `arrive`, which is
   * where the choice between the high-score board and a silent crossing is
   * made. */
  onArrived: (drive: DriveState) => void,
): void {
  if (
    drive.outcome === DRIVE_OUTCOME.broken &&
    drive.outcomeMs > DRIVE.breakdownHoldMs
  ) {
    Object.assign(drive, restartDrive(drive));
    // EVERYTHING THE OLD LEG LEFT BEHIND GOES WITH IT, AND HIS VOICE IS ONE OF
    // THOSE THINGS. The wreck's own line ("COME ON. NOT HERE. NOT TONIGHT.") is
    // about a car that no longer exists, so it must not be sitting over the
    // clean one — and it would be, for two reasons that compound: the bark
    // outlives `breakdownHoldMs` on its own (it is written to be readable, the
    // hold is written not to punish), and `restartDrive` REWINDS THE CLOCK the
    // bark retires itself on, so a page due at 41 000 ms is still due after the
    // road goes back to 0 and the box sits there over the fresh leg.
    clearSpeech();
    bursts.length = 0;
    clearDriveFx(fx);
    clearDriveGore(gore);
    clearSkids(skids);
  }
  if (
    drive.outcome === DRIVE_OUTCOME.arrived &&
    drive.outcomeMs > DRIVE.arrivalHoldMs
  ) {
    // WHAT HE MAKES OF THE TRIP goes with him rather than being said here.
    // `driveVerdict` reads the whole drive — the clock, the car, the other
    // drivers, the council's lighting and the people — and the line it picks is
    // spoken as the last page of the destination's opening monologue, which is
    // where a man's opinion of a journey belongs: standing beside the car,
    // having finished it. (`RunParams.arrivalThought` → `introPages`.)
    onArrived(drive);
  }
}
