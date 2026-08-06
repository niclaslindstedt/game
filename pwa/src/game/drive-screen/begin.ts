// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHETHER THE ROAD IS PLAYED AT ALL — the one place that decides it, and the
// parameters a drive is built from when it is.
//
// THREE THINGS HAVE TO AGREE, and each says no for a different reason:
//
//   THE SETTING.   SETTINGS → GAMEPLAY → MINIGAMES, off. The player has said
//                  they would rather have the cut, and that is the whole of it.
//   THE PARTY.     Somebody else is in this session. A drive seats ONE person
//                  in ONE car and pays no loot and no XP, so there is nothing
//                  in it for the other six but watching a stranger drive —
//                  and the run they are all standing in would have to be held
//                  open for the length of it. A party takes the cut, always,
//                  whatever the setting says. (docs/multiplayer.md.)
//   THE ROAD.      There is only one drive in the game, and it is the earthbound
//                  leg between the garage and GOODCO. A car door pointing
//                  anywhere else has no road authored for it and gets the cut.
//
// KEEPING IT IN ONE FUNCTION is what makes "minigames are skipped in
// multiplayer" a fact about the game rather than a thing three call sites
// remember to check.

import {
  areMinigamesEnabled,
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
 */
export function driveParamsFor(
  to: string,
  from: string,
  solo: boolean,
  seed: number,
): DriveParams | null {
  if (!areMinigamesEnabled()) return null;
  if (!solo) return null;
  const direction = legDirection(from, to);
  if (direction === null) return null;
  return {
    seed,
    direction,
    to,
    // THE GORE GATE, ASKED ONCE AND CARRIED. Both halves have to say yes: the
    // family switch (people bleed) and the switch for a body BURST rather than
    // cut. Fixed for the whole road on purpose — a switch flipped mid-drive
    // would leave half the tarmac gibbed and half of it in the gutter.
    gib: goreAmount("blood") !== null && dismemberAllowed("gib"),
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
