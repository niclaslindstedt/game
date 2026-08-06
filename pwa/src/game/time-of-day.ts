// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT TIME IT IS — the app's half of the day/night system, and the only place
// in the game that asks the machine what o'clock it is on the player's behalf.
//
// The engine cannot: `step()` is deterministic for (seed, input, dt) and a
// simulation that read a clock would fork a party across two time zones (see
// `src/game/daylight.ts`, which owns the curve and the reasoning). So the app
// reads the hour ONCE, before the run's first tick, and hands the answer over as
// a session parameter like every other thing it knows and the engine does not.
//
// THE STORY OUTRANKS THE CLOCK, and that is the rule this module exists to
// state. The campaign opens on a specific night — movie night, two hours later,
// and she never came back — so the visit that plays that opening is dark
// whatever the player's watch says. It is only from the SECOND visit, when the
// hero is coming home between errands rather than leaving on the worst night of
// his life, that home starts keeping the player's own hours.

import { daylightAtHour } from "@game/core";

/** The developer override (`?daylight=`, see docs/configuration.md) — a point
 * on the day, 0 (deep night) to 1 (broad daylight), so a screenshot or a
 * playtest can stand in any hour without waiting for one. */
const DAYLIGHT_PARAM = "daylight";

/**
 * How much daylight the machine says it is standing in right now, 0–1.
 *
 * `getHours()` plus the minutes as a fraction, because the ramps are hours long
 * and a whole-hour step would visibly notch the dusk on a player who happened to
 * be walking through the lot at 18:00.
 */
export function daylightNow(now: Date = new Date()): number {
  return daylightAtHour(now.getHours() + now.getMinutes() / 60);
}

/**
 * THE RUN'S LIGHT LEVEL — what `RunParams.daylight` is set from.
 *
 * Three answers in priority order, and the order is the whole content of this
 * function: a developer override if one was asked for, the story's own night on
 * the visit that tells it, and the player's clock every time after that.
 *
 * @param params      the page's query string (the `?daylight=` override)
 * @param storyNight  is this the visit that plays the venue's opening? The
 *                    campaign's first scene is at night by script, so its run is
 *                    dark whatever the hour.
 */
export function runDaylight(
  params: URLSearchParams,
  storyNight: boolean,
  now: Date = new Date(),
): number {
  const override = Number(params.get(DAYLIGHT_PARAM));
  if (params.get(DAYLIGHT_PARAM) !== null && Number.isFinite(override)) {
    return Math.min(1, Math.max(0, override));
  }
  if (storyNight) return 0;
  return daylightNow(now);
}
