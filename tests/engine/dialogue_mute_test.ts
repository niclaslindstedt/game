// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The dialogue MUTE button (`muteDialogue`): the player silences the repeatable
// in-world chatter for the rest of a level. It dismisses whatever scene is on
// stage and latches `dialogueMuted`, after which every scene source — elite/
// boss arrivals, story-item lore, and the like — is suppressed until the next
// level rebuilds a fresh state. Cutscenes keep their own SKIP and are untouched.

import { describe, expect, it } from "vitest";

import { collectStoryItem, muteDialogue } from "@game/core";
import type { GameState } from "@game/core";
import { clearStage, idle, makeEnemy, run, startGame } from "./helpers.ts";

/** Park the fixture boss beside the hero and run to his arrival scene. */
function meetBoss(): GameState {
  const state = startGame();
  clearStage(state);
  state.enemies.push(
    makeEnemy(
      { pos: { x: state.player.pos.x + 40, y: state.player.pos.y } },
      "test_boss",
    ),
  );
  run(state, idle, 60, (s) => s.phase === "dialogue");
  expect(state.phase).toBe("dialogue");
  return state;
}

describe("muteDialogue", () => {
  it("dismisses the current scene and resumes play", () => {
    const state = meetBoss();
    muteDialogue(state);
    expect(state.dialogueMuted).toBe(true);
    expect(state.dialogue).toBeNull();
    expect(state.phase).toBe("playing");
  });

  it("routes a pending level-up to the chooser as it dismisses", () => {
    const state = meetBoss();
    state.player.pendingStatPoints = 1;
    muteDialogue(state);
    expect(state.dialogue).toBeNull();
    expect(state.phase).toBe("levelup");
  });

  it("suppresses a later enemy arrival for the rest of the level", () => {
    const state = meetBoss();
    muteDialogue(state);
    // A fresh speaker walks into speak range: its scene is forfeited (marked
    // spoke on the step path) and the run never leaves play.
    const next = makeEnemy(
      { pos: { x: state.player.pos.x + 40, y: state.player.pos.y } },
      "test_boss",
    );
    state.enemies.push(next);
    run(state, idle, 60);
    expect(next.spoke).toBe(true);
    expect(state.dialogue).toBeNull();
    expect(state.phase).toBe("playing");
  });

  it("still banks a story item but plays no lore once muted", () => {
    const state = startGame();
    clearStage(state);
    state.dialogueMuted = true;
    collectStoryItem(state, "test_key", { ...state.player.pos });
    // The plot item is collected; only its lore box is silenced.
    expect(state.storyItems).toContain("test_key");
    expect(state.dialogue).toBeNull();
    expect(state.phase).toBe("playing");
  });

  it("lifts on the next level (a fresh state is unmuted)", () => {
    const muted = meetBoss();
    muteDialogue(muted);
    expect(muted.dialogueMuted).toBe(true);
    // The next map builds a new state — the mute does not carry over.
    const fresh = startGame();
    expect(fresh.dialogueMuted).toBe(false);
  });
});
