// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE `.song` NOTATION, CHECKED BY GOING ROUND — every shipped score written
// out in the short format and compiled back, and the two have to agree note for
// note.
//
// WHY THIS IS THE ONLY TEST THE NOTATION NEEDS. An importer on its own can be
// checked only by reading its output and agreeing with it, which is the same
// eye that wrote the input — so the interesting failures (a duration that
// rounds, a tie dropped at a bar line, a drum grid that flattens two pitches
// into one) survive review comfortably. With both directions present,
// `yaml → song → yaml` has to come back identical, and that single property
// covers the whole notation at once: every duration form, every rest, every
// drum grid, every instrument flag, the order, the tempo.
//
// IT ALREADY CAUGHT ONE. `rift_drift`'s kick plays A1 in some sections and B1
// in others; a drum grid carries ONE pitch, so writing it as a grid silently
// flattened it. The exporter now only grids a voice that plays at most one
// distinct pitch, and everything else comes back longhand.
//
// The catalogue is the fixture on purpose: these are the scores whose shapes
// the notation has to survive, and a new track joins the check by existing.

import { describe, expect, it } from "vitest";

import { parseSong, toSong } from "../../scripts/asset-tools/song-format.mjs";
import {
  cookTrack,
  loadMusic,
  type CookedTrack,
} from "../../scripts/music-data/load-yaml.mjs";

const { entries } = loadMusic();
const TRACKS = entries.map((e) => {
  const doc = e.doc as { name: string; description?: string };
  return {
    id: e.id,
    cooked: cookTrack(e.doc),
    song: toSong({
      ...cookTrack(e.doc),
      id: e.id,
      name: doc.name,
      description: doc.description,
    }),
  };
});

describe("the .song round trip", () => {
  it("has scores to check", () => {
    expect(TRACKS.length).toBeGreaterThan(4);
  });

  for (const { id, cooked, song } of TRACKS) {
    describe(id, () => {
      const back = parseSong(song);

      it("comes back with the same tempo, order and voices", () => {
        expect(back.id).toBe(id);
        expect(back.bpm).toBe(cooked.bpm);
        expect(back.order).toEqual(cooked.order);
        expect(Object.keys(back.patterns)).toEqual(
          Object.keys(cooked.patterns),
        );
        expect(Object.keys(back.instruments)).toEqual(
          Object.keys(cooked.instruments),
        );
      });

      it("comes back with the same instrument patches", () => {
        for (const [name, patch] of Object.entries(cooked.instruments))
          expect(back.instruments[name], `${id}/${name}`).toEqual(patch);
      });

      it("comes back note for note", () => {
        // Voice by voice rather than as one deep-equal, because a whole-track
        // mismatch prints eight hundred tokens and names neither the section
        // nor the voice that moved.
        for (const [section, pattern] of Object.entries(
          cooked.patterns as CookedTrack["patterns"],
        )) {
          for (const [voice, steps] of Object.entries(pattern)) {
            expect(
              back.patterns[section]?.[voice],
              `${id}: ${section}/${voice} changed`,
            ).toEqual(steps);
          }
        }
      });
    });
  }
});

describe("what the notation refuses", () => {
  const HEAD = [
    "id     probe",
    "title  PROBE",
    "tempo  120",
    "voice  lead square vol=.03",
    "drum   kick triangle vol=.06 slide=.25 note=D2",
  ].join("\n");

  const song = (body: string) => `${HEAD}\n${body}\n`;

  it("counts the bar lines it was given", () => {
    // The whole reason `|` is worth typing: a miscount is an error with a bar
    // number on it rather than a rhythm that quietly shifts by a sixteenth.
    expect(() =>
      parseSong(
        song(
          ["section a", "  lead d5*4 e5*4 f5*4 | c5*16", "order  a"].join("\n"),
        ),
      ),
    ).toThrow(/bar/i);
  });

  it("refuses a section nothing plays", () => {
    expect(() =>
      parseSong(
        song(
          [
            "section a",
            "  lead d5*16",
            "section b",
            "  lead e5*16",
            "order  a",
          ].join("\n"),
        ),
      ),
    ).toThrow(/never played/);
  });

  it("refuses an order naming a section nobody wrote", () => {
    expect(() =>
      parseSong(
        song(["section a", "  lead d5*16", "order  a chorus"].join("\n")),
      ),
    ).toThrow(/unknown section/);
  });

  it("refuses a voice whose length does not divide the section", () => {
    expect(() =>
      parseSong(
        song(
          [
            "section a",
            "  lead d5*16 e5*16 f5*16",
            "  kick x.......x.......|x.......x.......",
            "order  a",
          ].join("\n"),
        ),
      ),
    ).toThrow(/does not/);
  });

  it("refuses a figure with no chords to build it from", () => {
    expect(() =>
      parseSong(song(["section a", "  lead pump 3", "order  a"].join("\n"))),
    ).toThrow(/chords/);
  });

  it("takes flats, which the game's own token grammar cannot spell", () => {
    const doc = parseSong(
      song(["section a", "  lead eb5*8 bb4*8", "order  a"].join("\n")),
    );
    expect(doc.patterns.a?.lead?.[0]).toBe("D#5");
    expect(doc.patterns.a?.lead?.[8]).toBe("A#4");
  });
});
