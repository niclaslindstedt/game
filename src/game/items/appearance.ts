// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the hero LOOKS like — the costume the renderer draws him in.
//
// A leaf beside `combat-stats.ts` rather than part of it: the paper doll asks
// this on the title screen's roster portraits, where no fight exists, and
// combat-stats reaches the talent trees, the ability system and the loot flow
// behind them. Appearance needs the story items and the level, nothing else.

import { storyItemDef } from "../defs/story.ts";
import { runLevelDef } from "../defs/levels/index.ts";
import type { GameState } from "../types/index.ts";

/**
 * Whether the hero is drawn as the astronaut. The EVA suit is STORY gear,
 * not equipment — it is worn OVER his clothes and armor, carries no slot and
 * no stats, and latches the moment its story item is picked up (a
 * `StoryItemDef.suitsHero` entry — GOODCO HQ's recovered space suit). On
 * every level but GOODCO HQ he starts suited (the story picks up
 * mid-mission). The renderer reads this to choose the plain-clothes or
 * astronaut sprite set.
 */
export function playerSuited(state: GameState): boolean {
  for (const defId of state.storyItems) {
    if (storyItemDef(defId).suitsHero) return true;
  }
  return runLevelDef(state).heroSuited ?? true;
}

/**
 * The sprite family the player wears right now — the renderer draws
 * `<appearance>_0` / `_1` / `_jump` from it, so a costume change is data:
 * a sequel returns different family keys here (and ships their sprites) with
 * no renderer edit. This game toggles between plain clothes and the EVA suit.
 */
export function playerAppearance(state: GameState): string {
  return playerSuited(state) ? "player" : "hero";
}
