// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROAD SAYS, THINKS AND SHOUTS — the three lists of words the drive
// carries, held to the shape they have to keep to be read at all.
//
// WHY A SUITE FOR A HUNDRED STRINGS. For two of the three lists the engine hands
// out an INDEX and has never been told what is in them (`CROWD_THOUGHTS` /
// `GLUED_BARKS` are counts on one side and words on the other), so a list that
// drifts shorter than its count simply stops using its last entries —
// silently, with every other check green, and nobody notices because nobody was
// ever going to read all forty. The REACTIONS are keyed on a scene NAME instead
// (`WitnessScene`), which is why there is no count to pair here: the compiler
// refuses a scene nobody wrote a line for, and what is left to check is the
// WRITING.
//
// And that rule is load-bearing rather than fussiness: a thought is on screen
// for well under a second at the wagon's top speed and a reaction for a quarter
// of one, so a line that runs long, or that carries a second clause to hold, is
// a line the player never takes in — which is a line that may as well not have
// been written.
//
// This is `tests/content/` because it asserts things about SHIPPED WORDS. A
// sequel deletes it with the rest of the campaign.

import { describe, expect, it } from "vitest";

import {
  CROWD_THOUGHTS as THOUGHT_COUNT,
  GLUED_BARKS as BARK_COUNT,
  DRIVE,
} from "@game/core";

import {
  CROWD_THOUGHTS,
  GLUED_BARKS,
  PLACARD_READ_PX,
  WITNESS_LINES,
  witnessLine,
} from "../../pwa/src/game/drive-screen/placards.ts";

/** Every reaction, whatever scene it is filed under. */
const REACTIONS = Object.values(WITNESS_LINES).flat();

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

  it("writes all three lists in glyphs the road's font actually has", () => {
    for (const line of [...CROWD_THOUGHTS, ...GLUED_BARKS, ...REACTIONS]) {
      expect(line, `undrawable glyph in: ${line}`).toMatch(DRAWABLE);
    }
  });
});

describe("what the road shouts when it sees one", () => {
  it("gives every scene the sim can name at least three lines", () => {
    // THE COMPILER ALREADY REFUSES A MISSING SCENE (`Record<WitnessScene, …>`),
    // so what is left for a test is a scene that exists and is nearly empty: one
    // line means the same words every single time that case comes up, which on
    // the commonest of them — a walker with nothing about them to name — is the
    // whole road saying one sentence.
    for (const [scene, lines] of Object.entries(WITNESS_LINES)) {
      expect(
        lines.length,
        `too few reactions for ${scene}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("carries enough of them that a leg does not repeat itself", () => {
    // A leg raises a reaction every second or so at the ceiling
    // (`DRIVE.witness.gapMs`), so a catalogue much smaller than this is one a
    // player hears the whole of inside a single trip.
    expect(REACTIONS.length).toBeGreaterThanOrEqual(50);
  });

  it("never has two bystanders shouting the identical thing", () => {
    // Not per scene — ACROSS the lot. Two scenes sharing a line is the same
    // sentence arriving twice in one trip from two different causes, which is
    // exactly what makes a crowd read as one person copy-pasted.
    expect(new Set(REACTIONS).size).toBe(REACTIONS.length);
  });

  it("keeps every reaction shorter than a thought", () => {
    // A THOUGHT IS READ OFF A BODY THE CAR IS CLOSING ON FOR MOST OF A SECOND;
    // a reaction is picked at the FAR edge of the reading window and the wagon
    // is doing 905 px/s, so it has under three tenths. Two to six words —
    // shouted, not composed.
    //
    // THE FLOOR IS ONE WORD AND NOT TWO, which is the difference between this
    // list and the thoughts. A thought is a person turning something over and
    // needs a sentence to be one; a reaction is often not language at all — it
    // is a noise with letters in it, and cutting the road's single drawn-out
    // shout because it did not parse as a phrase would be enforcing grammar on
    // somebody who has just watched a car go through a person.
    for (const line of REACTIONS) {
      expect(words(line), `too long to catch: ${line}`).toBeLessThanOrEqual(6);
      expect(line.trim(), "an empty reaction").not.toBe("");
    }
  });

  it("picks a line for every roll the sim can hand it", () => {
    // `roll` is a hashed 0→1 and the picker floors it into the list, so the
    // interesting values are the two ends: 0 is the first line and anything
    // short of 1 must still be inside the list rather than one past it.
    for (const scene of Object.keys(
      WITNESS_LINES,
    ) as (keyof typeof WITNESS_LINES)[]) {
      const lines = WITNESS_LINES[scene];
      expect(witnessLine(scene, 0)).toBe(lines[0]);
      expect(witnessLine(scene, 0.999999)).toBe(lines[lines.length - 1]);
      expect(lines).toContain(witnessLine(scene, 0.5));
    }
  });

  it("only ever asks for a witness the picture can draw", () => {
    // THE ONE NUMBER THAT SPANS THE TWO TREES. The sim picks a body up to
    // `DRIVE.witness.reachPx` ahead of the car; the app's floating text gives up
    // at `PLACARD_READ_PX`, beyond which a line is drawn half off the right edge
    // of the frame because the camera only shows ~308 world px past the bumper.
    // A witness picked outside it is worse than none — the incident passes in
    // silence and the reaction is spent on a shout nobody saw.
    expect(DRIVE.witness.reachPx).toBeLessThanOrEqual(PLACARD_READ_PX);
    // …and the near edge is inside the far one, or the sim can never pick
    // anybody at all.
    expect(DRIVE.witness.nearPx).toBeLessThan(DRIVE.witness.reachPx);
  });
});
