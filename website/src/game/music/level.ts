// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MOON RUN — "REGOLITH RIDE". The complete score for the in-run music:
// every instrument patch and every note lives in this file, arranged like a
// tracker module (patterns + play order) for the sequencer in
// @ui/lib/chiptune.ts.
//
// A fast heroic A-minor action theme in the 16-bit arcade tradition:
// pumping triangle octave bass, a full kick/snare/hat kit, off-beat pulse
// stabs, and a detuned square lead that gets answered an octave down in
// the choruses. The shapes are the ones classic action scores run on —
// i–VI–VII drive, a relative-major chorus, a tense breakdown that builds
// back up — but every melody is original; nothing sampled or transcribed.
//
// Arrangement (150 bpm, 4/4, one bar = 16 sixteenth-note steps):
//   intro(4) A(8) A2(8) B(8) A(8) break(8) build(8) B(8) A2(8) turn(8)
//   = 76 bars ≈ 122 s per loop.

import { bars, type ChiptuneTrack } from "@ui/lib/chiptune.ts";

export const LEVEL_THEME: ChiptuneTrack = {
  bpm: 150,
  stepsPerBeat: 4,

  instruments: {
    // The hero lead: detuned square with quick vibrato — brassy, forward.
    lead: {
      wave: "square",
      volume: 0.03,
      gate: 0.85,
      detuneCents: 7,
      vibrato: { rateHz: 6, depthCents: 10, delayMs: 120 },
      echo: 0.22,
    },
    // The answer voice: doubles the lead an octave down in the choruses.
    harm: {
      wave: "square",
      volume: 0.016,
      gate: 0.85,
      pan: 0.35,
      echo: 0.18,
    },
    // Off-beat chord stabs — the rhythm guitar of the pulse world.
    stab: {
      wave: "square",
      volume: 0.014,
      gate: 0.35,
      pan: -0.3,
    },
    // Pumping triangle octaves, eight to the bar.
    bass: {
      wave: "triangle",
      volume: 0.055,
      gate: 0.85,
    },
    // The kit: a pitch-diving triangle kick, band-limited snare, tight hat.
    kick: {
      wave: "triangle",
      volume: 0.065,
      gate: 1,
      slide: 0.25,
    },
    snare: {
      wave: "noise",
      volume: 0.038,
      gate: 0.8,
      filter: { type: "highpass", frequency: 1400 },
    },
    hat: {
      wave: "noise",
      volume: 0.011,
      gate: 0.3,
      pan: 0.2,
      filter: { type: "highpass", frequency: 6500 },
    },
  },

  patterns: {
    // ── INTRO — four bars of Am groove; the lead runs in on bar 4. ──
    intro: {
      lead: bars(
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  E4 =  G4 =  B4 =  D5 =",
      ),
      stab: bars(
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  C4 .  .  .  E4 .  .  .  C4 .  .  .  E4 .",
        ".  .  C4 .  .  .  E4 .  .  .  C4 .  .  .  E4 .",
      ),
      bass: bars("A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 ."),
      kick: bars(
        "A2 .  .  .  .  .  .  .  A2 .  .  .  .  .  .  .",
        "A2 .  .  .  .  .  .  .  A2 .  A2 .  .  .  .  .",
      ),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // ── A — Am Am F G / Am F G E: the main theme. ──
    a: {
      lead: bars(
        "A4 =  =  =  C5 =  D5 =  E5 =  =  =  D5 =  C5 =",
        "D5 =  C5 =  D5 =  E5 =  G5 =  =  =  E5 =  D5 =",
        "F5 =  =  =  E5 =  D5 =  C5 =  =  =  A4 =  C5 =",
        "B4 =  =  =  D5 =  =  =  G4 =  =  =  B4 =  D5 =",
        "E5 =  =  =  C5 =  D5 =  E5 =  G5 =  A5 =  =  =",
        "A5 =  G5 =  F5 =  E5 =  F5 =  =  =  C5 =  =  =",
        "D5 =  E5 =  D5 =  C5 =  B4 =  =  =  G4 =  =  =",
        "C5 =  B4 =  A4 =  G#4 =  E4 =  =  =  B4 =  =  =",
      ),
      stab: bars(
        ".  .  C4 .  .  .  E4 .  .  .  C4 .  .  .  E4 .",
        ".  .  C4 .  .  .  E4 .  .  .  C4 .  .  .  E4 .",
        ".  .  A3 .  .  .  C4 .  .  .  A3 .  .  .  C4 .",
        ".  .  B3 .  .  .  D4 .  .  .  B3 .  .  .  D4 .",
        ".  .  C4 .  .  .  E4 .  .  .  C4 .  .  .  E4 .",
        ".  .  A3 .  .  .  C4 .  .  .  A3 .  .  .  C4 .",
        ".  .  B3 .  .  .  D4 .  .  .  B3 .  .  .  D4 .",
        ".  .  G#3 .  .  .  B3 .  .  .  G#3 .  .  .  B3 .",
      ),
      bass: bars(
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "F2 .  F3 .  F2 .  F3 .  F2 .  F3 .  F2 .  F3 .",
        "G2 .  G3 .  G2 .  G3 .  G2 .  G3 .  G2 .  G3 .",
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "F2 .  F3 .  F2 .  F3 .  F2 .  F3 .  F2 .  F3 .",
        "G2 .  G3 .  G2 .  G3 .  G2 .  G3 .  G2 .  G3 .",
        "E2 .  E3 .  E2 .  E3 .  E2 .  E3 .  E2 .  E3 .",
      ),
      kick: bars(
        "A2 .  .  .  .  .  .  .  A2 .  .  .  .  .  .  .",
        "A2 .  .  .  .  .  .  .  A2 .  A2 .  .  .  .  .",
      ),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // ── A2 — same drive, the lead answers itself with quicker runs. ──
    a2: {
      lead: bars(
        "A4 =  .  A4 C5 =  D5 =  E5 =  .  E5 D5 =  C5 =",
        "D5 =  C5 =  D5 =  E5 =  G5 =  A5 =  G5 =  E5 =",
        "F5 =  =  =  A5 =  G5 =  F5 =  E5 =  D5 =  C5 =",
        "B4 =  D5 =  G5 =  =  =  D5 =  B4 =  G4 =  =  =",
        "E5 =  =  =  C5 =  D5 =  E5 =  G5 =  A5 =  =  =",
        "A5 =  G5 =  F5 =  E5 =  F5 =  D5 =  C5 =  A4 =",
        "B4 =  C5 =  D5 =  E5 =  D5 =  C5 =  B4 =  A4 =",
        "C5 =  B4 =  A4 =  G#4 =  E4 =  =  =  E5 =  =  =",
      ),
      stab: bars(
        ".  .  C4 .  .  .  E4 .  .  .  C4 .  .  .  E4 .",
        ".  .  C4 .  .  .  E4 .  .  .  C4 .  .  .  E4 .",
        ".  .  A3 .  .  .  C4 .  .  .  A3 .  .  .  C4 .",
        ".  .  B3 .  .  .  D4 .  .  .  B3 .  .  .  D4 .",
        ".  .  C4 .  .  .  E4 .  .  .  C4 .  .  .  E4 .",
        ".  .  A3 .  .  .  C4 .  .  .  A3 .  .  .  C4 .",
        ".  .  B3 .  .  .  D4 .  .  .  B3 .  .  .  D4 .",
        ".  .  G#3 .  .  .  B3 .  .  .  G#3 .  .  .  B3 .",
      ),
      bass: bars(
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "F2 .  F3 .  F2 .  F3 .  F2 .  F3 .  F2 .  F3 .",
        "G2 .  G3 .  G2 .  G3 .  G2 .  G3 .  G2 .  G3 .",
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "F2 .  F3 .  F2 .  F3 .  F2 .  F3 .  F2 .  F3 .",
        "G2 .  G3 .  G2 .  G3 .  G2 .  G3 .  G2 .  G3 .",
        "E2 .  E3 .  E2 .  E3 .  E2 .  E3 .  E2 .  E3 .",
      ),
      kick: bars(
        "A2 .  .  .  .  .  .  .  A2 .  .  .  .  .  .  .",
        "A2 .  .  .  .  .  .  .  A2 .  A2 .  .  .  .  .",
      ),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // ── B — C G Am F / C G F G: the relative-major anthem, octave answer. ──
    b: {
      lead: bars(
        "E5 =  =  =  =  =  D5 =  C5 =  =  =  G4 =  =  =",
        "D5 =  =  =  =  =  C5 =  B4 =  =  =  G4 =  =  =",
        "C5 =  =  =  =  =  B4 =  A4 =  =  =  E5 =  =  =",
        "F5 =  =  =  E5 =  D5 =  C5 =  =  =  A4 =  =  =",
        "G5 =  =  =  =  =  E5 =  C5 =  =  =  E5 =  =  =",
        "D5 =  =  =  B4 =  D5 =  G5 =  =  =  =  =  =  =",
        "A5 =  =  =  G5 =  F5 =  E5 =  =  =  C5 =  =  =",
        "B4 =  C5 =  D5 =  =  =  =  =  =  =  .  .  .  .",
      ),
      harm: bars(
        "E4 =  =  =  =  =  D4 =  C4 =  =  =  G3 =  =  =",
        "D4 =  =  =  =  =  C4 =  B3 =  =  =  G3 =  =  =",
        "C4 =  =  =  =  =  B3 =  A3 =  =  =  E4 =  =  =",
        "F4 =  =  =  E4 =  D4 =  C4 =  =  =  A3 =  =  =",
        "G4 =  =  =  =  =  E4 =  C4 =  =  =  E4 =  =  =",
        "D4 =  =  =  B3 =  D4 =  G4 =  =  =  =  =  =  =",
        "A4 =  =  =  G4 =  F4 =  E4 =  =  =  C4 =  =  =",
        "B3 =  C4 =  D4 =  =  =  =  =  =  =  .  .  .  .",
      ),
      stab: bars(
        ".  .  E4 .  .  .  G4 .  .  .  E4 .  .  .  G4 .",
        ".  .  B3 .  .  .  D4 .  .  .  B3 .  .  .  D4 .",
        ".  .  C4 .  .  .  E4 .  .  .  C4 .  .  .  E4 .",
        ".  .  A3 .  .  .  C4 .  .  .  A3 .  .  .  C4 .",
        ".  .  E4 .  .  .  G4 .  .  .  E4 .  .  .  G4 .",
        ".  .  B3 .  .  .  D4 .  .  .  B3 .  .  .  D4 .",
        ".  .  A3 .  .  .  C4 .  .  .  A3 .  .  .  C4 .",
        ".  .  B3 .  .  .  D4 .  .  .  B3 .  .  .  D4 .",
      ),
      bass: bars(
        "C3 .  C4 .  C3 .  C4 .  C3 .  C4 .  C3 .  C4 .",
        "G2 .  G3 .  G2 .  G3 .  G2 .  G3 .  G2 .  G3 .",
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "F2 .  F3 .  F2 .  F3 .  F2 .  F3 .  F2 .  F3 .",
        "C3 .  C4 .  C3 .  C4 .  C3 .  C4 .  C3 .  C4 .",
        "G2 .  G3 .  G2 .  G3 .  G2 .  G3 .  G2 .  G3 .",
        "F2 .  F3 .  F2 .  F3 .  F2 .  F3 .  F2 .  F3 .",
        "G2 .  G3 .  G2 .  G3 .  G2 .  G3 .  G2 .  G3 .",
      ),
      kick: bars(
        "A2 .  .  .  .  .  .  .  A2 .  .  .  .  .  .  .",
        "A2 .  .  .  .  .  .  .  A2 .  A2 .  .  .  .  .",
      ),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // ── BREAK — Dm Dm Am Am / Dm Dm E E: drums thin, tension arps. ──
    break: {
      stab: bars(
        "D4 .  F4 .  A4 .  F4 .  D4 .  F4 .  A4 .  F4 .",
        "D4 .  F4 .  A4 .  F4 .  D4 .  F4 .  A4 .  F4 .",
        "C4 .  E4 .  A4 .  E4 .  C4 .  E4 .  A4 .  E4 .",
        "C4 .  E4 .  A4 .  E4 .  C4 .  E4 .  A4 .  E4 .",
        "D4 .  F4 .  A4 .  F4 .  D4 .  F4 .  A4 .  F4 .",
        "D4 .  F4 .  A4 .  F4 .  D4 .  F4 .  A4 .  F4 .",
        "B3 .  E4 .  G#4 .  E4 .  B3 .  E4 .  G#4 .  E4 .",
        "B3 .  E4 .  G#4 .  E4 .  B3 .  E4 .  G#4 .  E4 .",
      ),
      bass: bars(
        "D3 =  =  .  F3 =  =  .  A3 =  =  .  F3 =  =  .",
        "D3 =  =  .  F3 =  =  .  A3 =  =  .  F3 =  =  .",
        "A2 =  =  .  C3 =  =  .  E3 =  =  .  C3 =  =  .",
        "A2 =  =  .  C3 =  =  .  E3 =  =  .  C3 =  =  .",
        "D3 =  =  .  F3 =  =  .  A3 =  =  .  F3 =  =  .",
        "D3 =  =  .  F3 =  =  .  A3 =  =  .  F3 =  =  .",
        "E3 =  =  .  G#3 =  =  .  B3 =  =  .  G#3 =  =  .",
        "E3 =  =  .  G#3 =  =  .  B3 =  =  .  E3 =  =  .",
      ),
      hat: bars("x  .  .  .  x  .  .  .  x  .  .  .  x  .  x  ."),
    },

    // ── BUILD — F F G G Am Am E E: the long climb, snare roll at the top. ──
    build: {
      lead: bars(
        "F4 =  =  =  =  =  =  =  A4 =  =  =  =  =  =  =",
        "C5 =  =  =  =  =  =  =  A4 =  =  =  =  =  =  =",
        "G4 =  =  =  =  =  =  =  B4 =  =  =  =  =  =  =",
        "D5 =  =  =  =  =  =  =  B4 =  =  =  =  =  =  =",
        "C5 =  =  =  =  =  =  =  E5 =  =  =  =  =  =  =",
        "A5 =  =  =  =  =  =  =  E5 =  =  =  =  =  =  =",
        "B4 =  =  =  D5 =  =  =  E5 =  =  =  G#5 =  =  =",
        "B5 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      harm: bars(
        "F3 =  =  =  =  =  =  =  A3 =  =  =  =  =  =  =",
        "C4 =  =  =  =  =  =  =  A3 =  =  =  =  =  =  =",
        "G3 =  =  =  =  =  =  =  B3 =  =  =  =  =  =  =",
        "D4 =  =  =  =  =  =  =  B3 =  =  =  =  =  =  =",
        "C4 =  =  =  =  =  =  =  E4 =  =  =  =  =  =  =",
        "A4 =  =  =  =  =  =  =  E4 =  =  =  =  =  =  =",
        "B3 =  =  =  D4 =  =  =  E4 =  =  =  G#4 =  =  =",
        "B4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      bass: bars(
        "F2 .  F3 .  F2 .  F3 .  F2 .  F3 .  F2 .  F3 .",
        "F2 .  F3 .  F2 .  F3 .  F2 .  F3 .  F2 .  F3 .",
        "G2 .  G3 .  G2 .  G3 .  G2 .  G3 .  G2 .  G3 .",
        "G2 .  G3 .  G2 .  G3 .  G2 .  G3 .  G2 .  G3 .",
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "E2 .  E3 .  E2 .  E3 .  E2 .  E3 .  E2 .  E3 .",
        "E2 .  E3 .  E2 .  E3 .  E2 .  E3 .  E2 .  E3 .",
      ),
      kick: bars("A2 .  .  .  .  .  .  .  A2 .  .  .  .  .  .  ."),
      snare: bars(
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  x  .",
        ".  .  .  .  x  .  .  .  x  .  x  .  x  .  x  .",
        "x  .  x  .  x  x  x  x  x  x  x  x  x  x  x  x",
      ),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // ── TURN — Am F G E / Am F E E: the big unison finale, then the fill. ──
    turn: {
      lead: bars(
        "A4 =  B4 =  C5 =  D5 =  E5 =  =  =  =  =  =  =",
        "F5 =  E5 =  D5 =  C5 =  A4 =  =  =  =  =  =  =",
        "G4 =  A4 =  B4 =  C5 =  D5 =  =  =  =  =  =  =",
        "E5 =  D5 =  B4 =  G#4 =  E4 =  =  =  =  =  =  =",
        "A4 =  C5 =  E5 =  =  =  A5 =  =  =  G5 =  E5 =",
        "F5 =  A5 =  =  =  G5 =  F5 =  =  =  E5 =  D5 =",
        "B4 =  =  =  D5 =  =  =  E5 =  =  =  G#5 =  =  =",
        "A5 =  =  =  =  =  =  =  .  .  .  .  .  .  .  .",
      ),
      harm: bars(
        "A3 =  B3 =  C4 =  D4 =  E4 =  =  =  =  =  =  =",
        "F4 =  E4 =  D4 =  C4 =  A3 =  =  =  =  =  =  =",
        "G3 =  A3 =  B3 =  C4 =  D4 =  =  =  =  =  =  =",
        "E4 =  D4 =  B3 =  G#3 =  E3 =  =  =  =  =  =  =",
        "A3 =  C4 =  E4 =  =  =  A4 =  =  =  G4 =  E4 =",
        "F4 =  A4 =  =  =  G4 =  F4 =  =  =  E4 =  D4 =",
        "B3 =  =  =  D4 =  =  =  E4 =  =  =  G#4 =  =  =",
        "A4 =  =  =  =  =  =  =  .  .  .  .  .  .  .  .",
      ),
      bass: bars(
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "F2 .  F3 .  F2 .  F3 .  F2 .  F3 .  F2 .  F3 .",
        "G2 .  G3 .  G2 .  G3 .  G2 .  G3 .  G2 .  G3 .",
        "E2 .  E3 .  E2 .  E3 .  E2 .  E3 .  E2 .  E3 .",
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "F2 .  F3 .  F2 .  F3 .  F2 .  F3 .  F2 .  F3 .",
        "E2 .  E3 .  E2 .  E3 .  E2 .  E3 .  E2 .  E3 .",
        "E2 .  E3 .  E2 .  E3 .  E2 .  E3 .  E2 .  E3 .",
      ),
      kick: bars("A2 .  .  .  .  .  .  .  A2 .  .  .  .  .  .  ."),
      snare: bars(
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  x  .  x  x  .  x  x  x  x  x",
      ),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },
  },

  order: ["intro", "a", "a2", "b", "a", "break", "build", "b", "a2", "turn"],
};
