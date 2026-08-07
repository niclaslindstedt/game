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

import {
  isRecorded,
  pauseRecorded,
  playRecorded,
  resumeRecorded,
  stopRecorded,
} from "./recorded.ts";

export { setRecordedTracks, type RecordedTrack } from "./recorded.ts";

/**
 * Themes already fetched this session, so a revisit never refetches — and the
 * only place a MOD's score can live, since it arrives as data with no module
 * to import.
 *
 * A score is a wall of note data (tens of KB apiece) and NONE of it is startup.
 * A level's theme is wanted the moment a run begins, not while the menu is up,
 * and even the title theme is wanted one paint AFTER the menu is on screen
 * (`armTitleMusic`) rather than inside the entry chunk. The generated index
 * gives each track its own `import()`, so the browser fetches the one being
 * asked for.
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
  // A MOD'S RECORDED SCORE ANSWERS FIRST, and the sequencer is silenced when it
  // does: the two are one player as far as the game is concerned, and a
  // conversion whose theme is an .opus must not have a chiptune arrangement
  // playing under it. (`playRecorded` is a no-op for a track it does not hold,
  // so this is one branch rather than a lookup and a branch.)
  if (playRecorded(id)) {
    player?.stop();
    return;
  }
  stopRecorded();
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

/** The gestures that count as "the player has arrived" — any pointer, any
 * touch, any key. Captured (so an overlay that stops propagation cannot
 * swallow the first one) and passive (nothing here preventDefaults). */
const ARRIVAL_EVENTS = ["pointerdown", "touchend", "keydown"] as const;
const ARRIVAL_OPTS = { capture: true, passive: true } as const;

/**
 * THE THEME BELONGS TO THE MENU OPENING, NOT TO THE FIRST BUTTON PRESSED.
 *
 * Call it as the title screen mounts; the returned function disarms it (the
 * unmount). Three things happen, in the order they can happen at all:
 *
 * 1. The arrangement is claimed straight away, locked or not. The sequencer
 *    tolerates a silent clock — it ticks, finds none, nudges and waits — so
 *    the score is fetched and standing by, and the moment sound is permitted
 *    the theme is already playing rather than starting a beat later.
 * 2. `autostart()` starts it with no gesture at all where the platform allows
 *    that (the Steam shell, a browser that already trusts this origin). This
 *    is the case the player means by "it should just start on open".
 * 3. Where it doesn't, the player's FIRST touch or key ANYWHERE unlocks —
 *    rather than the first menu row they happen to press. The listener stays
 *    armed until the clock actually moves, so a gesture the browser refused to
 *    honour isn't the last one we listen to.
 */
export function armTitleMusic(): () => void {
  playTitleMusic();
  musicSynth.autostart();
  if (typeof document === "undefined" || musicSynth.now() !== null)
    return () => {};

  let armed = true;
  const disarm = (): void => {
    if (!armed) return;
    armed = false;
    for (const type of ARRIVAL_EVENTS)
      document.removeEventListener(type, onArrival, ARRIVAL_OPTS);
  };
  const onArrival = (): void => {
    musicSynth.unlock();
    if (musicSynth.now() !== null) disarm();
  };
  for (const type of ARRIVAL_EVENTS)
    document.addEventListener(type, onArrival, ARRIVAL_OPTS);
  return disarm;
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
    (trackId in TRACK_LOADERS || trackId in modTracks || isRecorded(trackId));
  playTrack(known ? (trackId as string) : DEFAULT_LEVEL_TRACK);
}

/** Silence the music — end-of-run jingles play over quiet. */
export function stopMusic(): void {
  current = null;
  player?.stop();
  stopRecorded();
}

/** Freeze the current theme in place (the pause screen) — keeps `current` so
 * a repeated request for the same track after resume stays a no-op. */
export function pauseMusic(): void {
  player?.pause();
  pauseRecorded();
}

/** Pick the frozen theme back up where `pauseMusic` left it. */
export function resumeMusic(): void {
  player?.resume();
  resumeRecorded();
}
