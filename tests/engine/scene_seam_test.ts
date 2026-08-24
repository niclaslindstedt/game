// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SEAM BETWEEN TWO CHAINED SCENES — `sceneEnded` (the event a finished
// prelude scene announces itself with) and `skipScene` (the verb that drops
// the CURRENT scene alone). Together they are what lets the app fork a
// minigame in between two scenes of one prelude: the flight mounts on the
// launch's ending and lands by skipping the cruise it stood in for.
//
// An ENGINE suite: it plays the synthetic prelude fixtures, never a shipped
// scene.

import { describe, expect, it } from "vitest";

import {
  createGame,
  skipCutscene,
  skipScene,
  step,
  tapCutscene,
  type GameState,
} from "@game/core";
import { DT, idle, SEED } from "./helpers.ts";

function sceneEndedIds(state: GameState): string[] {
  return state.events.flatMap((e) => (e.type === "sceneEnded" ? [e.id] : []));
}

/** Step the prelude out, tapping through its text beats (the fixture scene
 * holds a `say` a scene cannot outwait on its own), collecting every
 * `sceneEnded` the run raises on the way. */
function playOut(state: GameState): string[] {
  const seen: string[] = [];
  for (let i = 0; i < 20_000 && state.phase === "cutscene"; i++) {
    step(state, idle, DT);
    seen.push(...sceneEndedIds(state));
    if (i % 40 === 39) tapCutscene(state);
  }
  // One more tick: the last scene's announcement drains on the step AFTER the
  // phase moves on.
  step(state, idle, DT);
  seen.push(...sceneEndedIds(state));
  return seen;
}

describe("sceneEnded", () => {
  it("announces a scene that played out, by its own id", () => {
    const state = createGame(SEED, "test_prelude_level");
    expect(state.phase).toBe("cutscene");
    const seen = playOut(state);
    expect(seen).toContain("test_prelude");
    expect(state.phase).toBe("intro");
  });

  it("announces a scene the player tapped through — the roll survives the next step's event clear", () => {
    const state = createGame(SEED, "test_prelude_level");
    for (let i = 0; i < 200 && state.phase === "cutscene"; i++) {
      tapCutscene(state);
    }
    expect(state.phase).toBe("intro");
    // The tap rolled the chain BETWEEN ticks; the announcement must survive
    // the next step's event clear.
    step(state, idle, DT);
    expect(sceneEndedIds(state)).toContain("test_prelude");
  });

  it("announces nothing for a chain thrown away whole (skipCutscene)", () => {
    const state = createGame(SEED, "test_prelude_level");
    skipCutscene(state);
    step(state, idle, DT);
    expect(sceneEndedIds(state)).toEqual([]);
  });
});

describe("skipScene", () => {
  it("drops the current scene alone and lands on the opening, not the title", () => {
    const state = createGame(SEED, "test_prelude_level");
    skipScene(state);
    // Unlike the player's SKIP, the intro monologue behind the scene still
    // plays — that is the verb's whole reason to exist.
    expect(state.phase).toBe("intro");
    expect(state.cutscene).toBeNull();
  });

  it("rolls to the next queued scene when the chain holds one", () => {
    const state = createGame(SEED, "test_prelude_level");
    state.cutsceneQueue.push("test_prelude");
    skipScene(state);
    expect(state.phase).toBe("cutscene");
    expect(state.cutscene?.defId).toBe("test_prelude");
  });

  it("announces nothing for the scene it dropped", () => {
    const state = createGame(SEED, "test_prelude_level");
    skipScene(state);
    step(state, idle, DT);
    expect(sceneEndedIds(state)).toEqual([]);
  });

  it("is a no-op outside the cutscene phase", () => {
    const state = createGame(SEED, "test_level");
    const phase = state.phase;
    skipScene(state);
    expect(state.phase).toBe(phase);
  });
});
