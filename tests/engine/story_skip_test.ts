// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The replay story-skip: `skipStoryOpening` bails a level's STORY opening
// (prelude cutscene + intro monologue) and arms the hero in one call — landing
// on the level-name `title` card, which is orientation rather than story and
// so shows even on a replay. `markThoughtsSeen` pre-seeds the seen-thought
// ledger so a pinned inner monologue the player already read never fires
// again. The app drives both from its per-character, per-difficulty story
// ledger (characters.ts) so a die-and-retry loop drops back into the action
// one splash away instead of replaying text.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  advanceIntro,
  CAP_THOUGHT_IDS,
  createGame,
  createRunFromParams,
  dismissIntro,
  introPages,
  markThoughtsSeen,
  registerDefs,
  seatHero,
  skipStoryOpening,
  THOUGHT_DEFS,
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

// WHAT HE ARRIVED STILL THINKING (`RunParams.arrivalThought`) — the line the
// trip in left him with, spoken in the destination's own opening monologue
// rather than as a popup on the road he was still driving. It goes FIRST: the
// drive is the thing still in his hands when he gets out of the car, and the
// level's briefing is what he settles into afterwards.
describe("the arrival line", () => {
  const ARRIVAL = ["WHAT A TRIP THAT WAS."];
  const beats = {
    test_arrival: {
      id: "test_arrival",
      speaker: "ME",
      portrait: "player",
      pages: [ARRIVAL],
    },
  };

  /** A run built the way the app builds one after a drive. */
  const arrived = (openingSkip?: "story") =>
    createRunFromParams({
      seed: SEED,
      levelId: "test_level",
      difficulty: "medium",
      arrivalThought: "test_arrival",
      openingSkip,
    });

  beforeEach(() => registerDefs({ thoughts: beats, capThoughts: [] }));
  afterEach(() =>
    registerDefs({ thoughts: THOUGHT_DEFS, capThoughts: CAP_THOUGHT_IDS }),
  );

  it("opens the monologue, with the level's own briefing behind it", () => {
    const state = arrived();
    expect(introPages(state)).toEqual([ARRIVAL, ["TEST INTRO LINE."]]);
    expect(state.introPage).toBe(0);
  });

  it("is the whole monologue nothing arrived with is", () => {
    const plain = createGame(SEED, "test_level");
    expect(introPages(plain)).toEqual([["TEST INTRO LINE."]]);
  });

  it("survives the replay skip that eats the level's own opening", () => {
    // A die-and-retry loop has read the briefing; it has NOT read what he made
    // of tonight's drive. With the arrival line in front, the skip can't be a
    // page index — the monologue itself shrinks to the half nobody has read.
    const state = arrived();
    skipStoryOpening(state);
    expect(state.phase).toBe("intro");
    expect(introPages(state)).toEqual([ARRIVAL]);
    expect(state.introPage).toBe(0);
    // …and turning past it lands on the level-name card, as any skip does.
    advanceIntro(state);
    expect(state.phase).toBe("title");
  });

  it("takes the same skip through the session parameters", () => {
    // `openingSkip: "story"` is how the app and an arriving client ask for it,
    // and it must land the same run — a field only one of them applied is a
    // desync.
    const state = arrived("story");
    expect(state.phase).toBe("intro");
    expect(introPages(state)).toEqual([ARRIVAL]);
  });

  it("leaves a plain arrival's skip on the title card", () => {
    // Nothing arrived with, nothing left to read: the skip empties the
    // monologue and the card is all that is between the player and the run.
    const state = createGame(SEED, "test_level");
    skipStoryOpening(state);
    expect(introPages(state)).toEqual([]);
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
