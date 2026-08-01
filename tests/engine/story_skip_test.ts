// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The replay story-skip: `skipStoryOpening` bails a level's STORY opening
// (prelude cutscene + intro monologue) and arms the hero in one call — landing
// on the level-name `title` card, which is orientation rather than story and
// so shows even on a replay. `markThoughtsSeen` pre-seeds the seen-thought
// ledger so a pinned inner monologue the player already read never fires
// again. The app drives both from its per-character, per-difficulty story
// ledger (characters.ts) so a die-and-retry loop drops back into the action
// one splash away instead of replaying text.

import { describe, expect, it } from "vitest";

import {
  createGame,
  dismissIntro,
  markThoughtsSeen,
  skipStoryOpening,
} from "@game/core";
import { SEED } from "./helpers.ts";

describe("skipStoryOpening", () => {
  it("bails a prelude level's opening onto the title card", () => {
    const state = createGame(SEED, "test_prelude_level");
    expect(state.phase).toBe("cutscene");
    skipStoryOpening(state);
    expect(state.phase).toBe("title");
    expect(state.cutscene).toBeNull();
    // No opening strike on this level, so the hero was armed to begin with and
    // stays that way.
    expect(state.players[0].disarmed).toBe(false);
    // The card's tap/timer is what drops into play.
    dismissIntro(state);
    expect(state.phase).toBe("playing");
  });

  it("skips a plain intro monologue onto the title card", () => {
    const state = createGame(SEED, "test_level");
    expect(state.phase).toBe("intro");
    skipStoryOpening(state);
    expect(state.phase).toBe("title");
  });

  it("is a harmless no-op on a run already in play", () => {
    const state = createGame(SEED, "test_level");
    skipStoryOpening(state);
    dismissIntro(state);
    expect(state.phase).toBe("playing");
    // Calling it again changes nothing.
    skipStoryOpening(state);
    expect(state.phase).toBe("playing");
    expect(state.players[0].disarmed).toBe(false);
  });
});

describe("markThoughtsSeen", () => {
  it("seeds unseen ids and dedupes against the ledger", () => {
    const state = createGame(SEED, "test_level");
    expect(state.thoughtsSeen).toEqual([]);
    markThoughtsSeen(state, ["a", "b"]);
    expect(state.thoughtsSeen).toEqual(["a", "b"]);
    // Re-seeding an already-seen id is a no-op; a new id appends.
    markThoughtsSeen(state, ["a", "c"]);
    expect(state.thoughtsSeen).toEqual(["a", "b", "c"]);
  });

  it("accepts an empty list without touching the ledger", () => {
    const state = createGame(SEED, "test_level");
    markThoughtsSeen(state, ["x"]);
    markThoughtsSeen(state, []);
    expect(state.thoughtsSeen).toEqual(["x"]);
  });
});
