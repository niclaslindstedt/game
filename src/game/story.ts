// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The story systems: in-world dialogue (elite ambushes, boss confrontations,
// story-item lore) and the locked doors their keys open. Dialogue freezes
// the run in the `dialogue` phase — `step()` refuses to advance anything but
// `playing` — and `advanceDialogue` is the player's tap, safe to call from
// the app outside `step()` exactly like the inventory mutators.

import { distance } from "@game/lib/vec.ts";
import { DIALOGUE, DOORS } from "./config.ts";
import { enemyDef } from "./defs/enemies.ts";
import { storyItemDef } from "./defs/story.ts";
import type { DialogueState, Enemy, GameState } from "./types.ts";

/**
 * The text behind a running dialogue: who is on stage and every page of
 * what they say. The app renders `pages[dialogue.page]`; tests assert on
 * the lot.
 */
export function dialogueContent(dialogue: DialogueState): {
  speaker: string;
  /** Sprite/icon key for the speaker's portrait. */
  portrait: string;
  pages: string[][];
} {
  if (dialogue.source.kind === "enemy") {
    const def = enemyDef(dialogue.source.defId);
    return {
      speaker: def.name,
      portrait: def.sprite,
      pages: def.dialogue ?? [],
    };
  }
  const def = storyItemDef(dialogue.source.defId);
  return { speaker: def.name, portrait: def.icon, pages: def.lore };
}

/**
 * The player's tap: turn the page; past the last one the scene ends and
 * play resumes (a pending level-up takes priority, same as the bag).
 */
export function advanceDialogue(state: GameState): void {
  if (state.phase !== "dialogue" || !state.dialogue) return;
  state.dialogue.page++;
  if (state.dialogue.page < dialogueContent(state.dialogue).pages.length) {
    return;
  }
  state.dialogue = null;
  state.phase = state.player.pendingStatPoints > 0 ? "levelup" : "playing";
}

/**
 * Open an enemy's scene mid-step: pause the run and put the speaker on
 * stage. The `spoke` mark makes every scene a once-only — killing the
 * speaker first forfeits the scene, never the drops.
 */
export function startEnemyDialogue(state: GameState, enemy: Enemy): void {
  enemy.spoke = true;
  state.dialogue = {
    source: { kind: "enemy", enemyId: enemy.id, defId: enemy.defId },
    page: 0,
  };
  state.phase = "dialogue";
  state.events.push({
    type: "dialogueStarted",
    speaker: enemyDef(enemy.defId).name,
  });
}

/**
 * Should this enemy open its scene right now? Only speakers with unplayed
 * dialogue, only while the run is actually playing (a mid-step level-up
 * defers the scene to a later tick), only one scene at a time, and only
 * once the speaker is visibly close.
 */
export function wantsDialogue(state: GameState, enemy: Enemy): boolean {
  const def = enemyDef(enemy.defId);
  return (
    def.dialogue !== undefined &&
    def.dialogue.length > 0 &&
    !enemy.spoke &&
    state.dialogue === null &&
    state.phase === "playing" &&
    distance(enemy.pos, state.player.pos) <= DIALOGUE.speakRadius
  );
}

/**
 * Bank a picked-up story item and play its lore. Story items never enter
 * the bag — they are plot, not gear — so pickup always succeeds.
 */
export function collectStoryItem(state: GameState, defId: string): void {
  state.storyItems.push(defId);
  state.stats.itemsCollected++;
  state.events.push({ type: "storyItemCollected", defId });
  const def = storyItemDef(defId);
  if (def.lore.length === 0 || state.dialogue !== null) return;
  state.dialogue = { source: { kind: "story", defId }, page: 0 };
  state.phase = "dialogue";
  state.events.push({ type: "dialogueStarted", speaker: def.name });
}

/** Does the collection hold a key that opens this door? */
function holdsKeyFor(state: GameState, doorId: string): boolean {
  return state.storyItems.some(
    (defId) => storyItemDef(defId).unlocks === doorId,
  );
}

/**
 * Locked doors: whenever the player carries the matching key up to a
 * closed door, its obstacle chain vanishes and the room is open for good.
 */
export function stepDoors(state: GameState): void {
  for (const door of state.doors) {
    if (door.open || !holdsKeyFor(state, door.id)) continue;
    if (distance(state.player.pos, door.center) > DOORS.openRadius) continue;
    door.open = true;
    const gone = new Set(door.obstacleIds);
    state.obstacles = state.obstacles.filter((o) => !gone.has(o.id));
    state.events.push({ type: "doorOpened", pos: { ...door.center } });
  }
}
