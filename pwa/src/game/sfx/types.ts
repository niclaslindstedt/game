// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a compiled sound is: a list of voices the synth fires in order.
//
// Its own module, importing nothing but the synth's own option shapes, because
// four very different things need them — the generated catalog, the player, the
// recording bank, and the mod bridge — and none of them should have to import
// the others to describe it.

import type { NoiseOptions, ToneOptions } from "@ui/lib/synth.ts";

/**
 * WHICH TAKE a recording with several plays.
 *
 * `cycle` is the default and the right one almost always: round-robin never
 * repeats a take back-to-back, which is the whole artifact variants exist to
 * kill. `random` is honest randomness (and will sometimes repeat). `hash`
 * derives the take from WHERE the sound happened, so an identical replay of a
 * seeded run is identical audio — the rule the road's own banks already keep.
 */
export type SamplePick = "cycle" | "random" | "hash";

/**
 * A RECORDING, as a voice.
 *
 * `clip` is a file stem, not a sound id: `clip: impact` plays
 * `sounds/impact.wav` from the mod that shipped it. That is what makes a
 * recording composable rather than only a replacement — a sound can layer two
 * clips and a synthesized tail, or space three clips out with `delayMs`.
 *
 * A plain dropped-in `sounds/<id>.wav` with no YAML beside it is compiled into
 * exactly this: one sample voice whose clip is the id.
 */
export type SampleVoiceOptions = {
  /** The clip to play — the stem of a mod's audio file. */
  clip: string;
  /** Trim, 0–1. Absent plays the recording as mastered. */
  volume?: number;
  /** Stereo position, -1 to 1. Overridden when the sound is `spatial`. */
  pan?: number;
  /** 0–1 send into the shared echo bus. */
  echo?: number;
  /** Fire this far into the sound — the one sequencing primitive, shared with
   * `tone` and `noise` so a sound can be a little arrangement. */
  delayMs?: number;
  /** Playback rate; 1 is the recording's own pitch. */
  rate?: number;
  /**
   * ± this fraction of `rate`, redrawn per play. THE ANTIDOTE TO THE MACHINE
   * GUN: a synthesized `noise` voice regenerates its buffer every call, so the
   * shipped bank is subtly different each time; a recording is byte-identical
   * forever, and 400 identical takedowns a run is fatiguing in a way the sound
   * it replaced was not. 0.04–0.08 is a semitone of life; past ~0.15 it reads
   * as a broken tape.
   */
  pitchJitter?: number;
  /** ± this fraction of `volume`, redrawn per play. Same reasoning. */
  volumeJitter?: number;
  /** Which take, when the clip has several. Defaults to `cycle`. */
  pick?: SamplePick;
};

/** One voice of a sound. `call` picks which synth method fires it; the rest is
 * that method's own options, exactly as `@ui/lib/synth.ts` declares them —
 * so the format cannot drift from what the synth can be told to do. */
export type SoundVoice =
  | ({ call: "tone" } & ToneOptions)
  | ({ call: "noise" } & NoiseOptions)
  | ({ call: "sample" } & SampleVoiceOptions);

/** One sound: an id, the voices that make it, and how it sits in the world. */
export type SoundDef = {
  id: string;
  voices: SoundVoice[];
  /**
   * PAN AND ATTENUATE BY WHERE IT HAPPENED, against the local seat's own
   * camera (`Player.view`). Opt-in per sound and deliberately so: a menu
   * click, a level-up fanfare and a defeat sting are the player's, not the
   * world's, and drifting one off-centre because a body happened to be
   * standing left is a bug rather than an effect.
   *
   * A sound with no position on its event plays centred, so marking a sound
   * spatial is never a way to make it disappear.
   */
  spatial?: boolean;
  /**
   * A SUSTAINED sound: it starts on its event and plays until `stopOn` fires.
   * Recording-only (a loop of oscillators is what the music system is for), so
   * every voice must be a `sample`. Starting a loop already running is a no-op
   * — the event that raised a sandstorm may fire every tick it lasts.
   */
  loop?: boolean;
  /** The event type that ends the loop. A loop with none stops when the run
   * does, which is right for a level-long ambience and wrong for anything
   * else — the schema warns. */
  stopOn?: string;
  /** Fade for a loop's start and stop, ms. Without it a loop hard-cuts, which
   * on a room tone is a click. */
  fadeMs?: number;
};

/** A sound bank — the shipped catalog, plus whatever mods merged into it. */
export type SoundCatalog = Record<string, SoundDef>;

/** Where a sound happened, for a `spatial` def. Absent plays centred. */
export type PlayContext = {
  pos?: { x: number; y: number };
  /** Force placement for an imperative source whose whole domain is spatial,
   * such as the DRIVE road, without making every authored sound global-spatial. */
  spatial?: boolean;
};
