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
  cutsceneDef,
  isDialogueEnabled,
  RUN,
  setCutscenesEnabled,
  setDialogueEnabled,
  step,
  tapCutscene,
} from "@game/core";
import type { GameState } from "@game/core";
import { DT, idle, makeEnemy, run, SEED, startGame } from "./helpers.ts";

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

  it("off skips the opening monologue straight to the level-name card", () => {
    // Dialogue ON, the reference level opens on the hero's intro monologue…
    expect(createGame(SEED, "test_level").phase).toBe("intro");
    setDialogueEnabled(false);
    try {
      // …OFF, that monologue is silenced too: the run opens on the `title`
      // card (the same phase a SKIP lands on), never the `intro` box.
      expect(createGame(SEED, "test_level").phase).toBe("title");
    } finally {
      setDialogueEnabled(true);
    }
    expect(createGame(SEED, "test_level").phase).toBe("intro");
  });

  it("off lands a played-out prelude on the title card, not the intro", () => {
    // Cutscenes stay on (they own their own SKIP) — only the intro monologue
    // after them is dropped when dialogue is muted.
    setDialogueEnabled(false);
    try {
      const state = createGame(SEED, "test_prelude_level");
      expect(state.phase).toBe("cutscene");
      const beats = cutsceneDef("test_prelude").beats.length;
      for (let i = 0; i < beats && state.phase === "cutscene"; i++) {
        tapCutscene(state);
      }
      expect(state.phase).toBe("title");
      expect(state.cutscene).toBeNull();
    } finally {
      setDialogueEnabled(true);
    }
    // Restored: the prelude hands off to the intro monologue again.
    const on = createGame(SEED, "test_prelude_level");
    const beats = cutsceneDef("test_prelude").beats.length;
    for (let i = 0; i < beats && on.phase === "cutscene"; i++) {
      tapCutscene(on);
    }
    expect(on.phase).toBe("intro");
  });

  it("off skips the post-victory epilogue straight to the victory splash", () => {
    // Dialogue ON, clearing an outro level reads its epilogue pages first.
    const on = startGame(42, "test_outro_level");
    winObjective(on);
    run(on, idle, Math.ceil(RUN.victoryDelayMs / DT) + 2);
    expect(on.phase).toBe("outro");
    // OFF, the epilogue is skipped like the intro — straight to the splash.
    setDialogueEnabled(false);
    try {
      const off = startGame(42, "test_outro_level");
      expect(off.dialogueMuted).toBe(true);
      winObjective(off);
      run(off, idle, Math.ceil(RUN.victoryDelayMs / DT) + 2);
      expect(off.phase).toBe("victory");
    } finally {
      setDialogueEnabled(true);
    }
  });
});

/** Clear the objective: remove the parked boss, then let step() notice. */
function winObjective(state: GameState): void {
  state.enemies = [];
  step(state, idle, DT);
}
