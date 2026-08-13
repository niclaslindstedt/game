// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The story systems: in-world dialogue (elite ambushes, boss confrontations,
// unique-mob last words, story-item lore) and the locked doors their keys
// open. Dialogue freezes
// the run in the `dialogue` phase — `step()` refuses to advance anything but
// `playing` — and `advanceDialogue` is the player's tap, safe to call from
// the app outside `step()` exactly like the inventory mutators.

import { createCutscene } from "@game/lib/cutscene.ts";
import { distance, type Vec2 } from "@game/lib/vec.ts";
import { DIALOGUE, DOORS, GATES, MERCHANT, PLAYER } from "./config/index.ts";
import { companionDef } from "./defs/companions.ts";
import { cutsceneDef, cutsceneVariant } from "./defs/cutscenes.ts";
import { MERCHANT_RETURN_SENDOFF } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import type { DialoguePage } from "./defs/enemies/types.ts";
import { levelDef, runLevelDef } from "./defs/levels/index.ts";
import type {
  PlaceThoughtTrigger,
  ThoughtTrigger,
} from "./defs/levels/types.ts";
import { storyItemDef } from "./defs/story.ts";
import { capThoughtIds, thoughtDef } from "./defs/thoughts.ts";
import {
  HERO_NAME_TOKEN,
  withHeroName,
  withHeroNameLines,
} from "./hero-name.ts";
import { knockEnemyBack } from "./knockback.ts";
import { xpLevelCap } from "./leveling.ts";
import { addMapMarker } from "./map.ts";
import { menaceStage } from "./menace.ts";
import { openingPhase } from "./opening.ts";
import { anyHeroWithin, heroInPlay, partyLevel } from "./party.ts";
import type { DialogueState, Enemy, GameState, Player } from "./types/index.ts";

// The `dialogue`/`cutscenes` display preferences live in the engine's leaf
// `flags.ts` — no imports at all — so the SETTINGS screen can apply them at
// startup without pulling this system (and the enemy, cutscene and thought
// catalogs behind it) along. Re-exported here so every existing reader keeps
// its import.
export {
  areCutscenesEnabled,
  isDialogueEnabled,
  setCutscenesEnabled,
  setDialogueEnabled,
} from "./flags.ts";

/**
 * The played-out prelude scene ends: start the next scene in the chain
 * (`LevelDef.prelude` as a list — the launch, then the flight), or hand the
 * stage to the intro monologue once the queue is dry. The queue's ids are
 * already variant-resolved (create.ts), so they look up directly. Both the
 * step loop and the player's tap land here so the chain behaves the same
 * whether a scene runs out or is clicked through. A DIALOGUE-muted run skips
 * the intro monologue too, dropping straight to the level-name card (the same
 * `title` phase a SKIP lands on) — and so does a venue that ships no monologue
 * at all, which is the PRELUDE's own case: it walks the hero out of his living
 * room and the hub he lands in has nothing left to introduce (`openingPhase`).
 */
export function advanceCutsceneChain(state: GameState): void {
  const next = state.cutsceneQueue.shift();
  if (next) {
    state.cutscene = createCutscene(cutsceneDef(next), state.cutsceneTags);
    return;
  }
  state.cutscene = null;
  // WHICH END OF THE RUN THIS WAS. A prelude hands the stage to the hero's
  // opening monologue; a level's FAREWELL (`LevelDef.farewell`) has the run
  // already won behind it and hands over to the epilogue pages, or straight to
  // the splash when the level ships none. A DIALOGUE-muted run has neither.
  if (state.cutsceneThen === "victory") {
    const outro = runLevelDef(state).outro;
    state.phase =
      !state.dialogueMuted && outro && outro.length > 0 ? "outro" : "victory";
    return;
  }
  state.phase = openingPhase(state);
}

/**
 * The objective has fallen and the level has a SEND-OFF to play: raise it and
 * hold the run in the `cutscene` phase until the chain drains.
 *
 * Returns whether it took the stage, so the caller keeps the plain
 * epilogue-or-splash path for every level that ships none.
 */
export function beginFarewell(state: GameState): boolean {
  if (state.dialogueMuted) return false;
  const farewell = runLevelDef(state).farewell;
  const scenes = (
    typeof farewell === "string" ? [farewell] : (farewell ?? [])
  ).map((id) => cutsceneVariant(id, state.difficulty));
  const first = scenes[0];
  if (first === undefined) return false;
  state.cutscene = createCutscene(cutsceneDef(first), state.cutsceneTags);
  state.cutsceneQueue = scenes.slice(1);
  state.cutsceneThen = "victory";
  state.phase = "cutscene";
  return true;
}

/**
 * The name over the hero's own words, wherever in a scene he speaks — the
 * player's own, so the box that carries his inner monologue is headed by the
 * character they named rather than by a pronoun. It is the same token every
 * other authored line writes (`engine/game/hero-name.ts`), resolved on the way
 * out of {@link dialogueContent}, which is why a `{ hero: … }` reply page
 * needs no special case here.
 */
const HERO_SPEAKER = HERO_NAME_TOKEN;

