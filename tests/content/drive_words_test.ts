// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROAD SAYS, THINKS AND SHOUTS — the three lists of words the drive
// carries, in BOTH of its dressings, held to the shape they have to keep to be
// read at all.
//
// WHY A SUITE FOR TWO HUNDRED STRINGS. For two of the three lists the engine
// hands out an INDEX and has never been told what is in them (`CROWD_THOUGHTS` /
// `GLUED_BARKS` are counts on one side and words on the other), so a list that
// drifts shorter than its count simply stops using its last entries —
// silently, with every other check green, and nobody notices because nobody was
// ever going to read all forty. The REACTIONS are keyed on a scene NAME instead
// (`WitnessScene`), which is why there is no count to pair here: the compiler
// refuses a scene nobody wrote a line for, and what is left to check is the
// WRITING.
//
// AND THE SFW TWINS ARE HELD TO THE IDENTICAL BAR (`placards-sfw.ts`), because
// every rule below is a fact about the CAMERA and the wagon's speed rather than
// about the mode: the reading window is the same window, the pixel font has the
// same glyphs, and the sim deals the same indices. A twin list that drifted
// short would go quiet in exactly the way the shipped one would, with nothing
// but a switch between the two.
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
  crowdThought,
  CROWD_THOUGHTS,
  gluedBark,
  GLUED_BARKS,
  placardOrder,
  PLACARD_READ_PX,
  WITNESS_LINES,
  witnessLine,
} from "../../pwa/src/game/drive-screen/placards.ts";
import {
  CROWD_THOUGHTS_SFW,
  GLUED_BARKS_SFW,
  WITNESS_LINES_SFW,
} from "../../pwa/src/game/drive-screen/placards-sfw.ts";

/** The two dressings, walked by every rule below. `sfw` is the flag the three
 * pickers take, so the suite exercises the SELECTOR rather than restating which
 * table the renderer should have reached for. */
const MODES = [
  {
    name: "the shipped road",
    sfw: false,
    thoughts: CROWD_THOUGHTS,
    barks: GLUED_BARKS,
    scenes: WITNESS_LINES,
  },
  {
    name: "the SFW road",
    sfw: true,
    thoughts: CROWD_THOUGHTS_SFW,
    barks: GLUED_BARKS_SFW,
    scenes: WITNESS_LINES_SFW,
  },
] as const;

/** The glyphs the pixel font actually draws for these — capitals, digits and the
 * handful of marks the road's lines spend. A character outside this set is drawn
 * as a `?` on the tarmac (`pixel-font.ts` falls back on a missing glyph). */
