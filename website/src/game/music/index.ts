// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The soundtrack's front door. Each track is a self-contained score file in
// this directory (all instruments + all notes, MIDI-style data for the
// @ui/lib/chiptune.ts sequencer); this module owns the single player so the
// themes never overlap, and decides what plays when.
//
// Level themes live in a registry keyed by track id — the `music` id a
// LevelDef carries (see defs/levels/types.ts). A new level's theme is one
// score file plus one entry in LEVEL_TRACKS; a level with no `music` (or an
// unknown id) falls back to DEFAULT_LEVEL_TRACK.

import {
  createChiptunePlayer,
  type ChiptunePlayer,
  type ChiptuneTrack,
} from "@ui/lib/chiptune.ts";

import { musicSynth } from "../audio.ts";

import { LEVEL_THEME } from "./level.ts";
import { HQ_THEME } from "./spacez.ts";
import { TITLE_THEME } from "./title.ts";

export { LEVEL_THEME } from "./level.ts";
export { HQ_THEME } from "./spacez.ts";
export { TITLE_THEME } from "./title.ts";

/** Every level theme, keyed by the `music` id a LevelDef carries. */
export const LEVEL_TRACKS: Record<string, ChiptuneTrack> = {
  regolith_ride: LEVEL_THEME,
  hq_lockdown: HQ_THEME,
};

/** Played when a level names no `music` id (or an id we don't ship). */
const DEFAULT_LEVEL_TRACK = "regolith_ride";

// What is currently looping: a LEVEL_TRACKS key, the reserved "title"
// sentinel, or null when silent. Kept so a repeated request for the same
// track is a no-op (it can hang off every menu gesture as the audio unlock).
let player: ChiptunePlayer | null = null;
let current: string | null = null;

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

/**
 * Loop a level's theme, resolving `trackId` (a LevelDef `music` id) against
 * the registry and falling back to the default when it is missing or unknown.
 * A no-op when *that* track is already playing, so advancing to another level
 * with the same theme never restarts it — but crossing to a level with a
 * different theme switches cleanly.
 */
export function playLevelMusic(trackId?: string): void {
  const id = trackId && trackId in LEVEL_TRACKS ? trackId : DEFAULT_LEVEL_TRACK;
  if (current === id) return;
  current = id;
  ensurePlayer().play(LEVEL_TRACKS[id] as ChiptuneTrack);
}

/** Silence the music — end-of-run jingles play over quiet. */
export function stopMusic(): void {
  current = null;
  player?.stop();
}