/**
 * WHO IS DELIVERING ONE PAGE. Every scene in the game resolves to a list of
 * these, one per page, so the box never has to know which KIND of scene it is
 * drawing — which is the whole point: an arrival scene the hero answers back
 * in, and an inner monologue somebody answers back TO, are the same shape.
 */
export type DialogueVoice = {
  /** The name printed over the words. */
  speaker: string;
  /** Portrait sprite/icon key — unused when `hero` (see below). */
  portrait: string;
  /**
   * THE HERO IS SPEAKING. The app draws his live dressed paper-doll rather than
   * a sprite, so his lines are delivered by the character the player
   * recognizes, gear and all — which is why his `portrait` here is only a
   * fallback.
   */
  hero: boolean;
};

/** A single-speaker scene: every page belongs to the named speaker. */
function soloPages(
  pages: string[][],
  voice: DialogueVoice,
): { pages: string[][]; voices: DialogueVoice[] } {
  return { pages, voices: pages.map(() => voice) };
}

/** What a scene resolves to, before the hero's name is put into it. */
type SceneContent = {
  speaker: string;
  /** Sprite/icon key for the speaker's portrait. */
  portrait: string;
  pages: string[][];
  voices: DialogueVoice[];
};

/**
 * The text behind a running dialogue: who is on stage and every page of
 * what they say. The app renders `pages[dialogue.page]`; tests assert on
 * the lot. `voices` runs parallel to `pages` and says who delivers each one —
 * the scene's owner, or the other party in a two-way beat (the hero's replies
 * in an arrival scene; a mob answering back in one of his own monologues).
 * `speaker`/`portrait` remain the SCENE's owner, for anything that wants to
 * name the scene rather than the page.
 *
 * `heroName` is the name of the hero the VIEWER is playing (`localHero`'s
 * character, app-side): it heads his own pages and lands in the handful of
 * authored lines that write `{HERO}` because the speaker knows him. It is a
 * parameter rather than something read off the run for the reason in
 * `hero-name.ts` — the name changes no tick, and in a party each screen's box
 * belongs to a different person. A caller with no name in hand gets the
 * first-person fallback, which is what the box printed before anyone had one.
 */
export function dialogueContent(
  dialogue: DialogueState,
  heroName?: string | null,
): SceneContent {
  return withHeroNameIn(authoredContent(dialogue), heroName);
}

/**
 * Put the hero's name through a resolved scene: over his own pages, and into
 * whichever authored lines wrote the token. A PAGE that gained nothing keeps
 * its identity — and the page is what the box wraps and paginates — so a
 * scene that never names him (nearly all of them) costs no re-flow on every
 * typed character.
 */
function withHeroNameIn(
  content: SceneContent,
  heroName?: string | null,
): SceneContent {
  return {
    ...content,
    speaker: withHeroName(content.speaker, heroName),
    pages: content.pages.map((page) => withHeroNameLines(page, heroName)),
    voices: content.voices.map((voice) => {
      const speaker = withHeroName(voice.speaker, heroName);
      return speaker === voice.speaker ? voice : { ...voice, speaker };
    }),
  };
}

/** The scene exactly as it was authored, tokens and all. */
function authoredContent(dialogue: DialogueState): SceneContent {
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
        ...soloPages(def.lastWords ? [def.lastWords] : [], {
          speaker: def.name,
          portrait: def.sprite,
          hero: false,
        }),
      };
    }
    // The arrival scene runs the def's `dialogue` — the one scene kind that
    // can interleave the hero's replies (see DialoguePage).
    const authored: DialoguePage[] = def.dialogue ?? [];
    return {
      speaker: def.name,
      portrait: def.sprite,
      pages: authored.map((p) => (Array.isArray(p) ? p : p.hero)),
      voices: authored.map((p) =>
        Array.isArray(p)
          ? { speaker: def.name, portrait: def.sprite, hero: false }
          : { speaker: HERO_SPEAKER, portrait: "hero", hero: true },
      ),
    };
  }
  // The hero's own head — and, in a two-way beat, whoever is talking AT him.
  // A thought's default voice is his, which is the exact inverse of an arrival
  // scene: there the mob owns the scene and `{ hero: … }` marks his replies,
  // here he owns it and `{ them: … }` marks theirs. `voice` names who "them"
  // is, so a monologue somebody interrupts costs one authored line rather than
  // a second scene kind.
  if (dialogue.source.kind === "playerThought") {
    const def = thoughtDef(dialogue.source.defId);
    const mine: DialogueVoice = {
      speaker: def.speaker,
      portrait: def.portrait,
      hero: true,
    };
    const theirs: DialogueVoice | null = def.voice
      ? { ...def.voice, hero: false }
      : null;
    return {
      speaker: def.speaker,
      portrait: def.portrait,
      pages: def.pages.map((p) => (Array.isArray(p) ? p : p.them)),
      voices: def.pages.map((p) =>
        Array.isArray(p) ? mine : (theirs ?? mine),
      ),
    };
  }
  // A spared figure's joining scene: its companion def carries the thanks —
  // same face in the portrait box it fought the hero with.
  if (dialogue.source.kind === "companionJoin") {
    const def = companionDef(dialogue.source.defId);
    return {
      speaker: def.name,
      portrait: def.sprite,
      ...soloPages(def.joinWords ?? [], {
        speaker: def.name,
        portrait: def.sprite,
        hero: false,
      }),
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
    const speaker = def?.name ?? "THE MERCHANT";
    const portrait = def?.sprite ?? "merchant";
    return {
      speaker,
      portrait,
      ...soloPages(pages, { speaker, portrait, hero: false }),
    };
  }
  const def = storyItemDef(dialogue.source.defId);
  return {
    speaker: def.name,
    portrait: def.icon,
    ...soloPages(def.lore, {
      speaker: def.name,
      portrait: def.icon,
      hero: false,
    }),
  };
}

