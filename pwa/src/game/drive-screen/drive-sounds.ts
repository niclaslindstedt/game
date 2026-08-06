// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH SOUND A COLLISION MAKES — the road's banks, and the pick.
//
// TWO DECISIONS LIVE HERE AND BOTH ARE ABOUT REPETITION. A drive books a body
// every couple of seconds and thirty of them a trip, so:
//
//   HOW HARD WAS IT   picks the SHELF, off the collision's own absorbed energy
//                     (`DriveEvent.joules`) against `wearJoules` — the same
//                     number the gore burst and the car's own wear are priced
//                     off. Nothing here re-decides what a heavy hit is.
//   WHICH TAKE        picks one of that shelf's variants by HASHING WHERE IT
//                     HAPPENED. Never `drive.rng()`: the road's stream lays the
//                     crowd and the traffic down, so spending a draw on which
//                     thud to play would move every body after it — the same
//                     rule the loot toss and the gore scatter obey.
//
// The ids are `content/sounds/drive_*.yaml`, played through the LIVE bank, so a
// mod that reskins the road is heard on it.

import { DRIVE } from "@game/core";

/** The ordinary thud of a body on the bumper. */
export const BODY_SOUNDS = [
  "drive_body_a",
  "drive_body_b",
  "drive_body_c",
] as const;
/** The same collision past `HARD_BODY_JOULES` — taken square, at speed. */
export const HARD_BODY_SOUNDS = [
  "drive_body_hard_a",
  "drive_body_hard_b",
] as const;
/** Paint traded down the flank. */
export const SCRAPE_SOUNDS = ["drive_scrape_a", "drive_scrape_b"] as const;
/** A real collision with another car. */
export const CRUNCH_SOUNDS = ["drive_crunch_a", "drive_crunch_b"] as const;
/** A panel folding one rung further. */
export const PANEL_SOUNDS = ["drive_panel_a", "drive_panel_b"] as const;
/** The two singletons — one part comes off a car exactly one way, and an engine
 * only dies once a leg. */
export const SHED_SOUND = "drive_part_shed";
export const BREAKDOWN_SOUND = "drive_breakdown";

/** Where the body's thud becomes a body's crunch, as a fraction of the energy
 * that totals the car. Sits at about a square hit at half the top end, so the
 * heavy takes are what a driver holding the throttle down hears and the light
 * ones are what a careful one does. */
const HARD_BODY_JOULES = 0.045;
/** …and the same line for traffic, higher because trading paint at all is
 * already the expensive mistake. */
const CRUNCH_JOULES = 0.09;

/** Which variant a hit at this spot plays — deterministic, so an identical road
 * replays with identical audio. */
export function variantAt(x: number, y: number, count: number): number {
  return Math.abs(Math.round(x * 3.1 + y * 7.7)) % count;
}

function pick(bank: readonly string[], x: number, y: number): string {
  return bank[variantAt(x, y, bank.length)] ?? bank[0] ?? "";
}

/** The sound a body going under the car makes. */
export function bodyHitSound(x: number, y: number, joules: number): string {
  const heavy = joules > DRIVE.impact.wearJoules * HARD_BODY_JOULES;
  return pick(heavy ? HARD_BODY_SOUNDS : BODY_SOUNDS, x, y);
}

/** The sound of meeting another car — a scrape down the side, or a crunch. */
export function trafficHitSound(x: number, y: number, joules: number): string {
  const heavy = joules > DRIVE.impact.wearJoules * CRUNCH_JOULES;
  return pick(heavy ? CRUNCH_SOUNDS : SCRAPE_SOUNDS, x, y);
}

/** The sound of a panel giving up a rung. */
export function panelSound(x: number, y: number): string {
  return pick(PANEL_SOUNDS, x, y);
}

/** Every id the road can ask the bank for — what the content test walks. */
export const DRIVE_SOUND_IDS: readonly string[] = [
  ...BODY_SOUNDS,
  ...HARD_BODY_SOUNDS,
  ...SCRAPE_SOUNDS,
  ...CRUNCH_SOUNDS,
  ...PANEL_SOUNDS,
  SHED_SOUND,
  BREAKDOWN_SOUND,
];
