// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RECORDED SOUNDS — the one place in the game audio comes out of a file.
//
// Everything the game itself ships is synthesized from parameters
// (`content/sounds/<id>.yaml` → `play.ts`), and that is not changing: it is
// what keeps the PWA tiny, offline-capable and diffable. But a MOD is somebody
// else's work, and a sound designer's work IS the waveform — no list of
// oscillators is going to be the orchestral hit they recorded. So a mod may
// ship audio files, and this is the bank they land in.
//
// THIS MODULE HOLDS CLIPS, NOT SOUNDS, and the distinction is the whole reason
// a recording can now be composed rather than only swapped in. A CLIP is a file
// stem with one or more TAKES behind it; a SOUND is a def in the catalog whose
// voices happen to be `call: sample`. The compiler writes that def — a plain
// dropped-in `sounds/enemy_killed.wav` compiles to a one-voice def naming the
// clip `enemy_killed`, which is why the file name is still the whole of the
// routing — but once it is a def like any other, a mod can also layer two
// clips under a synthesized tail, space three out with `delayMs`, or give one
// clip three takes so four hundred takedowns a run do not sound like four
// hundred copies of one takedown.
//
// Four rules hold it together:
//
//   * **DECODING IS LAZY AND FAILS OPEN.** `decodeAudioData` needs a running
//     AudioContext, which does not exist until the player has touched
//     something, so a take cannot be decoded at the moment a mod is applied.
//     It is decoded on demand (and warmed as soon as audio is live); a file the
//     browser refuses is DROPPED, and a clip that loses its last take is
//     dropped with it — which puts the SHIPPED sound back (see `play.ts`'s
//     fallback) rather than leaving a permanent hole in the mix.
//   * **THE BYTES ARE NEVER PARSED HERE.** They go to the browser's own audio
//     decoder — the same one every `<audio>` on the web uses — exactly as they
//     arrived. Nothing in this file knows what a RIFF chunk is, and a mod
//     cannot make it run anything, which is the same bargain the rest of the
//     mod format keeps.
//   * **A TAKE IS NEVER PICKED WITH THE RUN'S DICE.** `pick: hash` derives from
//     where the sound happened and `cycle` from a bank-local counter; neither
//     touches `state.rng()`, because a cosmetic draw shifts every roll after it
//     and seeded runs would stop replaying. The road's own banks already obey
//     this rule (`drive-sounds.ts`) — this is the same rule, made data.
//   * **A LOOP IS OWNED, NOT FIRED.** Every sustained source is held by key so
//     it can be stopped, and the whole registry is torn down when the bank is
//     replaced or a run ends. A loop nobody can stop is a loop that plays over
//     the title screen.

import type { SampleHandle, Synth } from "@ui/lib/synth.ts";

import type { Placement } from "./listener.ts";
import type { SampleVoiceOptions } from "./types.ts";

/** One recording, as it arrives from the mod compiler. */
export type LoadedSample = {
  /** The CLIP NAME — the stem of the file. For a plain dropped-in recording
   * this is also the sound id it stands in for, because the compiler named the
   * def after it. */
  id: string;
  /** The encoded files, byte for byte as the mod shipped them, in take order.
   * One for an ordinary recording; several when the mod shipped `<id>.1.wav`,
   * `<id>.2.wav` … as variants of one sound. */
  takes: Uint8Array[];
};

/** One take: the bytes, and the decode that may or may not have happened. */
type Take = {
  bytes: Uint8Array;
  buffer: AudioBuffer | null;
  decoding: boolean;
  /** The browser refused these bytes. Never retried, never played. */
  dead: boolean;
};

type Clip = {
  name: string;
  takes: Take[];
  /** Round-robin cursor for `pick: cycle`. */
  next: number;
};

/** Empty for the shipped game, which is every frame most players ever see. */
let bank = new Map<string, Clip>();

/** Live sustained sources, by the key their owner stops them with. */
const loops = new Map<string, SampleHandle>();

/**
 * Install a mod stack's recordings. Replaces the bank wholesale — the caller
 * has already merged the stack in load order, exactly as it does for sprites —
 * and stops every loop the previous stack had running, which is what keeps a
 * conversion's weather from outliving the conversion.
 */
export function setSamples(samples: readonly LoadedSample[]): void {
  stopAllLoops();
  bank = new Map(
    samples.map((s) => [
      s.id,
      {
        name: s.id,
        takes: s.takes.map((bytes) => ({
          bytes,
          buffer: null,
          decoding: false,
          dead: false,
        })),
        next: 0,
      },
    ]),
  );
}

/** Put the shipped game's silence back: every sound is synthesized again. */
export function clearSamples(): void {
  stopAllLoops();
  bank = new Map();
}

/** The clips currently in the bank — for the log and the tests. */
export function sampleIds(): string[] {
  return [...bank.keys()];
}

/** How many takes a clip has, or 0 when the bank does not hold it. */
export function takeCount(clip: string): number {
  return bank.get(clip)?.takes.length ?? 0;
}

/**
 * Decode everything, so the first kill after a modded run starts is heard
 * rather than swallowed. Safe to call before audio is unlocked (it simply
 * decodes nothing and the lazy path picks it up), and safe to call twice.
 */
export function warmSamples(synth: Synth): void {
  for (const clip of bank.values()) {
    for (const take of clip.takes) decodeInto(synth, clip, take);
  }
}