/**
 * The player's tap: turn the page; past the last one the scene ends and play
 * resumes. A GROUP verb — anyone in the party may advance the beat.
 * Banked level-up points stay banked; the HUD pip carries the
 * reminder.
 */
export function advanceDialogue(state: GameState): void {
  if (state.phase !== "dialogue" || !state.dialogue) return;
  state.dialogue.page++;
  if (state.dialogue.page < dialogueContent(state.dialogue).pages.length) {
    return;
  }
  state.dialogue = null;
  state.phase = "playing";
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
    state.phase = "playing";
  }
}

/**
 * Lift the mute for the rest of the run — the player took the controls back
 * (the AUTO PILOT stop): scenes not yet marked seen play again from here on.
 */
export function unmuteDialogue(state: GameState): void {
  state.dialogueMuted = false;
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
 * THE HERO LOOKS A STANDING DOOR OVER AND FINDS IT ISN'T READY.
 *
 * A travel door whose roads are all still locked opens no picker (see
 * `LevelDef.travelDoors[].unready`): the hero says what is wrong with it
 * instead, which on the hub's ROCKET is the ship still being one part short.
 * The app decides that nothing is open — campaign progress lives on the
 * CHARACTER, not on the run — and this is the half that travels: the authored
 * line, played through the ordinary thought box.
 *
 * The beat REPLAYS on purpose, so it is never written to `thoughtsSeen`: it is
 * an answer to a tap rather than a story beat the player is owed once, and a
 * player who taps the ship again a chapter later is asking the same question.
 *
 * Refuses for a door with no line, and for a hero who is not actually AT it —
 * the same revalidation `enterCar` does of the tap the app already checked, so
 * a session client cannot put a scene on every party member's screen from
 * across the map.
 */
export function tapTravelDoor(
  state: GameState,
  hero: Player,
  doorId: string,
): boolean {
  const door = (runLevelDef(state).travelDoors ?? []).find(
    (d) => d.id === doorId,
  );
  if (!door?.unready) return false;
  const mark = state.landmarks.find((l) => l.kind === doorId);
  if (!mark || distance(hero.pos, mark.pos) > MERCHANT.tradeRadius * 1.5) {
    return false;
  }
  startPlayerThought(state, door.unready);
  return true;
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
 * the cap rotation (`capThoughtIds`) round-robin via `state.capThoughtIdx` so a
 * long farm hears
 * a different variation each time. A no-op while a scene is up, off cooldown,
 * or below the cap — and it only advances the rotation / re-arms the cooldown
 * when it actually fires, so a blocked turn simply retries on the next kill.
 *
 * It also falls silent once menace has evolved the horde past
 * `DIALOGUE.capThoughtMenaceStageCeiling`: on a high-menace rampage the mobs
 * carry stacked evolution hp and the set pieces power-match the hero, so they
 * are demonstrably no longer pathetic and the self-satisfied line would be
 * wrong. The cooldown isn't re-armed on this skip, so the line resumes the
 * moment the meter cools back down.
 */
export function maybeCapThought(state: GameState): void {
  if (state.dialogue !== null || state.capThoughtMs > 0) return;
  if (menaceStage(state) > DIALOGUE.capThoughtMenaceStageCeiling) return;
  const cap = xpLevelCap(state.level.id, state.difficulty);
  // THE PARTY's level, not seat 0's: the line is about the venue having nothing
  // left to teach, which is a fact about the run rather than about the host —
  // and the cap is what the horde is scaled against (`partyLevel`).
  if (partyLevel(state) < cap) return;
  // A conversion may replace the thought catalog without authoring a rotation,
  // which leaves nothing to mutter — the beat simply never fires.
  const rotation = capThoughtIds();
  if (rotation.length === 0) return;
  const id = rotation[state.capThoughtIdx % rotation.length]!;
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
    // …AND SOME BEATS ARE ABOUT THE INSIDE OF A BUILDING (`inside`), which a
    // radius cannot say on its own: a sighting is pure distance, so a crowd
    // standing a step past a doorway is "seen" by a hero on the car park the
    // instant the gate opens — and "every desk's manned, every lab lit" gets
    // read out to a man looking at parked cars.
    if (trigger.inside && !anyHeroPastEntrance(state)) continue;
    const radius = trigger.radius ?? DIALOGUE.sightRadius;
    // ANY hero laying eyes on it fires the beat — the trigger rule for
    // everything the world does when somebody walks up to it. A sighting only
    // seat 0 could make is a beat seven players never see.
    const seen = state.enemies.some(
      (e) => e.defId === trigger.enemy && anyHeroWithin(state, e.pos, radius),
    );
    if (!seen) continue;
    state.thoughtsSeen.push(trigger.thought);
    startPlayerThought(state, trigger.thought);
    return;
  }
}

/**
 * The per-tick hook for a level's `placeThoughts`: beats pinned to WHERE the
 * hero is rather than to a monster (see `PlaceThoughtTrigger`).
 *
 * The hub needed them and nothing else fit. A venue's `intro` is the doorstep
 * cutscene — it plays before the level is walkable and once per difficulty, and
 * it is the establishing SHOT rather than a to-do — while every other pinned
 * monologue in the game hangs off a monster, of which the garage deliberately
 * has none. So this is the third trigger: no mob, no kill, no sighting, just
 * "he is here" and "he has walked out of here on his own feet".
 *
 * Fired once each and tracked in `state.thoughtsSeen` like every other pinned
 * beat, so the app's per-difficulty ledger skips them on the way back from
 * GOODCO. One per tick at most, in authored order, and each yields to anything
 * already on stage (the opening monologue, a cutscene) and simply retries on the
 * next playing tick — which is what makes "after the intro" true without either
 * beat knowing the other exists.
 */
export function stepPlaceThoughts(
  state: GameState,
  triggers: PlaceThoughtTrigger[] | undefined,
): void {
  if (state.dialogue !== null || !triggers) return;
  for (const trigger of triggers) {
    if (state.thoughtsSeen.includes(trigger.thought)) continue;
    if (trigger.after && !state.thoughtsSeen.includes(trigger.after)) continue;
    if (trigger.where === "pastDoor" && !anyHeroPastApproachDoor(state)) {
      continue;
    }
    state.thoughtsSeen.push(trigger.thought);
    startPlayerThought(state, trigger.thought);
    return;
  }
}

/**
 * IS ANYBODY PAST THE GATE — has a hero actually got INSIDE the building?
 *
 * The staff lot's own geometry already answers it. The arrival plan
 * (`engine/game/arrivals.ts`) holds the doorway and the two points either side
 * of it — `apron` out on the tarmac, `inside` a step into the building — so
 * "inside" is simply the side of the doorway's line that `inside` is on. No
 * zone, no room id, no carve lookup, which is what makes it work on a floor
 * plan that did not exist until this run was carved.
 *
 * TRUE on every level that has no arrival lot, and deliberately: a beat that
 * waits to be indoors on a map with no indoors is a beat that never plays. The
 * gate it names is the one the mission put there; a venue without one has
 * nothing for the hero to be on the far side of.
 */
export function anyHeroPastEntrance(state: GameState): boolean {
  const plan = state.arrivalPlan;
  if (!plan) return true;
  const nx = plan.inside.x - plan.door.x;
  const ny = plan.inside.y - plan.door.y;
  return state.players.some(
    (hero) =>
      heroInPlay(hero) &&
      (hero.pos.x - plan.door.x) * nx + (hero.pos.y - plan.door.y) * ny > 0,
  );
}

/**
 * HAS ANYBODY WALKED OUT? — the `pastDoor` predicate.
 *
 * An APPROACH door is a segment (`from`→`to`, the first and last slat), so
 * "out" is simply the far SIDE of that line from the level's own
 * `playerSpawn` — which is where the hero starts and is therefore, by
 * construction, inside whatever the door shuts. Derived rather than authored:
 * a blueprint that moves the bay's doorway moves this with it, and no venue
 * has to name a zone it cannot author anyway (a mission carries no geometry —
 * the floor plan is carved per run).
 *
 * A hero AT A WHEEL is not walking, and is skipped. That is the whole point of
 * the hub's beat rather than a nicety: the car crosses this same threshold on
 * its way out, and a "you forgot the car" read fired at the man driving it
 * would be the single worst-timed line in the game.
 */
function anyHeroPastApproachDoor(state: GameState): boolean {
  const inside = runLevelDef(state).playerSpawn;
  const driving = new Set(
    state.vehicles.flatMap((v) => (v.driver === null ? [] : [v.driver])),
  );
  for (const door of state.doors) {
    if (!door.approach || !door.from || !door.to) continue;
    const dx = door.to.x - door.from.x;
    const dy = door.to.y - door.from.y;
    const sideOf = (p: Vec2): number =>
      dx * (p.y - door.from!.y) - dy * (p.x - door.from!.x);
    const home = sideOf(inside);
    if (home === 0) continue; // a doorway the spawn stands in says nothing
    for (let seat = 0; seat < state.players.length; seat++) {
      const hero = state.players[seat] as Player;
      if (!heroInPlay(hero) || driving.has(seat)) continue;
      if (sideOf(hero.pos) * home < 0) return true;
    }
  }
  return false;
}

/**
 * The per-tick hook for a level's `openingStrike`: the hero starts disarmed,
 * and the pinned vanguard closing to within `openingStrike.radius` (falling
 * back to `DIALOGUE.strikeRadius`) draws his weapon. Levels tune that radius to
 * a CONTACT gap — the vanguard reaches the hero and swings when it's on top of
 * him, not half a screen away (see goodco_hq). That works because the rusher
 * outruns the hero (its `rushSpeed` sits above PLAYER.speed), so a fleeing hero
 * still gets run down rather than kiting the beat into a permanent stall.
 * Called from step() after the enemies
 * have moved, so the sighting is judged on this tick's positions. This arms the
 * hero, fires the pinned thought once (tracked in `thoughtsSeen`), and flashes
 * the soft hit. Held until the `after` gate's thought has played — so the "look
 * at this place" read always lands before the "good thing I came armed"
 * reaction — a no-op once armed, and it simply retries on a later tick if a
 * scene is already on stage.
 *
 * A level may script the strike as an ESCALATION rather than a single blow
 * (`OpeningStrike.warnings`): the early blows land on a hero who refuses to
 * answer them — one beat each, the striker shoved off between them so the next
 * blow is a separate event the player watches arrive — and only the blow that
 * lands with every warning already read draws the weapon. The read ledger is
 * the counter, so the escalation needs no run state of its own.
 *
 * A safety net closes the one way the beat could never fire: if the vanguard
 * is KILLED before it reaches the hero — a party (or a conjured power) cutting
 * the lone rusher down — the hero would otherwise stay disarmed for the whole
 * level, never swinging while his companions fight on. So a vanquished vanguard
 * (none left alive) draws the blade too, just without the soft-hit flash.
 *
 * ARMING NEVER HINGES ON THE THOUGHT BEING UNSEEN. A replay — or DEVELOPER →
 * BOT VIEW, which drops a leveled arrival hero and seeds this difficulty's read
 * ledger via `markThoughtsSeen` — starts with `opening.thought` already in
 * `thoughtsSeen`. Skipping the whole hook on that (the old `includes(thought)`
 * early return) soft-locked the holstered hero: the vanguard reached him, the
 * strike no-op'd, and the pack just piled up around a defenceless hero forever.
 * The blade is drawn whenever a disarmed hero is struck/vanquished; the
 * already-read check only suppresses RE-SHOWING the monologue.
 */
export function stepOpeningStrike(state: GameState): void {
  if (state.dialogue !== null) return;
  // THE BEAT IS THE RUN'S, AND SO IS THE ANSWER TO IT. Every hero starts the
  // level holstered, so the gate is "is anybody still disarmed" and the draw
  // below arms the WHOLE party — a level whose opening blow armed seat 0 alone
  // would leave every joiner unable to swing for the rest of it, which is the
  // same soft-lock the vanquished-vanguard safety net exists to close.
  const holstered = state.players.filter(
    (hero) => heroInPlay(hero) && hero.disarmed,
  );
  if (holstered.length === 0) return;
  const opening = runLevelDef(state).openingStrike;
  if (!opening) return;
  if (opening.after && !state.thoughtsSeen.includes(opening.after)) return;
  const radius = opening.radius ?? DIALOGUE.strikeRadius;
  const vanguards = state.enemies.filter((e) => e.vanguard);
  // A striker still COASTING from the last blow's recoil is being shoved off,
  // not swinging: the trigger is contact, and one tick of the shove moves him a
  // couple of px out of a contact-tight radius he is standing well inside, so
  // without this gate the escalation collapses — the next beat fires on the
  // very tick the player taps the last one closed, and three separate blows
  // read as one uninterrupted scene. The gate is what makes "he comes again"
  // a fact rather than a number that happens to be big enough today.
  //
  // The blow lands on WHOEVER the vanguard reached, which in a party is the
  // holstered hero it ran at rather than the one who pressed HOST.
  let victim: Player | undefined;
  const striker = vanguards.find((e) => {
    if ((e.knockMs ?? 0) > 0) return false;
    victim = holstered.find((hero) => distance(e.pos, hero.pos) <= radius);
    return victim !== undefined;
  });
  const struck = striker !== undefined;
  // The vanguard's touch draws the blade — but a COMPANION (or a conjured
  // power) can cut the lone rusher down before it ever reaches the holstered
  // hero, and nothing else can trigger this beat. Left unhandled, the hero
  // stays disarmed for the WHOLE level while his party fights on without him
  // (a hero arriving with a full party — e.g. deep into a campaign — never
  // gets to swing). So once the opening read has played, a VANQUISHED vanguard
  // (none left on the board) draws the blade exactly as its strike would have.
  const vanquished = vanguards.length === 0;
  if (!struck && !vanquished) return;

  // THE BLOWS HE DOESN'T ANSWER. A level may script the strike as an
  // ESCALATION (`warnings`): the first blows land on a hero who will not hit
  // back — he tells them who he is and to stand down — and only a striker who
  // keeps coming gets an answer. The read ledger is the counter, so the next
  // unread warning IS this blow's beat; when they are all read, the blow falls
  // through below and draws the weapon.
  //
  // A VANQUISHED vanguard skips the whole escalation. There is nobody left to
  // refuse, and the safety net exists precisely so a hero whose party cut the
  // rusher down is never left holstered for the level — holding him unarmed
  // through warnings that can no longer be delivered would reinstate the bug.
  const pending = (opening.warnings ?? []).find(
    (id) => !state.thoughtsSeen.includes(id),
  );
  if (striker && victim && pending !== undefined) {
    // He takes it — the flash, no HP, exactly as the arming blow costs none.
    victim.hurtFlashMs = 250;
    state.events.push({ type: "playerHurt", crit: false });
    // …and shoves the man off rather than swinging at him. The recoil is what
    // makes the NEXT blow a separate event: the trigger is contact, so a
    // striker left parked on the hero would satisfy it again the instant the
    // player tapped this beat closed.
    knockEnemyBack(
      striker,
      victim.pos,
      DIALOGUE.strikeRecoilSpeed,
      DIALOGUE.strikeRecoilMs,
    );
    state.thoughtsSeen.push(pending);
    startPlayerThought(state, pending);
    return;
  }

  // Draw the blade: combat is live from here on — for the WHOLE party, since
  // the opening is the level's, not one hero's (see the gate above).
  for (const hero of holstered) hero.disarmed = false;
  // The soft first hit is a flash, no HP — but a vanguard cut down before it
  // arrived landed no blow, so there is nothing to flash for the death path.
  if (struck && victim) {
    victim.hurtFlashMs = 250;
    state.events.push({ type: "playerHurt", crit: false });
  }
  // Fire the pinned thought once, but only if it hasn't been read yet — a
  // seeded ledger (replay / BOT VIEW) already holds it, and re-showing it is
  // wrong. The arming above happened regardless, so the run is never stuck.
  if (!state.thoughtsSeen.includes(opening.thought)) {
    state.thoughtsSeen.push(opening.thought);
    startPlayerThought(state, opening.thought);
  }
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
    // ANY hero close enough opens the scene: an arrival the host happened to
    // walk past is an arrival nobody in the party ever hears.
    anyHeroWithin(state, enemy.pos, DIALOGUE.speakRadius)
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
 * items/inventory.ts) books the crossing — a one-shot `gateEntered` event the app
 * answers by carrying the build into a run of the destination level. The
 * engine itself never travels; a latched gate the app ignores (tests,
 * headless sims) is simply a doorway nobody followed through.
 */
export function stepGates(state: GameState): void {
  for (const gate of state.gates) {
    if (gate.entered) continue;
    // A SEAM ONE HERO TORE IS THAT HERO'S DOOR, and only theirs. A level's own
    // gate is the opposite — ANY hero steps through for the party, because a
    // gate is a doorway rather than a turnstile and the app answers the
    // crossing for the whole run. So the seam asks who is standing in it: it
    // takes the hero who tore it home and leaves everybody else fighting.
    if (gate.solo) {
      const seat = soloSeatFor(gate.id);
      if (seat === null) continue;
      const hero = state.players[seat];
      if (!hero || !heroInPlay(hero)) continue;
      if (distance(hero.pos, gate.pos) > GATES.enterRadius) continue;
      gate.entered = true;
      state.events.push({
        type: "gateEntered",
        pos: { ...gate.pos },
        to: gate.to,
        solo: true,
        seat,
      });
      continue;
    }
    if (!anyHeroWithin(state, gate.pos, GATES.enterRadius)) continue;
    gate.entered = true;
    state.events.push({
      type: "gateEntered",
      pos: { ...gate.pos },
      to: gate.to,
    });
  }
}

/** Which seat a torn seam belongs to, read off its id (`rift_seam_home_<n>` —
 * see rift-tool.ts), or null when the id is not one. */
function soloSeatFor(gateId: string): number | null {
  const match = /^rift_seam_home_(\d+)$/.exec(gateId);
  if (!match) return null;
  const seat = Number(match[1]);
  return Number.isInteger(seat) ? seat : null;
}

/**
 * Does THIS MOB have the card for this door on it?
 *
 * Derived from what it is CARRYING (`loot.storyItems` → the item's `unlocks`)
 * rather than from a pass list of its own, because those are the same fact said
 * twice and the second copy is the one that goes stale. It also makes the rule
 * the player can see: the door answers to the card, the card is on the body, so
 * the mob the door opens for is exactly the mob you can take it from.
 */
function enemyHoldsKeyFor(enemy: Enemy, doorId: string): boolean {
  const carried = enemyDef(enemy.defId).loot?.storyItems;
  if (!carried) return false;
  return carried.some((id) => storyItemDef(id).unlocks === doorId);
}

/**
 * Doors: a KEY door opens for the party carrying the matching key up to it;
 * an APPROACH door (an office door, the garage door) opens for anybody who
 * simply comes near — on foot here, or driven at by the car (vehicles.ts calls
 * `openDoor` with the car's own position).
 *
 * AND THE STAFF WALK THROUGH THEIR OWN BUILDING. Once a floor is cut into rooms
 * with real doors in the doorways (`MapArea.doors`), a door that only ever
 * opened for the hero is a door every guard on the night shift is stuck behind:
 * the sentry pacing his round walks into it, the pack chasing the hero stops at
 * it, and the building reads as a set rather than as a place with people in it.
 * So an approach door opens for a mob exactly as it does for the hero — it is an
 * automatic door and they have badges — and a KEY door opens for a mob that is
 * carrying that key.
 *
 * The keyed half sounds like it should give the vault away, and does not, for a
 * geometric reason worth stating: `DOORS.openRadius` is 40 px and a set piece is
 * placed and paces well inside its room's walls, so nothing wanders a card up to
 * a door. What it takes is a mob that has a REASON to cross that threshold —
 * which, since the only thing mobs walk toward is the hero, means the hero is
 * already standing there.
 */
export function stepDoors(state: GameState, dtMs = 0): void {
  for (const door of state.doors) {
    // A ROLL-UP IS STILL IN THE WAY WHILE IT IS ROLLING (`DoorState.rollingMs`)
    // — the chain is dropped the moment the opener fires, because the slats are
    // drawn by the animation from there on, but the hole is not a hole until
    // the travel is done. Counted here rather than in the car's own step so a
    // door opened by a man on foot has already finished by the time he comes
    // back for the wagon.
    if (door.rollingMs !== undefined) {
      door.rollingMs -= dtMs;
      if (door.rollingMs <= 0) delete door.rollingMs;
    }
    if (door.open) {
      stepClosingDoor(state, door, dtMs);
      continue;
    }
    const keyed = !door.approach;
    if (
      (!keyed || holdsKeyFor(state, door.id)) &&
      anyHeroWithin(state, door.center, DOORS.openRadius)
    ) {
      openDoor(state, door);
      continue;
    }
    // …AND FOR SOMEBODY LETTING THEMSELVES IN. A giver still walking in
    // (`QuestGiver.to`, see `QuestGiverDef.arrive`) is crossing ground with a
    // door in it, and the whole read of the garage's beat is that Ada's mother
    // opens the roll-up herself — she has had a key to it for years. Only while
    // she is ARRIVING: a giver standing at her spot is not leaning on the
    // opener, and a hub door held permanently up by the furniture would take
    // the roll-up out of the picture entirely.
    if (
      !keyed &&
      state.questGivers.some(
        (giver) =>
          giver.to !== undefined &&
          distance(giver.pos, door.center) <= DOORS.openRadius,
      )
    ) {
      openDoor(state, door);
      continue;
    }
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      if (keyed && !enemyHoldsKeyFor(enemy, door.id)) continue;
      // The mob's own bulk counts: a wide body standing IN a doorway has its
      // centre further out than a hero's would be, and a door that refused to
      // open for something already filling it is the one bug this cannot afford.
      const reach = DOORS.openRadius + enemyDef(enemy.defId).radius;
      if (distance(enemy.pos, door.center) > reach) continue;
      openDoor(state, door);
      break;
    }
  }
}

