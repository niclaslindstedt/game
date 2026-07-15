// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The story systems: in-world dialogue (elite ambushes, boss confrontations,
// unique-mob last words, story-item lore) and the locked doors their keys
// open. Dialogue freezes
// the run in the `dialogue` phase — `step()` refuses to advance anything but
// `playing` — and `advanceDialogue` is the player's tap, safe to call from
// the app outside `step()` exactly like the inventory mutators.

import { createCutscene } from "@game/lib/cutscene.ts";
import { distance, type Vec2 } from "@game/lib/vec.ts";
import { DIALOGUE, DOORS, GATES } from "./config.ts";
import { companionDef } from "./defs/companions.ts";
import { cutsceneDef } from "./defs/cutscenes.ts";
import { MERCHANT_RETURN_SENDOFF } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import type { DialoguePage } from "./defs/enemies/types.ts";
import { levelDef } from "./defs/levels/index.ts";
import type { ThoughtTrigger } from "./defs/levels/types.ts";
import { storyItemDef } from "./defs/story.ts";
import { CAP_THOUGHT_IDS, thoughtDef } from "./defs/thoughts.ts";
import { xpLevelCap } from "./leveling.ts";
import { addMapMarker } from "./map.ts";
import type { DialogueState, Enemy, GameState } from "./types.ts";

/**
 * The played-out prelude scene ends: start the next scene in the chain
 * (`LevelDef.prelude` as a list — the launch, then the flight), or hand the
 * stage to the intro monologue once the queue is dry. The queue's ids are
 * already variant-resolved (create.ts), so they look up directly. Both the
 * step loop and the player's tap land here so the chain behaves the same
 * whether a scene runs out or is clicked through.
 */
export function advanceCutsceneChain(state: GameState): void {
  const next = state.cutsceneQueue.shift();
  if (next) {
    state.cutscene = createCutscene(cutsceneDef(next));
  } else {
    state.cutscene = null;
    state.phase = "intro";
  }
}

/** A single-speaker scene: every page belongs to the named speaker. */
function soloPages(pages: string[][]): {
  pages: string[][];
  heroPages: boolean[];
} {
  return { pages, heroPages: pages.map(() => false) };
}

/**
 * The text behind a running dialogue: who is on stage and every page of
 * what they say. The app renders `pages[dialogue.page]`; tests assert on
 * the lot. `heroPages` runs parallel to `pages` and marks the pages the
 * HERO speaks (his replies in a two-way arrival scene) — the app swaps in
 * his name and portrait for those.
 */
