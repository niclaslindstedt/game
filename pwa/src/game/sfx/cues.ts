// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CUES — the sounds the ENGINE does not know it is making.
//
// A sound in this game is normally answered by a `GameEvent`: the simulation
// says a thing happened and the catalog says what that sounds like. That works
// for everything the simulation decides, and not at all for the things it
// merely IMPLIES. A footfall is the example that forced this module: the engine
// moves a body from A to B, and it is the RENDERER that knows the body has legs,
// which frame of the walk it is on, and that a boot just came down. Asking the
// engine to emit an event per footfall would put hundreds of events a second
// into `state.events` — a list that is replicated over the wire — to describe
// something the receiving end could work out for itself.
//
// So a CUE is a moment the app raises directly, matched by the same catalog
// through the same `on:` block:
//
//     on:
//       cue: footstep
//       surface: metal
//
// and keyed in its own table (`cue|surface`) rather than smuggled into the
// event key, because a cue has no event type and giving it a blank one would
// make `on: { type: "" }` a thing an author could write.
//
// TWO RULES, both learned from what a footstep actually costs:
//
//   * **A CUE FALLS BACK TO ITS GENERIC.** `footstep|metal` is tried, then
//     `footstep|`. A biome nobody wrote a specific sound for is still audible,
//     and a mod may be as specific as it likes without having to cover the
//     whole board.
//   * **A CUE IS RATE-LIMITED HERE, NOT AT ITS CALLER.** Cues are raised from
//     per-frame code by definition; four heroes and a horde walking is sixty
//     footfalls a second, which is not a sound, it is mud. The cap lives in the
//     one place every cue passes through so no caller can forget it.

import type { Synth } from "@ui/lib/synth.ts";

import { GENERATED_CUE_KEYS, GENERATED_SOUNDS } from "../../generated/sounds.ts";

import { playSound } from "./play.ts";
import type { SoundCatalog } from "./types.ts";

/** The moments the app raises directly. One so far; the axis exists so the
 * next one (cloth on a dodge, a weapon's idle hum) is a content change. */
export type Cue = "footstep";

/**
 * How many of one cue may sound per second, across every body raising it.
 *
 * Footsteps set this number: a walking hero lands about two boots a second, so
 * a party of four is eight, and anything above roughly a dozen stops reading
 * as footsteps at all. The cap is on the CUE rather than on the body, because
 * what the ear objects to is the total.
 */
const PER_SECOND: Record<Cue, number> = { footstep: 12 };

/** When each cue last sounded, on the app's own clock. */
const lastAt = new Map<string, number>();

let catalog: SoundCatalog = GENERATED_SOUNDS;
let keys: Record<string, string> = GENERATED_CUE_KEYS;

/** Point the cue table at a mod's bank. Called by the mod loader beside
 * `setSoundCatalog`, and with the shipped pair to put it back. */
export function setCueCatalog(
  sounds: SoundCatalog,
  cueKeys: Record<string, string>,
): void {
  catalog = sounds;
  keys = cueKeys;
  lastAt.clear();
}

/** Forget the rate-limiter's history — a new run, or a test. */
export function resetCues(): void {
  lastAt.clear();
}

/**
 * Raise one cue.
 *
 * @param surface the material it happened on, or undefined for the generic
 * @param pos     where, for a `spatial:` sound
 * @param nowMs   the app clock, passed in rather than read so the caller's own
 *                frame time is what paces this and a test can drive it
 * @returns whether anything sounded (false when rate-limited or unanswered)
 */
export function playCue(
  synth: Synth,
  cue: Cue,
  surface: string | undefined,
  pos: { x: number; y: number } | undefined,
  nowMs: number,
): boolean {
  const minGapMs = 1000 / PER_SECOND[cue];
  const last = lastAt.get(cue);
  if (last !== undefined && nowMs - last < minGapMs) return false;

  const id = keys[`${cue}|${surface ?? ""}`] ?? keys[`${cue}|`];
  if (!id) return false;
  // Stamped before the play, and stamped even for a cue whose sound turns out
  // to be missing from the bank: a bank that cannot answer must not become a
  // lookup on every single frame.
  lastAt.set(cue, nowMs);
  return playSound(synth, catalog, id, pos ? { pos } : undefined, GENERATED_SOUNDS);
}