const DRAWABLE = /^[A-Z0-9 .,'’!?-]+$/;

const words = (line: string): number => line.trim().split(/\s+/).length;

describe.each(MODES)("what the road has to say — $name", (mode) => {
  const reactions = Object.values(mode.scenes).flat();

  it("gives the crowd exactly as many thoughts as the sim deals", () => {
    expect(mode.thoughts).toHaveLength(THOUGHT_COUNT);
  });

  it("gives THE GLUED exactly as many lines as the sim picks from", () => {
    expect(mode.barks).toHaveLength(BARK_COUNT);
  });

  it("never has two people thinking the identical thing", () => {
    // The deck deals each index once a trip, so a DUPLICATE STRING would put the
    // same sentence over two heads on one road and undo the whole point of the
    // deck.
    expect(new Set(mode.thoughts).size).toBe(mode.thoughts.length);
  });

  it("keeps every thought short enough to be taken in at a glance", () => {
    for (const line of mode.thoughts) {
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
    for (const line of mode.thoughts) {
      expect(
        line.match(/[.!?](\s|$)/g) ?? [],
        `two sentences: ${line}`,
      ).toHaveLength(0);
    }
  });

  it("writes all three lists in glyphs the road's font actually has", () => {
    for (const line of [...mode.thoughts, ...mode.barks, ...reactions]) {
      expect(line, `undrawable glyph in: ${line}`).toMatch(DRAWABLE);
    }
  });

  it("gives every scene the sim can name at least three lines", () => {
    // THE COMPILER ALREADY REFUSES A MISSING SCENE (`Record<WitnessScene, …>`),
    // so what is left for a test is a scene that exists and is nearly empty: one
    // line means the same words every single time that case comes up, which on
    // the commonest of them — a walker with nothing about them to name — is the
    // whole road saying one sentence.
    for (const [scene, lines] of Object.entries(mode.scenes)) {
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
    expect(reactions.length).toBeGreaterThanOrEqual(50);
  });

  it("never has two bystanders shouting the identical thing", () => {
    // Not per scene — ACROSS the lot. Two scenes sharing a line is the same
    // sentence arriving twice in one trip from two different causes, which is
    // exactly what makes a crowd read as one person copy-pasted.
    expect(new Set(reactions).size).toBe(reactions.length);
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
    for (const line of reactions) {
      expect(words(line), `too long to catch: ${line}`).toBeLessThanOrEqual(6);
      expect(line.trim(), "an empty reaction").not.toBe("");
    }
  });

  it("picks a line for every roll the sim can hand it", () => {
    // `roll` is a hashed 0→1 and the picker floors it into the list, so the
    // interesting values are the two ends: 0 is the first line and anything
    // short of 1 must still be inside the list rather than one past it.
    for (const scene of Object.keys(
      mode.scenes,
    ) as (keyof typeof mode.scenes)[]) {
      const lines = mode.scenes[scene];
      expect(witnessLine(scene, 0, mode.sfw)).toBe(lines[0]);
      expect(witnessLine(scene, 0.999999, mode.sfw)).toBe(
        lines[lines.length - 1],
      );
      expect(lines).toContain(witnessLine(scene, 0.5, mode.sfw));
    }
  });

  it("wraps a dealt index against its OWN list, whichever dressing is up", () => {
    // The sim hands out an index it got from a count in the other tree and has
    // never seen either list, so the picker is what pairs the two. A picker that
    // wrapped against the shipped length would silently stop using the twin's
    // tail the day the two differed — the exact silent failure the count pairing
    // above exists to catch, moved one function along.
    for (const [at, line] of mode.barks.entries()) {
      expect(gluedBark(at, mode.sfw)).toBe(line);
      expect(gluedBark(at + mode.barks.length, mode.sfw)).toBe(line);
    }
    for (const [at, line] of mode.thoughts.entries()) {
      expect(crowdThought(at, mode.sfw)).toBe(line);
      expect(crowdThought(at + mode.thoughts.length, mode.sfw)).toBe(line);
    }
  });
});

describe("the two dressings of the road", () => {
  it("says something different in each", () => {
    // The whole point of the twin lists is that the words agree with the
    // picture. A line that survived into both would be one written for a road
    // that throws blood being read over a road that throws glitter — which is
    // the mode telling the player what it is refusing to draw.
    const shipped = new Set([
      ...CROWD_THOUGHTS,
      ...GLUED_BARKS,
      ...Object.values(WITNESS_LINES).flat(),
    ]);
    const shared = [
      ...CROWD_THOUGHTS_SFW,
      ...GLUED_BARKS_SFW,
      ...Object.values(WITNESS_LINES_SFW).flat(),
    ].filter((line) => shipped.has(line));
    expect(shared, "a line is shared by both dressings").toEqual([]);
  });

  it("names the same scenes in both", () => {
    // `WitnessScene` is a union and both tables are `Record<WitnessScene, …>`,
    // so the compiler already refuses an omission. What it cannot refuse is a
    // scene added to ONE table's literal and forgotten in the other's, which
    // this catches by comparing the two key sets.
    expect(Object.keys(WITNESS_LINES_SFW).sort()).toEqual(
      Object.keys(WITNESS_LINES).sort(),
    );
  });
});

describe("what the road shouts when it sees one", () => {
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

  it("hands the one slot to the nearest speaker AHEAD, then to the ones passed", () => {
    // The picture carries ONE line (`MAX_PLACARDS`) and `placardOrder` is the
    // whole of who gets it. Two rules, and the second is the one that exists at
    // all: as the car closes, each speaker in turn is passed and the next takes
    // the bubble (a picket line reads as a SEQUENCE); and a speaker the car has
    // gone past keeps their line until somebody in front wants it, so a thought
    // leaves the picture with the person who was thinking it rather than being
    // cut off on the frame the bumper draws level with them.
    const queue = (aways: number[]): number[] =>
      [...aways].sort((a, b) => placardOrder(a) - placardOrder(b));

    // Nearest AHEAD first…
    expect(queue([200, 40, 120])).toEqual([40, 120, 200]);
    // …ahead of anybody already passed, however near they still are…
    expect(queue([-5, 250])).toEqual([250, -5]);
    // …and among the passed, the one the car has only just gone by.
    expect(queue([-90, -10, -40])).toEqual([-10, -40, -90]);
    // The body dead level with the bumper is still an APPROACHING one, so a
    // speaker cannot lose the slot to itself on the frame it is passed.
    expect(placardOrder(0)).toBeLessThan(placardOrder(-0.001));
  });
});