export function dialogueContent(dialogue: DialogueState): {
  speaker: string;
  /** Sprite/icon key for the speaker's portrait. */
  portrait: string;
  pages: string[][];
  heroPages: boolean[];
} {
  if (
    dialogue.source.kind === "enemy" ||
    dialogue.source.kind === "enemyDeath"
  ) {
    const def = enemyDef(dialogue.source.defId);
    // The death scene runs the def's `lastWords` as a single page — same
    // speaker, same portrait box as the arrival.
    if (dialogue.source.kind === "enemyDeath") {
      return {
        speaker: def.name,
        portrait: def.sprite,
        ...soloPages(def.lastWords ? [def.lastWords] : []),
      };
    }
    // The arrival scene runs the def's `dialogue` — the one scene kind that
    // can interleave the hero's replies (see DialoguePage).
    const authored: DialoguePage[] = def.dialogue ?? [];
    return {
      speaker: def.name,
      portrait: def.sprite,
      pages: authored.map((p) => (Array.isArray(p) ? p : p.hero)),
      heroPages: authored.map((p) => !Array.isArray(p)),
    };
  }
  // The hero's own head: his face in the portrait box, his private read on
  // stage.
  if (dialogue.source.kind === "playerThought") {
    const def = thoughtDef(dialogue.source.defId);
    return {
      speaker: def.speaker,
      portrait: def.portrait,
      ...soloPages(def.pages),
    };
  }
  // A spared figure's joining scene: its companion def carries the thanks —
  // same face in the portrait box it fought the hero with.
  if (dialogue.source.kind === "companionJoin") {
    const def = companionDef(dialogue.source.defId);
    return {
      speaker: def.name,
      portrait: def.sprite,
      ...soloPages(def.joinWords ?? []),
    };
  }
  // The wandering merchant's meeting scene: the level def carries his
  // persona — look, name, and his own story for setting up shop here.
  if (dialogue.source.kind === "merchant") {
    const def = levelDef(dialogue.source.levelId).merchant;
    // A RETURN visit (met here before, set up at the door) plays the shorter
    // "welcome back" — the per-level line plus the difficulty's send-off — in
    // place of the first-meeting scene.
    const pages =
      dialogue.source.returning && dialogue.source.difficulty
        ? [
            [
              ...(def?.returnGreeting ?? ["GOOD TO SEE YOU AGAIN."]),
              MERCHANT_RETURN_SENDOFF[dialogue.source.difficulty] ??
                "GOOD LUCK OUT THERE.",
            ],
          ]
        : (def?.greeting ?? []);
    return {
      speaker: def?.name ?? "THE MERCHANT",
      portrait: def?.sprite ?? "merchant",
      ...soloPages(pages),
    };
  }
  const def = storyItemDef(dialogue.source.defId);
  return { speaker: def.name, portrait: def.icon, ...soloPages(def.lore) };
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
 * The dialogue MUTE button: silence every in-world scene for the rest of the
 * level and dismiss whatever is on stage right now (resuming play, or a
 * pending level-up, exactly like tapping through the last page). It only
 * latches `dialogueMuted`; a new level rebuilds the state, so the mute lifts on
 * the next map. Cutscenes are untouched — they own their own SKIP button.
 */
export function muteDialogue(state: GameState): void {
  state.dialogueMuted = true;
  if (state.phase === "dialogue" && state.dialogue) {
    state.dialogue = null;
    state.phase = state.player.pendingStatPoints > 0 ? "levelup" : "playing";
  }
}

/**
 * Open an enemy's scene mid-step: pause the run and put the speaker on
 * stage. The `spoke` mark makes every scene a once-only — killing the
 * speaker first forfeits the scene, never the drops.
 */
export function startEnemyDialogue(state: GameState, enemy: Enemy): void {
  // Mark spoken first so a muted run forfeits the scene the same way killing
  // the speaker does — the enemy never queues to try again.
  enemy.spoke = true;
  if (state.dialogueMuted) return;
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
  if (
    !def.lastWords ||
    def.lastWords.length === 0 ||
    state.dialogue !== null ||
    state.dialogueMuted
  ) {
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
  if (
    !def.joinWords ||
    def.joinWords.length === 0 ||
    state.dialogue !== null ||
    state.dialogueMuted
  ) {
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
  if (
    def.pages.length === 0 ||
    state.dialogue !== null ||
    state.dialogueMuted
  ) {
    return;
  }
  state.dialogue = {
    source: { kind: "playerThought", defId: thoughtId },
    page: 0,
  };
  state.phase = "dialogue";
  state.events.push({ type: "dialogueStarted", speaker: def.speaker });
}

/**
 * Pre-seed the seen-thought ledger so a replay skips inner monologues the
 * player has already read. The app persists a run's accumulated `thoughtsSeen`
 * per difficulty (see the app's story ledger in characters.ts) and feeds the
 * ids back in here when it rebuilds a level, so a pinned kill/sight/strike/
 * asteroid beat that already played never fires again. Ids not yet read are
 * left out, so a monologue the player has not reached still gets its one turn.
 */
export function markThoughtsSeen(
  state: GameState,
  ids: readonly string[],
): void {
  for (const id of ids) {
    if (!state.thoughtsSeen.includes(id)) state.thoughtsSeen.push(id);
  }
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
 * The kill-path hook for the RECURRING cap-farm mutter: once the hero has
 * out-levelled this map (his level has reached the map's `xpLevelCap`, so kills
 * only trickle XP now — see `xpCapMultiplier`), every so often he catches
 * himself grinding and thinks "these things are pathetic, go find Ada." Called
 * from loot.ts after the kill is booked, right behind `maybeFirstKillThought`.
 *
 * Unlike the pinned beats this one REPLAYS: it is never written to
 * `thoughtsSeen`, so instead it is throttled by `state.capThoughtMs`
 * (DIALOGUE.capThoughtCooldownMs, ticked down in step()) and rotates through
 * `CAP_THOUGHT_IDS` round-robin via `state.capThoughtIdx` so a long farm hears
 * a different variation each time. A no-op while a scene is up, off cooldown,
 * or below the cap — and it only advances the rotation / re-arms the cooldown
 * when it actually fires, so a blocked turn simply retries on the next kill.
 */
export function maybeCapThought(state: GameState): void {
  if (state.dialogue !== null || state.capThoughtMs > 0) return;
  const cap = xpLevelCap(state.level.id, state.difficulty);
  if (state.player.level < cap) return;
  const id = CAP_THOUGHT_IDS[state.capThoughtIdx % CAP_THOUGHT_IDS.length]!;
  state.capThoughtIdx++;
  state.capThoughtMs = DIALOGUE.capThoughtCooldownMs;
  startPlayerThought(state, id);
}

/**
 * The per-tick hook for a level's `firstSightThoughts`: the first time a
 * pinned mob comes within the trigger's `radius` (falling back to
 * DIALOGUE.sightRadius) of the hero, fire its inner monologue exactly once
 * (tracked in `state.thoughtsSeen`, same ledger as the kill-pinned beats). A
 * drop-in survey beat widens that radius so it fires the instant the crowd is
 * on screen, before a faster scripted rusher can beat it to the punch. Called
 * from step() after the enemies have moved,
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
    const radius = trigger.radius ?? DIALOGUE.sightRadius;
    const seen = state.enemies.some(
      (e) =>
        e.defId === trigger.enemy &&
        distance(e.pos, state.player.pos) <= radius,
    );
    if (!seen) continue;
    state.thoughtsSeen.push(trigger.thought);
    startPlayerThought(state, trigger.thought);
    return;
  }
}

/**
 * The per-tick hook for a level's `openingStrike`: the hero starts disarmed,
 * and the pinned vanguard closing to within `openingStrike.radius` (falling
 * back to `DIALOGUE.strikeRadius`) draws his weapon. Levels tune that radius to
 * a CONTACT gap — the vanguard reaches the hero and swings when it's on top of
 * him, not half a screen away (see spacez_hq). That works because the rusher
 * outruns the hero (its `rushSpeed` sits above PLAYER.speed), so a fleeing hero
 * still gets run down rather than kiting the beat into a permanent stall.
 * Called from step() after the enemies
 * have moved, so the sighting is judged on this tick's positions. This arms the
 * hero, fires the pinned thought once (tracked in `thoughtsSeen`), and flashes
 * the soft hit. Held until the `after` gate's thought has played — so the "look
 * at this place" read always lands before the "good thing I came armed"
 * reaction — a no-op once armed, and it simply retries on a later tick if a
 * scene is already on stage.
 */
export function stepOpeningStrike(state: GameState): void {
  if (state.dialogue !== null || !state.player.disarmed) return;
  const opening = levelDef(state.level.id).openingStrike;
  if (!opening) return;
  if (opening.after && !state.thoughtsSeen.includes(opening.after)) return;
  if (state.thoughtsSeen.includes(opening.thought)) return;
  const radius = opening.radius ?? DIALOGUE.strikeRadius;
  const near = state.enemies.some(
    (e) => e.vanguard && distance(e.pos, state.player.pos) <= radius,
  );
  if (!near) return;
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
  if (def.lore.length === 0 || state.dialogue !== null || state.dialogueMuted) {
    return;
  }
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
 * Travel gates: stepping into one the player tore open (`spendGateKey` in
 * items.ts) books the crossing — a one-shot `gateEntered` event the app
 * answers by carrying the build into a run of the destination level. The
 * engine itself never travels; a latched gate the app ignores (tests,
 * headless sims) is simply a doorway nobody followed through.
 */
export function stepGates(state: GameState): void {
  for (const gate of state.gates) {
    if (gate.entered) continue;
    if (distance(state.player.pos, gate.pos) > GATES.enterRadius) continue;
    gate.entered = true;
    state.events.push({
      type: "gateEntered",
      pos: { ...gate.pos },
      to: gate.to,
    });
  }
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
