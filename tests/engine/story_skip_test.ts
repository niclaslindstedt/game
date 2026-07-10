// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The replay story-skip: `skipStoryOpening` bails a level's whole opening
// (prelude cutscene + intro monologue) and arms the hero in one call, and
// `markThoughtsSeen` pre-seeds the seen-thought ledger so a pinned inner
// monologue the player already read never fires again. The app drives both
// from its per-character, per-difficulty story ledger (characters.ts) so a
// die-and-retry loop drops straight into the action instead of replaying text.

import { describe, expect, it } from "vitest";

import { createGame, markThoughtsSeen, skipStoryOpening } from "@game/core";
import { SEED } from "./helpers.ts";

describe("skipStoryOpening", () => {
  it("bails a prelude level's opening straight into play", () => {
    const state = createGame(SEED, "test_prelude_level");
    expect(state.phase).toBe("cutscene");
    skipStoryOpening(state);
    expect(state.phase).toBe("playing");
    expect(state.cutscene).toBeNull();
    // No opening strike on this level, so the hero was armed to begin with and
    // stays that way.
    expect(state.player.disarmed).toBe(false);
  });

  it("skips a plain intro monologue straight into play", () => {
    const state = createGame(SEED, "test_level");
    expect(state.phase).toBe("intro");
    skipStoryOpening(state);
    expect(state.phase).toBe("playing");
  });

  it("is a harmless no-op on a run already in play", () => {
    const state = createGame(SEED, "test_level");
    skipStoryOpening(state);
    expect(state.phase).toBe("playing");
    // Calling it again changes nothing.
    skipStoryOpening(state);
    expect(state.phase).toBe("playing");
    expect(state.player.disarmed).toBe(false);
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
