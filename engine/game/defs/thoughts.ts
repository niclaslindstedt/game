// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player-thought catalog: the hero's own inner monologues, played through
// the dialogue box when a level's `firstKillThoughts` (the first time he kills
// a given enemy there) or `firstSightThoughts` (the first time one comes into
// view) fires. Unlike an elite's arrival scene there is no speaker on the
// board — the box shows the hero's face and his private read on what he just
// saw.
//
// This module owns the TYPE and the registry; the CONTENT is authored in
// `content/thoughts.yaml` and compiled to `engine/generated/thoughts.ts` by
// `scripts/generate-story.mjs`. Adding a beat = an entry there + referencing its
// id from a LevelDef; no engine changes. A MOD ships its own `thoughts.yaml` and
// its monologues arrive through `registerDefs` (pwa/src/game/mods.ts).

import {
  GENERATED_CAP_THOUGHTS,
  GENERATED_THOUGHTS,
} from "../../generated/thoughts.ts";

/**
 * One page of a monologue. A plain `string[]` is the hero's own page (one
 * string per line); `{ them: [...] }` is SOMEBODY ANSWERING HIM — the def's
 * `voice` names who, and the app swaps in that name and portrait for the page.
 *
 * The exact inverse of an arrival scene's `DialoguePage`: there the mob owns
 * the scene and `{ hero: … }` marks his replies; here he owns it and
 * `{ them: … }` marks theirs. Two tags rather than one shared "the other
 * party" because a scene should read from its own file — an author looking at
 * a thought should see whose page each one is without knowing which kind of
 * scene the engine filed it under.
 */
export type ThoughtPage = string[] | { them: string[] };

export type ThoughtDef = {
  id: string;
  /**
   * Name shown in the dialogue header. Every shipped beat is the hero's own
   * voice, so every one of them writes `{HERO}` — the name the player gave
   * this character (`engine/game/hero-name.ts`), resolved by whichever box draws
   * the beat.
   */
  speaker: string;
  /** Portrait sprite family (frame `<portrait>_0`) drawn beside the words. */
  portrait: string;
  /**
   * THE OTHER VOICE IN THE BEAT — who a `{ them: … }` page belongs to. Absent
   * on a plain monologue, which is nearly all of them: a thought is private by
   * default, and the only reason to break that is a beat where somebody is
   * talking AT him and what they say is the point (a shove answered with "we
   * have our orders"). Required as soon as any page is tagged.
   */
  voice?: { speaker: string; portrait: string };
  /** What he thinks, one entry per page, one string per line. */
  pages: ThoughtPage[];
};

export const THOUGHT_DEFS: Record<string, ThoughtDef> = GENERATED_THOUGHTS;

/**
 * The RECURRING cap-farm monologue ids the game ships, in rotation order (see
 * `maybeCapThought` in story.ts). The engine cycles these — one per firing,
 * round-robin — so a hero farming an out-levelled map hears a fresh variation
 * each time rather than the same line on repeat. Authored as `capRotation` in
 * `content/thoughts.yaml`; order is the rotation, nothing else keys off it.
 */
export const CAP_THOUGHT_IDS: readonly string[] = GENERATED_CAP_THOUGHTS;

// Active registry the accessors read (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See engine/index.ts.
let activeThoughtDefs: Record<string, ThoughtDef> = THOUGHT_DEFS;
let activeCapThoughts: readonly string[] = CAP_THOUGHT_IDS;

/**
 * Test/authoring hook: replace the active player-thought catalog, and with it
 * the cap-farm rotation.
 *
 * The rotation is FILTERED to ids the new catalog actually holds, and that is
 * load-bearing rather than defensive: a total conversion replaces the thoughts
 * without necessarily authoring its own `capRotation`, and the shipped rotation
 * left standing over a catalog that no longer holds `cap_pathetic_1` would throw
 * out of `thoughtDef` the first time a player out-levelled a map. An empty
 * rotation simply means the mutter never fires.
 */
export function setThoughtDefs(
  defs: Record<string, ThoughtDef>,
  capRotation: readonly string[] = CAP_THOUGHT_IDS,
): void {
  activeThoughtDefs = defs;
  activeCapThoughts = capRotation.filter((id) => id in defs);
}

/** Look up a player thought's def; throws on a broken id so bugs surface. */
export function thoughtDef(defId: string): ThoughtDef {
  const def = activeThoughtDefs[defId];
  if (!def) throw new Error(`unknown thought def "${defId}"`);
  return def;
}

/** The active cap-farm rotation — the shipped one until a mod replaces it. */
export function capThoughtIds(): readonly string[] {
  return activeCapThoughts;
}