/**
 * Slide a door open: its obstacle chain vanishes for good, the leaves are left
 * standing in the jambs if the door has art for that, the autopilot's nav grid
 * is told (`obstaclesVersion` — a wall that disappears without the bump is a
 * wall the bot still routes around), and the app hears which KIND of door
 * moved: `garageDoorOpened` drives the roll-up animation, `doorOpened` the
 * plain slide.
 */
export function openDoor(
  state: GameState,
  door: GameState["doors"][number],
  holdMs?: number,
): void {
  if (door.open) return;
  door.open = true;
  // A ROLL-UP HAS TRAVEL TO DO, and for the length of it the doorway is still
  // full of slats — drawn by the animation, since the chain below is dropped on
  // this very tick. Only the car reads it (`collideCarBody`): a man ducks under
  // a door that is on its way up, a wagon does not.
  if (door.rollUp) door.rollingMs = DOORS.rollUpMs;
  const gone = new Set(door.obstacleIds);
  // A GATE KEEPS ITS OWN CHAIN. `holdMs` says this door shuts again, so the
  // slats are set aside rather than dropped: putting them back is the whole of
  // closing it, and rebuilding them from the door's ends would have to
  // re-derive a spacing the carve already solved.
  if (holdMs !== undefined) {
    door.shut = state.obstacles.filter((o) => gone.has(o.id));
    door.closeMs = holdMs;
  }
  state.obstacles = state.obstacles.filter((o) => !gone.has(o.id));
  state.obstaclesVersion++;
  // THE LEAVES STAY. A doorway whose door simply disappears is a hole in a
  // wall, and a building of them reads as a floor plan with the doors deleted —
  // which is exactly what an interior looked like before this. The open frames
  // are flat scenery at the two ENDS of the chain (where the leaves went), so
  // they are drawn but never stood in the way of again.
  //
  // A GATE GETS THEM TOO, AND GIVES THEM BACK. It is the one door that shuts
  // again, so its leaves are laid down for the length of the hold rather than
  // for good (`shutGate` takes them away with the same hand that puts the slats
  // back) — and it is the door that needs them MOST. A gate whose whole
  // vocabulary is one moment has to say which of its two modes it is in from
  // across the tarmac, and for as long as OPEN was drawn as nothing at all,
  // "the way in is open right now" was a fact the player could only learn by
  // walking at it.
  if (door.openSprite && door.from && door.to) {
    for (const pos of [door.from, door.to])
      state.decor.push({
        kind: door.openSprite,
        sprite: door.openSprite,
        pos: { x: pos.x, y: pos.y },
      });
  }
  state.events.push({
    type: door.rollUp ? "garageDoorOpened" : "doorOpened",
    pos: { ...door.center },
  });
}

