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

/**
 * Every theme this build ships, keyed by track id — each behind its OWN dynamic
 * import. `"title"` is the reserved id for the menu theme; the rest are the
 * `music` ids a LevelDef carries.
 *
 * A score is a wall of note data (tens of KB apiece) and NONE of it is startup.
 * A level's theme is wanted the moment a run begins, not while the menu is up —
 * and the title theme can't sound before the player's first gesture unlocks
 * audio anyway, so even it has no business in the entry chunk. Each entry is a
 * separate `import()`, so the browser fetches the one track being asked for and
 * `trackCache` keeps it for the rest of the session.
 */
const TRACK_LOADERS: Record<string, () => Promise<ChiptuneTrack>> = {
  title: () => import("./title.ts").then((m) => m.TITLE_THEME),
  regolith_ride: () => import("./level.ts").then((m) => m.LEVEL_THEME),
  hq_lockdown: () => import("./spacez.ts").then((m) => m.HQ_THEME),
  red_dust: () => import("./mars.ts").then((m) => m.MARS_THEME),
  rift_drift: () => import("./rift.ts").then((m) => m.RIFT_THEME),
};

/** Themes already fetched this session, so a revisit never refetches. */
const trackCache = new Map<string, ChiptuneTrack>();

/** The level `music` ids this build ships a score for. */
export const LEVEL_TRACK_IDS = Object.keys(TRACK_LOADERS).filter(
  (id) => id !== "title",
);

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
  const cached = trackCache.get(id);
  if (cached) {
    ensurePlayer().play(cached);
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
  playTrack("title");
}

/**
 * Loop a level's theme, resolving `trackId` (a LevelDef `music` id) against
 * the registry and falling back to the default when it is missing or unknown.
 * A no-op when *that* track is already playing, so advancing to another level
 * with the same theme never restarts it — but crossing to a level with a
 * different theme switches cleanly.
 */
export function playLevelMusic(trackId?: string): void {
  playTrack(
    trackId && trackId !== "title" && trackId in TRACK_LOADERS
      ? trackId
      : DEFAULT_LEVEL_TRACK,
  );
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
