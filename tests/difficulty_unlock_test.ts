// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The difficulty UNLOCK graph (pwa `isDifficultyUnlocked`, reading
// `DIFFICULTY_UNLOCK_PREREQS`): the three bottom lanes (easy/medium/hard) are
// PARALLEL entry points, all open from the first launch; beating ANY one opens
// nightmare, and beating nightmare opens jesus. This replaces the old strict
// five-rung chain (each rung needing the one before it).

import type { Difficulty } from "@game/core";
import { describe, expect, it } from "vitest";

import type { Character } from "../pwa/src/game/characters.ts";
import {
  isDifficultyUnlocked,
  nextDifficultyFor,
} from "../pwa/src/game/characters.ts";

// The gate reads only `character.beaten`; a partial stand-in keeps the test
// free of the full loadout/roster scaffolding.
function withBeaten(beaten: Difficulty[]): Character {
  return { beaten } as unknown as Character;
}

describe("difficulty unlock graph — parallel starting lanes", () => {
  it("easy, medium, and hard are all open from the start", () => {
    const fresh = withBeaten([]);
    expect(isDifficultyUnlocked(fresh, "easy")).toBe(true);
    expect(isDifficultyUnlocked(fresh, "medium")).toBe(true);
    expect(isDifficultyUnlocked(fresh, "hard")).toBe(true);
  });

  it("nightmare and jesus are locked on a fresh character", () => {
    const fresh = withBeaten([]);
    expect(isDifficultyUnlocked(fresh, "nightmare")).toBe(false);
    expect(isDifficultyUnlocked(fresh, "jesus")).toBe(false);
  });

  it("beating ANY one bottom lane opens nightmare (jesus still gated)", () => {
    for (const lane of ["easy", "medium", "hard"] as Difficulty[]) {
      const c = withBeaten([lane]);
      expect(isDifficultyUnlocked(c, "nightmare")).toBe(true);
      expect(isDifficultyUnlocked(c, "jesus")).toBe(false);
    }
  });

  it("jesus opens only once nightmare is beaten", () => {
    expect(isDifficultyUnlocked(withBeaten(["medium"]), "jesus")).toBe(false);
    expect(
      isDifficultyUnlocked(withBeaten(["medium", "nightmare"]), "jesus"),
    ).toBe(true);
  });
});

describe("nextDifficultyFor — the roster card's NEXT standing", () => {
  it("points a fresh hero at the gentlest starting lane", () => {
    expect(nextDifficultyFor(withBeaten([]))).toBe("easy");
  });

  it("beating ANY starting lane points at nightmare, not a skipped lane", () => {
    for (const lane of ["easy", "medium", "hard"] as Difficulty[]) {
      expect(nextDifficultyFor(withBeaten([lane]))).toBe("nightmare");
    }
  });

  it("still points at nightmare once several starting lanes are beaten", () => {
    expect(nextDifficultyFor(withBeaten(["easy", "medium", "hard"]))).toBe(
      "nightmare",
    );
  });

  it("beating nightmare points at jesus", () => {
    expect(nextDifficultyFor(withBeaten(["hard", "nightmare"]))).toBe("jesus");
  });

  it("beating jesus reads as ALL CLEARED (null)", () => {
    expect(
      nextDifficultyFor(withBeaten(["hard", "nightmare", "jesus"])),
    ).toBeNull();
  });
});
