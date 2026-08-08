// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ARCADE SHELF (pwa/src/game/minigames.ts): who may grind a minigame on its
// own, and on which rungs.
//
// THE WHOLE CAMPAIGN IS THE KEY. A cabinet is not earned by playing the
// interlude on the way to work — it is earned by BEATING the game — and the
// rungs it may be replayed on are exactly the rungs that has been done on. The
// record is `Character.beaten`, which already exists, already rides cloud save
// and is already what the campaign ladder reads, so there is nothing stored
// here for a second copy to disagree with.

import { describe, expect, it } from "vitest";

import type { Difficulty } from "@game/menu";

import type { Character } from "../pwa/src/game/characters.ts";
import {
  arcadeRung,
  arcadeRungs,
  hasArcade,
  minigameDef,
  MINIGAME_ORDER,
} from "../pwa/src/game/minigames.ts";
import {
  arcadeDriveParams,
  driveParamsFor,
} from "../pwa/src/game/drive-screen/begin.ts";
import { setMinigamesEnabled } from "../engine/menu.ts";

/** A hero who has beaten the campaign on these rungs, and nothing else. */
function hero(beaten: Difficulty[], over: Partial<Character> = {}): Character {
  return {
    id: `hero-${beaten.join("-") || "none"}`,
    name: "ADA",
    hardcore: false,
    createdAt: 0,
    dead: false,
    loadout: null,
    clears: [],
    beaten,
    storySeen: [],
    merchantsMet: [],
    ...over,
  };
}

describe("the arcade shelf", () => {
  it("is closed until a whole campaign has been beaten", () => {
    // A roster of heroes who are PLAYING is not a roster of heroes who have
    // FINISHED, and the shelf is the reward for finishing.
    expect(hasArcade([])).toBe(false);
    expect(hasArcade([hero([]), hero([], { clears: ["medium:garage"] })])).toBe(
      false,
    );
    expect(arcadeRungs([hero([])])).toEqual([]);
    expect(hasArcade([hero(["medium"])])).toBe(true);
  });

  it("offers exactly the rungs the campaign was beaten on, easiest first", () => {
    expect(arcadeRungs([hero(["jesus", "easy"])])).toEqual(["easy", "jesus"]);
  });

  it("counts every hero on the roster, dead ones included", () => {
    // The shelf is the PLAYER's, not one hero's: a retired hardcore hero's
    // campaign is still a campaign this person finished, and switching to a
    // fresh hero must not take the cabinet away again.
    const roster = [hero([]), hero(["nightmare"], { dead: true })];
    expect(arcadeRungs(roster)).toEqual(["nightmare"]);
    expect(hasArcade(roster)).toBe(true);
  });

  it("names every cabinet it can list", () => {
    // A shelf row is drawn from the def, so an id with no def would be a blank
    // row rather than a missing one.
    for (const id of MINIGAME_ORDER) {
      const def = minigameDef(id);
      expect(def.id).toBe(id);
      expect(def.name).toBe(def.name.toUpperCase());
      expect(def.name.length).toBeGreaterThan(0);
    }
  });

  it("never plays a rung the player has not earned", () => {
    // The pick is PERSISTED and the rungs are EARNED, so the two can
    // legitimately disagree — a saved NIGHTMARE on a device whose only
    // campaign-beating hero was since deleted, or a settings blob carried in
    // from another install. The saved pick loses; the easiest earned rung wins.
    const roster = [hero(["hard"])];
    expect(arcadeRung(roster, "hard")).toBe("hard");
    expect(arcadeRung(roster, "nightmare")).toBe("hard");
    // …and with nothing earned there is no rung at all, which is what makes a
    // press on a cabinet buzz rather than launch one.
    expect(arcadeRung([hero([])], "medium")).toBeNull();
  });
});

describe("a cabinet's own road", () => {
  it("is played whatever the MINIGAMES setting says", () => {
    // The setting is a decision about the trip to work — whether a RUN stops to
    // play the interlude — and it is not a padlock on a cabinet the player beat
    // the game to reach. The campaign door reads it; the shelf's does not.
    try {
      setMinigamesEnabled(false);
      expect(
        driveParamsFor("goodco_hq", "garage", true, false, 7, "medium"),
      ).toBeNull();
      const lap = arcadeDriveParams(7, "medium");
      expect(lap.to).toBe("goodco_hq");
      expect(lap.direction).toBe(1);
      expect(lap.difficulty).toBe("medium");
      expect(lap.seed).toBe(7);
    } finally {
      setMinigamesEnabled(true);
    }
  });

  it("carries the rung the shelf was set to", () => {
    expect(arcadeDriveParams(1, "jesus").difficulty).toBe("jesus");
  });
});
