// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PLAYING A COMPILED SOUND — the whole of what replaced ~2,000 lines of
// hand-written switch statements.
//
// Every sound in the game is now `content/sounds/<id>.yaml`: a list of voices,
// each a `tone` or a `noise`. This fires them. That is the entire runtime, and
// the smallness is the point — the sound DESIGN moved into content where it can
// be read, diffed and modded, and what stayed in code is the four lines that
// hand a voice to the synth.
//
// Nothing here interprets: a voice's fields go to the synth verbatim. A mod
// cannot make this run anything, because there is nothing here to run.

import type { Synth } from "@ui/lib/synth.ts";

import type { SoundCatalog, SoundDef } from "./types.ts";

/** Fire one sound. Unknown ids are silent by design — a mod naming a sound it
 * forgot to ship should be a quiet game, never a crashed frame. */
export function playSound(
  synth: Synth,
  catalog: SoundCatalog,
  id: string | undefined,
): boolean {
  if (!id) return false;
  const def = catalog[id];
  if (!def) return false;
  playDef(synth, def);
  return true;
}

/** Fire a sound we already hold. */
export function playDef(synth: Synth, def: SoundDef): void {
  for (const voice of def.voices) {
    const { call, ...options } = voice;
    if (call === "noise") synth.noise(options);
    else synth.tone(options as Parameters<Synth["tone"]>[0]);
  }
}
