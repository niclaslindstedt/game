// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a compiled sound is: a list of voices the synth fires in order.
//
// Its own module, importing nothing, because three very different things need
// the shape — the generated catalog, the player, and the mod bridge — and none
// of them should have to import the others to describe it.

import type { NoiseOptions, ToneOptions } from "@ui/lib/synth.ts";

/** One voice of a sound. `call` picks which synth method fires it; the rest is
 * that method's own options, exactly as `@ui/lib/synth.ts` declares them —
 * so the format cannot drift from what the synth can be told to do. */
export type SoundVoice =
  ({ call: "tone" } & ToneOptions) | ({ call: "noise" } & NoiseOptions);

/** One sound: an id, and the voices that make it. */
export type SoundDef = {
  id: string;
  voices: SoundVoice[];
};

/** A sound bank — the shipped catalog, plus whatever mods merged into it. */
export type SoundCatalog = Record<string, SoundDef>;
