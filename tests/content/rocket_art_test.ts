// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLIGHT'S ART AND SOUND TABLES against the shipped catalogs — the seam
// between "the sim rolled a number" and "the player saw and heard something".
//
// A CONTENT suite: it holds the app's variant tables to the engine's
// `ORBIT_VARIANTS` (a variant with no sprite is an invisible thing the ship
// can still hit), the tables to the shipped atlas, and the sound id banks to
// the shipped sound catalog (an id the catalog lacks plays silence with every
// check green — the exact drift `FLIGHT_SOUND_IDS` exists to catch).

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ORBIT_VARIANTS } from "../../engine/game/rocket/index.ts";
import { ORBIT_SPRITE_TABLES } from "../../pwa/src/game/rocket-screen/orbit-art.ts";
import { FLIGHT_SOUND_IDS } from "../../pwa/src/game/rocket-screen/rocket-sounds.ts";
import { GENERATED_SOUNDS } from "../../pwa/src/generated/sounds.ts";

const ATLAS: Record<string, unknown> = JSON.parse(
  readFileSync(
    new URL("../../pwa/src/game/assets/atlas.json", import.meta.url),
    "utf8",
  ),
);

/** Everything the flight's renderer names outside the variant tables. */
const NAMED = [
  // The ship's two flight states, two frames each (the cutscenes' own art).
  "ship_0",
  "ship_1",
  "ship_fire_0",
  "ship_fire_1",
  // The module, cold and burning, and the ground it aims for.
  "orbit_lander",
  "orbit_lander_burn",
  "orbit_pad",
  // The backdrops borrowed from the voyage scenes and the moon.
  "sky_moon",
  "sky_earth",
  "moon_0",
  "boulder",
];

describe("the flight's sprite tables", () => {
  // WALKED, NEVER LISTED. A hand-written line per kind passes for every kind
  // somebody remembered — which is exactly the kinds that already worked. The
  // whole vocabulary is `ORBIT_VARIANTS`, so both checks read it.
  const KINDS = Object.keys(ORBIT_VARIANTS) as (keyof typeof ORBIT_VARIANTS)[];

  it("answers every variant the sim can roll", () => {
    const lengths = Object.fromEntries(
      KINDS.map((kind) => [kind, ORBIT_SPRITE_TABLES[kind].length]),
    );
    expect(lengths).toEqual({ ...ORBIT_VARIANTS });
  });

  it("names only sprites the shipped atlas actually has", () => {
    const all = [
      ...KINDS.flatMap((kind) => ORBIT_SPRITE_TABLES[kind]),
      ...NAMED,
    ];
    const missing = all.filter((name) => !(name in ATLAS));
    expect(missing).toEqual([]);
  });
});

describe("the flight's sound banks", () => {
  it("names only sounds the shipped catalog actually has", () => {
    const missing = FLIGHT_SOUND_IDS.filter((id) => !(id in GENERATED_SOUNDS));
    expect(missing).toEqual([]);
  });
});
