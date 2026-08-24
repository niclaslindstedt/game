// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE SKY'S GARBAGE LOOKS LIKE — the variant→sprite tables the flight
// draws from.
//
// THE SIM PICKS A NUMBER AND THIS FILE ANSWERS IT: `OrbitObject.variant` is
// rolled in the engine against `ORBIT_VARIANTS` (engine/game/rocket/field.ts),
// and these tables are the same length by contract —
// `tests/content/rocket_art_test.ts` holds the two together, because a variant
// with no sprite would be an invisible thing the ship can still hit.

import type { OrbitKind } from "@game/core";

/** The twenty pieces of GOODCO's disposal business, in variant order. */
export const JUNK_SPRITES: readonly string[] = [
  "orbit_junk_0",
  "orbit_junk_1",
  "orbit_junk_2",
  "orbit_junk_3",
  "orbit_junk_4",
  "orbit_junk_5",
  "orbit_junk_6",
  "orbit_junk_7",
  "orbit_junk_8",
  "orbit_junk_9",
  "orbit_junk_10",
  "orbit_junk_11",
  "orbit_junk_12",
  "orbit_junk_13",
  "orbit_junk_14",
  "orbit_junk_15",
  "orbit_junk_16",
  "orbit_junk_17",
  "orbit_junk_18",
  "orbit_junk_19",
];

/** The company's own hardware. */
export const SATELLITE_SPRITES: readonly string[] = [
  "orbit_sat_0",
  "orbit_sat_1",
  "orbit_sat_2",
];

/** The rocks that never asked anybody. */
export const ROCK_SPRITES: readonly string[] = [
  "orbit_rock_0",
  "orbit_rock_1",
  "orbit_rock_2",
];

const TABLES: Record<OrbitKind, readonly string[]> = {
  junk: JUNK_SPRITES,
  satellite: SATELLITE_SPRITES,
  rock: ROCK_SPRITES,
};

/** The sprite a drifting thing wears. Clamped rather than trusted, so a mod's
 * shorter table degrades to its last sprite instead of to nothing. */
export function orbitSprite(kind: OrbitKind, variant: number): string {
  const table = TABLES[kind];
  return table[Math.min(table.length - 1, Math.max(0, variant))]!;
}
