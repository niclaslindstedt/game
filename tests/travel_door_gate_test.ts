// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHEN A STANDING DOOR SPEAKS INSTEAD OF OPENING A PICKER (the app's half —
// `groundedDoorThought`; the engine's half is tests/engine/travel_door_test.ts).
//
// The rule the garage's ROCKET exists for: a door whose roads are ALL still
// locked opens no picker, because every row in it would name a chapter the
// player has not reached. Which roads are open is campaign progress on the
// CHARACTER, so it is decided here rather than in the run.

import {
  createGame,
  LEVELS,
  type Difficulty,
  type GameState,
} from "@game/core";
import { describe, expect, it } from "vitest";

import type { Character } from "../pwa/src/game/characters.ts";
import { groundedDoorThought } from "../pwa/src/game/game-screen/travel-doors.ts";

const home = (): GameState => createGame(42, "garage", "medium");

// The gate reads only `clears` and `beaten`; a partial stand-in keeps the test
// free of the full loadout/roster scaffolding (difficulty_unlock_test's idiom).
function hero(clears: string[] = [], beaten: Difficulty[] = []): Character {
  return { clears, beaten } as unknown as Character;
}

describe("the rocket on the garage lawn", () => {
  it("says the ship is one part short while both voyages are shut", () => {
    expect(groundedDoorThought(home(), hero(), "medium", "rocket")).toBe(
      "garage_ship_unfinished",
    );
  });

  it("opens the picker the moment GOODCO HQ has fallen", () => {
    const cleared = hero(["medium:goodco_hq"]);
    expect(groundedDoorThought(home(), cleared, "medium", "rocket")).toBeNull();
  });

  it("is per DIFFICULTY: a hero mid-nightmare is grounded again", () => {
    // The ship is rebuilt every campaign — the intro monologue says so on
    // every rung — so a clear on the easy lane does not fly the nightmare one.
    const easyOnly = hero(["easy:goodco_hq"]);
    expect(groundedDoorThought(home(), easyOnly, "nightmare", "rocket")).toBe(
      "garage_ship_unfinished",
    );
  });

  it("stands aside for a hero who has beaten the tier and may pick any level", () => {
    // Beating a lane opens the free-replay picker on every level
    // (`isDifficultyTierBeaten`), which is a deliberate grinding affordance —
    // grounding the ship there would take it back.
    const veteran = hero([], ["medium"]);
    expect(groundedDoorThought(home(), veteran, "medium", "rocket")).toBeNull();
  });
});

describe("every other door still answers the way it always did", () => {
  it("never grounds a door with no line of its own", () => {
    const fresh = hero();
    for (const door of LEVELS.garage!.travelDoors ?? []) {
      if (door.unready) continue;
      expect(
        groundedDoorThought(home(), fresh, "medium", door.id),
        `door "${door.id}"`,
      ).toBeNull();
    }
  });

  it("never grounds a door that isn't on this level", () => {
    expect(groundedDoorThought(home(), hero(), "medium", "nope")).toBeNull();
  });
});
