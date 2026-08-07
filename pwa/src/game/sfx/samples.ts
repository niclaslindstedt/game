// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RECORDED SOUNDS — the one place in the game audio comes out of a file.
//
// Everything the game itself ships is synthesized from parameters
// (`content/sounds/<id>.yaml` → `play.ts`), and that is not changing: it is
// what keeps the PWA tiny, offline-capable and diffable. But a MOD is somebody
// else's work, and a sound designer's work IS the waveform — no list of
// oscillators is going to be the orchestral hit they recorded. So a mod may
// ship `sounds/<id>.wav` (or `.mp3`), and the id it is NAMED AFTER is the sound
// it replaces. That is the whole routing rule: no new event table, no new
// catalog, no manifest entry — the shipped `on:` block that already points an
// event at `enemy_killed` keeps pointing at `enemy_killed`, and this bank
// answers first.
//
// Three rules hold it together:
//
//   * **THE BANK ANSWERS BEFORE THE CATALOG**, and it answers for EVERY sound
//     the game plays — a run's events, the interface's clicks, the road's
//     scrapes, a weapon's own `sfx:`. They all funnel through `playSound`, so
//     one check there is every sound id at once.
//   * **DECODING IS LAZY AND FAILS OPEN.** `decodeAudioData` needs a running
//     AudioContext, which does not exist until the player has touched
//     something, so a sample cannot be decoded at the moment a mod is applied.
//     It is decoded on demand (and warmed as soon as audio is live); a file the
//     browser refuses is DROPPED from the bank, which puts the synthesized
//     sound back rather than leaving a permanent hole in the mix.
//   * **THE BYTES ARE NEVER PARSED HERE.** They go to the browser's own audio
//     decoder — the same one every `<audio>` on the web uses — exactly as they
//     arrived. Nothing in this file knows what a RIFF chunk is, and a mod
//     cannot make it run anything, which is the same bargain the rest of the
//     mod format keeps.

import type { Synth } from "@ui/lib/synth.ts";

/** One recording, as it arrives from the mod compiler. */
export type LoadedSample = {
  /** The sound id it replaces — a shipped id, or one of the mod's own. */
  id: string;
  /** The encoded file, byte for byte as the mod shipped it. */
  bytes: Uint8Array;
  /** Trim, 0–1. Absent means "as mastered". */
  volume?: number;
  /** Stereo position, -1 to 1. */
  pan?: number;
  /** 0–1 send into the shared echo bus. */
  echo?: number;
};

type Entry = LoadedSample & {
  /** Decoded audio, once the context has been able to make it. */
  buffer: AudioBuffer | null;
  /** A decode is in flight — so a burst of the same sound kicks off one. */
  decoding: boolean;
};

/** Empty for the shipped game, which is every frame most players ever see. */
let bank = new Map<string, Entry>();

/**
 * Install a mod stack's recordings. Replaces the bank wholesale — the caller
 * has already merged the stack in load order, exactly as it does for sprites.
 */
export function setSamples(samples: readonly LoadedSample[]): void {
  bank = new Map(
    samples.map((s) => [s.id, { ...s, buffer: null, decoding: false }]),
  );
}

/** Put the shipped game's silence back: every sound is synthesized again. */
export function clearSamples(): void {
  bank = new Map();
}

/** The ids currently answered by a recording — for the log and the tests. */
export function sampleIds(): string[] {
  return [...bank.keys()];
}

/**
 * Decode everything, so the first kill after a modded run starts is heard
 * rather than swallowed. Safe to call before audio is unlocked (it simply
 * decodes nothing and the lazy path picks it up), and safe to call twice.
 */
export function warmSamples(synth: Synth): void {
  for (const entry of bank.values()) decodeInto(synth, entry);
}

/**
 * Play `id` from the bank.
 *
 * @returns whether the bank CLAIMED the id — true even for the one hit that
 *   arrives while the decode is still in flight, because falling through to
 *   the synthesized sound there would play the shipped effect for a moment and
 *   then swap, which reads as a glitch rather than as a mod loading.
 */
export function playSample(synth: Synth, id: string): boolean {
  const entry = bank.get(id);
  if (!entry) return false;
  if (!entry.buffer) {
    decodeInto(synth, entry);
    return true;
  }
  synth.sample({
    buffer: entry.buffer,
    volume: entry.volume,
    pan: entry.pan,
    echo: entry.echo,
  });
  return true;
}

/** Decode one entry in the background. A refusal drops it from the bank. */
function decodeInto(synth: Synth, entry: Entry): void {
  if (entry.buffer || entry.decoding) return;
  entry.decoding = true;
  void synth
    .decode(copyOf(entry.bytes))
    .then((buffer) => {
      entry.decoding = false;
      // Null with the context still locked is "not yet", not "never": leave
      // the entry alone and the next play (or the next warm) tries again.
      if (buffer) entry.buffer = buffer;
      else if (synth.now() !== null) bank.delete(entry.id);
    })
    .catch(() => {
      entry.decoding = false;
      bank.delete(entry.id);
    });
}

/** The file's bytes as a standalone ArrayBuffer — a view into a larger buffer
 * would hand the decoder its neighbours too. */
function copyOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
