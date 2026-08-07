// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHETHER THE ROAD IS PLAYED AT ALL — the one place that decides it, and the
// parameters a drive is built from when it is.
//
// FOUR THINGS HAVE TO AGREE, and each says no for a different reason:
//
//   THE SETTING.   SETTINGS → GAMEPLAY → MINIGAMES, off. The player has said
//                  they would rather have the cut, and that is the whole of it.
//   THE PARTY.     Somebody else is in this session. A drive seats ONE person
//                  in ONE car and pays no loot and no XP, so there is nothing
//                  in it for the other six but watching a stranger drive —
//                  and the run they are all standing in would have to be held
//                  open for the length of it. A party takes the cut, always,
//                  whatever the setting says. (docs/multiplayer.md.)
//   THE DRIVER.    Nobody's hands are on this run — BOT VIEW / `?bot=`, the
//                  demo, or the paid AUTO PILOT is playing it. A minigame is a
//                  thing to PLAY, and the autopilot has no strategy for the
//                  road: handed the wheel it holds no pedal, so the wagon
//                  coasts to a stop on the tarmac and the drive never reaches
//                  its end — an unattended run stranded on a road forever,
//                  which is the exact failure the departure beat exists to
//                  avoid. So a run being driven for you takes the cut.
//   THE ROAD.      There is only one drive in the game, and it is the earthbound
//                  leg between the garage and GOODCO. A car door pointing
//                  anywhere else has no road authored for it and gets the cut.
//
// KEEPING IT IN ONE FUNCTION is what makes "minigames are skipped in
// multiplayer" a fact about the game rather than a thing three call sites
// remember to check.

import {
  areMinigamesEnabled,
  DRIVE,
  type Difficulty,
  type DriveDirection,
  type DriveParams,
} from "@game/core";

import { dismemberAllowed, goreAmount } from "../game-screen/gore-gate.ts";

/** The two ends of the one road there is. */
const GARAGE = "garage";
const GOODCO = "goodco_hq";

/**
 * The drive that gets the player from wherever they are to `to`, or null when
 * this trip is a straight cut.
 *
 * `solo` is false whenever anybody else is in the session — the caller knows,
 * because it is the same question `sessionTravels` asks about a crossing.
 *
 * `autoplayed` is true whenever a BOT holds this run's input rather than a
 * person — see THE DRIVER above.
 *
 * `difficulty` is the RUN'S OWN rung, carried in because a drive is settled
 * whole before its first tick and has no run under it to ask afterwards. It is
 * what the road weighs on the way to work.
 *
 * `attract` shortens the leg. A minute of road is the right length for a trip
 * to work and much too long for a title-screen demo trying to show somebody the
 * whole game — so the demo drives the SAME road, same crowd, same rung, with
 * the finish brought forward (`DRIVE.attractCoursePx`). Only the demo: a
 * `?bot=` playtest is a measurement and gets the road a player gets.
 */
export function driveParamsFor(
  to: string,
  from: string,
  solo: boolean,
  autoplayed: boolean,
  seed: number,
  difficulty: Difficulty,
  attract = false,
): DriveParams | null {
  if (!areMinigamesEnabled()) return null;
  if (!solo) return null;
  if (autoplayed) return null;
  const direction = legDirection(from, to);
  if (direction === null) return null;
  return {
    seed,
    direction,
    to,
    difficulty,
    ...(attract ? { coursePx: DRIVE.attractCoursePx } : {}),
    // THE GORE GATE, ASKED ONCE AND CARRIED. The family switch (people bleed)
    // has to say yes for either, and then each way a body can come apart
    // answers for itself — the lumps torn off on the way past are GIBS, and the
    // bumper going through somebody is a CLEAVE. Both fixed for the whole road
    // on purpose: a switch flipped mid-drive would leave half the tarmac gibbed
    // and half of it in the gutter.
    gib: goreAmount("blood") !== null && dismemberAllowed("gib"),
    split: goreAmount("blood") !== null && dismemberAllowed("cleave"),
  };
}

/**
 * WHICH WAY THIS LEG RUNS, or null if it is not the road at all.
 *
 * The trip out is nose-right and the trip home is the same road driven the
 * other way with the side-profile art flipped — which is the only thing that
 * changes about the car (`CarVehicle.faceLeft`).
 */
export function legDirection(from: string, to: string): DriveDirection | null {
  if (from === GARAGE && to === GOODCO) return 1;
  if (from === GOODCO && to === GARAGE) return -1;
  return null;
}
