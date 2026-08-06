// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A STANDING DOOR SHOWS, AND WHAT IT DOES WHEN IT HAS NOTHING TO SHOW
// (the app's half — travel-doors.ts; the engine's half is
// tests/engine/travel_door_test.ts).
//
// The rule, in one line: A ROAD THE PLAYER HAS NOT EARNED IS NOT NAMED. The
// picker lists only open roads, and a door with none either speaks its own
// line (the ROCKET) or is not on the field at all (the RIFT SEAM). Which roads
// are open is campaign progress on the CHARACTER, so it is decided here rather
// than in the run.

import {
  createGame,
  LEVELS,
  type Difficulty,
  type GameState,
} from "@game/core";
import { describe, expect, it } from "vitest";

import type { Character } from "../pwa/src/game/characters.ts";
import {
  groundedDoorThought,
  hiddenTravelDoors,
  openRoads,
} from "../pwa/src/game/game-screen/travel-doors.ts";

const home = (): GameState => createGame(42, "garage", "medium");

/** The rift, mid-run: the coward is still on his feet and the field is live. */
const rift = (): GameState => createGame(42, "the_rift", "medium");

/** The rift on a CLEARED field — the win banked and the player back on it via
 * the victory menu's STAY, which is the only state the far door ever opens in. */
const clearedRift = (): GameState => {
  const state = rift();
  state.staying = true;
  return state;
};

const riftDoor = (id: string) =>
  (LEVELS.the_rift!.travelDoors ?? []).find((d) => d.id === id)!;

const doorNamed = (id: string) =>
  (LEVELS.garage!.travelDoors ?? []).find((d) => d.id === id)!;

// The gate reads only `clears`, `beaten` and `keepsakes`; a partial stand-in
// keeps the test free of the full loadout/roster scaffolding (the idiom
// difficulty_unlock_test.ts uses).
function hero(
  clears: string[] = [],
  beaten: Difficulty[] = [],
  keepsakes: string[] = [],
): Character {
  return { clears, beaten, keepsakes } as unknown as Character;
}

describe("the picker names only the roads that are open", () => {
  it("says nothing about MARS until the moon has let go", () => {
    const rocket = doorNamed("rocket");
    // GOODCO cleared: the moon is the one road, and MARS is not on the panel.
    const afterHq = hero(["medium:goodco_hq"]);
    expect(openRoads(home(), afterHq, "medium", rocket)).toEqual(["moon"]);
    // The moon cleared too: now both are named, in authored order.
    const afterMoon = hero(["medium:goodco_hq", "medium:moon"]);
    expect(openRoads(home(), afterMoon, "medium", rocket)).toEqual([
      "moon",
      "mars",
    ]);
  });

  it("names no deep road until the RIFT CREATOR is banked", () => {
    const seam = doorNamed("rift_seam");
    // The campaign walked as far as the rift (which is where the creator
    // drops), so both deep roads are unlocked on their own terms — and the
    // door is STILL shut without the keepsake. The gate is the whole door,
    // not merely its rows.
    const toTheRift = [
      "medium:goodco_hq",
      "medium:moon",
      "medium:mars",
      "medium:the_rift",
    ];
    expect(openRoads(home(), hero(toTheRift), "medium", seam)).toEqual([]);
    const kept = hero(toTheRift, [], ["rift_creator"]);
    expect(openRoads(home(), kept, "medium", seam)).toEqual([
      "the_rift",
      "boot_hill",
    ]);
  });

  it("always names the road out — the car's is the campaign's first level", () => {
    expect(openRoads(home(), hero(), "medium", doorNamed("car"))).toEqual([
      "goodco_hq",
    ]);
  });
});

describe("the rocket on the garage lawn — it speaks", () => {
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

  it("stays on the lawn even while it is grounded — the ship IS the story", () => {
    expect(hiddenTravelDoors(home(), hero(), "medium")).not.toContain("rocket");
  });
});

describe("the rift seam — it simply isn't there", () => {
  it("is off the wall before THE FOUNDER's RIFT CREATOR comes home", () => {
    expect(hiddenTravelDoors(home(), hero(), "medium")).toContain("rift_seam");
  });

  it("is off the wall on a fresh campaign the keepsake outlives", () => {
    // Keepsakes are banked on the CHARACTER, not per rung, so a hero who kept
    // the rift creator on medium still holds it when nightmare opens — and has
    // walked neither deep road there. This is the case that used to open a
    // picker made of nothing but locked rows.
    const stepUp = hero(
      ["medium:the_rift", "medium:boot_hill"],
      ["medium"],
      ["rift_creator"],
    );
    expect(hiddenTravelDoors(home(), stepUp, "nightmare")).toContain(
      "rift_seam",
    );
  });

  it("comes back the moment it leads somewhere", () => {
    const kept = hero(
      ["medium:goodco_hq", "medium:moon", "medium:mars", "medium:the_rift"],
      [],
      ["rift_creator"],
    );
    expect(hiddenTravelDoors(home(), kept, "medium")).not.toContain(
      "rift_seam",
    );
  });
});

describe("the far door at the end of the rift", () => {
  // The hero has walked far enough that BOTH its roads are earned on their own
  // terms — so anything the door withholds below is the CLEAR gate and nothing
  // else.
  const walker = () =>
    hero(["medium:goodco_hq", "medium:moon", "medium:mars", "medium:the_rift"]);

  it("names no road while the coward is still standing", () => {
    expect(openRoads(rift(), walker(), "medium", riftDoor("far_door"))).toEqual(
      [],
    );
  });

  it("says why, rather than swallowing the tap", () => {
    // The whole reason `afterClear` may not ship without an `unready` line: a
    // door that refuses in silence for most of a level reads as scenery.
    expect(groundedDoorThought(rift(), walker(), "medium", "far_door")).toBe(
      "rift_far_door_shut",
    );
  });

  it("asks which road once the field is cleared", () => {
    expect(
      openRoads(clearedRift(), walker(), "medium", riftDoor("far_door")),
    ).toEqual(["boot_hill", "garage"]);
    expect(
      groundedDoorThought(clearedRift(), walker(), "medium", "far_door"),
    ).toBeNull();
  });

  it("offers the way home on a first walk, before BOOT HILL is earned", () => {
    // The rift itself is not cleared on the character yet the first time
    // through it, so its onward road is still shut — and the door must not
    // therefore go silent, or the run's only exit is the splash it replaced.
    const firstTime = hero(["medium:goodco_hq", "medium:moon", "medium:mars"]);
    expect(
      openRoads(clearedRift(), firstTime, "medium", riftDoor("far_door")),
    ).toEqual(["garage"]);
  });

  it("stands at the end of the road the whole level — it is never hidden", () => {
    // It carries an `unready` line, so the hide rule never reaches it: the
    // tear the intro sends him to FIND has to be visible while he looks.
    expect(hiddenTravelDoors(rift(), walker(), "medium")).not.toContain(
      "far_door",
    );
  });
});

describe("the way out is never hidden", () => {
  it("keeps the car on the drive for a brand-new hero", () => {
    expect(hiddenTravelDoors(home(), hero(), "medium")).not.toContain("car");
  });

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
