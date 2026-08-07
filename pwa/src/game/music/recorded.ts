// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A MOD'S RECORDED SCORE — the second kind of thing that can be a track.
//
// Everything the game itself ships is a tracker arrangement: instruments,
// patterns and an order, played note by note through the chiptune sequencer.
// That is not changing, and for the sound effects the same reasoning holds all
// the way down (see `sfx/samples.ts`). For MUSIC it holds rather less: a
// conversion that has commissioned a score has a finished mix, and asking its
// author to re-enter it as sixteenth-note tokens is asking them to throw the
// work away.
//
// SO A RECORDED TRACK IS AN `<audio>` ELEMENT, and that is a deliberate choice
// over the `decodeAudioData` path the sound effects take:
//
//   * **IT STREAMS.** A decoded `AudioBuffer` is 32-bit float PCM — a
//     three-minute stereo track is over 60 MB resident, and a conversion with
//     six themes would be most of a gigabyte. An element decodes as it plays
//     and holds a buffer, not a track.
//   * **IT LOOPS FOR FREE**, seamlessly and without a scheduler, which is the
//     one thing the sequencer does that would otherwise have to be rebuilt.
//   * **IT PAUSES AND RESUMES** where it was, which the pause screen needs and
//     a re-triggered buffer source cannot do.
//
// The cost is that it does NOT pass through the AudioContext, so the music
// volume has to be pushed to it (`onMusicVolume`) rather than read per note.
// That is the whole of the seam, and it is why this file exists rather than
// the element being hidden inside the chiptune player.

import { musicLevel, onMusicVolume } from "../audio.ts";

/** One recorded score, as it arrives from the mod compiler. */
export type RecordedTrack = {
  id: string;
  /** The encoded file, byte for byte as the mod shipped it. */
  bytes: Uint8Array;
};

type Live = {
  id: string;
  el: HTMLAudioElement;
  url: string;
};

let bank = new Map<string, Uint8Array>();
let live: Live | null = null;
let unwatch: (() => void) | null = null;

/** Install a mod stack's recorded scores, replacing whatever was there.
 * Anything playing stops — a conversion's theme must not outlive it. */
export function setRecordedTracks(tracks: readonly RecordedTrack[]): void {
  stopRecorded();
  bank = new Map(tracks.map((t) => [t.id, t.bytes]));
}

/** Is `id` a recorded score rather than an arrangement? */
export function isRecorded(id: string): boolean {
  return bank.has(id);
}

/** Every recorded track id — for the log and the tests. */
export function recordedIds(): string[] {
  return [...bank.keys()];
}

/**
 * Loop `id`. A no-op when it is already the one playing, so this can hang off
 * the same repeated requests `playTrack` fields.
 *
 * @returns whether the bank claimed it
 */
export function playRecorded(id: string): boolean {
  const bytes = bank.get(id);
  if (!bytes) return false;
  if (live?.id === id) {
    // Already ours. It may still be PAUSED (the pause screen, then a level
    // change back to the same theme), so make sure it is running.
    void live.el.play().catch(() => {});
    return true;
  }
  stopRecorded();

  // No container type given: the browser sniffs the bytes, exactly as it does
  // for a sound effect. Naming one here would be this file having an opinion
  // about a file it never parsed.
  const url = URL.createObjectURL(new Blob([copyOf(bytes)]));
  const el = new Audio(url);
  el.loop = true;
  el.volume = musicLevel();
  live = { id, el, url };
  unwatch = onMusicVolume((level) => {
    if (live) live.el.volume = level;
  });
  // A refusal is silence, never a crash: autoplay policy, a container this
  // build of Chromium lacks, a corrupt download. The run carries on.
  void el.play().catch(() => {});
  return true;
}

/** Stop and release whatever is playing. */
export function stopRecorded(): void {
  if (!live) return;
  const { el, url } = live;
  live = null;
  unwatch?.();
  unwatch = null;
  el.pause();
  // Detach the source before revoking, or Chromium logs a failed load for the
  // element that is still pointing at a URL that no longer resolves.
  el.removeAttribute("src");
  el.load();
  URL.revokeObjectURL(url);
}

/** Freeze in place (the pause screen). */
export function pauseRecorded(): void {
  live?.el.pause();
}

/** Pick it back up where it was. */
export function resumeRecorded(): void {
  if (live) void live.el.play().catch(() => {});
}

/** The bytes as a standalone ArrayBuffer — a view into a larger buffer would
 * hand the Blob its neighbours too. */
function copyOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
