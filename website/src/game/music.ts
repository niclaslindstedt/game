// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The soundtrack: original chiptune compositions for the title menu and the
// moon run, written as note data for the sequencer in @ui/lib/chiptune.ts.
// The style nods to NES-era action-RPG scores (driving bass, soaring pulse
// lead) but both tunes are composed for this game — nothing sampled or
// transcribed. One module-level player keeps the title/level themes from
// ever overlapping.

import {
  bars,
  createChiptunePlayer,
  type ChiptunePlayer,
  type ChiptuneTrack,
} from "@ui/lib/chiptune.ts";

import { musicSynth } from "./audio.ts";

/**
 * TITLE — "THE MOON HAUNTING". Slow A-minor lament: a long sine lead drifts
 * over an arpeggiated pulse and deep triangle roots. Am / F / Dm / E.
 * (Exported for the headless smoke test that keeps every note parseable.)
 */
export const TITLE_THEME: ChiptuneTrack = {
  bpm: 96,
  stepsPerBeat: 4,
  channels: [
    {
      // The drifting lead — more theremin than trumpet.
      wave: "sine",
      volume: 0.045,
      gate: 0.95,
      notes: bars(
        "E4 =  =  =  =  =  =  =  C4 =  =  =  D4 =  =  =",
        "C4 =  =  =  =  =  =  =  A3 =  =  =  =  =  =  =",
        "D4 =  =  =  F4 =  =  =  E4 =  =  =  D4 =  =  =",
        "B3 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
    },
    {
      // Cold pulse arpeggios rippling under the lead.
      wave: "square",
      volume: 0.018,
      gate: 0.5,
      notes: bars(
        "A3 .  C4 .  E4 .  C4 .  A3 .  C4 .  E4 .  C4 .",
        "F3 .  A3 .  C4 .  A3 .  F3 .  A3 .  C4 .  A3 .",
        "D3 .  F3 .  A3 .  F3 .  D3 .  F3 .  A3 .  F3 .",
        "E3 .  G#3 .  B3 .  G#3 .  E3 .  G#3 .  B3 .  D4 .",
      ),
    },
    {
      // Triangle roots, two slow tones per bar.
      wave: "triangle",
      volume: 0.05,
      gate: 0.95,
      notes: bars(
        "A2 =  =  =  =  =  =  =  E2 =  =  =  =  =  =  =",
        "F2 =  =  =  =  =  =  =  C3 =  =  =  =  =  =  =",
        "D2 =  =  =  =  =  =  =  A2 =  =  =  =  =  =  =",
        "E2 =  =  =  =  =  =  =  B2 =  =  =  =  =  =  =",
      ),
    },
  ],
};

/**
 * MOON RUN — "REGOLITH RIDE". Fast heroic A-minor: pumping triangle
 * octaves, off-beat pulse stabs, and a soaring lead. Eight bars —
 * Am / Am / F / G / Am / F / G / E — then straight back around.
 */
export const LEVEL_THEME: ChiptuneTrack = {
  bpm: 160,
  stepsPerBeat: 4,
  channels: [
    {
      // The lead: long soaring phrases answered by quick runs.
      wave: "square",
      volume: 0.028,
      gate: 0.85,
      notes: bars(
        "A4 =  =  =  C5 =  D5 =  E5 =  =  =  D5 =  C5 =",
        "D5 =  C5 =  D5 =  E5 =  G5 =  =  =  E5 =  D5 =",
        "F5 =  =  =  E5 =  D5 =  C5 =  =  =  A4 =  C5 =",
        "B4 =  =  =  D5 =  =  =  G4 =  =  =  B4 =  D5 =",
        "E5 =  =  =  C5 =  D5 =  E5 =  G5 =  A5 =  =  =",
        "A5 =  G5 =  F5 =  E5 =  F5 =  =  =  C5 =  =  =",
        "D5 =  E5 =  D5 =  C5 =  B4 =  =  =  G4 =  =  =",
        "C5 =  B4 =  A4 =  G#4 =  E4 =  =  =  B4 =  =  =",
      ),
    },
    {
      // Off-beat chord stabs — the rhythm guitar of the pulse world.
      wave: "square",
      volume: 0.016,
      gate: 0.4,
      notes: bars(
        ".  .  C4 .  .  .  E4 .  .  .  C4 .  .  .  E4 .",
        ".  .  C4 .  .  .  E4 .  .  .  C4 .  .  .  E4 .",
        ".  .  A3 .  .  .  C4 .  .  .  A3 .  .  .  C4 .",
        ".  .  B3 .  .  .  D4 .  .  .  B3 .  .  .  D4 .",
        ".  .  C4 .  .  .  E4 .  .  .  C4 .  .  .  E4 .",
        ".  .  A3 .  .  .  C4 .  .  .  A3 .  .  .  C4 .",
        ".  .  B3 .  .  .  D4 .  .  .  B3 .  .  .  D4 .",
        ".  .  G#3 .  .  .  B3 .  .  .  G#3 .  .  .  B3 .",
      ),
    },
    {
      // Pumping triangle octaves, eight to the bar.
      wave: "triangle",
      volume: 0.055,
      gate: 0.8,
      notes: bars(
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "F2 .  F3 .  F2 .  F3 .  F2 .  F3 .  F2 .  F3 .",
        "G2 .  G3 .  G2 .  G3 .  G2 .  G3 .  G2 .  G3 .",
        "A2 .  A3 .  A2 .  A3 .  A2 .  A3 .  A2 .  A3 .",
        "F2 .  F3 .  F2 .  F3 .  F2 .  F3 .  F2 .  F3 .",
        "G2 .  G3 .  G2 .  G3 .  G2 .  G3 .  G2 .  G3 .",
        "E2 .  E3 .  E2 .  E3 .  E2 .  E3 .  E2 .  E3 .",
      ),
    },
    {
      // Hi-hat ticks on the eighths (loops every bar).
      wave: "noise",
      volume: 0.012,
      gate: 0.25,
      notes: bars("x .  x .  x .  x .  x .  x .  x .  x ."),
    },
    {
      // Snare on the backbeat (loops every bar).
      wave: "noise",
      volume: 0.035,
      gate: 1,
      notes: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
    },
  ],
};

let player: ChiptunePlayer | null = null;
let current: "title" | "level" | null = null;

function ensurePlayer(): ChiptunePlayer {
  player ??= createChiptunePlayer(musicSynth);
  return player;
}

/** Loop the title theme (no-op when it is already playing, so it can hang
 * off every menu gesture as the audio unlock). */
export function playTitleMusic(): void {
  if (current === "title") return;
  current = "title";
  ensurePlayer().play(TITLE_THEME);
}

/** Loop the moon-run theme (no-op when already playing). */
export function playLevelMusic(): void {
  if (current === "level") return;
  current = "level";
  ensurePlayer().play(LEVEL_THEME);
}

/** Silence the music — end-of-run jingles play over quiet. */
export function stopMusic(): void {
  current = null;
  player?.stop();
}
