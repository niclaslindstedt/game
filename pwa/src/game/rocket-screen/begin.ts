// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHETHER THE FLIGHT IS PLAYED AT ALL — the one place that decides it, and the
// parameters a flight is built from when it is.
//
// THE SAME FOUR QUESTIONS AS THE ROAD'S (`drive-screen/begin.ts`), asked of a
// different seam. The flight replaces the `voyage_moon` scene inside the moon
// run's own prelude — the launch plays on the lawn, the scene chain hands over
// (`sceneEnded`), and what happens next is either this minigame or the cruise
// cutscene it stands in for:
//
//   THE SETTING.   SETTINGS → GAMEPLAY → MINIGAMES, off. The player would
//                  rather have the film.
//   THE PARTY.     Somebody else is in this session — one ship seats one
//                  person, and the run they are all standing in would have to
//                  be held open for the length of it.
//   THE PILOT.     Nobody's hands are on this run (BOT VIEW, the demo, the
//                  paid AUTO PILOT). A minigame is a thing to PLAY — the
//                  engine's own flight auto-pilot exists (`createFlightDriver`,
//                  for the attract loop and the harnesses), but a run being
//                  played FOR you takes the cut, exactly as the road does.
//   THE TRIP.      There is exactly one flight in the game, and it is the leg
//                  between the lawn and the moon. A prelude ending anywhere
//                  else has no sky authored for it.
//
// KEEPING IT IN ONE FUNCTION is what makes "minigames are skipped in
// multiplayer" a fact about the game rather than a thing call sites remember.
// The ARCADE SHELF's door (`arcadeFlightParams`) asks none of the four, for
// the shelf's usual reasons — but BOTH doors settle the gore gate here, the
// road's own rule: whether the sky's soft bodies burst red is decided before
// the first tick and carried on the params, never asked mid-flight.

import {
  FLIGHT,
  areMinigamesEnabled,
  type Difficulty,
  type FlightParams,
} from "@game/core";

import {
  dismemberAllowed,
  goreAmount,
  sfwModeEnabled,
} from "../game-screen/gore-gate.ts";

/** The gore gate's answers, asked once per door — see `FlightParams.gib`. */
function flightGore(): { gib: boolean; dust: boolean } {
  return {
    gib: goreAmount("blood") !== null && dismemberAllowed("gib"),
    dust: sfwModeEnabled(),
  };
}

/** The one destination the sky is authored for. */
const MOON = "moon";
/** …and the arcade shelf's second way to fly it: the drop alone
 * (`minigames.ts` — the MOON LANDING variant). */
export const MOON_LANDING_VARIANT = "moon_landing";
/** …and the one scene whose ending cues the flight — the launch on the lawn.
 * The chain raises `sceneEnded` for every scene, so the fork keys on WHICH. */
export const LAUNCH_SCENE = "launch";

/**
 * The flight that carries the player to `to`, or null when the trip stays a
 * cutscene. `solo` and `autoplayed` are the caller's, same as the road's.
 */
export function flightParamsFor(
  to: string,
  solo: boolean,
  autoplayed: boolean,
  seed: number,
  difficulty: Difficulty,
  attract = false,
): FlightParams | null {
  if (!flightIsPlayed(to, solo, autoplayed)) return null;
  return {
    seed,
    difficulty,
    to,
    ...flightGore(),
    ...(attract ? { coursePx: FLIGHT.attractCoursePx } : {}),
  };
}

/** The four gates on their own — is this trip going to be FLOWN. */
export function flightIsPlayed(
  to: string,
  solo: boolean,
  autoplayed: boolean,
): boolean {
  if (!areMinigamesEnabled()) return false;
  if (!solo) return false;
  if (autoplayed) return false;
  return to === MOON;
}

/**
 * THE SAME SKY, OFF THE ARCADE SHELF — played on its own for the score. None
 * of the four gates applies at a cabinet the player walked over and pressed;
 * the gore gate still does, because the sky's soft bodies bleed at a cabinet
 * exactly as much as on the campaign's climb. `variant` is the shelf's
 * MISSION row: the whole trip, or the MOON LANDING drop alone
 * (`FlightParams.leg`).
 */
export function arcadeFlightParams(
  seed: number,
  difficulty: Difficulty,
  variant?: string,
): FlightParams {
  return {
    seed,
    difficulty,
    to: MOON,
    ...(variant === MOON_LANDING_VARIANT ? { leg: "landing" as const } : {}),
    ...flightGore(),
  };
}
