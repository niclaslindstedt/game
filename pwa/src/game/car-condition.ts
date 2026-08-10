// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WAGON IS ONE OBJECT ACROSS THE WHOLE NIGHT, and this is where it lives
// between the four things that hold it.
//
// He leaves the garage in it (a `GameState`), drives a minute of road in it (a
// `DriveState`), parks it on GOODCO's staff lot (a second `GameState`), drives
// it home again (a second `DriveState`) and leaves it in his own bay. Every one
// of those is built from scratch and torn down; the car is supposed to be the
// same car in all of them.
//
// **THE CONDITION IS TWO HALVES, CARRIED TOGETHER AND STORED APART.**
//
//   THE DAMAGE  is simulation — bent panels, shot wheels, a bumper working
//               free — and the engine has always owned it (`CarDamage`,
//               engine/game/vehicles.ts). It travels as a PARAMETER, because
//               everything settled about a run or a leg before its first tick
//               does: `RunParams.car` and `DriveParams.car`. It is therefore
//               also IN the run's state, which is what makes a parked run, a
//               checkpoint and a joining client agree about it for free.
//   THE BLOOD   is presentation — how much of somebody is on each panel and on
//               the tyres (`drive-screen/car-soak.ts`) — and the engine has
//               never known a car can get dirty. So it rides here, in the app,
//               and this module is the whole of "between".
//
// **WHY THE BLOOD IS A MODULE-LEVEL SINGLETON AND NOT A REF.** The two seams it
// crosses are on opposite sides of a component being torn down and rebuilt: the
// drive screen unmounts as the run mounts, and the run unmounts as the next
// drive screen mounts. There is exactly one wagon per player, so the honest
// shape is one value — the same shape `assets.ts` and the settings use, for the
// same reason.
//
// **WHAT IT DELIBERATELY DOES NOT DO IS PERSIST.** Reloading the page keeps the
// DAMAGE (it is on the run's own car, and a checkpoint carries it) and loses
// the blood, which comes back clean. That is the right trade rather than a
// shortcut: the mess is a memory of one drive, and a wash is what a night of it
// would have got anyway.

import type { CarPanelId } from "@game/core";

import {
  carCoat,
  cleanCar,
  wheelCoat,
  type CarSoak,
} from "./drive-screen/car-soak.ts";
import type { CoatLayer } from "./render/soak-ladder.ts";

/** What a body left on the wagon — the panels, and what the tyres picked up. */
export type CarFilth = {
  /** Per-panel soak, 0 (factory paint) .. 1 (you cannot see it). */
  soak: CarSoak;
  /** The tyres' own carry (`DriveGoreState.tyre`) — one number for both. */
  tyre: number;
};

/** The wagon, as it currently stands. Reset to clean by a fresh page. */
let filth: CarFilth = { soak: cleanCar(), tyre: 0 };

/** Hand the wagon's filth on — called as a leg of road ends. */
export function carryCarFilth(next: CarFilth): void {
  filth = { soak: { ...next.soak }, tyre: next.tyre };
}

/** …and read it back, for the leg (or the car park) that comes next. */
export function carriedCarFilth(): CarFilth {
  return { soak: { ...filth.soak }, tyre: filth.tyre };
}

/**
 * Wash it off — a fresh campaign, and the ARCADE cabinet, which plays the same
 * road for a score rather than as part of a night and must not inherit (or
 * leave behind) a night's worth of mess.
 */
export function washCar(): void {
  filth = { soak: cleanCar(), tyre: 0 };
}

/**
 * THE FILM THE PARKED CAR WEARS, ready for `drawCarAssembly` — the same pair of
 * records the road hands it, off the same ladder, so a wagon standing in a car
 * park is drawn exactly as filthy as it was a second earlier at 120 mph.
 */
export function carriedCarCoat(): {
  panels: Partial<Record<CarPanelId, readonly CoatLayer[]>>;
  wheels: readonly CoatLayer[];
} {
  return { panels: carCoat(filth.soak), wheels: wheelCoat(filth.tyre) };
}
