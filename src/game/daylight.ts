// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TIME OF DAY — whether the venue the run is standing in is in daylight, and
// how deep into the night it is if it isn't.
//
// THREE FACTS, AND THEY BELONG TO THREE DIFFERENT OWNERS. Mixing them up is
// what makes a time-of-day system unshippable:
//
//   WHETHER A VENUE HAS A SKY AT ALL is the MISSION's (`LevelDef.sky`). The
//   moon's regolith, the rift and a sealed bunker do not get darker at eight in
//   the evening, and a venue that never opted in reads as fully lit forever —
//   so adding this cost every existing level exactly nothing.
//
//   WHAT TIME IT IS is the APP's, and it arrives as a session PARAMETER
//   (`RunParams.daylight`). The engine may not read a clock: `step()` is
//   deterministic for (seed, input, dt), and a run that sampled `Date.now()`
//   would hand a party in two time zones two different pictures of the same
//   garage. The host reads its clock once, before the first tick, and everybody
//   builds the same night.
//
//   WHAT THE DARK LOOKS LIKE is the RENDERER's (`pwa/src/game/render/night.ts`)
//   — the colour of the wash and how far the lamps reach into it. Nothing here
//   changes a single simulation rule: sight, aggro, spawns and reach are exactly
//   what they are at noon. A hero is not blinded by a sunset, and a horde does
//   not creep up on him because his screen went dark; the night is atmosphere,
//   and a rule keyed to it would be a rule the player cannot see coming.

import { clamp } from "@game/lib/vec.ts";

import { DAYLIGHT } from "./config/index.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import type { SkyKind } from "./defs/levels/types.ts";
import type { GameState } from "./types/index.ts";

/** Every sky a mission may name (see {@link SkyKind}) — the engine's own
 * allow-list, mirrored by the level schema's. */
export const SKY_KINDS: readonly SkyKind[] = ["earth"];

/**
 * How much daylight the hour `hour` (local, 0–24, fractional) is given: 1 is
 * full day, 0 is deep night, and the two ramps in between are dawn and dusk.
 *
 * Pure arithmetic on {@link DAYLIGHT} — no clock, no state — so the app can ask
 * it for the current hour, a test can ask it for 03:00, and the developer
 * override can hand a run any point on the curve it likes.
 */
export function daylightAtHour(hour: number): number {
  // A wrapped hour rather than a clamped one: 25:00 is 01:00, and a caller
  // that computed an hour off a UTC offset should not fall off the end of the
  // day into a permanent noon.
  const h = ((hour % 24) + 24) % 24;
  if (h >= DAYLIGHT.dayFrom && h <= DAYLIGHT.dayUntil) return 1;
  if (h >= DAYLIGHT.nightFrom || h <= DAYLIGHT.nightUntil) return 0;
  if (h > DAYLIGHT.dayUntil) {
    // DUSK: the light going, evenly, across the evening.
    return (
      1 - (h - DAYLIGHT.dayUntil) / (DAYLIGHT.nightFrom - DAYLIGHT.dayUntil)
    );
  }
  // DAWN: the same ramp run backwards.
  return (h - DAYLIGHT.nightUntil) / (DAYLIGHT.dayFrom - DAYLIGHT.nightUntil);
}

/**
 * HOW DARK THIS RUN IS, 0 (broad daylight, or a venue with no sky at all) to 1
 * (the deep of the night).
 *
 * The one accessor everything presentational reads, so "is it night" is asked
 * in exactly one place and a venue that never opted into a sky can never
 * accidentally be dimmed by a stale parameter. A run created before this
 * existed — and every headless simulation, which has no clock to read — carries
 * no `daylight` and is therefore in full day.
 */
export function nightAmount(state: GameState): number {
  if (!runLevelDef(state).sky) return 0;
  return 1 - clamp(state.daylight ?? 1, 0, 1);
}
