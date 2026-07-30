// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cutscene catalog. A cutscene is pure data played by the generic
// @game/lib/cutscene player: a stage, a cast, and a timeline of beats.
// Levels reference a scene by id via `LevelDef.prelude`; the app can also
// jump straight to one with the `?cutscene=<id>` URL param, and
// `pwa/scripts/cutscene-preview.mjs` screenshots every beat for review.
//
// This module owns the registry and the per-difficulty variant rule; the
// CONTENT is authored one scene per file in `content/cutscenes/<id>.yaml` and
// compiled to `src/generated/cutscenes.ts` by `scripts/generate-story.mjs`.
// Adding a scene = a file there plus its sprites — no engine changes. A MOD
// ships its own `cutscenes/` and its scenes arrive through `registerDefs`
// (pwa/src/game/mods.ts), so a conversion opens on its own prelude.

import { GENERATED_CUTSCENES } from "../../generated/cutscenes.ts";
import type { CutsceneDef } from "@game/lib/cutscene.ts";

export const CUTSCENE_DEFS: Record<string, CutsceneDef> = GENERATED_CUTSCENES;

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeCutsceneDefs: Record<string, CutsceneDef> = CUTSCENE_DEFS;

/** Test/authoring hook: replace the active cutscene catalog. */
export function setCutsceneDefs(defs: Record<string, CutsceneDef>): void {
  activeCutsceneDefs = defs;
}

/** Look up a cutscene def; throws on a broken id so bugs surface loudly. */
export function cutsceneDef(id: string): CutsceneDef {
  const def = activeCutsceneDefs[id];
  if (!def) throw new Error(`unknown cutscene "${id}"`);
  return def;
}

/**
 * Resolve a scene's per-difficulty variant: `<id>_<difficulty>` when such a
 * def is registered, the base `id` otherwise. This is how the prelude puts
 * the run's actual starting weapon on the living-room wall — createGame
 * resolves the variant once and the state carries the resolved id, so the
 * step loop and the renderer just look it up like any other scene. The
 * variants themselves are authored as one `variants:` block on the base
 * scene's YAML and expanded at compile time (scripts/story-data/load-yaml.mjs).
 */
export function cutsceneVariant(id: string, difficulty: string): string {
  const variant = `${id}_${difficulty}`;
  return activeCutsceneDefs[variant] ? variant : id;
}
