// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The soundtrack's front door. A track is authored as `content/music/<id>.yaml`
// (all instruments + all notes, tracker-style data for the @ui/lib/chiptune.ts
// sequencer) and compiled by scripts/generate-music.mjs into one module per
// score; this module owns the single player so the themes never overlap, and
// decides what plays when.
//
// Tracks are keyed by track id — the `music` id a LevelDef carries (see
// defs/levels/types.ts). A new level's theme is one YAML file and nothing else;
// a level with no `music` (or an id this build has no score for) falls back to
// DEFAULT_LEVEL_TRACK.
//
// A MOD may ship scores too, and they arrive as DATA rather than as a module —
// the shell compiled them in its main process, so there is nothing to fetch.

import {
  createChiptunePlayer,
  type ChiptunePlayer,
  type ChiptuneTrack,
} from "@ui/lib/chiptune.ts";

import { TITLE_TRACK, TRACK_LOADERS } from "../../generated/music/index.ts";
import { musicSynth } from "../audio.ts";

/**
 * Themes already fetched this session, so a revisit never refetches — and the
 * only place a MOD's score can live, since it arrives as data with no module
 * to import.
 *
 * A score is a wall of note data (tens of KB apiece) and NONE of it is startup.
 * A level's theme is wanted the moment a run begins, not while the menu is up —
 * and the title theme can't sound before the player's first gesture unlocks
 * audio anyway, so even it has no business in the entry chunk. The generated
 * index gives each track its own `import()`, so the browser fetches the one
 * being asked for.
 */
const trackCache = new Map<string, ChiptuneTrack>();

/** Scores a mod supplied, by id. Consulted ahead of the shipped loaders, so a
 * mod may replace a venue's theme by naming its id. */
let modTracks: Record<string, ChiptuneTrack> = {};

/**
 * Install the active mods' scores (or clear them, with `{}`). A track already
 * in the cache is dropped so the next request re-resolves it — otherwise a
 * theme heard before the mod was switched on would keep playing over it.
 */
export function setModTracks(tracks: Record<string, ChiptuneTrack>): void {
  for (const id of new Set([...Object.keys(modTracks), ...Object.keys(tracks)]))
    trackCache.delete(id);
  modTracks = tracks;
}

/** Played when a level names no `music` id (or an id we don't ship). */
const DEFAULT_LEVEL_TRACK = "regolith_ride";

// What is currently looping: a TRACK_LOADERS key ("title" or a level's `music`
// id), or null when silent. Kept so a repeated request for the same track is a
// no-op (it can hang off every menu gesture as the audio unlock).
let player: ChiptunePlayer | null = null;
let current: string | null = null;

function ensurePlayer(): ChiptunePlayer {
  player ??= createChiptunePlayer(musicSynth);
  return player;
}

/**
 * Loop `id`'s theme, fetching the score if this session hasn't yet. Claims
 * `current` synchronously and re-checks it once the score lands, so a request
 * that has since been superseded — another level, a `stopMusic()` — drops
 * silently instead of starting a track the run has already left behind.
 */
function playTrack(id: string): void {
  if (current === id) return;
  current = id;
  const ready = modTracks[id] ?? trackCache.get(id);
  if (ready) {
    ensurePlayer().play(ready);
    return;
  }
  void (TRACK_LOADERS[id] as () => Promise<ChiptuneTrack>)()
    .then((track) => {
      trackCache.set(id, track);
      if (current !== id) return;
      ensurePlayer().play(track);
    })
    .catch(() => {
      // A failed score fetch (offline, stale deploy) leaves the run silent
      // rather than dead — and unclaims `current` so a later request retries.
      if (current === id) current = null;
    });
}

/** Loop the title theme (no-op when it is already playing, so it can hang
 * off every menu gesture as the audio unlock). */
export function playTitleMusic(): void {
  playTrack(TITLE_TRACK);
}

/**
 * Loop a level's theme, resolving `trackId` (a LevelDef `music` id) against
 * the registry and falling back to the default when it is missing or unknown.
 * A no-op when *that* track is already playing, so advancing to another level
 * with the same theme never restarts it — but crossing to a level with a
 * different theme switches cleanly.
 */
export function playLevelMusic(trackId?: string): void {
  const known =
    trackId !== undefined &&
    trackId !== TITLE_TRACK &&
    (trackId in TRACK_LOADERS || trackId in modTracks);
  playTrack(known ? (trackId as string) : DEFAULT_LEVEL_TRACK);
}

/** Silence the music — end-of-run jingles play over quiet. */
export function stopMusic(): void {
  current = null;
  player?.stop();
}

/** Freeze the current theme in place (the pause screen) — keeps `current` so
 * a repeated request for the same track after resume stays a no-op. */
export function pauseMusic(): void {
  player?.pause();
}

/** Pick the frozen theme back up where `pauseMusic` left it. */
export function resumeMusic(): void {
  player?.resume();
}
