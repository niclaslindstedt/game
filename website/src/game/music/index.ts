// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The soundtrack's front door. Each track is a self-contained score file in
// this directory (all instruments + all notes, MIDI-style data for the
// @ui/lib/chiptune.ts sequencer); this module owns the single player so the
// themes never overlap, and decides what plays when.

import { createChiptunePlayer, type ChiptunePlayer } from "@ui/lib/chiptune.ts";

import { musicSynth } from "../audio.ts";

import { LEVEL_THEME } from "./level.ts";
import { TITLE_THEME } from "./title.ts";

export { LEVEL_THEME } from "./level.ts";
export { TITLE_THEME } from "./title.ts";

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