/**
 * ONE TICK OF A DOOR THAT IS STANDING OPEN — and all but one kind of door has
 * nothing to do here, because opening is the last thing they ever do.
 *
 * A GATE is the exception (`DoorState.closeMs`, set by the badge in
 * arrivals.ts): it runs its hold down and then puts its own slats back, which
 * is what makes the way into GOODCO a moment the hero has to take rather than a
 * wall that eventually moves.
 *
 * IT WILL NOT SHUT ON ANYBODY. The clock is held — not spent — while a body is
 * standing in the opening, hero or otherwise: the staffer whose badge opened it
 * is walking through it, and a gate that closed on the man it just admitted
 * would be a gate that teleports him. Held rather than cancelled, so the moment
 * the threshold is clear it shuts on the next tick.
 */
/**
 * IS ANYBODY STANDING IN THIS DOORWAY? — the question a gate has to answer
 * before it shuts, and it is about the HOLE, not about the neighbourhood.
 *
 * A CIRCLE ROUND THE DOOR'S CENTRE IS THE WRONG SHAPE, and it was the shape
 * this used: the doorway's half-span plus `DOORS.openRadius`, which reaches as
 * far INTO the building as it does across the opening. GOODCO parks the
 * scripted rusher a step past its entrance (`clearTheLobby` walks it back to
 * `ARRIVALS.insideStep`), so on the seeds where it settles nearest the gate it
 * stood inside that circle for the whole run — and the gate that the entire
 * venue is built around, the one whose second and a half the player has to
 * take, opened once and never shut again. Nobody was ever in its way.
 *
 * So the test is the OPENING's own box: how far along the chain a body is
 * (which is what "in the hole" means across it) and how far off the wall plane
 * (which is what "in it" means through it). A leaf's own thickness on each,
 * plus the body's radius, so a person clear of the slab is clear.
 *
 * It fails back to the circle on a door with no chain geometry to read — there
 * are none today, and a gate that guesses wrong is better than a gate that
 * guillotines.
 */
