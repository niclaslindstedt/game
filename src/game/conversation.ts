// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TALK — running a conversation tree (defs/conversations.ts) against a
// body standing on the field.
//
// THREE RULES SHAPE THIS MODULE.
//
// 1. **A BYSTANDER IS TAPPED, NEVER TRIGGERED.** A quest giver's offer opens
//    itself on approach, because an errand nobody notices is an errand nobody
//    takes and there are two givers on a map. A NEUTRAL MOB is the opposite
//    case: a venue may have a dozen of them and the hero walks past bystanders
//    constantly, so a conversation that opened itself would be a stream of
//    modals over a fight. It waits for the same deliberate tap the merchant's
//    stall waits for, and `talkPrompt` is what tells the app to draw the cue.
//
// 2. **THE FLAGS ARE THE ONLY THING THAT LEAVES.** A branch may set a flag,
//    provoke the speaker, hand over a piece, or move to another node — and
//    that is all (see the catalog's header for why the list is short and
//    closed). Everything a conversation appears to accomplish elsewhere in the
//    game is something ELSE reading a flag: an objective that requires one, a
//    merchant whose stall unlocks on one, a later branch gated on one. Nothing
//    in this file knows what a quest or a stall is.
//
// 3. **A CONVERSATION IS RE-ENTRANT AND NEVER RESETS.** Walking away mid-tree
//    and coming back re-enters at whichever `reentry` the flags have earned,
//    so a person who has already told you something does not tell you again
//    from the top. That is also the whole memory the system has: there is no
//    saved cursor, because a cursor would have to be persisted, merged and
//    version-migrated to say what three flags already say.

import { distance } from "@game/lib/vec.ts";

import { QUESTS } from "./config/index.ts";
import {
  conversationDef,
  conversationNode,
  hasConversation,
  type ConversationChoice,
  type ConversationNode,
} from "./defs/conversations.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { questGiverDef } from "./defs/quests.ts";
import { isNeutral, provokeEnemy } from "./disposition.ts";
import { dropItem } from "./items/index.ts";
import { lineOfSight } from "./obstacles.ts";
import type {
  Enemy,
  GameState,
  Player,
  TalkSpeaker,
} from "./types/index.ts";

// ------------------------------------------------------------------ the flags

/**
 * SET A RUN FLAG. The one write path, so the `questFlagSet` event is emitted
 * exactly once per flag however many branches claim to set it — an objective
 * watching for it must not be credited twice by a player who re-reads a page.
 */
export function setQuestFlag(state: GameState, flag: string): boolean {
  if (state.questFlags[flag]) return false;
  state.questFlags[flag] = true;
  state.events.push({ type: "questFlagSet", flag });
  return true;
}

/** Is this run flag set? */
export function hasQuestFlag(state: GameState, flag: string): boolean {
  return state.questFlags[flag] === true;
}

/** Are every one of these flags set? (An empty list is vacuously true.) */
export function hasAllFlags(
  state: GameState,
  flags: readonly string[] | undefined,
): boolean {
  return (flags ?? []).every((f) => hasQuestFlag(state, f));
}

// ------------------------------------------------------------ opening a talk

/**
 * The nearest body the hero could TALK TO right now, or null. A neutral mob
 * within tap range, in sight, carrying a conversation. Read by the app to draw
 * the prompt over a head and to route the tap — the same shape the merchant's
 * own proximity check takes.
 */
export function talkPrompt(state: GameState, hero: Player): Enemy | null {
  if (state.phase !== "playing") return null;
  let best: Enemy | null = null;
  let bestDist: number = QUESTS.talkRadius;
  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    if (!def.conversation || !isNeutral(def, enemy)) continue;
    if (!hasConversation(def.conversation)) continue;
    const d = distance(hero.pos, enemy.pos);
    if (d > bestDist) continue;
    if (!lineOfSight(state, hero.pos, enemy.pos)) continue;
    best = enemy;
    bestDist = d;
  }
  return best;
}

/**
 * OPEN A CONVERSATION with a neutral mob on the TAPPING hero's screen (plan
 * §3.2 — the rest of the party plays on, exactly as a quest offer). ONE talk
 * at a time, party-wide: the tree record lives on the run. False when there
 * is nobody to talk to or something else already holds the stage, so a stray
 * tap is simply ignored.
 */
export function talkToEnemy(
  state: GameState,
  hero: Player,
  enemyId: number,
): boolean {
  if (state.phase !== "playing" || state.dialogue !== null) return false;
  if (hero.screen !== undefined) return false;
  if (state.talk !== null || state.questOffer !== null) return false;
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return false;
  const def = enemyDef(enemy.defId);
  if (!def.conversation || !isNeutral(def, enemy)) return false;
  if (distance(hero.pos, enemy.pos) > QUESTS.tapRadius) return false;
  return openConversation(state, hero, def.conversation, {
    kind: "enemy",
    id: enemy.id,
    name: def.name,
    sprite: def.sprite,
  });
}

/**
 * OPEN A CONVERSATION with a quest giver — the same tree machinery, aimed at
 * somebody who also hands out errands. Used by a giver whose talk is a
 * conversation rather than a plain offer.
 */
