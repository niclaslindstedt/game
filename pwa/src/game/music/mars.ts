// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MARS — "RED DUST". The complete score for level 3's in-run music: every
// instrument patch and every note lives in this file, arranged like a
// tracker module (patterns + play order) for the sequencer in
// @ui/lib/chiptune.ts.
//
// A galloping E-minor desert ride with a spaghetti-western squint: a
// triangle gallop bass under a twangy detuned saw lead, an off-beat square
// pulse like heat shimmer, and a chorus that lifts to the relative major
// before the turnaround drags it back into the dust. Where the moon RIDES
// and HQ sneaks, Mars DRIVES — wide horizon, bad landlords. Original
// melodies; nothing sampled.
//
// Arrangement (132 bpm, 4/4, one bar = 16 sixteenth-note steps):
//   intro(4) A(8) B(8) A(8) break(8) build(8) B(8) turn(8) A(8)
//   = 68 bars ≈ 124 s per loop.

import { bars, type ChiptuneTrack } from "@ui/lib/chiptune.ts";

export const MARS_THEME: ChiptuneTrack = {
  bpm: 132,
  stepsPerBeat: 4,

  instruments: {
    // The twangy lead: a detuned saw with a slow desert vibrato.
    lead: {
      wave: "sawtooth",
      volume: 0.026,
      gate: 0.85,
      detuneCents: 7,
      vibrato: { rateHz: 5.5, depthCents: 12, delayMs: 180 },
      echo: 0.22,
    },
    // Heat shimmer: an off-beat square pulse, panned off-center.
    pulse: {
      wave: "square",
      volume: 0.012,
      gate: 0.35,
      pan: 0.25,
      echo: 0.12,
    },
    // The gallop: triangle bass riding eighth-plus-sixteenths.
    bass: {
      wave: "triangle",
      volume: 0.055,
      gate: 0.8,
    },
    // The kit: a diving triangle kick, band-limited snare, tight hat.
    kick: {
      wave: "triangle",
      volume: 0.066,
      gate: 1,
      slide: 0.25,
    },
    snare: {
      wave: "noise",
      volume: 0.036,
      gate: 0.8,
      filter: { type: "highpass", frequency: 1500 },
    },
    hat: {
      wave: "noise",
      volume: 0.01,
      gate: 0.3,
      pan: -0.2,
      filter: { type: "highpass", frequency: 7000 },
    },
  },

  patterns: {
    // ── INTRO — four bars of open desert; the gallop rides in alone. ──
    intro: {
      bass: bars(
        "E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2",
        "E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2",
        "E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2",
        "E2 .  E2 E2 E2 .  E2 E2 D2 .  D2 D2 D2 .  D2 D2",
      ),
      lead: bars(
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  E4 =  G4 =  B4 =  D5 =",
      ),
      kick: bars("E2 .  .  .  .  .  .  .  E2 .  .  .  .  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // ── A — Em Em C D: the ride. ──
    a: {
      lead: bars(
        "E5 =  =  =  D5 =  B4 =  G4 =  =  =  A4 =  B4 =",
        "G5 =  F#5 =  E5 =  D5 =  E5 =  =  =  =  =  =  =",
        "C5 =  =  =  E5 =  G5 =  A5 =  G5 =  E5 =  C5 =",
        "D5 =  =  =  F#5 =  A5 =  B5 =  A5 =  F#5 =  D5 =",
        "E5 =  =  =  B4 =  E5 =  G5 =  =  =  F#5 =  E5 =",
        "B4 =  =  =  =  =  =  =  D5 =  C5 =  B4 =  A4 =",
        "C5 =  D5 =  E5 =  =  =  G5 =  E5 =  D5 =  C5 =",
        "B4 =  =  =  A4 =  F#4 =  E4 =  =  =  =  =  =  =",
      ),
      pulse: bars(
        ".  .  B3 .  .  .  B3 .  .  .  B3 .  .  .  B3 .",
        ".  .  B3 .  .  .  B3 .  .  .  B3 .  .  .  B3 .",
        ".  .  C4 .  .  .  C4 .  .  .  C4 .  .  .  C4 .",
        ".  .  D4 .  .  .  D4 .  .  .  D4 .  .  .  D4 .",
      ),
      bass: bars(
        "E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2",
        "E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2",
        "C2 .  C2 C2 C2 .  C2 C2 C2 .  C2 C2 C2 .  C2 C2",
        "D2 .  D2 D2 D2 .  D2 D2 D2 .  D2 D2 D2 .  D2 D2",
      ),
      kick: bars(
        "E2 .  .  .  .  .  .  .  E2 .  .  .  .  .  .  .",
        "E2 .  .  .  .  .  .  .  E2 .  E2 .  .  .  .  .",
      ),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // ── B — G G C D | Em C D B: the chorus lift to the relative major. ──
    b: {
      lead: bars(
        "G5 =  =  =  =  =  F#5 =  G5 =  A5 =  B5 =  =  =",
        "D5 =  =  =  E5 =  F#5 =  G5 =  =  =  =  =  =  =",
        "E5 =  =  =  C5 =  E5 =  A5 =  G5 =  E5 =  C5 =",
        "D5 =  E5 =  F#5 =  A5 =  D5 =  =  =  =  =  =  =",
        "E5 =  =  =  G5 =  B5 =  E5 =  =  =  D5 =  B4 =",
        "C5 =  =  =  E5 =  G5 =  C5 =  =  =  A4 =  G4 =",
        "A4 =  B4 =  D5 =  F#5 =  A5 =  =  =  G5 =  F#5 =",
        "B4 =  =  =  D#5 =  F#5 =  B5 =  =  =  =  =  =  =",
      ),
      pulse: bars(
        ".  .  .  .  G4 .  .  .  .  .  .  .  G4 .  .  .",
        ".  .  .  .  G4 .  .  .  .  .  .  .  G4 .  .  .",
        ".  .  .  .  E4 .  .  .  .  .  .  .  E4 .  .  .",
        ".  .  .  .  F#4 .  .  .  .  .  .  .  F#4 .  .  .",
        ".  .  .  .  G4 .  .  .  .  .  .  .  G4 .  .  .",
        ".  .  .  .  E4 .  .  .  .  .  .  .  E4 .  .  .",
        ".  .  .  .  F#4 .  .  .  .  .  .  .  F#4 .  .  .",
        ".  .  .  .  F#4 .  .  .  .  .  .  .  F#4 .  .  .",
      ),
      bass: bars(
        "G1 .  G1 G1 G1 .  G1 G1 G1 .  G1 G1 G1 .  G1 G1",
        "G1 .  G1 G1 G1 .  G1 G1 G1 .  G1 G1 G1 .  G1 G1",
        "C2 .  C2 C2 C2 .  C2 C2 C2 .  C2 C2 C2 .  C2 C2",
        "D2 .  D2 D2 D2 .  D2 D2 D2 .  D2 D2 D2 .  D2 D2",
        "E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2",
        "C2 .  C2 C2 C2 .  C2 C2 C2 .  C2 C2 C2 .  C2 C2",
        "D2 .  D2 D2 D2 .  D2 D2 D2 .  D2 D2 D2 .  D2 D2",
        "B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1",
      ),
      kick: bars(
        "E2 .  .  .  .  .  .  .  E2 .  .  .  .  .  .  .",
        "E2 .  .  .  .  .  .  .  E2 .  E2 .  .  .  .  .",
      ),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // ── BREAK — Em Em B B: drums fall away, the shimmer arps the dusk. ──
    break: {
      pulse: bars(
        "E4 .  G4 .  B4 .  G4 .  E4 .  G4 .  B4 .  G4 .",
        "E4 .  G4 .  B4 .  G4 .  E4 .  G4 .  B4 .  G4 .",
        "B3 .  D#4 .  F#4 .  D#4 .  B3 .  D#4 .  F#4 .  D#4 .",
        "B3 .  D#4 .  F#4 .  D#4 .  B3 .  D#4 .  F#4 .  D#4 .",
        "E4 .  G4 .  B4 .  G4 .  E4 .  G4 .  B4 .  G4 .",
        "E4 .  G4 .  B4 .  G4 .  E4 .  G4 .  B4 .  G4 .",
        "B3 .  D#4 .  F#4 .  B4 .  D#4 .  F#4 .  B4 .  D#4 .",
        "B3 .  D#4 .  F#4 .  B4 .  D#4 .  F#4 .  B4 .  D#4 .",
      ),
      bass: bars(
        "E2 =  =  .  E3 =  =  .  E2 =  =  .  E3 =  =  .",
        "E2 =  =  .  E3 =  =  .  E2 =  =  .  E3 =  =  .",
        "B1 =  =  .  B2 =  =  .  B1 =  =  .  B2 =  =  .",
        "B1 =  =  .  B2 =  =  .  B1 =  =  .  B2 =  =  .",
        "E2 =  =  .  E3 =  =  .  E2 =  =  .  E3 =  =  .",
        "E2 =  =  .  E3 =  =  .  E2 =  =  .  E3 =  =  .",
        "B1 =  =  .  B2 =  =  .  B1 =  =  .  B2 =  =  .",
        "B1 =  =  .  B2 =  =  .  B1 =  =  .  B2 =  =  .",
      ),
      hat: bars("x  .  .  .  x  .  .  .  x  .  .  .  x  .  x  ."),
    },

    // ── BUILD — Em Em B B: the climb out of the dust, snare roll on top. ──
    build: {
      lead: bars(
        "E4 =  =  =  =  =  =  =  G4 =  =  =  =  =  =  =",
        "B4 =  =  =  =  =  =  =  G4 =  =  =  =  =  =  =",
        "B4 =  =  =  =  =  =  =  D5 =  =  =  =  =  =  =",
        "F#5 =  =  =  =  =  =  =  D#5 =  =  =  =  =  =  =",
        "E5 =  =  =  G5 =  =  =  B5 =  =  =  =  =  =  =",
        "B5 =  =  =  =  =  =  =  F#5 =  =  =  =  =  =  =",
        "B4 =  =  =  D5 =  =  =  F#5 =  =  =  B5 =  =  =",
        "D#5 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      bass: bars(
        "E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2",
        "E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2",
        "B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1",
        "B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1",
        "E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2",
        "E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2",
        "B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1",
        "B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1",
      ),
      kick: bars("E2 .  .  .  .  .  .  .  E2 .  .  .  .  .  .  ."),
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

    // ── TURN — Em D C B: the unison hook, then the fill back to A. ──
    turn: {
      lead: bars(
        "E5 =  D5 =  C5 =  B4 =  G4 =  =  =  =  =  =  =",
        "C5 =  B4 =  A4 =  G4 =  E4 =  =  =  =  =  =  =",
        "D5 =  C5 =  B4 =  A4 =  B4 =  =  =  =  =  =  =",
        "F#4 =  A4 =  B4 =  D5 =  B4 =  =  =  =  =  =  =",
        "E5 =  G5 =  B5 =  =  =  A5 =  =  =  G5 =  E5 =",
        "C5 =  E5 =  G5 =  =  =  F#5 =  =  =  D5 =  B4 =",
        "D5 =  =  =  C5 =  =  =  B4 =  =  =  D#5 =  =  =",
        "E5 =  =  =  =  =  =  =  .  .  .  .  .  .  .  .",
      ),
      pulse: bars(
        ".  .  B3 .  .  .  B3 .  .  .  B3 .  .  .  B3 .",
        ".  .  B3 .  .  .  B3 .  .  .  B3 .  .  .  B3 .",
      ),
      bass: bars(
        "E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2",
        "D2 .  D2 D2 D2 .  D2 D2 D2 .  D2 D2 D2 .  D2 D2",
        "C2 .  C2 C2 C2 .  C2 C2 C2 .  C2 C2 C2 .  C2 C2",
        "B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1",
        "E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2 E2 .  E2 E2",
        "C2 .  C2 C2 C2 .  C2 C2 C2 .  C2 C2 C2 .  C2 C2",
        "D2 .  D2 D2 D2 .  D2 D2 D2 .  D2 D2 D2 .  D2 D2",
        "B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1 B1 .  B1 B1",
      ),
      kick: bars("E2 .  .  .  .  .  .  .  E2 .  .  .  .  .  .  ."),
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

  order: ["intro", "a", "b", "a", "break", "build", "b", "turn", "a"],
};
