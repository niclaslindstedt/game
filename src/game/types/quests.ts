// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The QUEST runtime: the people standing on the map, the log of what the hero
// has taken on, and the bodies an escort errand puts on the field.
//
// The DEFS (what an errand asks for and pays) live in defs/quests.ts; these are
// the mutable halves that ride the run and serialize with a saved game.

import type { Vec2 } from "@game/lib/vec.ts";

/**
 * WHERE ONE ERRAND HAS GOT TO.
 *
 * `offered` is the state a quest sits in before it has been taken — it is NOT
 * "the modal is open": the modal is `GameState.questOffer`, and a quest can be
 * offerable for the whole run without the player ever accepting it. `declined`
 * is remembered separately from `offered` for one reason: an offer AUTO-OPENS
 * the first time the hero walks up, and a player who said no must not be asked
 * again every time they cross the same ground. They can still tap the giver.
 */
export type QuestStatus =
  "offered" | "declined" | "active" | "complete" | "turnedIn" | "failed";

/** One errand's live state. Absent from the log = never offered. */
export type QuestProgress = {
  /** QUEST_DEFS id. */
  id: string;
  status: QuestStatus;
  /**
   * Tally per objective, parallel to `QuestDef.objectives`. A `kill` counts
   * corpses, a `collect` counts pieces in hand, a `killNamed` and an `escort`
   * are 0 or 1 — one shape for every objective so the tracker needs no union.
   */
  counts: number[];
  /**
   * Kills of a carrying breed since the last quest-item drop, per objective —
   * the PITY counter behind `QUESTS.dropPity`. Parallel to `counts`.
   */
  dryKills: number[];
  /**
   * Sim ms the errand was accepted at, so the tracker can list what was taken
   * on most recently at the top.
   */
  acceptedAtMs: number;
};

/**
 * SOMEBODY STANDING ON THE MAP WITH SOMETHING TO ASK. Built at level creation
 * from `giversForLevel`; the horde is warded off them and nothing can hurt
 * them.
 */
export type QuestGiver = {
  /** QUEST_GIVER_DEFS id. */
  id: string;
  pos: Vec2;
  /** Sprite mirror, so they turn to face the hero they are talking to. */
  faceLeft: boolean;
  /** Latched the first time the hero comes near — pins them on the level map. */
  discovered: boolean;
  /**
   * Quest ids whose offer has already AUTO-OPENED this run. A conversation
   * starts itself exactly once per errand; after that it is a tap.
   */
  autoOffered: string[];
};

/**
 * THE MARK OVER A GIVER'S HEAD, which is the whole discoverability story: a
 * yellow `!` means there is an errand here to take, a yellow `?` means one is
 * finished and wants handing in, a grey `?` means one is running, and `none`
 * means this person has nothing left to say. Derived every tick by
 * `giverMark`, never stored — a stored mark is a mark that goes stale the
 * moment a kill completes an objective off screen.
 */
export type QuestMark = "none" | "offer" | "progress" | "turnIn";

/**
 * ONE THING A GIVER HAS TO SAY — a row of the pick list. `kind` is what
 * picking it opens, and it is also what the row's mark reads as: a gold `!`
 * for work to take, a gold `?` for work to hand in, a grey `?` for work
 * already running.
 */
export type QuestTopic = {
  questId: string;
  kind: "offer" | "incomplete" | "complete";
};

/**
 * THE CONVERSATION ON SCREEN. Non-null exactly while `phase === "quest"`; the
 * run is frozen behind it, like the shop and the bag.
 *
 * A person with MORE THAN ONE thing to say opens on the `list` — WoW's gossip
 * window — and the player picks which errand to hear about. That indirection
 * exists because the alternative is worse in a specific way: handing back one
 * quest at a time means a giver's second errand is only reachable by refusing
 * the first, which reads as the game losing track of what it already offered.
 * With exactly one topic the list is skipped entirely, because a menu of one is
 * a menu nobody wants.
 */
export type QuestOffer = {
  /**
   * QUEST_DEFS id being discussed. Absent on the `list`, which is about the
   * PERSON rather than any one errand.
   */
  questId?: string;
  /** QUEST_GIVER_DEFS id doing the talking. */
  giverId: string;
  /**
   * Which conversation this is: the PICK LIST, the ask (with ACCEPT /
   * DECLINE), the nag when the hero comes back short, or the handover (with a
   * REWARD panel).
   */
  kind: "list" | "offer" | "incomplete" | "complete";
  /** Which page of the speech is on screen (unused by the `list`). */
  page: number;
  /**
   * This conversation was reached by PICKING it off the list, so backing out
   * of it — declining, closing, or finishing the business — returns there
   * rather than to the field. Without it a giver with three errands costs
   * three walk-ups.
   */
  fromList?: boolean;
};

/**
 * A BODY ON THE FIELD THE HERO IS RESPONSIBLE FOR. One per running `escort`
 * objective. It walks toward the hero (never onto him), stops when left
 * behind, and the horde can reach it — which is the entire tension of the
 * errand: the fight and the follower want opposite things from the player.
 */
export type EscortState = {
  id: number;
  /** The quest that owns it, and the `QuestEscortDef` id within that quest. */
  questId: string;
  defId: string;
  pos: Vec2;
  hp: number;
  maxHp: number;
  /** Where it is being walked to. */
  to: Vec2;
  faceLeft: boolean;
  /** True while it walked this step; drives the walk animation. */
  moving: boolean;
  /** Ms until the horde may land another contact blow on it. */
  hitCooldownMs: number;
  /** Latched once it reaches `to` — the objective is met and it stops. */
  arrived: boolean;
  /**
   * True while the hero has walked out past `QUESTS.escortLeashDistance` and
   * it has planted itself. Purely a read for the tracker and the app's label
   * ("WAITING") — the walk logic re-derives it every tick.
   */
  waiting: boolean;
};
