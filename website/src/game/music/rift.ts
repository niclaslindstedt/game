// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RIFT — "RIFT DRIFT". The complete score for level 4's in-run music:
// every instrument patch and every note lives in this file, arranged like a
// tracker module (patterns + play order) for the sequencer in
// @ui/lib/chiptune.ts.
//
// Weightless and wrong on purpose: a slow A-lydian drift whose raised
// fourth (D#) keeps the ground from ever quite arriving. Echo-heavy sine
// lead floating over long detuned pads, a deep sparse bass like a heartbeat
// heard through a wall, and a kit that mostly declines to play. Where Mars
// DRIVES, the rift FALLS — gently, in every direction at once. Original
// melodies; nothing sampled.
//
// Arrangement (96 bpm, 4/4, one bar = 16 sixteenth-note steps):
//   drift(4) A(8) B(8) A(8) void(4) B(8) drift(4)
//   = 44 bars ≈ 110 s per loop.

import { bars, type ChiptuneTrack } from "@ui/lib/chiptune.ts";

export const RIFT_THEME: ChiptuneTrack = {
  bpm: 96,
  stepsPerBeat: 4,

  instruments: {
    // The floating voice: a pure sine with a slow, seasick vibrato and a
    // long tail into the echo bus.
    lead: {
      wave: "sine",
      volume: 0.03,
      gate: 0.9,
      vibrato: { rateHz: 3.5, depthCents: 18, delayMs: 260 },
      echo: 0.45,
    },
    // The pad: two detuned triangles holding whole notes under everything.
    pad: {
      wave: "triangle",
      volume: 0.026,
      gate: 0.98,
      detuneCents: 9,
      echo: 0.3,
    },
    // A heartbeat through a wall: deep, soft, sparse.
    bass: {
      wave: "sine",
      volume: 0.06,
      gate: 0.7,
    },
    // Star shimmer: a barely-there square, panned off-center, echoing.
    shimmer: {
      wave: "square",
      volume: 0.008,
      gate: 0.25,
      pan: 0.35,
      echo: 0.4,
    },
    // The kit, such as it is: a soft diving kick and a distant hat.
    kick: {
      wave: "triangle",
      volume: 0.05,
      gate: 1,
      slide: 0.3,
    },
    hat: {
      wave: "noise",
      volume: 0.006,
      gate: 0.25,
      pan: -0.25,
      filter: { type: "highpass", frequency: 8000 },
    },
  },

  patterns: {
    // ── DRIFT — four bars of falling in no direction: pads and stars. ──
    drift: {
      pad: bars(
        "A2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "E3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "D#3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "E3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
      ),
      shimmer: bars(
        ".  .  .  .  E5 .  .  .  .  .  .  .  B4 .  .  .",
        ".  .  G#5 .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  D#5 .  .  .  .  .  .  .  .  .",
        ".  .  .  .  A4 .  .  .  .  .  E5 .  .  .  .  .",
      ),
    },
    // ── A — the drift theme: the lead floats up through the lydian
    // ladder and never lands; the heartbeat keeps a slow two-count. ──
    a: {
      lead: bars(
        "A3 .  .  .  .  .  B3 .  .  .  C#4 .  .  .  .  .",
        "E4 .  .  .  .  .  .  .  D#4 .  .  .  .  .  .  .",
        "C#4 .  .  .  .  .  B3 .  .  .  A3 .  .  .  .  .",
        "B3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "A3 .  .  .  .  .  B3 .  .  .  C#4 .  .  .  .  .",
        "E4 .  .  .  .  .  .  .  F#4 .  .  .  .  .  .  .",
        "D#4 .  .  .  .  .  E4 .  .  .  C#4 .  .  .  .  .",
        "A3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
      ),
      pad: bars(
        "A2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "A2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "F#2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "E2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "A2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "D3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "B2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "A2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
      ),
      bass: bars(
        "A1 .  .  .  .  .  .  .  A1 .  .  .  .  .  .  .",
        "A1 .  .  .  .  .  .  .  A1 .  .  .  .  .  .  .",
        "F#1 .  .  .  .  .  .  .  F#1 .  .  .  .  .  .  .",
        "E1 .  .  .  .  .  .  .  E1 .  .  .  .  .  .  .",
        "A1 .  .  .  .  .  .  .  A1 .  .  .  .  .  .  .",
        "D2 .  .  .  .  .  .  .  D2 .  .  .  .  .  .  .",
        "B1 .  .  .  .  .  .  .  B1 .  .  .  .  .  .  .",
        "A1 .  .  .  .  .  .  .  A1 .  .  .  .  .  .  .",
      ),
      kick: bars("A1 .  .  .  .  .  .  .  A1 .  .  .  .  .  .  ."),
      hat: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
    },
    // ── B — deeper in: the raised fourth leads, the shimmer answers,
    // the heartbeat doubles. The hallucination noticing you back. ──
    b: {
      lead: bars(
        "D#4 .  .  .  .  .  .  .  E4 .  .  .  .  .  .  .",
        "F#4 .  .  .  .  .  E4 .  .  .  D#4 .  .  .  .  .",
        "C#4 .  .  .  .  .  .  .  B3 .  .  .  .  .  .  .",
        "D#4 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "E4 .  .  .  .  .  .  .  F#4 .  .  .  .  .  .  .",
        "G#4 .  .  .  .  .  F#4 .  .  .  E4 .  .  .  .  .",
        "D#4 .  .  .  .  .  C#4 .  .  .  B3 .  .  .  .  .",
        "A3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
      ),
      pad: bars(
        "B2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "B2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "A2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "G#2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "A2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "B2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "C#3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "A2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
      ),
      bass: bars(
        "B1 .  .  .  B1 .  .  .  B1 .  .  .  B1 .  .  .",
        "B1 .  .  .  B1 .  .  .  B1 .  .  .  B1 .  .  .",
        "A1 .  .  .  A1 .  .  .  A1 .  .  .  A1 .  .  .",
        "G#1 .  .  .  G#1 .  .  .  G#1 .  .  .  G#1 .  .  .",
        "A1 .  .  .  A1 .  .  .  A1 .  .  .  A1 .  .  .",
        "B1 .  .  .  B1 .  .  .  B1 .  .  .  B1 .  .  .",
        "C#2 .  .  .  C#2 .  .  .  C#2 .  .  .  C#2 .  .  .",
        "A1 .  .  .  A1 .  .  .  A1 .  .  .  A1 .  .  .",
      ),
      shimmer: bars(
        ".  .  .  .  .  .  B4 .  .  .  .  .  .  .  .  .",
        ".  .  D#5 .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  E5 .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  G#4 .  .  .  .  .",
        ".  .  .  .  A4 .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  B4 .  .  .  .  .  .  .  .  .",
        ".  .  E5 .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  A4 .  .  .  .  .",
      ),
      kick: bars("B1 .  .  .  .  .  .  .  B1 .  .  .  .  .  B1 ."),
      hat: bars(".  .  x  .  .  .  x  .  .  .  x  .  .  .  x  ."),
    },
    // ── VOID — four bars of held breath: everything stops but the pads
    // and one far star. The black holes get their silence. ──
    void: {
      pad: bars(
        "A2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "D#3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "E3 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
      ),
      shimmer: bars(
        ".  .  .  .  .  .  .  .  .  .  E5 .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  A4 .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
      ),
    },
  },

  order: ["drift", "a", "b", "a", "void", "b", "drift"],
};
