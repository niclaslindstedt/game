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
  createRunFromParams,
  dismissIntro,
  introPages,
  markThoughtsSeen,
  seatHero,
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

  it("arms the WHOLE party, not just seat 0", () => {
    const state = createGame(SEED, "test_level");
    const joiner = seatHero(state, null);
    // Both start the level holstered — the opening is the LEVEL's, so the skip
    // has to be too. Armed only at seat 0, a joiner could never swing again on
    // a level whose one arming beat has just been skipped past.
    state.players[0].disarmed = true;
    joiner.disarmed = true;
    skipStoryOpening(state);
    expect(state.players[0].disarmed).toBe(false);
    expect(joiner.disarmed).toBe(false);
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

// THE MONOLOGUE IS THE LEVEL'S, ALL OF IT. Nothing a trip in left him with is
// spoken here any more: the DRIVE says what it made of the journey at the wheel,
// on its own run-in, in front of the place's own line. So the briefing has no
// half that outlives the replay skip — which is exactly what the skip used to
// have to work around.
describe("the opening monologue", () => {
  it("is the level's own pages and nothing in front of them", () => {
    const state = createRunFromParams({
      seed: SEED,
      levelId: "test_level",
      difficulty: "medium",
    });
    expect(introPages(state)).toEqual([["TEST INTRO LINE."]]);
    expect(state.introPage).toBe(0);
  });

  it("is spent whole by the replay skip, which lands on the title card", () => {
    // A die-and-retry loop has read the briefing, and there is nothing behind
    // it that has not been read — so the skip is the card.
    const state = createRunFromParams({
      seed: SEED,
      levelId: "test_level",
      difficulty: "medium",
    });
    skipStoryOpening(state);
    expect(state.phase).toBe("title");
    expect(state.introPage).toBe(0);
  });

  it("takes the same skip through the session parameters", () => {
    // `openingSkip: "story"` is how the app and an arriving client ask for it,
    // and it must land the same run — a field only one of them applied is a
    // desync.
    const state = createRunFromParams({
      seed: SEED,
      levelId: "test_level",
      difficulty: "medium",
      openingSkip: "story",
    });
    expect(state.phase).toBe("title");
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
