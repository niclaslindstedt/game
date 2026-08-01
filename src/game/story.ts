// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The story systems: in-world dialogue (elite ambushes, boss confrontations,
// unique-mob last words, story-item lore) and the locked doors their keys
// open. Dialogue freezes
// the run in the `dialogue` phase — `step()` refuses to advance anything but
// `playing` — and `advanceDialogue` is the player's tap, safe to call from
// the app outside `step()` exactly like the inventory mutators.

import { createCutscene } from "@game/lib/cutscene.ts";
import { distance, type Vec2 } from "@game/lib/vec.ts";
import { DIALOGUE, DOORS, GATES } from "./config/index.ts";
import { companionDef } from "./defs/companions.ts";
import { cutsceneDef } from "./defs/cutscenes.ts";
import { MERCHANT_RETURN_SENDOFF } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import type { DialoguePage } from "./defs/enemies/types.ts";
import { levelDef, runLevelDef } from "./defs/levels/index.ts";
import type { ThoughtTrigger } from "./defs/levels/types.ts";
import { storyItemDef } from "./defs/story.ts";
import { capThoughtIds, thoughtDef } from "./defs/thoughts.ts";
import { knockEnemyBack } from "./knockback.ts";
import { xpLevelCap } from "./leveling.ts";
import { addMapMarker } from "./map.ts";
import { menaceStage } from "./menace.ts";
import { anyHeroWithin } from "./party.ts";
import type { DialogueState, Enemy, GameState } from "./types/index.ts";

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
 * `title` phase a SKIP lands on) — see `create.ts` for the muted opening.
 */
export function advanceCutsceneChain(state: GameState): void {
  const next = state.cutsceneQueue.shift();
  if (next) {
    state.cutscene = createCutscene(cutsceneDef(next));
  } else {
    state.cutscene = null;
    state.phase = state.dialogueMuted ? "title" : "intro";
  }
}

/** The name over the hero's own words, wherever in a scene he speaks. */
const HERO_SPEAKER = "ME";

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

/**
 * The text behind a running dialogue: who is on stage and every page of
 * what they say. The app renders `pages[dialogue.page]`; tests assert on
 * the lot. `voices` runs parallel to `pages` and says who delivers each one —
 * the scene's owner, or the other party in a two-way beat (the hero's replies
 * in an arrival scene; a mob answering back in one of his own monologues).
 * `speaker`/`portrait` remain the SCENE's owner, for anything that wants to
 * name the scene rather than the page.
 */
export function dialogueContent(dialogue: DialogueState): {
  speaker: string;
  /** Sprite/icon key for the speaker's portrait. */
  portrait: string;
  pages: string[][];
  voices: DialogueVoice[];
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
 * resumes. A GROUP verb — anyone in the party may advance the beat (plan
 * §3.2). Banked level-up points stay banked; the HUD pip carries the
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
  if (state.players[0].level < cap) return;
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
    const radius = trigger.radius ?? DIALOGUE.sightRadius;
    const seen = state.enemies.some(
      (e) =>
        e.defId === trigger.enemy &&
        distance(e.pos, state.players[0].pos) <= radius,
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
  if (state.dialogue !== null || !state.players[0].disarmed) return;
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
  const striker = vanguards.find(
    (e) =>
      (e.knockMs ?? 0) <= 0 && distance(e.pos, state.players[0].pos) <= radius,
  );
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
  if (striker && pending !== undefined) {
    // He takes it — the flash, no HP, exactly as the arming blow costs none.
    state.players[0].hurtFlashMs = 250;
    state.events.push({ type: "playerHurt", crit: false });
    // …and shoves the man off rather than swinging at him. The recoil is what
    // makes the NEXT blow a separate event: the trigger is contact, so a
    // striker left parked on the hero would satisfy it again the instant the
    // player tapped this beat closed.
    knockEnemyBack(
      striker,
      state.players[0].pos,
      DIALOGUE.strikeRecoilSpeed,
      DIALOGUE.strikeRecoilMs,
    );
    state.thoughtsSeen.push(pending);
    startPlayerThought(state, pending);
    return;
  }

  // Draw the blade: combat is live from here on.
  state.players[0].disarmed = false;
  // The soft first hit is a flash, no HP — but a vanguard cut down before it
  // arrived landed no blow, so there is nothing to flash for the death path.
  if (struck) {
    state.players[0].hurtFlashMs = 250;
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
    distance(enemy.pos, state.players[0].pos) <= DIALOGUE.speakRadius
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
    // ANY hero steps through for the party — a gate is a doorway, not a
    // turnstile, and the app answers the crossing for the whole run.
    if (!anyHeroWithin(state, gate.pos, GATES.enterRadius)) continue;
    gate.entered = true;
    state.events.push({
      type: "gateEntered",
      pos: { ...gate.pos },
      to: gate.to,
    });
  }
}

/**
 * Doors: a KEY door opens for the party carrying the matching key up to it;
 * an APPROACH door (the garage door) opens for anybody who simply comes
 * near — on foot here, or driven at by the car (vehicles.ts calls
 * `openDoor` with the car's own position).
 */
export function stepDoors(state: GameState): void {
  for (const door of state.doors) {
    if (door.open) continue;
    if (!door.approach && !holdsKeyFor(state, door.id)) continue;
    if (!anyHeroWithin(state, door.center, DOORS.openRadius)) continue;
    openDoor(state, door);
  }
}

/**
 * Slide a door open: its obstacle chain vanishes for good, the autopilot's
 * nav grid is told (`obstaclesVersion` — a wall that disappears without the
 * bump is a wall the bot still routes around), and the app hears which KIND
 * of door moved: `garageDoorOpened` drives the roll-up animation, `doorOpened`
 * the vault slide.
 */
export function openDoor(
  state: GameState,
  door: GameState["doors"][number],
): void {
  if (door.open) return;
  door.open = true;
  const gone = new Set(door.obstacleIds);
  state.obstacles = state.obstacles.filter((o) => !gone.has(o.id));
  state.obstaclesVersion++;
  state.events.push({
    type: door.approach ? "garageDoorOpened" : "doorOpened",
    pos: { ...door.center },
  });
}
