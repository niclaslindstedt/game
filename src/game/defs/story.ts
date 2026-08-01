// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The story-item catalog: plot pieces dropped by unique (elite) mobs or found
// in locked rooms — keycards, dossiers, recovered hardware. Picking one up
// banks it in `state.storyItems` and plays its `lore` pages as a dialogue; an
// `unlocks` entry turns the item into the key for the matching LevelDef door.
//
// This module owns the TYPE and the registry; the CONTENT is authored in
// `content/story-items.yaml` and compiled to `src/generated/story-items.ts` by
// `scripts/generate-story.mjs`. Adding a plot thread = an entry there plus an
// icon; no engine changes. A MOD ships its own `story-items.yaml` and its finds
// arrive through `registerDefs` (pwa/src/game/mods.ts).

import { GENERATED_STORY_ITEMS } from "../../generated/story-items.ts";

export type StoryItemDef = {
  id: string;
  /** Display name (dialogue header, pickup toast). */
  name: string;
  /** Icon sprite drawn on the ground and in the lore box. */
  icon: string;
  /**
   * What the find reveals, played as a dialogue on pickup. One entry per
   * page, one string per line — same shape as EnemyDef.dialogue.
   */
  lore: string[][];
  /** LevelDef door id this item opens (keycards). */
  unlocks?: string;
  /**
   * Picking this up dresses the hero as the ASTRONAUT for the rest of the
   * run: the EVA suit is worn OVER his clothes and armor — plot gear with no
   * equip slot and no stats (see `playerSuited`). Only GOODCO HQ's recovered
   * space suit sets it.
   */
  suitsHero?: boolean;
  /**
   * A PERMANENT ACQUISITION: picking this up banks it on the persistent
   * CHARACTER (the app's run-progress does the write), where every other
   * story item is the run's own and resets with the level. What a travel
   * door's `requires` gate reads — the RIFT CREATOR that unseals the
   * garage's rift seam is the first.
   */
  keepsake?: boolean;
};

export const STORY_ITEM_DEFS: Record<string, StoryItemDef> =
  GENERATED_STORY_ITEMS;

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeStoryItemDefs: Record<string, StoryItemDef> = STORY_ITEM_DEFS;

/** Test/authoring hook: replace the active story-item catalog. */
export function setStoryItemDefs(defs: Record<string, StoryItemDef>): void {
  activeStoryItemDefs = defs;
}

/** Look up a story item's def; throws on a broken id so bugs surface loudly. */
export function storyItemDef(defId: string): StoryItemDef {
  const def = activeStoryItemDefs[defId];
  if (!def) throw new Error(`unknown story item def "${defId}"`);
  return def;
}