/**
 * Play one `call: sample` voice.
 *
 * @returns whether the bank CLAIMED it — true even for the one hit that
 *   arrives while a decode is still in flight, because falling through to the
 *   synthesized sound there would play the shipped effect for a moment and
 *   then swap, which reads as a glitch rather than as a mod loading. False
 *   only when there is no live clip by that name at all, which is what lets
 *   `play.ts` put the shipped sound back.
 */
export function playSample(
  synth: Synth,
  voice: SampleVoiceOptions,
  place: Placement,
  /** Set for a sustained source: the key it will be stopped by. */
  loop?: { key: string; fadeMs: number },
): boolean {
  const clip = bank.get(voice.clip);
  if (!clip || clip.takes.length === 0) return false;

  const take = pickTake(clip, voice, place);
  if (!take) return true; // every take is still decoding — see the doc above
  if (!take.buffer) {
    decodeInto(synth, clip, take);
    return true;
  }

  // A loop already running is left alone: the event that raised a sandstorm
  // fires on every tick it lasts, and restarting the source each time would be
  // a stutter rather than weather.
  if (loop && loops.has(loop.key)) return true;

  const rate = jitter(voice.rate ?? 1, voice.pitchJitter, clip, take);
  const base = voice.volume ?? 1;
  const volume =
    jitter(base, voice.volumeJitter, clip, take) * (place.gain ?? 1);

  const handle = synth.sample({
    buffer: take.buffer,
    volume: Math.max(0, volume),
    // A spatial sound's pan is the stage's, not the author's: a mod that both
    // marks a sound spatial and pans it hard left meant "over there", and
    // "over there" is where the thing is.
    pan: place.pan !== 0 ? place.pan : (voice.pan ?? 0),
    ...(voice.echo === undefined ? {} : { echo: voice.echo }),
    ...(voice.delayMs === undefined ? {} : { delayMs: voice.delayMs }),
    rate,
    ...(loop ? { loop: true, fadeInMs: loop.fadeMs } : {}),
  });
  if (loop && handle) loops.set(loop.key, handle);
  return true;
}

/** Is a sustained source with this key running? */
export function loopRunning(key: string): boolean {
  return loops.has(key);
}

/** Stop one sustained source. A key nobody started is not an error — the event
 * that stops a loop fires whether or not the loop was ever raised. */
export function stopLoop(key: string, fadeMs = 0): void {
  const handle = loops.get(key);
  if (!handle) return;
  loops.delete(key);
  handle.stop(fadeMs);
}

/** Stop everything sustained — the run ended, or the bank was replaced. */
export function stopAllLoops(): void {
  for (const handle of loops.values()) handle.stop(0);
  loops.clear();
}

/**
 * WHICH TAKE. Never `state.rng()` — see the module header.
 *
 * Returns null when the clip has takes but none of them is ready yet, which
 * the caller reports as a claim rather than as a miss.
 */
function pickTake(
  clip: Clip,
  voice: SampleVoiceOptions,
  place: Placement,
): Take | null {
  const live = clip.takes.filter((t) => !t.dead);
  if (live.length === 0) return null;
  if (live.length === 1) return live[0]!;

  let at: number;
  switch (voice.pick ?? "cycle") {
    case "random":
      at = Math.floor(Math.random() * live.length);
      break;
    case "hash":
      // The placement is where it happened, which is exactly the road's own
      // rule: an identical replay of a seeded run is identical audio.
      at =
        Math.abs(Math.round(place.pan * 3571 + place.gain * 7717)) %
        live.length;
      break;
    default:
      // ROUND-ROBIN, and the default deliberately: it is the only pick that
      // never repeats a take back-to-back, which is the artifact variants
      // exist to kill. True randomness repeats about a third of the time with
      // three takes, and a repeat is exactly what the ear catches.
      at = clip.next % live.length;
      clip.next = (clip.next + 1) % live.length;
      break;
  }
  return live[at] ?? live[0]!;
}

/** `base` moved by ±`amount` of itself. Zero/absent amount is exact. */
function jitter(
  base: number,
  amount: number | undefined,
  clip: Clip,
  take: Take,
): number {
  if (!amount) return base;
  // Math.random rather than a hash: this is presentation on top of an already
  // chosen take, nothing replays off it, and a per-play draw is what stops
  // consecutive plays of the SAME take from being identical — which is the
  // whole point. (`clip`/`take` are named so a future hash-based variant has
  // somewhere to reach; the engine's own dice are never an option here.)
  void clip;
  void take;
  return base * (1 + (Math.random() * 2 - 1) * amount);
}

/** Decode one take in the background. A refusal kills it for good. */
function decodeInto(synth: Synth, clip: Clip, take: Take): void {
  if (take.buffer || take.decoding || take.dead) return;
  take.decoding = true;
  void synth
    .decode(copyOf(take.bytes))
    .then((buffer) => {
      take.decoding = false;
      // Null with the context still locked is "not yet", not "never": leave
      // the take alone and the next play (or the next warm) tries again.
      if (buffer) take.buffer = buffer;
      else if (synth.now() !== null) kill(clip, take);
    })
    .catch(() => {
      take.decoding = false;
      kill(clip, take);
    });
}

/** Drop a take the browser refused, and the clip with it once nothing is left
 * — a clip with no live takes must stop claiming its sound, so the shipped one
 * can be heard instead of a permanent hole. */
function kill(clip: Clip, take: Take): void {
  take.dead = true;
  if (clip.takes.every((t) => t.dead)) bank.delete(clip.name);
}

/** The file's bytes as a standalone ArrayBuffer — a view into a larger buffer
 * would hand the decoder its neighbours too. */
function copyOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
