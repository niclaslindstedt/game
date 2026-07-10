// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Two-way arrival scenes: a `{ hero: [...] }` page in EnemyDef.dialogue is
// the HERO talking back mid-scene. `dialogueContent` normalizes the authored
// pages into plain line pages plus a parallel `heroPages` flag array — the
// app swaps in the hero's name and portrait on the flagged pages, and the
// page-turn machinery treats a reply like any other page.

import { describe, expect, it } from "vitest";

import { advanceDialogue, collectStoryItem, dialogueContent } from "@game/core";
import type { GameState } from "@game/core";
import { clearStage, idle, makeEnemy, run, startGame } from "./helpers.ts";

/** Park the two-way fixture elite beside the hero and run to its scene. */
function meetTalker(): GameState {
  const state = startGame();
  clearStage(state);
  state.enemies.push(
    makeEnemy(
      { pos: { x: state.player.pos.x + 40, y: state.player.pos.y } },
      "test_talker",
    ),
  );
  run(state, idle, 60, (s) => s.phase === "dialogue");
  expect(state.phase).toBe("dialogue");
  return state;
}

describe("hero replies in arrival scenes", () => {
  it("normalizes hero pages into lines plus parallel heroPages flags", () => {
    const state = meetTalker();
    const content = dialogueContent(state.dialogue!);
    // The scene stays owned by the enemy speaker…
    expect(content.speaker).toBe("TEST TALKER");
    // …its pages read out in order, hero reply included…
    expect(content.pages).toEqual([
      ["TEST TALKER LINE ONE."],
      ["TEST HERO REPLY."],
      ["TEST TALKER LINE TWO."],
    ]);
    // …and the flags mark exactly the page the hero speaks.
    expect(content.heroPages).toEqual([false, true, false]);
  });

  it("turns a hero page like any other page", () => {
    const state = meetTalker();
    advanceDialogue(state); // past the opener
    advanceDialogue(state); // past the hero's reply
    expect(state.phase).toBe("dialogue");
    advanceDialogue(state); // past the last page — the scene ends
    expect(state.phase).toBe("playing");
    expect(state.dialogue).toBeNull();
  });

  it("keeps single-speaker scenes free of hero pages", () => {
    const state = startGame();
    clearStage(state);
    collectStoryItem(state, "test_key", { ...state.player.pos });
    expect(state.phase).toBe("dialogue");
    const content = dialogueContent(state.dialogue!);
    expect(content.heroPages).toEqual(content.pages.map(() => false));
  });
});
