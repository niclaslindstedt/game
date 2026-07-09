// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The story systems: in-world dialogue (elite ambushes, boss confrontations,
// unique-mob last words, story-item lore) and the locked doors their keys
// open. Dialogue freezes
// the run in the `dialogue` phase — `step()` refuses to advance anything but
// `playing` — and `advanceDialogue` is the player's tap, safe to call from
// the app outside `step()` exactly like the inventory mutators.

import { distance, type Vec2 } from "@game/lib/vec.ts";
import { DIALOGUE, DOORS } from "./config.ts";
import { companionDef } from "./defs/companions.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { levelDef } from "./defs/levels/index.ts";
import type { ThoughtTrigger } from "./defs/levels/types.ts";
import { storyItemDef } from "./defs/story.ts";
import { thoughtDef } from "./defs/thoughts.ts";
import { addMapMarker } from "./map.ts";
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
  if (
    dialogue.source.kind === "enemy" ||
    dialogue.source.kind === "enemyDeath"
  ) {
    const def = enemyDef(dialogue.source.defId);
    // The arrival scene runs the def's `dialogue`; the death scene runs its
    // `lastWords` as a single page — same speaker, same portrait box.
    const pages =
      dialogue.source.kind === "enemyDeath"
        ? def.lastWords
          ? [def.lastWords]
          : []
        : (def.dialogue ?? []);
    return { speaker: def.name, portrait: def.sprite, pages };
  }
  // The hero's own head: his face in the portrait box, his private read on
  // stage.
  if (dialogue.source.kind === "playerThought") {
    const def = thoughtDef(dialogue.source.defId);
    return { speaker: def.speaker, portrait: def.portrait, pages: def.pages };
  }
  // A spared figure's joining scene: its companion def carries the thanks —
  // same face in the portrait box it fought the hero with.
  if (dialogue.source.kind === "companionJoin") {
    const def = companionDef(dialogue.source.defId);
    return {
      speaker: def.name,
      portrait: def.sprite,
      pages: def.joinWords ?? [],
    };
  }
  // The wandering merchant's meeting scene: the level def carries his
  // persona — look, name, and his own story for setting up shop here.
  if (dialogue.source.kind === "merchant") {
    const def = levelDef(dialogue.source.levelId).merchant;
    return {
      speaker: def?.name ?? "THE MERCHANT",
      portrait: def?.sprite ?? "merchant",
      pages: def?.greeting ?? [],
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
 * Open a unique mob's death scene mid-step: reuse the arrival dialogue box
 * to play its `lastWords` as the speaker falls. Called from the kill path
 * (loot.ts) once the enemy is already off the board, so it carries only the
 * def id. Silent for mobs without last words, and it yields to any scene
 * already on stage (a rare double-kill keeps the first speaker). The
 * `enemyLastWords` event lets the app swap the arrival knock for a somber
 * cue; the box itself resumes play — or a pending level-up — when tapped
 * through, exactly like every other dialogue.
 */
export function startDeathWords(state: GameState, defId: string): void {
  const def = enemyDef(defId);
  if (!def.lastWords || def.lastWords.length === 0 || state.dialogue !== null) {
    return;
  }
  state.dialogue = { source: { kind: "enemyDeath", defId }, page: 0 };
  state.phase = "dialogue";
  state.events.push({ type: "enemyLastWords", defId });
}

/**
 * Open a spared figure's JOINING scene: the short thanks — a life owed, a
 * promise to follow and protect — played through the same dialogue box its
 * ambush ran in, the moment the SPARE verdict lands (see `resolveChoice` in
 * companions.ts). Silent for a def without `joinWords`, and it yields to any
 * scene already on stage, exactly like a death gasp.
 */
export function startJoinWords(state: GameState, companionId: string): void {
  const def = companionDef(companionId);
  if (!def.joinWords || def.joinWords.length === 0 || state.dialogue !== null) {
    return;
  }
  state.dialogue = {
    source: { kind: "companionJoin", defId: companionId },
    page: 0,
  };
  state.phase = "dialogue";
  state.events.push({ type: "dialogueStarted", speaker: def.name });
}

/**
 * Play a one-time inner monologue: put the hero's own thought on stage and
 * freeze the run in the `dialogue` phase. Silent for an empty/unknown thought
 * and it yields to any scene already up (a death gasp keeps the stage). The
 * `dialogueStarted` event lets the app cue it; the box resumes play — or a
 * pending level-up — when tapped through, like every other dialogue.
 */
export function startPlayerThought(state: GameState, thoughtId: string): void {
  const def = thoughtDef(thoughtId);
  if (def.pages.length === 0 || state.dialogue !== null) return;
  state.dialogue = {
    source: { kind: "playerThought", defId: thoughtId },
    page: 0,
  };
  state.phase = "dialogue";
  state.events.push({ type: "dialogueStarted", speaker: def.speaker });
}

/**
 * The kill-path hook for a level's `firstKillThoughts`: the first time the
 * hero downs `enemyId` on this level, fire its inner monologue exactly once
 * (tracked in `state.thoughtsSeen`). Called from loot.ts after the kill is
 * booked, so the thought stacks ahead of any level-up the blow just earned.
 * A trigger gated by `after` holds (unspent) until its prerequisite thought
 * has played, then fires on the next qualifying kill.
 */
export function maybeFirstKillThought(
  state: GameState,
  enemyId: string,
  triggers: ThoughtTrigger[] | undefined,
): void {
  if (state.dialogue !== null || !triggers) return;
  const trigger = triggers.find((t) => t.enemy === enemyId);
  if (!trigger || state.thoughtsSeen.includes(trigger.thought)) return;
  if (trigger.after && !state.thoughtsSeen.includes(trigger.after)) return;
  state.thoughtsSeen.push(trigger.thought);
  startPlayerThought(state, trigger.thought);
}

/**
 * The per-tick hook for a level's `firstSightThoughts`: the first time a
 * pinned mob comes within DIALOGUE.sightRadius of the hero, fire its inner
 * monologue exactly once (tracked in `state.thoughtsSeen`, same ledger as
 * the kill-pinned beats). Called from step() after the enemies have moved,
 * so the sighting is judged on this tick's positions; if another scene is
 * already on stage, the sighting simply retries on a later playing tick.
 * A trigger gated by `after` holds the same way until its prerequisite
 * thought has played.
 */
export function stepSightThoughts(
  state: GameState,
  triggers: ThoughtTrigger[] | undefined,
): void {
  if (state.dialogue !== null || !triggers) return;
  for (const trigger of triggers) {
    if (state.thoughtsSeen.includes(trigger.thought)) continue;
    if (trigger.after && !state.thoughtsSeen.includes(trigger.after)) continue;
    const seen = state.enemies.some(
      (e) =>
        e.defId === trigger.enemy &&
        distance(e.pos, state.player.pos) <= DIALOGUE.sightRadius,
    );
    if (!seen) continue;
    state.thoughtsSeen.push(trigger.thought);
    startPlayerThought(state, trigger.thought);
    return;
  }
}

/**
 * The scripted opening strike (a level's `openingStrike`): the hero starts
 * disarmed, and the FIRST contact from the pinned vanguard draws his weapon.
 * Called from the enemy-contact path while `player.disarmed` — every other
 * touch in that window is a harmless bump. The vanguard's swing costs no HP
 * (the caller withholds damage); this arms the hero, fires the pinned thought
 * once (tracked in `thoughtsSeen`), and flashes the soft hit. Held until the
 * `after` gate's thought has played — so the "look at this place" read always
 * lands before the "good thing I came armed" reaction — and a no-op if
 * a scene is already up (it simply retries on a later contact).
 */
export function tryOpeningStrike(state: GameState, enemy: Enemy): void {
  if (state.dialogue !== null) return;
  const opening = levelDef(state.level.id).openingStrike;
  if (!opening || !enemy.vanguard) return;
  if (opening.after && !state.thoughtsSeen.includes(opening.after)) return;
  if (state.thoughtsSeen.includes(opening.thought)) return;
  // Draw the blade: combat is live from here on.
  state.player.disarmed = false;
  state.player.hurtFlashMs = 250;
  state.events.push({ type: "playerHurt", crit: false });
  state.thoughtsSeen.push(opening.thought);
  startPlayerThought(state, opening.thought);
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
 * the bag — they are plot, not gear — so pickup always succeeds. `pos` is
 * where it lay: the find is pinned to the level map there.
 */
export function collectStoryItem(
  state: GameState,
  defId: string,
  pos: Vec2,
): void {
  state.storyItems.push(defId);
  state.stats.itemsCollected++;
  state.events.push({ type: "storyItemCollected", defId });
  addMapMarker(state, "story", pos, defId);
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
