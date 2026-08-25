// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE HERO SAYS ON THE WAY UP — the four thoughts a flight has room for,
// each a bark over a sky that keeps moving.
//
// THE FLIGHT REPLACES A CUTSCENE AND OWES ITS BEATS. When the minigame is
// played, `voyage_moon` is not (rocket-screen/begin.ts owns that fork), so the
// two facts that scene carried — the tracker pings from the moon, and nobody
// goes there for chips and soda — are said HERE instead, from the pilot's
// seat. A player with MINIGAMES off still gets them the old way; nobody gets
// them twice.
//
// THE ENGINE NAMES NONE OF THESE. It raises its beats (`orbit`, `touchdown`,
// the shell-clear edge the app reads off `flightShellClear`) and the words are
// content (`content/thoughts.yaml`) — the fence every line in this game is
// drawn along.

import { thoughtDef } from "@game/core";

/** The flight's fixed beats, as thought ids. */
export const FLIGHT_VOICE = {
  /** Just after the hand-over, climbing into the band — why the sky is like
   * this, and where she is. */
  monologue: "flight_up_junk",
  /** The shell's top falling away below — one thought of relief. */
  clear: "flight_shell_clear",
  /** The drop beginning: the moon under the module. */
  descent: "flight_drop",
  /** Down, intact. The last thing the flight says before the board. */
  touchdown: "flight_touchdown",
  /** The first time the jet stream takes the hull — the wind meter's red. */
  jetstream: "flight_jetstream",
  /** The first time he has properly wandered off the corridor. */
  offCourse: "flight_off_course",
  /** The first bird across the nose… */
  bird: "flight_bird",
  /** …and the first of somebody's canopies (a skydiver or a paraglider —
   * one thought covers the hobby). */
  hobbyist: "flight_hobbyist",
  /** The first time the climb reaches the watch deck — the solar-winged
   * machines that have been over everybody for years, and the one beat on the
   * whole trip that is about being LOOKED AT. */
  watched: "flight_watched",
} as const;

/** THE TIP-OVER ROTATION — the ship never stops trying, so a repeated scare
 * gets the next variation rather than the same line (`drainFlight` keeps the
 * cycle's count). */
export const FLIGHT_TIPPING = [
  "flight_tipping_0",
  "flight_tipping_1",
  "flight_tipping_2",
] as const;

/**
 * A thought's pages as the flight's box wants them — plain string rows. None
 * of the flight's lines carries a `{ them: [...] }` block (he is alone in the
 * ship, which is the whole point of the trip), so the tagged shape is unfolded
 * rather than special-cased. An id the catalog does not have THROWS, here as
 * everywhere else.
 */
export function flightThoughtPages(id: string): string[][] {
  return thoughtDef(id).pages.map((page) => [
    ...(Array.isArray(page) ? page : page.them),
  ]);
}
