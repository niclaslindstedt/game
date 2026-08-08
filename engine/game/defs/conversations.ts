// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CONVERSATIONS — the talks the hero STEERS, as opposed to the scenes played
// at him.
//
// Every other spoken thing in this game is a monologue with a NEXT button: an
// elite's arrival, a boss's reveal, a pinned thought, a quest offer. The player
// reads it and taps it away, and nothing he does changes a word of it. That is
// right for a story beat and wrong for the one situation a quest chain
// eventually needs — a person who has something the hero wants and no reason to
// hand it over. The answer to that is not a longer monologue, it is a CHOICE:
// ask straight, lie, threaten, flatter, or say the one thing that makes this
// go badly. A conversation is a tree of what the speaker says and what the hero
// may say back, and the branch the player picks is the mechanic.
//
// WHAT A BRANCH MAY ACTUALLY DO IS DELIBERATELY SMALL — four things, and no
// scripting hook, because a mod ships these files (see mod/FORMAT.md) and
// "subscribe to a mod" must never mean "run a stranger's code":
//
//   1. SET A FLAG. The whole bridge to the rest of the game. A flag is a
//      string on the run (`GameState.questFlags`), an objective can require
//      one, and another branch can be gated on one — which is how a
//      conversation remembers what it was told, how a quest knows the hero
//      learned the passphrase, and how a second talk opens on a different
//      node from the first.
//   2. PROVOKE THE SPEAKER. A neutral mob turns hostile (`provokeEnemy`), and
//      the man you were talking to is a fight. The one irreversible branch in
//      the system, which is exactly why it is worth having.
//   3. HAND OVER A QUEST PIECE. The speaker gives the hero something a
//      `collect` objective is counting.
//   4. GO SOMEWHERE, OR STOP. `goto` walks to another node; no `goto` ends it.
//
// Everything else a conversation appears to do is one of those four wearing a
// costume. That is a feature: the branch that "convinces the assessor his
// tithe was underpaid" sets a flag, and the merchant reads the flag. Nothing
// in the tree knows what a merchant is.
//
// The catalog is authored in `content/conversations/<id>.yaml` and compiled
// into `engine/generated/quests.ts` by the QUEST pipeline — the same generator,
// because a conversation exists to move a quest along and splitting it into a
// pipeline of its own would buy a second schema to keep in step and nothing
// else.

import { GENERATED_CONVERSATIONS } from "../../generated/quests.ts";

/**
 * ONE THING THE HERO MAY SAY. Rows are shown in authored order, and only the
 * ones whose gates pass are shown at all — a choice the player cannot take is
 * a choice better left off the list than greyed out, because a greyed row
 * still tells him a secret he has not earned.
 */
export type ConversationChoice = {
  /** What the hero says — the row the player picks. */
  text: string;
  /**
   * Shown only while EVERY one of these run flags is set. The usual use is
   * knowledge: an answer the hero could not give before he was told something.
   */
  requires?: readonly string[];
  /** Shown only while NONE of these are set — how an answer is spent. */
  forbids?: readonly string[];
  /** Where the talk goes next. Omitted ENDS it (the walk-away row). */
  goto?: string;
  /** Run flags this answer sets. The bridge to the quest log. */
  sets?: readonly string[];
  /**
   * Turn the speaker hostile — a neutral mob only, and the one branch that
   * cannot be taken back. The conversation closes on it: there is nobody left
   * to talk to.
   */
  provoke?: boolean;
  /** A quest piece the speaker hands over on this answer. */
  gives?: { quest: string; item: string };
};

/** ONE THING THE SPEAKER SAYS, and what may be said back. */
export type ConversationNode = {
  /** Unique within the conversation; what `goto` and `start` name. */
  id: string;
  /** The speaker's lines — one string per line, paged like every other scene. */
  say: readonly string[];
  /**
   * The hero's options once the lines are read. Omitted (or empty) ends the
   * conversation after the last line, which is how a node is used as a plain
   * reply rather than as a fork.
   */
  choices?: readonly ConversationChoice[];
};

/** A re-entry: opening this talk again lands here instead of at `start`. */
export type ConversationEntry = {
  /** Every one of these run flags must be set for this entry to win. */
  requires: readonly string[];
  /** The node it opens on. */
  node: string;
};

/**
 * ONE CONVERSATION. Named by a neutral mob (`EnemyDef.conversation`) or by a
 * quest giver's errand, and opened by walking up and talking.
 */
export type ConversationDef = {
  id: string;
  /**
   * The node a first talk opens on.
   *
   * RE-ENTRY IS THE FIELD BESIDE IT, and it exists because a person who
   * greets you with the same sentence after you have done what they asked is
   * a vending machine. `reentry` is scanned in authored order and the FIRST
   * whose flags are all set wins, so the specific case is authored above the
   * general one; nothing matching falls back to `start`.
   */
  start: string;
  reentry?: readonly ConversationEntry[];
  /** Every node, in authored order. */
  nodes: readonly ConversationNode[];
};

export const CONVERSATION_DEFS: Record<string, ConversationDef> =
  GENERATED_CONVERSATIONS;

// Active registry the accessors read (defaults to the shipped catalog; tests
// and mods swap in their own via `registerDefs`). See engine/index.ts.
let activeConversationDefs: Record<string, ConversationDef> = CONVERSATION_DEFS;

/** Test/authoring hook: replace the active conversation catalog. */
export function setConversationDefs(
  defs: Record<string, ConversationDef>,
): void {
  activeConversationDefs = defs;
}

/** Look up a conversation; throws on a broken id so bugs surface loudly. */
export function conversationDef(id: string): ConversationDef {
  const def = activeConversationDefs[id];
  if (!def) throw new Error(`unknown conversation def "${id}"`);
  return def;
}

/** Is there such a conversation? (A saved run may name a mod's.) */
export function hasConversation(id: string): boolean {
  return activeConversationDefs[id] !== undefined;
}

/** One node of a conversation, or null when either id is unknown. */
export function conversationNode(
  defId: string,
  nodeId: string,
): ConversationNode | null {
  const def = activeConversationDefs[defId];
  return def?.nodes.find((n) => n.id === nodeId) ?? null;
}
