// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SEND-OFF — `LevelDef.farewell`, the prelude's mirror at the other end of
// a run: a cutscene chain played the moment the objective falls, before the
// epilogue pages and the victory splash.
//
// It exists because a DEPARTURE belongs to the place being left. The shipped
// moon is the case: its ghost sees the hero off the landing site, and hanging
// that scene on MARS — a level flown to from the hero's own lawn — showed a
// player who had walked home and boarded his own ship a picture of himself
// standing on regolith in a spacesuit, saying goodbye.
//
// The rule these tests pin is the one that is easy to get wrong: a cutscene
// chain has to know WHICH END OF THE RUN it was (`GameState.cutsceneThen`),
// because by the time it drains both ends look identical — the `cutscene`
// phase with an empty queue.

import { describe, expect, it } from "vitest";

import {
  createGame,
  RUN,
  setDialogueEnabled,
  skipCutscene,
  tapCutscene,
} from "@game/core";
import type { GameState } from "@game/core";

import { DT, idle, run, SEED } from "./helpers.ts";

/**
 * A run standing on an empty board, one step short of its victory beat.
 *
 * The phases are STEPPED into rather than assigned, because which phase the
 * engine picks when the objective clears is the whole of what is under test.
 */
function wonRun(levelId: string): GameState {
  const state = createGame(SEED, levelId);
  skipCutscene(state);
  state.phase = "playing";
  state.enemies = [];
  state.spawners = [];
  // The loot-grab countdown arms first, then runs out — the same two waits
  // every victory test makes (`RUN.victoryDelayMs`).
  run(state, idle, Math.ceil(RUN.victoryDelayMs / DT) + 20, (s) =>
    ["cutscene", "outro", "victory"].includes(s.phase),
  );
  return state;
}

/** Turn the running scene over beat by beat until it lets go of the stage. */
function playOut(state: GameState): void {
  for (let i = 0; i < 200 && state.phase === "cutscene"; i++) {
    tapCutscene(state);
  }
}

describe("a level's farewell", () => {
  it("plays when the objective falls, then hands over to the epilogue", () => {
    const state = wonRun("test_farewell_level");
    expect(state.phase).toBe("cutscene");
    expect(state.cutscene?.defId).toBe("test_prelude");
    // …and it knows it is the END of the run rather than the start of one.
    expect(state.cutsceneThen).toBe("victory");

    playOut(state);
    // The epilogue comes AFTER the send-off — not instead of it, and not
    // before: the ghost speaks, then the black-screen pages, then the splash.
    expect(state.phase).toBe("outro");
  });

  it("is skipped whole by a DIALOGUE-muted run", () => {
    setDialogueEnabled(false);
    try {
      const state = wonRun("test_farewell_level");
      // Muted: no send-off and no epilogue — straight to the splash, exactly
      // as a muted run drops the prelude and the opening monologue.
      expect(state.phase).toBe("victory");
      expect(state.cutscene).toBeNull();
    } finally {
      setDialogueEnabled(true);
    }
  });

  it("leaves a level without one on the path it always had", () => {
    const state = wonRun("test_level");
    expect(state.phase).not.toBe("cutscene");
    expect(state.cutsceneThen).toBe("intro");
  });

  it("SKIPPED, still lands on the epilogue rather than the title card", () => {
    const state = wonRun("test_farewell_level");
    expect(state.phase).toBe("cutscene");
    skipCutscene(state);
    // The bug this pins: SKIP used to send every chain to the level-name
    // `title` card, which for a send-off drops a player who has just BEATEN
    // the level back onto the card announcing it.
    expect(state.phase).toBe("outro");
  });
});