export function talkToGiverTree(
  state: GameState,
  hero: Player,
  giverId: string,
  conversationId: string,
): boolean {
  if (state.phase !== "playing" || state.dialogue !== null) return false;
  if (hero.screen !== undefined) return false;
  if (state.talk !== null || state.questOffer !== null) return false;
  const giver = questGiverDef(giverId);
  return openConversation(state, hero, conversationId, {
    kind: "giver",
    id: giverId,
    name: giver.name,
    sprite: giver.sprite,
  });
}

/** Put a conversation on this hero's screen at whichever node its flags have
 * earned. */
function openConversation(
  state: GameState,
  hero: Player,
  defId: string,
  speaker: TalkSpeaker,
): boolean {
  if (!hasConversation(defId)) return false;
  const def = conversationDef(defId);
  // Re-entry in AUTHORED ORDER, first match wins: the specific case is written
  // above the general one, so "you already have the seal" beats "we have met".
  const entry = (def.reentry ?? []).find((r) => hasAllFlags(state, r.requires));
  const nodeId = entry?.node ?? def.start;
  if (!conversationNode(defId, nodeId)) return false;
  state.talk = { defId, node: nodeId, speaker };
  hero.screen = "talk";
  state.events.push({ type: "talkOpened", defId, node: nodeId });
  return true;
}

// ------------------------------------------------------------ running a talk

/** The node the open conversation is sitting on, or null when none is. */
export function talkNode(state: GameState): ConversationNode | null {
  const talk = state.talk;
  return talk ? conversationNode(talk.defId, talk.node) : null;
}

/**
 * THE ROWS THE PLAYER MAY ACTUALLY PICK, gates applied. A choice whose
 * `requires` are unmet (or whose `forbids` are set) is left OUT rather than
 * greyed: a greyed row is still a sentence, and a sentence the hero has not
 * earned is a spoiler printed in the shape of a locked door.
 */
export function talkChoices(state: GameState): ConversationChoice[] {
  const node = talkNode(state);
  if (!node) return [];
  return (node.choices ?? []).filter(
    (choice) =>
      hasAllFlags(state, choice.requires) &&
      !(choice.forbids ?? []).some((f) => hasQuestFlag(state, f)),
  );
}

/**
 * TAP THE BOX. A node's `say` is ONE page — the whole speech at once, the way
 * every other scene in this game shows a page — so there is nothing to page
 * through and this is only ever the answer to "the speaker has finished and
 * there is nothing to choose": it closes the talk.
 *
 * A node that wants a second page is TWO nodes with a `goto` between them,
 * which is strictly better than a page counter: the second half becomes
 * addressable, so a `reentry` can drop the player straight into it.
 *
 * A node WITH choices ignores this — a conversation that closed itself on the
 * last line would eat the decision it exists for.
 */
export function advanceTalk(state: GameState, hero: Player): void {
  if (hero.screen !== "talk") return;
  if (!state.talk || !talkNode(state)) return;
  if (talkChoices(state).length === 0) closeTalk(state, hero);
}

/**
 * TAKE A BRANCH — the whole mechanic, in the order the four effects have to
 * happen:
 *
 *   flags first, because a `goto` may land on a node whose own choices are
 *   gated on the flag this answer just set; then the hand-over; then the
 *   PROVOKE, which closes the talk outright because there is nobody left to
 *   talk to; then the move (or the end).
 *
 * `index` indexes the FILTERED list (`talkChoices`), which is what the app
 * drew — indexing the authored list would pick a different row than the one
 * the player tapped the moment any gate is in play. False for a row that is
 * not there, so a stale tap is ignored.
 */
export function pickTalkChoice(
  state: GameState,
  hero: Player,
  index: number,
): boolean {
  if (hero.screen !== "talk") return false;
  const talk = state.talk;
  if (!talk) return false;
  const choice = talkChoices(state)[index];
  if (!choice) return false;

  for (const flag of choice.sets ?? []) setQuestFlag(state, flag);

  if (choice.gives)
    giveQuestPiece(state, hero, choice.gives.quest, choice.gives.item);

  if (choice.provoke && talk.speaker.kind === "enemy") {
    const enemy = state.enemies.find((e) => e.id === talk.speaker.id);
    if (enemy) provokeEnemy(state, enemy);
    closeTalk(state, hero);
    return true;
  }

  if (!choice.goto || !conversationNode(talk.defId, choice.goto)) {
    closeTalk(state, hero);
    return true;
  }
  talk.node = choice.goto;
  return true;
}

/** Close the talk. */
export function closeTalk(state: GameState, hero: Player): void {
  if (hero.screen !== "talk") return;
  state.talk = null;
  delete hero.screen;
}

/**
 * Hand a quest piece over across the counter. It is DROPPED at the hero's feet
 * rather than banked directly, so it travels the one path every quest piece
 * travels — the toss, the landing sound, the pickup that credits the tally —
 * and a piece given in conversation is indistinguishable from one prised off a
 * corpse. Nothing here checks the quest is running: the pickup pass already
 * refuses a piece no active errand wants, and refusing it HERE would leave the
 * player holding a branch that silently did nothing.
 */
function giveQuestPiece(
  state: GameState,
  hero: Player,
  questId: string,
  item: string,
): void {
  dropItem(
    state,
    {
      id: state.nextId++,
      kind: "quest",
      pos: { ...hero.pos },
      questId,
      defId: item,
    },
    hero.pos,
  );
}
