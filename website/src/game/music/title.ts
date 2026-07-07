// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TITLE — "MOONLIGHT VIGIL". The complete score for the title-screen music:
// every instrument patch and every note lives in this file, arranged like a
// tracker module (patterns + play order) for the sequencer in
// @ui/lib/chiptune.ts.
//
// A slow A-minor vigil in the 16-bit console tradition: a breathy sine
// flute carries the lament over rippling pulse arpeggios and washed-out
// pads, a detuned square lead takes the relative-major chorus, and glassy
// echo bells keep watch through the breakdown. The harmonic language leans
// on the progressions classic game scores are built from — i–VI–iv–V
// verses, a I–V–vi–IV chorus lift — but the melodies are original;
// nothing is sampled or transcribed.
//
// Arrangement (90 bpm, 4/4, one bar = 16 sixteenth-note steps):
//   intro(4) verse(8) chorus(8) verse(8) break(8) chorus(8) outro(4)
//   = 48 bars ≈ 128 s per loop.

import { bars, type ChiptuneTrack } from "@ui/lib/chiptune.ts";

export const TITLE_THEME: ChiptuneTrack = {
  bpm: 90,
  stepsPerBeat: 4,

  instruments: {
    // The verse voice: a breathy sine "flute" with slow singer's vibrato.
    flute: {
      wave: "sine",
      volume: 0.042,
      gate: 0.95,
      attackMs: 25,
      vibrato: { rateHz: 5, depthCents: 18, delayMs: 250 },
      echo: 0.4,
    },
    // The chorus voice: a detuned square lead — one pulse that sounds like
    // a brass section once the chorus width and echo are on it.
    lead: {
      wave: "square",
      volume: 0.03,
      gate: 0.92,
      attackMs: 12,
      detuneCents: 6,
      vibrato: { rateHz: 5.5, depthCents: 14, delayMs: 200 },
      echo: 0.3,
    },
    // Cold pulse arpeggios rippling off to one side.
    arp: {
      wave: "square",
      volume: 0.013,
      gate: 0.4,
      pan: 0.3,
      echo: 0.25,
    },
    // Two-voice string pad: wide detune + slow swell = the SNES wash.
    padHi: {
      wave: "square",
      volume: 0.009,
      gate: 0.98,
      attackMs: 400,
      detuneCents: 12,
      pan: -0.25,
      echo: 0.35,
    },
    padLo: {
      wave: "square",
      volume: 0.009,
      gate: 0.98,
      attackMs: 400,
      detuneCents: 12,
      pan: 0.25,
      echo: 0.35,
    },
    // Deep triangle roots.
    bass: {
      wave: "triangle",
      volume: 0.05,
      gate: 0.95,
    },
    // Glassy bell accents, drenched in echo and floated left.
    bell: {
      wave: "sine",
      volume: 0.024,
      gate: 0.5,
      pan: -0.4,
      echo: 0.55,
    },
  },

  patterns: {
    // ── INTRO — Am Am F E: bells rise out of the dark over pads. ──
    intro: {
      bell: bars(
        "A4 =  =  =  C5 =  =  =  E5 =  =  =  =  =  =  =",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "A4 =  =  =  C5 =  =  =  F5 =  =  =  =  =  =  =",
        "G#4 =  =  =  B4 =  =  =  E5 =  =  =  =  =  =  =",
      ),
      padHi: bars(
        "E4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "E4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "C4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "B3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      padLo: bars(
        "A3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "A3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "A3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "G#3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      bass: bars(
        "A2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "A2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "F2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "E2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
    },

    // ── VERSE — Am F Dm E ×2: the flute lament over pads and arps. ──
    verse: {
      flute: bars(
        "E4 =  =  =  =  =  =  =  C4 =  =  =  D4 =  =  =",
        "C4 =  =  =  =  =  =  =  A3 =  =  =  =  =  =  =",
        "D4 =  =  =  F4 =  =  =  E4 =  =  =  D4 =  =  =",
        "B3 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "E4 =  =  =  =  =  =  =  G4 =  =  =  E4 =  =  =",
        "F4 =  =  =  C4 =  =  =  A3 =  =  =  =  =  =  =",
        "D4 =  =  =  E4 =  =  =  F4 =  E4 =  D4 =  =  =",
        "B3 =  =  =  =  =  =  =  E4 =  =  =  =  =  =  =",
      ),
      arp: bars(
        "A3 .  C4 .  E4 .  C4 .  A3 .  C4 .  E4 .  C4 .",
        "F3 .  A3 .  C4 .  A3 .  F3 .  A3 .  C4 .  A3 .",
        "D3 .  F3 .  A3 .  F3 .  D3 .  F3 .  A3 .  F3 .",
        "E3 .  G#3 .  B3 .  G#3 .  E3 .  G#3 .  B3 .  G#3 .",
        "A3 .  C4 .  E4 .  C4 .  A3 .  C4 .  E4 .  C4 .",
        "F3 .  A3 .  C4 .  A3 .  F3 .  A3 .  C4 .  A3 .",
        "D3 .  F3 .  A3 .  F3 .  D3 .  F3 .  A3 .  F3 .",
        "E3 .  G#3 .  B3 .  G#3 .  E3 .  G#3 .  B3 .  D4 .",
      ),
      padHi: bars(
        "E4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "C4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "D4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "B3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "E4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "C4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "D4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "B3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      padLo: bars(
        "C4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "A3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "A3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "G#3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "C4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "A3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "A3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "G#3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      bass: bars(
        "A2 =  =  =  =  =  =  =  E2 =  =  =  =  =  =  =",
        "F2 =  =  =  =  =  =  =  C3 =  =  =  =  =  =  =",
        "D2 =  =  =  =  =  =  =  A2 =  =  =  =  =  =  =",
        "E2 =  =  =  =  =  =  =  B2 =  =  =  =  =  =  =",
        "A2 =  =  =  =  =  =  =  E2 =  =  =  =  =  =  =",
        "F2 =  =  =  =  =  =  =  C3 =  =  =  =  =  =  =",
        "D2 =  =  =  =  =  =  =  A2 =  =  =  =  =  =  =",
        "E2 =  =  =  =  =  =  =  B2 =  =  =  =  =  =  =",
      ),
    },

    // ── CHORUS — C G Am F, C G F E: the square lead takes it up. ──
    chorus: {
      lead: bars(
        "E5 =  =  =  D5 =  C5 =  G4 =  =  =  =  =  =  =",
        "D5 =  =  =  C5 =  B4 =  G4 =  =  =  =  =  =  =",
        "C5 =  =  =  B4 =  A4 =  E5 =  =  =  =  =  =  =",
        "A4 =  =  =  =  =  =  =  C5 =  =  =  D5 =  =  =",
        "E5 =  =  =  G5 =  =  =  E5 =  =  =  D5 =  C5 =",
        "D5 =  =  =  B4 =  =  =  G4 =  =  =  B4 =  D5 =",
        "C5 =  =  =  A4 =  =  =  F4 =  =  =  A4 =  C5 =",
        "B4 =  =  =  =  =  =  =  G#4 =  =  =  E4 =  =  =",
      ),
      arp: bars(
        "C4 .  E4 .  G4 .  E4 .  C4 .  E4 .  G4 .  E4 .",
        "G3 .  B3 .  D4 .  B3 .  G3 .  B3 .  D4 .  B3 .",
        "A3 .  C4 .  E4 .  C4 .  A3 .  C4 .  E4 .  C4 .",
        "F3 .  A3 .  C4 .  A3 .  F3 .  A3 .  C4 .  A3 .",
        "C4 .  E4 .  G4 .  E4 .  C4 .  E4 .  G4 .  E4 .",
        "G3 .  B3 .  D4 .  B3 .  G3 .  B3 .  D4 .  B3 .",
        "F3 .  A3 .  C4 .  A3 .  F3 .  A3 .  C4 .  A3 .",
        "E3 .  G#3 .  B3 .  G#3 .  E3 .  G#3 .  B3 .  G#3 .",
      ),
      padHi: bars(
        "G4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "D4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "E4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "C4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "G4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "D4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "C4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "B3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      padLo: bars(
        "E4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "B3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "C4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "A3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "E4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "B3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "A3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "G#3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      bass: bars(
        "C3 =  =  =  C3 =  =  =  G2 =  =  =  C3 =  =  =",
        "G2 =  =  =  G2 =  =  =  D3 =  =  =  G2 =  =  =",
        "A2 =  =  =  A2 =  =  =  E2 =  =  =  A2 =  =  =",
        "F2 =  =  =  F2 =  =  =  C3 =  =  =  F2 =  =  =",
        "C3 =  =  =  C3 =  =  =  G2 =  =  =  C3 =  =  =",
        "G2 =  =  =  G2 =  =  =  D3 =  =  =  G2 =  =  =",
        "F2 =  =  =  F2 =  =  =  C3 =  =  =  F2 =  =  =",
        "E2 =  =  =  E2 =  =  =  B2 =  =  =  E2 =  =  =",
      ),
    },

    // ── BREAK — F G Am Am, F G E E: bells and arps alone in the echo. ──
    break: {
      bell: bars(
        "A5 =  =  =  =  =  =  =  .  .  .  .  C6 =  =  =",
        "B5 =  =  =  =  =  =  =  .  .  .  .  .  .  .  .",
        "C6 =  =  =  =  =  =  =  E5 =  =  =  .  .  .  .",
        ".  .  .  .  A5 =  =  =  .  .  .  .  .  .  .  .",
        "F5 =  =  =  =  =  =  =  A5 =  =  =  .  .  .  .",
        "G5 =  =  =  =  =  =  =  B5 =  =  =  .  .  .  .",
        "E5 =  =  =  G#5 =  =  =  B5 =  =  =  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
      ),
      arp: bars(
        "F3 .  A3 .  C4 .  A3 .  F3 .  A3 .  C4 .  A3 .",
        "G3 .  B3 .  D4 .  B3 .  G3 .  B3 .  D4 .  B3 .",
        "A3 .  C4 .  E4 .  C4 .  A3 .  C4 .  E4 .  C4 .",
        "A3 .  C4 .  E4 .  C4 .  A3 .  C4 .  E4 .  C4 .",
        "F3 .  A3 .  C4 .  A3 .  F3 .  A3 .  C4 .  A3 .",
        "G3 .  B3 .  D4 .  B3 .  G3 .  B3 .  D4 .  B3 .",
        "E3 .  G#3 .  B3 .  G#3 .  E3 .  G#3 .  B3 .  G#3 .",
        "E3 .  G#3 .  B3 .  G#3 .  E3 .  G#3 .  B3 .  G#3 .",
      ),
      bass: bars(
        "F2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "G2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "A2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "A2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "F2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "G2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "E2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "E2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
    },

    // ── OUTRO — Am F E E: the flute recalls the lament, then breath. ──
    outro: {
      flute: bars(
        "E4 =  =  =  =  =  =  =  C4 =  =  =  D4 =  =  =",
        "C4 =  =  =  =  =  =  =  A3 =  =  =  =  =  =  =",
        "B3 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
      ),
      bell: bars(
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "E5 =  =  =  B4 =  =  =  G#4 =  =  =  =  =  =  =",
      ),
      padHi: bars(
        "E4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "C4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "B3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "B3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      padLo: bars(
        "C4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "A3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "G#3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "G#3 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      bass: bars(
        "A2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "F2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "E2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        "E2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
    },
  },

  order: ["intro", "verse", "chorus", "verse", "break", "chorus", "outro"],
};
