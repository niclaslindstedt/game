// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PLAYING A COMPILED SOUND — the whole of what replaced ~2,000 lines of
// hand-written switch statements.
//
// Every sound in the game is `content/sounds/<id>.yaml`: a list of voices, each
// a `tone`, a `noise` or — only ever in a mod — a `sample`. This fires them.
// That is the entire runtime, and the smallness is the point: the sound DESIGN
// moved into content where it can be read, diffed and modded, and what stayed
// in code is the few lines that hand a voice to the synth.
//
// Nothing here interprets: a voice's fields go to the synth verbatim. A mod
// cannot make this run anything, because there is nothing here to run.
//
// TWO THINGS THE FUNNEL OWNS, because every sound in the game passes through
// it — the run's events, the interface's clicks, the road's scrapes, a weapon's
// own `sfx:` — and one place is the only place either can be right:
//
//   * **PLACING A SPATIAL SOUND** on the stage the local camera describes
//     (`listener.ts`), so a `spatial:` sound pans and trims wherever it is
//     played from.
//   * **FAILING OPEN TO THE SHIPPED SOUND.** A mod's def whose every voice is a
//     recording the browser refused would otherwise be a permanent hole in the
//     mix; instead the shipped def for that id is played, and the player hears
//     the game rather than nothing.

import type { Synth } from "@ui/lib/synth.ts";

import { place, type Placement } from "./listener.ts";
import { playSample, stopLoop } from "./samples.ts";
import type { PlayContext, SoundCatalog, SoundDef } from "./types.ts";

/** Centred and untrimmed, for every sound that is not `spatial`. */
const FLAT: Placement = { pan: 0, gain: 1 };

/**
 * Fire one sound by id.
 *
 * Unknown ids are silent by design — a mod naming a sound it forgot to ship
 * should be a quiet game, never a crashed frame.
 *
 * @param ctx      where it happened, for a `spatial:` def
 * @param fallback the SHIPPED bank, so a recording that will not decode is
 *                 replaced by the sound it stood in for rather than by silence
 * @returns whether anything was played (or claimed by a decode in flight)
 */
export function playSound(
  synth: Synth,
  catalog: SoundCatalog,
  id: string | undefined,
  ctx?: PlayContext,
  fallback?: SoundCatalog,
): boolean {
  if (!id) return false;
  const def = catalog[id];
  if (!def) return false;
  if (playDef(synth, def, ctx)) return true;
  // Every voice was a clip the bank no longer holds. Put the shipped sound
  // back — but only if it IS a different sound, or a shipped def that somehow
  // names a missing clip would recurse.
  const shipped = fallback?.[id];
  if (shipped && shipped !== def) return playDef(synth, shipped, ctx);
  return false;
}

/**
 * Stop a sustained sound by id. A sound that was never started is not an error
 * — the event that ends a loop fires whether or not the loop was raised.
 */
export function stopSound(
  catalog: SoundCatalog,
  id: string | undefined,
): void {
  if (!id) return;
  stopLoop(id, catalog[id]?.fadeMs ?? 0);
}

/**
 * Fire a sound we already hold.
 *
 * @returns whether ANY voice was audible. False means every voice was a
 *   recording the bank could not answer, which is the one case a caller can
 *   still do something about.
 */
export function playDef(
  synth: Synth,
  def: SoundDef,
  ctx?: PlayContext,
): boolean {
  const at = def.spatial ? place(ctx?.pos) : FLAT;
  let heard = 0;
  for (const voice of def.voices) {
    if (voice.call === "sample") {
      const claimed = playSample(
        synth,
        voice,
        at,
        def.loop ? { key: def.id, fadeMs: def.fadeMs ?? 0 } : undefined,
      );
      if (claimed) heard++;
      continue;
    }
    const { call, ...options } = voice;
    // A spatial sound's placement rides the two fields the synth already
    // takes, so a tone and a recording are placed by exactly the same
    // arithmetic and nothing downstream knows the difference.
    const placed =
      at === FLAT
        ? options
        : {
            ...options,
            pan: at.pan,
            volume: (options.volume ?? DEFAULT_VOLUME[call]) * at.gain,
          };
    if (call === "noise") synth.noise(placed);
    else synth.tone(placed as Parameters<Synth["tone"]>[0]);
    heard++;
  }
  return heard > 0;
}

/** The synth's own defaults, needed only when a spatial trim has to scale a
 * volume the author left off. Kept in step with `@ui/lib/synth.ts` — a drift
 * here is a spatial sound at the wrong level, which nothing else would catch,
 * so `sfx_spatial_test.ts` pins the pair. */
const DEFAULT_VOLUME = { tone: 0.06, noise: 0.05 } as const;
