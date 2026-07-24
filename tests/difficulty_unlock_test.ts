// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The difficulty UNLOCK graph (pwa `isDifficultyUnlocked`, reading
// `DIFFICULTY_UNLOCK_PREREQS`): the three bottom lanes (easy/medium/hard) are
// PARALLEL entry points, all open from the first launch; beating ANY one opens
// nightmare, and beating nightmare opens jesus. This replaces the old strict
// five-rung chain (each rung needing the one before it).

import { LEVEL_ORDER } from "@game/core";
import type { Difficulty } from "@game/core";
import { describe, expect, it } from "vitest";

import type { Character } from "../pwa/src/game/characters.ts";
import {
  isDifficultyTierBeaten,
  isDifficultyUnlocked,
  isLevelUnlocked,
  nextDifficultyFor,
} from "../pwa/src/game/characters.ts";

// The gate reads only `character.beaten`; a partial stand-in keeps the test
// free of the full loadout/roster scaffolding.
function withBeaten(beaten: Difficulty[]): Character {
  return { beaten, clears: [] } as unknown as Character;
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

describe("isDifficultyTierBeaten — the shared starting tier opens together", () => {
  it("beating ANY starting lane clears the whole easy/medium/hard tier", () => {
    for (const lane of ["easy", "medium", "hard"] as Difficulty[]) {
      const c = withBeaten([lane]);
      expect(isDifficultyTierBeaten(c, "easy")).toBe(true);
      expect(isDifficultyTierBeaten(c, "medium")).toBe(true);
      expect(isDifficultyTierBeaten(c, "hard")).toBe(true);
      // The gated rungs stand alone — each its own tier, not opened by a lane.
      expect(isDifficultyTierBeaten(c, "nightmare")).toBe(false);
      expect(isDifficultyTierBeaten(c, "jesus")).toBe(false);
    }
  });

  it("a gated rung's tier is beaten only by its own clear", () => {
    const c = withBeaten(["hard", "nightmare"]);
    expect(isDifficultyTierBeaten(c, "nightmare")).toBe(true);
    expect(isDifficultyTierBeaten(c, "jesus")).toBe(false);
  });

  it("a fresh character has no tier beaten", () => {
    const fresh = withBeaten([]);
    for (const d of [
      "easy",
      "medium",
      "hard",
      "nightmare",
      "jesus",
    ] as Difficulty[]) {
      expect(isDifficultyTierBeaten(fresh, d)).toBe(false);
    }
  });
});

describe("isLevelUnlocked — the picker opens across the shared starting tier", () => {
  const last = LEVEL_ORDER[LEVEL_ORDER.length - 1] as string;

  it("opens every mission on a SIBLING lane once one starting lane is beaten", () => {
    // Beat EASY, then pick MEDIUM (never played): the last mission is reachable
    // for the grind up to nightmare — no fresh linear walk from level one.
    const c = withBeaten(["easy"]);
    for (const id of LEVEL_ORDER) {
      expect(isLevelUnlocked(c, id, "medium")).toBe(true);
      expect(isLevelUnlocked(c, id, "hard")).toBe(true);
    }
  });

  it("keeps the linear campaign locked before the tier is beaten", () => {
    const fresh = withBeaten([]);
    // The opener is always reachable; a later mission is not until its
    // predecessor is cleared here.
    expect(isLevelUnlocked(fresh, LEVEL_ORDER[0] as string, "medium")).toBe(
      true,
    );
    if (LEVEL_ORDER.length > 1) {
      expect(isLevelUnlocked(fresh, last, "medium")).toBe(false);
    }
  });
});
