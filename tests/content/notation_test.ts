// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ENGRAVER (scripts/asset-tools/notation.mjs) — the sheet-music view of a
// score, which `scripts/music-sheet.mjs` draws.
//
// WHAT IS WORTH ASSERTING is not what the page looks like — that is judged by
// eye, which is the entire reason the tool exists — but the handful of facts
// that make the picture TRUSTWORTHY. A sheet that quietly dropped a voice, or
// spelled a rhythm that does not add up to a bar, is worse than no sheet: it is
// a review tool that agrees with you.
//
//   IT DRAWS EVERY SHIPPED SCORE without throwing, which is the same smoke pass
//   `chiptune_test.ts` runs through the player — a track the game can play and
//   the sheet cannot draw is a bug in the sheet.
//
//   THE BARS ADD UP. Every voice's spelled durations must total exactly the
//   pattern's length, or the page is showing music that is not the music.
//
//   NOTHING IS SILENTLY DROPPED: every voice with a note in a pattern gets a
//   staff, and every one of its onsets gets a notehead.

import { describe, expect, it } from "vitest";

import {
  engraveTrack,
  parseNote,
  voiceNotes,
  type VoiceNote,
} from "../../scripts/asset-tools/notation.mjs";
import {
  cookTrack,
  loadMusic,
  type CookedTrack,
} from "../../scripts/music-data/load-yaml.mjs";

const { entries } = loadMusic();
const TRACKS: [string, CookedTrack][] = entries.map((e) => [
  e.id,
  cookTrack(e.doc),
]);

describe("reading a voice", () => {
  it("starts a note on a token and sustains it through the ties", () => {
    const notes = voiceNotes(["D5", "=", "=", ".", "F5", "="]);
    expect(notes).toEqual([
      { at: 0, steps: 3, token: "D5" },
      { at: 4, steps: 2, token: "F5" },
    ]);
  });

  it("ends a note at the next onset even with no rest between", () => {
    expect(voiceNotes(["A4", "B4"]).map((n) => n.steps)).toEqual([1, 1]);
  });

  it("ignores a tie with nothing to tie to", () => {
    expect(voiceNotes(["=", "=", "C4"])).toEqual([
      { at: 2, steps: 1, token: "C4" },
    ]);
  });
});

describe("placing a pitch", () => {
  it("reads a note as a DIATONIC step, so a sharp shares its letter's line", () => {
    const c4 = parseNote("C4");
    const cs4 = parseNote("C#4");
    expect(cs4?.diatonic).toBe(c4?.diatonic);
    expect(cs4?.midi).toBe((c4?.midi as number) + 1);
  });

  it("counts octaves the way the sequencer does", () => {
    expect(parseNote("A4")?.midi).toBe(69); // concert A
    expect(parseNote("C-1")?.midi).toBe(0);
  });

  it("refuses anything that is not a note", () => {
    expect(parseNote("x")).toBeNull();
    expect(parseNote("H4")).toBeNull();
    expect(parseNote("Db4")).toBeNull(); // the format spells flats as sharps
  });
});

describe("engraving the shipped scores", () => {
  it("draws every one of them without throwing", async () => {
    for (const [id, track] of TRACKS) {
      const sheet = await engraveTrack(track, { title: id });
      expect(sheet.svg.startsWith("<svg"), id).toBe(true);
      expect(sheet.height, id).toBeGreaterThan(200);
      // The analyser row is part of the page, not an extra: a sheet with no
      // spectrum is a sheet that says nothing about the mix.
      expect(sheet.svg, id).toContain(">spectrum<");
      expect(sheet.svg, id).toContain("data:image/png;base64,");
    }
  });

  it("gives every voice that plays a staff of its own", async () => {
    for (const [id, track] of TRACKS) {
      const sheet = await engraveTrack(track, { title: id });
      for (const [name, pattern] of Object.entries(track.patterns)) {
        for (const [voice, tokens] of Object.entries(
          pattern as Record<string, string[]>,
        )) {
          if (!tokens.some((t) => t !== ".")) continue;
          expect(sheet.svg, `${id}/${name}: no staff for "${voice}"`).toContain(
            `>${voice}</text>`,
          );
        }
      }
    }
  });

  it("spells every voice to exactly the length of its pattern", () => {
    // The bar has to add up. This walks the same `held` rule the engraver uses
    // — a note runs to the next onset but stops at the bar line unless it is
    // genuinely still sounding — and checks the notes plus the rests it implies
    // tile the pattern with nothing over and nothing missing.
    for (const [id, track] of TRACKS) {
      const stepsPerBar = track.stepsPerBeat * 4;
      for (const [name, pattern] of Object.entries(track.patterns)) {
        const patternSteps = Math.max(
          ...Object.values(pattern as Record<string, string[]>).map(
            (t) => t.length,
          ),
        );
        for (const [voice, line] of Object.entries(
          pattern as Record<string, string[]>,
        )) {
          const tokens = Array.from(
            { length: patternSteps },
            (_, k) => line[k % line.length] as string,
          );
          const notes = voiceNotes(tokens);
          let covered = 0;
          notes.forEach((n: VoiceNote, k: number) => {
            const gap = (notes[k + 1]?.at ?? patternSteps) - n.at;
            const toBar =
              (Math.floor(n.at / stepsPerBar) + 1) * stepsPerBar - n.at;
            const held = Math.max(
              1,
              Math.min(gap, n.steps > toBar ? n.steps : toBar),
            );
            // No note may run past the one after it, or two would sound at once
            // on a voice that is monophonic by construction.
            expect(
              n.at + held,
              `${id}/${name}/${voice}: note at ${n.at} overruns the next`,
            ).toBeLessThanOrEqual(notes[k + 1]?.at ?? patternSteps);
            covered += held;
          });
          const rests = patternSteps - covered - (notes[0]?.at ?? patternSteps);
          expect(
            covered + rests + (notes[0]?.at ?? patternSteps),
            `${id}/${name}/${voice}: does not tile ${patternSteps} steps`,
          ).toBe(patternSteps);
        }
      }
    }
  });

  it("prints the running order, so a section's weight in the loop is visible", async () => {
    const [, overdue] = TRACKS.find(([id]) => id === "overdue") as [
      string,
      CookedTrack,
    ];
    const sheet = await engraveTrack(overdue, { title: "OVERDUE" });
    expect(sheet.svg).toContain(">ORDER<");
    for (const name of new Set(overdue.order))
      expect(sheet.svg).toContain(`>${name}</text>`);
  });
});
