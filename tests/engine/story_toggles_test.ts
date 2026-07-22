// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The DISPLAY toggles for the story's spoken scenes (pwa settings
// `dialogue`/`cutscenes`, applied via `setDialogueEnabled`/`setCutscenesEnabled`).
// Both default ON; flipping one off is read at level build (create.ts):
// dialogue-off starts a run already `dialogueMuted` (every in-world scene
// silenced), cutscenes-off drops the prelude so the run opens on the intro.
// The flags are engine-global, so each test restores the shipped ON default.

import { describe, expect, it } from "vitest";

import {
  areCutscenesEnabled,
  createGame,
  isDialogueEnabled,
  setCutscenesEnabled,
  setDialogueEnabled,
} from "@game/core";
import { idle, makeEnemy, run, SEED, startGame } from "./helpers.ts";

describe("cutscenes display toggle", () => {
  it("defaults on — a prelude level boots into its cutscene", () => {
    expect(areCutscenesEnabled()).toBe(true);
    const state = createGame(SEED, "test_prelude_level");
    expect(state.phase).toBe("cutscene");
    expect(state.cutscene?.defId).toBe("test_prelude");
  });

  it("off skips the whole prelude straight to the intro", () => {
    setCutscenesEnabled(false);
    try {
      const state = createGame(SEED, "test_prelude_level");
      expect(state.phase).toBe("intro");
      expect(state.cutscene).toBeNull();
      expect(state.cutsceneQueue).toEqual([]);
      // A chained prelude is dropped queue-and-all, too.
      const chain = createGame(SEED, "test_chain_level");
      expect(chain.phase).toBe("intro");
      expect(chain.cutscene).toBeNull();
      expect(chain.cutsceneQueue).toEqual([]);
    } finally {
      setCutscenesEnabled(true);
    }
    // Restored: the next build plays the prelude again.
    expect(createGame(SEED, "test_prelude_level").phase).toBe("cutscene");
  });
});

describe("dialogue display toggle", () => {
  it("defaults on — a fresh run starts unmuted", () => {
    expect(isDialogueEnabled()).toBe(true);
    expect(createGame(SEED, "test_level").dialogueMuted).toBe(false);
  });

  it("off starts the run muted and forfeits an enemy arrival scene", () => {
    setDialogueEnabled(false);
    try {
      const state = startGame();
      expect(state.dialogueMuted).toBe(true);
      // A speaker walks into range: its scene is silenced (marked spoke on the
      // step path) and the run never leaves play.
      const boss = makeEnemy(
        { pos: { x: state.player.pos.x + 40, y: state.player.pos.y } },
        "test_boss",
      );
      state.enemies.push(boss);
      run(state, idle, 60);
      expect(boss.spoke).toBe(true);
      expect(state.dialogue).toBeNull();
      expect(state.phase).toBe("playing");
    } finally {
      setDialogueEnabled(true);
    }
    // Restored: the next build is unmuted again.
    expect(startGame().dialogueMuted).toBe(false);
  });
});