function doorwayIsBlocked(
  state: GameState,
  door: GameState["doors"][number],
): boolean {
  const from = door.from;
  const to = door.to;
  const len = from && to ? distance(from, to) : 0;
  if (!from || !to || len === 0) {
    const reach = DOORS.openRadius;
    return (
      anyHeroWithin(state, door.center, reach) ||
      state.enemies.some(
        (e) => e.hp > 0 && distance(e.pos, door.center) <= reach,
      )
    );
  }
  // Along the chain, and across it — the leaf's own half-thickness on both, so
  // the box is the hole the door fills rather than a point at its middle.
  const ax = (to.x - from.x) / len;
  const ay = (to.y - from.y) / len;
  const leaf = door.shut?.[0]?.radius ?? 0;
  const half = len / 2 + leaf;
  const standing = (pos: Vec2, radius: number): boolean => {
    const dx = pos.x - door.center.x;
    const dy = pos.y - door.center.y;
    return (
      Math.abs(dx * ax + dy * ay) <= half + radius &&
      Math.abs(dy * ax - dx * ay) <= leaf + radius
    );
  };
  return (
    state.players.some(
      (hero) => heroInPlay(hero) && standing(hero.pos, PLAYER.radius),
    ) ||
    state.enemies.some(
      (e) => e.hp > 0 && standing(e.pos, enemyDef(e.defId).radius),
    )
  );
}

