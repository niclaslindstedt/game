// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SPACEZ HQ — "LOCKDOWN". The complete score for level 1's in-run music:
// every instrument patch and every note lives in this file, arranged like a
// tracker module (patterns + play order) for the sequencer in
// @ui/lib/chiptune.ts.
//
// A tense D-minor infiltration groove in the 16-bit stealth-action tradition:
// a driving triangle octave bass, a mechanical off-beat pulse riff, a hard
// kick/snare/hat kit, and a wiry square lead that stalks the scale rather
// than soaring. Where the moon's REGOLITH RIDE is heroic, HQ is nervous —
// this is a break-in, not a charge. Original melodies; nothing sampled.
//
// Arrangement (140 bpm, 4/4, one bar = 16 sixteenth-note steps):
//   intro(4) A(8) B(8) A(8) break(8) build(8) B(8) turn(8) A(8)
//   = 68 bars ≈ 117 s per loop.

import { bars, type ChiptuneTrack } from "@ui/lib/chiptune.ts";

export const HQ_THEME: ChiptuneTrack = {
  bpm: 140,
  stepsPerBeat: 4,

  instruments: {
    // The wiry lead: a tight square that prowls the scale.
    lead: {
      wave: "square",
      volume: 0.028,
      gate: 0.8,
      detuneCents: 5,
      vibrato: { rateHz: 5, depthCents: 8, delayMs: 150 },
      echo: 0.18,
    },
    // Mechanical off-beat riff — the alarm ticking under everything.
    riff: {
      wave: "sawtooth",
      volume: 0.014,
      gate: 0.4,
      pan: -0.25,
      echo: 0.12,
    },
    // Driving triangle octaves, eight to the bar.
    bass: {
      wave: "triangle",
      volume: 0.055,
      gate: 0.85,
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
      pan: 0.2,
      filter: { type: "highpass", frequency: 7000 },
    },
  },

  patterns: {
    // ── INTRO — four bars of Dm tension; the lead sneaks in on bar 4. ──
    intro: {
      riff: bars(
        ".  .  A4 .  .  .  A4 .  .  .  A4 .  .  .  A4 .",
        ".  .  A4 .  .  .  A4 .  .  .  A4 .  .  .  A4 .",
        ".  .  A4 .  .  .  A4 .  .  .  A4 .  .  .  A4 .",
        ".  .  A4 .  .  .  A4 .  .  .  A4 .  .  .  A4 .",
      ),
      lead: bars(
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  D4 =  F4 =  A4 =  C5 =",
      ),
      bass: bars("D2 .  D3 .  D2 .  D3 .  D2 .  D3 .  D2 .  D3 ."),
      kick: bars("D2 .  .  .  .  .  .  .  D2 .  .  .  .  .  .  ."),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // ── A — Dm Dm A# C: the main prowl. ──
    a: {
      lead: bars(
        "D5 =  =  =  C5 =  A4 =  A#4 =  =  =  A4 =  F4 =",
        "A4 =  F4 =  D4 =  F4 =  A4 =  =  =  G4 =  A4 =",
        "A#4 =  =  =  A4 =  G4 =  F4 =  =  =  D4 =  F4 =",
        "C5 =  =  =  A#4 =  A4 =  A4 =  =  =  E4 =  =  =",
        "D5 =  =  =  C5 =  A4 =  A#4 =  C5 =  D5 =  =  =",
        "F5 =  E5 =  D5 =  C5 =  A#4 =  =  =  A4 =  =  =",
        "G4 =  A4 =  A#4 =  A4 =  G4 =  F4 =  E4 =  =  =",
        "D4 =  =  =  A4 =  =  =  A4 =  C#5 =  D5 =  =  =",
      ),
      riff: bars(
        ".  .  A4 .  .  .  A4 .  .  .  A4 .  .  .  A4 .",
        ".  .  A4 .  .  .  A4 .  .  .  A4 .  .  .  A4 .",
        ".  .  G4 .  .  .  A#4 .  .  .  G4 .  .  .  A#4 .",
        ".  .  A4 .  .  .  C5 .  .  .  A4 .  .  .  C5 .",
        ".  .  A4 .  .  .  A4 .  .  .  A4 .  .  .  A4 .",
        ".  .  A#4 .  .  .  A4 .  .  .  A#4 .  .  .  A4 .",
        ".  .  G4 .  .  .  A#4 .  .  .  G4 .  .  .  A#4 .",
        ".  .  A4 .  .  .  C#5 .  .  .  A4 .  .  .  C#5 .",
      ),
      bass: bars(
        "D2 .  D3 .  D2 .  D3 .  D2 .  D3 .  D2 .  D3 .",
        "D2 .  D3 .  D2 .  D3 .  D2 .  D3 .  D2 .  D3 .",
        "A#1 .  A#2 .  A#1 .  A#2 .  C2 .  C3 .  C2 .  C3 .",
        "A1 .  A2 .  A1 .  A2 .  A1 .  A2 .  A1 .  A2 .",
        "D2 .  D3 .  D2 .  D3 .  D2 .  D3 .  D2 .  D3 .",
        "A#1 .  A#2 .  A#1 .  A#2 .  A1 .  A2 .  A1 .  A2 .",
        "G1 .  G2 .  G1 .  G2 .  A#1 .  A#2 .  A#1 .  A#2 .",
        "A1 .  A2 .  A1 .  A2 .  A1 .  A2 .  A1 .  A2 .",
      ),
      kick: bars(
        "D2 .  .  .  .  .  .  .  D2 .  .  .  .  .  .  .",
        "D2 .  .  .  .  .  .  .  D2 .  D2 .  .  .  .  .",
      ),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // ── B — Gm F Dm A: the corridor sweep, riff thins to half-time. ──
    b: {
      lead: bars(
        "G5 =  =  =  =  =  F5 =  D5 =  =  =  A#4 =  =  =",
        "F5 =  =  =  =  =  E5 =  C5 =  =  =  A4 =  =  =",
        "D5 =  =  =  =  =  C5 =  A4 =  =  =  F4 =  =  =",
        "A4 =  C5 =  E5 =  =  =  A4 =  =  =  =  =  =  =",
        "G5 =  =  =  F5 =  D5 =  A#4 =  =  =  C5 =  =  =",
        "F5 =  =  =  E5 =  C5 =  A4 =  =  =  E4 =  =  =",
        "D5 =  F5 =  A5 =  =  =  G5 =  F5 =  E5 =  D5 =",
        "C5 =  A#4 =  A4 =  G4 =  A4 =  =  =  =  =  =  =",
      ),
      riff: bars(
        ".  .  .  .  G4 .  .  .  .  .  .  .  G4 .  .  .",
        ".  .  .  .  F4 .  .  .  .  .  .  .  F4 .  .  .",
        ".  .  .  .  D4 .  .  .  .  .  .  .  D4 .  .  .",
        ".  .  .  .  A4 .  .  .  .  .  .  .  A4 .  .  .",
      ),
      bass: bars(
        "G1 .  G2 .  G1 .  G2 .  G1 .  G2 .  G1 .  G2 .",
        "F1 .  F2 .  F1 .  F2 .  F1 .  F2 .  F1 .  F2 .",
        "D2 .  D3 .  D2 .  D3 .  D2 .  D3 .  D2 .  D3 .",
        "A1 .  A2 .  A1 .  A2 .  A1 .  A2 .  A1 .  A2 .",
        "G1 .  G2 .  G1 .  G2 .  F1 .  F2 .  F1 .  F2 .",
        "D2 .  D3 .  D2 .  D3 .  A1 .  A2 .  A1 .  A2 .",
        "A#1 .  A#2 .  A#1 .  A#2 .  C2 .  C3 .  C2 .  C3 .",
        "A1 .  A2 .  A1 .  A2 .  A1 .  A2 .  A1 .  A2 .",
      ),
      kick: bars(
        "D2 .  .  .  .  .  .  .  D2 .  .  .  .  .  .  .",
        "D2 .  .  .  .  .  .  .  D2 .  D2 .  .  .  .  .",
      ),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // ── BREAK — Dm Dm A A: drums drop out, the alarm arps alone. ──
    break: {
      riff: bars(
        "D4 .  F4 .  A4 .  F4 .  D4 .  F4 .  A4 .  F4 .",
        "D4 .  F4 .  A4 .  F4 .  D4 .  F4 .  A4 .  F4 .",
        "A3 .  C#4 .  E4 .  C#4 .  A3 .  C#4 .  E4 .  C#4 .",
        "A3 .  C#4 .  E4 .  C#4 .  A3 .  C#4 .  E4 .  C#4 .",
        "D4 .  F4 .  A4 .  F4 .  D4 .  F4 .  A4 .  F4 .",
        "D4 .  F4 .  A4 .  F4 .  D4 .  F4 .  A4 .  F4 .",
        "A3 .  C#4 .  E4 .  A4 .  C#4 .  E4 .  A4 .  C#4 .",
        "A3 .  C#4 .  E4 .  A4 .  C#4 .  E4 .  A4 .  C#4 .",
      ),
      bass: bars(
        "D2 =  =  .  D3 =  =  .  D2 =  =  .  D3 =  =  .",
        "D2 =  =  .  D3 =  =  .  D2 =  =  .  D3 =  =  .",
        "A1 =  =  .  A2 =  =  .  A1 =  =  .  A2 =  =  .",
        "A1 =  =  .  A2 =  =  .  A1 =  =  .  A2 =  =  .",
        "D2 =  =  .  D3 =  =  .  D2 =  =  .  D3 =  =  .",
        "D2 =  =  .  D3 =  =  .  D2 =  =  .  D3 =  =  .",
        "A1 =  =  .  A2 =  =  .  A1 =  =  .  A2 =  =  .",
        "A1 =  =  .  A2 =  =  .  A1 =  =  .  A2 =  =  .",
      ),
      hat: bars("x  .  .  .  x  .  .  .  x  .  .  .  x  .  x  ."),
    },

    // ── BUILD — Dm Dm A A: the climb back, snare roll at the top. ──
    build: {
      lead: bars(
        "D4 =  =  =  =  =  =  =  F4 =  =  =  =  =  =  =",
        "A4 =  =  =  =  =  =  =  F4 =  =  =  =  =  =  =",
        "A4 =  =  =  =  =  =  =  C5 =  =  =  =  =  =  =",
        "E5 =  =  =  =  =  =  =  C#5 =  =  =  =  =  =  =",
        "D5 =  =  =  F5 =  =  =  A5 =  =  =  =  =  =  =",
        "A5 =  =  =  =  =  =  =  E5 =  =  =  =  =  =  =",
        "A4 =  =  =  C5 =  =  =  E5 =  =  =  A5 =  =  =",
        "C#5 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      bass: bars(
        "D2 .  D3 .  D2 .  D3 .  D2 .  D3 .  D2 .  D3 .",
        "D2 .  D3 .  D2 .  D3 .  D2 .  D3 .  D2 .  D3 .",
        "A1 .  A2 .  A1 .  A2 .  A1 .  A2 .  A1 .  A2 .",
        "A1 .  A2 .  A1 .  A2 .  A1 .  A2 .  A1 .  A2 .",
        "D2 .  D3 .  D2 .  D3 .  D2 .  D3 .  D2 .  D3 .",
        "D2 .  D3 .  D2 .  D3 .  D2 .  D3 .  D2 .  D3 .",
        "A1 .  A2 .  A1 .  A2 .  A1 .  A2 .  A1 .  A2 .",
        "A1 .  A2 .  A1 .  A2 .  A1 .  A2 .  A1 .  A2 .",
      ),
      kick: bars("D2 .  .  .  .  .  .  .  D2 .  .  .  .  .  .  ."),
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

    // ── TURN — Dm A# C A: the unison hook, then the fill back to A. ──
    turn: {
      lead: bars(
        "D5 =  C5 =  A#4 =  A4 =  F4 =  =  =  =  =  =  =",
        "A#4 =  A4 =  G4 =  F4 =  D4 =  =  =  =  =  =  =",
        "C5 =  A#4 =  A4 =  G4 =  A4 =  =  =  =  =  =  =",
        "E4 =  G4 =  A4 =  C5 =  A4 =  =  =  =  =  =  =",
        "D5 =  F5 =  A5 =  =  =  G5 =  =  =  F5 =  D5 =",
        "A#4 =  D5 =  F5 =  =  =  E5 =  =  =  C5 =  A4 =",
        "C5 =  =  =  A#4 =  =  =  A4 =  =  =  C#5 =  =  =",
        "D5 =  =  =  =  =  =  =  .  .  .  .  .  .  .  .",
      ),
      riff: bars(
        ".  .  A4 .  .  .  A4 .  .  .  A4 .  .  .  A4 .",
        ".  .  A4 .  .  .  A4 .  .  .  A4 .  .  .  A4 .",
      ),
      bass: bars(
        "D2 .  D3 .  D2 .  D3 .  D2 .  D3 .  D2 .  D3 .",
        "A#1 .  A#2 .  A#1 .  A#2 .  D2 .  D3 .  D2 .  D3 .",
        "C2 .  C3 .  C2 .  C3 .  A1 .  A2 .  A1 .  A2 .",
        "E2 .  E3 .  E2 .  E3 .  A1 .  A2 .  A1 .  A2 .",
        "D2 .  D3 .  D2 .  D3 .  G1 .  G2 .  G1 .  G2 .",
        "A#1 .  A#2 .  A#1 .  A#2 .  C2 .  C3 .  C2 .  C3 .",
        "F1 .  F2 .  F1 .  F2 .  A1 .  A2 .  A1 .  A2 .",
        "A1 .  A2 .  A1 .  A2 .  A1 .  A2 .  A1 .  A2 .",
      ),
      kick: bars("D2 .  .  .  .  .  .  .  D2 .  .  .  .  .  .  ."),
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
