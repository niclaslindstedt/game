// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROAD SAYS AND THINKS — the two lists of words the drive carries, held
// to the shape they have to keep to be read at all.
//
// WHY A SUITE FOR FORTY STRINGS. The engine hands out an INDEX and has never
// been told what is in either list (`CROWD_THOUGHTS`/`GLUED_BARKS` are counts on
// one side and words on the other), so a list that drifts shorter than its count
// simply stops using its last entries — silently, with every other check green,
// and nobody notices because nobody was ever going to read all forty.
//
// The rest of it is the WRITING RULE, and it is load-bearing rather than
// fussiness: a thought is on screen for well under a second at the wagon's top
// speed, so a line that runs long, or that carries a second clause to hold, is a
// line the player never takes in — which is a line that may as well not have
// been written. The rule is five to eight words, one sentence, in the pixel
// font's own capitals.
//
// This is `tests/content/` because it asserts things about SHIPPED WORDS. A
// sequel deletes it with the rest of the campaign.

import { describe, expect, it } from "vitest";

import {
  CROWD_THOUGHTS as THOUGHT_COUNT,
  GLUED_BARKS as BARK_COUNT,
} from "@game/core";

import {
  CROWD_THOUGHTS,
  GLUED_BARKS,
} from "../../pwa/src/game/drive-screen/placards.ts";

/** The glyphs the pixel font actually draws for these — capitals, digits and the
 * handful of marks the road's lines spend. A character outside this set is drawn
 * as a `?` on the tarmac (`pixel-font.ts` falls back on a missing glyph). */
const DRAWABLE = /^[A-Z0-9 .,'’!?-]+$/;

const words = (line: string): number => line.trim().split(/\s+/).length;

describe("what the road has to say", () => {
  it("gives the crowd exactly as many thoughts as the sim deals", () => {
    expect(CROWD_THOUGHTS).toHaveLength(THOUGHT_COUNT);
  });

  it("gives THE GLUED exactly as many lines as the sim picks from", () => {
    expect(GLUED_BARKS).toHaveLength(BARK_COUNT);
  });

  it("never has two people thinking the identical thing", () => {
    // The deck deals each index once a trip, so a DUPLICATE STRING would put the
    // same sentence over two heads on one road and undo the whole point of the
    // deck.
    expect(new Set(CROWD_THOUGHTS).size).toBe(CROWD_THOUGHTS.length);
  });

  it("keeps every thought short enough to be taken in at a glance", () => {
    for (const line of CROWD_THOUGHTS) {
      expect(
        words(line),
        `too long to read at 120: ${line}`,
      ).toBeLessThanOrEqual(8);
      expect(
        words(line),
        `too clipped to land: ${line}`,
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps every thought to ONE sentence", () => {
    // A thought is a person turning something over, not a speech. Two sentences
    // is a paragraph on a road going past at a hundred and twenty, and it wraps
    // to a fourth row the frame does not always have above a walking body.
    for (const line of CROWD_THOUGHTS) {
      expect(
        line.match(/[.!?](\s|$)/g) ?? [],
        `two sentences: ${line}`,
      ).toHaveLength(0);
    }
  });

  it("writes both lists in glyphs the road's font actually has", () => {
    for (const line of [...CROWD_THOUGHTS, ...GLUED_BARKS]) {
      expect(line, `undrawable glyph in: ${line}`).toMatch(DRAWABLE);
    }
  });
});
