// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TWO-WAY PINNED BEATS: a thought is the hero alone by default, but a
// `{ them: [...] }` page is SOMEBODY ANSWERING HIM — the exact mirror of a
// `{ hero: [...] }` page in an arrival scene (hero_reply_test.ts). What both
// come out as is one `voices` array parallel to `pages`, so the box draws the
// exchange without knowing which kind of scene it is in. Everything here runs
// on synthetic fixtures: the rule is the engine's, not GOODCO HQ's.

import { afterEach, describe, expect, it } from "vitest";

import {
  CAP_THOUGHT_IDS,
  dialogueContent,
  registerDefs,
  THOUGHT_DEFS,
} from "@game/core";

const MINE = ["MY OWN HEAD."];
const THEIRS = ["SOMEBODY ELSE'S MOUTH."];

/** A pinned beat somebody interrupts, and the plain monologue it started as. */
const beats = {
  two_way: {
    id: "two_way",
    speaker: "ME",
    portrait: "player",
    voice: { speaker: "TEST HECKLER", portrait: "test_minion" },
    pages: [MINE, { them: THEIRS }, MINE],
  },
  solo: {
    id: "solo",
    speaker: "ME",
    portrait: "player",
    pages: [MINE, MINE],
  },
};

const content = (defId: string) =>
  dialogueContent({ source: { kind: "playerThought", defId }, page: 0 });

describe("a pinned beat somebody answers back to", () => {
  afterEach(() =>
    registerDefs({ thoughts: THOUGHT_DEFS, capThoughts: CAP_THOUGHT_IDS }),
  );

  it("reads every page out in order, whoever said it", () => {
    registerDefs({ thoughts: beats, capThoughts: [] });
    expect(content("two_way").pages).toEqual([MINE, THEIRS, MINE]);
  });

  it("hands each page its own voice — his face on his, theirs on theirs", () => {
    registerDefs({ thoughts: beats, capThoughts: [] });
    const { voices } = content("two_way");
    // `hero` is what makes the app draw his live dressed paper-doll instead of
    // a sprite, so getting it wrong on the heckler's page would put the hero's
    // own face over somebody else's words.
    expect(voices.map((v) => v.hero)).toEqual([true, false, true]);
    expect(voices.map((v) => v.speaker)).toEqual(["ME", "TEST HECKLER", "ME"]);
    expect(voices[1]!.portrait).toBe("test_minion");
  });

  it("keeps the SCENE owned by the hero even so", () => {
    // The scene's own speaker/portrait stay his: the beat is still one of his,
    // pinned to something he saw, and only the individual page changes hands.
    registerDefs({ thoughts: beats, capThoughts: [] });
    const c = content("two_way");
    expect(c.speaker).toBe("ME");
    expect(c.portrait).toBe("player");
  });

  it("leaves a plain monologue entirely his", () => {
    registerDefs({ thoughts: beats, capThoughts: [] });
    const { voices } = content("solo");
    expect(voices.map((v) => v.hero)).toEqual([true, true]);
    expect(voices.every((v) => v.speaker === "ME")).toBe(true);
  });

  it("falls back to his own voice when a page is tagged but nobody is named", () => {
    // The build refuses this (a `them:` page with no `voice:`), and a MOD's
    // catalog arrives through the same door — so the runtime still has to have
    // an answer rather than reading `speaker` off undefined mid-scene.
    registerDefs({
      thoughts: {
        orphan: { ...beats.two_way, id: "orphan", voice: undefined },
      },
      capThoughts: [],
    });
    const { voices } = content("orphan");
    expect(voices.map((v) => v.hero)).toEqual([true, true, true]);
  });
});