function stepClosingDoor(
  state: GameState,
  door: GameState["doors"][number],
  dtMs: number,
): void {
  if (door.closeMs === undefined || !door.shut) return;
  const blocked = doorwayIsBlocked(state, door);
  if (blocked) return;
  door.closeMs -= dtMs;
  if (door.closeMs > 0) return;
  door.open = false;
  delete door.closeMs;
  state.obstacles = state.obstacles.concat(door.shut);
  delete door.shut;
  // …AND THE OPEN LEAVES COME BACK OUT OF THE JAMBS. `openDoor` lays a pair of
  // them where the chain's two ends stood, which for every other door in the
  // game is the last thing that ever happens to that doorway; a gate has to
  // undo it, or it stands there closed with a pair of open leaves beside it and
  // a fresh pair after every badge.
  //
  // Matched by WHAT and WHERE rather than by identity: a snapshot crossing the
  // wire and coming back is a different object holding the same two facts, and
  // a gate that could not find its own leaves after a reconnect would litter
  // one pair per swipe for the rest of the run.
  if (door.openSprite && door.from && door.to) {
    const ends = [door.from, door.to];
    state.decor = state.decor.filter(
      (piece) =>
        piece.kind !== door.openSprite ||
        !ends.some((end) => end.x === piece.pos.x && end.y === piece.pos.y),
    );
  }
  // A wall that reappears without the bump is a wall the autopilot walks
  // straight through, exactly as one that vanishes without it is one it keeps
  // routing around.
  state.obstaclesVersion++;
  // WHICH KIND OF DOOR SHUT, told the same way the opening tells it
  // (`garageDoorOpened` / `doorOpened` above): a roll-up coming back down is
  // the chain drive again and a plain door is a leaf swinging to, and a sound
  // catalog routes on the event's own type.
  state.events.push({
    type: door.rollUp ? "garageDoorClosed" : "doorClosed",
    pos: { ...door.center },
  });
}
