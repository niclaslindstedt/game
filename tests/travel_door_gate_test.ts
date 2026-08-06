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

const doorNamed = (id: string) =>
  (LEVELS.garage!.travelDoors ?? []).find((d) => d.id === id)!;

// The gate reads only `clears`, `beaten` and `keepsakes`; a partial stand-in
// keeps the test free of the full loadout/roster scaffolding (the idiom
// difficulty_unlock_test.ts uses).
function hero(
  clears: string[] = [],
  beaten: Difficulty[] = [],
  keepsakes: string[] = [],
  riftRoads: string[] = [],
): Character {
  return { clears, beaten, keepsakes, riftRoads } as unknown as Character;
}

describe("the picker names only the roads that are open", () => {
  it("says nothing about MARS until the moon has let go", () => {
    const rocket = doorNamed("rocket");
    // GOODCO cleared: the moon is the one road, and MARS is not on the panel.
    const afterHq = hero(["medium:goodco_hq"]);
    expect(openRoads(afterHq, "medium", rocket)).toEqual(["moon"]);
    // The moon cleared too: now both are named, in authored order.
    const afterMoon = hero(["medium:goodco_hq", "medium:moon"]);
    expect(openRoads(afterMoon, "medium", rocket)).toEqual(["moon", "mars"]);
  });

  it("names no deep road until the RIFT CREATOR is banked", () => {
    const seam = doorNamed("rift_seam");
    // The campaign walked as far as the rift (which is where the creator
    // drops) and both deep roads have been walked through a portal — and the
    // door is STILL shut without the keepsake. The gate is the whole door,
    // not merely its rows.
    const toTheRift = [
      "medium:goodco_hq",
      "medium:moon",
      "medium:mars",
      "medium:the_rift",
    ];
    const walked = ["the_rift", "boot_hill"];
    expect(openRoads(hero(toTheRift, [], [], walked), "medium", seam)).toEqual(
      [],
    );
    const kept = hero(toTheRift, [], ["rift_creator"], walked);
    expect(openRoads(kept, "medium", seam)).toEqual(["the_rift", "boot_hill"]);
  });

  it("reaches only where the TOOL has been, not where the campaign says he may go", () => {
    const seam = doorNamed("rift_seam");
    const toTheRift = [
      "medium:goodco_hq",
      "medium:moon",
      "medium:mars",
      "medium:the_rift",
    ];
    // Clearing MARS unlocks the rift on the campaign ladder — and tears no
    // seam. Until THE FOUNDER's own tear has actually been followed, the seam
    // at home has no road to it.
    expect(
      openRoads(hero(toTheRift, [], ["rift_creator"]), "medium", seam),
    ).toEqual([]);
    // …and the other way round: a road walked through a portal is offered even
    // on a rung whose ladder has not reached it. The tool remembers the trip,
    // not the campaign.
    const fresh = hero([], [], ["rift_creator"], ["the_bunker"]);
    expect(openRoads(fresh, "nightmare", seam)).toEqual(["the_bunker"]);
  });

  it("always names the road out — the car's is the campaign's first level", () => {
    expect(openRoads(hero(), "medium", doorNamed("car"))).toEqual([
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
      ["the_rift"],
    );
    expect(hiddenTravelDoors(home(), kept, "medium")).not.toContain(
      "rift_seam",
    );
  });
});

describe("the rift portals out in the maps", () => {
  it("MARS and THE RIFT declare their way onward as a tear", () => {
    // Both of these bosses FLEE, which ends the level the instant the tear
    // opens — so there is never a live field to walk over and tap it on, and
    // the crossing itself is the trip. `riftExit` is what says so, and it is
    // what teaches the seam at home the road (see GameScreen's onAdvance).
    expect(LEVELS.mars!.riftExit).toBe(true);
    expect(LEVELS.the_rift!.riftExit).toBe(true);
  });

  it("is claimed by no venue whose exit is an ordinary road", () => {
    for (const id of ["goodco_hq", "moon", "boot_hill", "garage"]) {
      expect(LEVELS[id]!.riftExit, `level "${id}"`).toBeUndefined();
    }
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
