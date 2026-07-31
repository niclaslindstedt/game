// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Two-way arrival scenes: a `{ hero: [...] }` page in EnemyDef.dialogue is
// the HERO talking back mid-scene. `dialogueContent` normalizes the authored
// pages into plain line pages plus a parallel `voices` array saying who
// delivers each one — the app draws that page's name and portrait, and the
// page-turn machinery treats a reply like any other page. (A THOUGHT is the
// mirror image, `{ them: [...] }`; see thought_voice_test.ts.)

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
      { pos: { x: state.players[0].pos.x + 40, y: state.players[0].pos.y } },
      "test_talker",
    ),
  );
  run(state, idle, 60, (s) => s.phase === "dialogue");
  expect(state.phase).toBe("dialogue");
  return state;
}

describe("hero replies in arrival scenes", () => {
  it("normalizes hero pages into lines plus a parallel voice per page", () => {
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
    // …and the voices mark exactly the page the hero speaks, with his own name
    // over it rather than the mob's.
    expect(content.voices.map((v) => v.hero)).toEqual([false, true, false]);
    expect(content.voices.map((v) => v.speaker)).toEqual([
      "TEST TALKER",
      "ME",
      "TEST TALKER",
    ]);
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
    collectStoryItem(state, "test_key", { ...state.players[0].pos });
    expect(state.phase).toBe("dialogue");
    const content = dialogueContent(state.dialogue!);
    expect(content.voices.map((v) => v.hero)).toEqual(
      content.pages.map(() => false),
    );
    expect(content.voices.every((v) => v.speaker === content.speaker)).toBe(
      true,
    );
  });
});
