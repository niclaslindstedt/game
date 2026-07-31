// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// QUESTS — the errands the field's non-combatants ask of the hero.
//
// The catalogs (what is asked, and by whom) live in defs/quests.ts; the escort
// bodies in ./escort.ts and the payout in ./rewards.ts. This module is the
// orchestrator: it stands the givers up at level creation, decides what each
// one has to say every tick, opens and closes the conversation, and keeps the
// tallies.
//
// FOUR RULES SHAPE EVERYTHING HERE.
//
// 1. **THE LOG IS THE TRUTH; THE MARK IS DERIVED.** `giverMark` recomputes the
//    `!` / `?` over a head from the quest log every time it is asked, and
//    nothing caches it. A stored mark goes stale the instant a kill three
//    rooms away completes an objective, and a `?` that isn't there is a quest
//    the player never hands in.
// 2. **A CONVERSATION STARTS ITSELF EXACTLY ONCE.** Walking up auto-opens the
//    offer, because a quest nobody notices is a quest nobody takes — but a
//    DECLINED offer is remembered (`declined`) and never re-opens on its own.
//    After that it is a tap on the giver, which is the same gesture the shop
//    already uses.
// 3. **PROGRESS IS BOOKED WHERE IT HAPPENS, NOT SCANNED FOR.** `creditQuestKill`
//    is called from `killEnemy` and `creditQuestPickup` from the item pass.
//    Polling the world for "are there still eight assemblers" would be both
//    slower and wrong — the tally must count what the hero DID, not what is
//    left standing.
// 4. **AN ERRAND IS A RUN'S BUSINESS.** The log lives on the run and a fresh
//    run of the same level offers everything again. Quests are pacing and
//    flavour for one visit to a map, not a persistent account the roster has
//    to carry across a content update.

import { distance, type Vec2 } from "@game/lib/vec.ts";

import { QUESTS } from "../config/index.ts";
import { difficultyDef } from "../defs/difficulties.ts";
import type { EnemyDef } from "../defs/enemies/index.ts";
import {
  giversForLevel,
  hasQuest,
  questDef,
  questGiverDef,
  questsForLevel,
  type QuestDef,
  type QuestObjective,
} from "../defs/quests.ts";
import { dropItem } from "../items/index.ts";
import { addMapMarker } from "../map.ts";
import { lineOfSight } from "../obstacles.ts";
import type {
  Enemy,
  GameState,
  QuestGiver,
  QuestMark,
  QuestProgress,
  QuestTopic,
} from "../types/index.ts";
import { clearEscorts, spawnEscort, stepEscorts } from "./escort.ts";
import { questSpot } from "./placement.ts";
import { payQuestReward, type QuestPayout } from "./rewards.ts";

export * from "./campaign.ts";
export * from "./escort.ts";
export * from "./placement.ts";
export * from "./merchant.ts";
export * from "./rewards.ts";

/**
 * Stand this level's givers up at creation. Placed exactly where they are
 * authored — a person with an errand is a landmark, and a landmark that moves
 * between runs cannot be walked back to.
 *
 * `blocked` is the same terrain predicate the merchant's placement takes, and
 * it exists for ONE case: a GENERATED map (see mapgen/) carves fresh geometry
 * under authored coordinates, so a giver's spot can land inside a wall that did
 * not exist when it was written. Rather than drop them — a map with no errands
 * on it — they ring outward to the nearest clear ground. On a hand-authored map
 * the check passes on the first try and nobody moves.
 */
export function createQuestGivers(
  levelId: string,
  blocked?: (pos: Vec2, radius: number) => boolean,
): QuestGiver[] {
  return giversForLevel(levelId).map((def) => ({
    id: def.id,
    pos: clearSpot({ ...def.at }, blocked),
    faceLeft: false,
    discovered: false,
    autoOffered: [],
  }));
}

/** The authored spot, or the nearest clear ground when terrain refuses it. */
function clearSpot(
  at: Vec2,
  blocked?: (pos: Vec2, radius: number) => boolean,
): Vec2 {
  if (!blocked || !blocked(at, QUESTS.radius)) return at;
  for (let ring = 1; ring <= 6; ring++) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const reach = ring * QUESTS.repelRadius * 0.5;
      const candidate = {
        x: at.x + Math.cos(angle) * reach,
        y: at.y + Math.sin(angle) * reach,
      };
      if (!blocked(candidate, QUESTS.radius)) return candidate;
    }
  }
  return at;
}

/**
 * Advance the quest system one tick: meet the givers, open the conversations
 * that open themselves, walk the escorts, and pin what the hero has laid eyes
 * on. Runs after the horde has moved, so a sighting means the thing is
 * actually on screen.
 */
export function stepQuests(state: GameState, dt: number, dtMs: number): void {
  pollQuestConditions(state);
  if (state.escorts.length > 0) {
    const { arrived, died } = stepEscorts(state, dt, dtMs);
    for (const escort of arrived) {
      creditEscortArrival(state, escort.questId, escort.defId);
    }
    for (const escort of died) failQuest(state, escort.questId, "escortDied");
  }

  if (state.questGivers.length === 0) return;

  for (const giver of state.questGivers) {
    const near =
      distance(state.players[0].pos, giver.pos) <= QUESTS.talkRadius &&
      lineOfSight(state, state.players[0].pos, giver.pos);
    if (!near) continue;
    giver.faceLeft = state.players[0].pos.x < giver.pos.x;
    if (!giver.discovered) {
      giver.discovered = true;
      addMapMarker(state, "questGiver", giver.pos, giver.id);
      state.events.push({
        type: "questGiverMet",
        pos: { ...giver.pos },
        giverId: giver.id,
      });
    }
    // The conversation only opens itself while the run is actually running and
    // NOTHING ELSE HAS THE STAGE. Both halves matter: `phase` catches the bag,
    // the shop and a level-up, and `dialogue` catches an in-world scene that
    // this very tick's earlier passes may have raised — an offer that stepped
    // over a monologue would take a page of the story away from the player and
    // then be tapped away with it.
    if (
      state.phase === "playing" &&
      state.dialogue === null &&
      state.questOffer === null
    ) {
      maybeOpenConversation(state, giver);
    }
  }

  markQuestTargets(state);
}

/**
 * THE THREE OBJECTIVES NOBODY CAN CALL IN — polled once a tick over the
 * RUNNING errands only.
 *
 * Rule 3 at the top of this file says progress is booked where it happens, and
 * it still holds for everything with a moment to book it at: a kill calls
 * `creditQuestKill`, a pickup calls `creditQuestPickup`, a sale calls the
 * merchant's own path. These three have no such moment. Standing somewhere is
 * not an event; a flag may be set by any branch of any conversation; and a
 * hero's level rises inside `grantXp`, which has no business knowing quests
 * exist. So they are asked rather than told — over the handful of active
 * errands, which is the same budget `markQuestTargets` already spends beside
 * them, and never over the whole catalog.
 */
function pollQuestConditions(state: GameState): void {
  const active = activeQuests(state);
  if (active.length === 0) return;
  for (const progress of active) {
    const def = questDef(progress.id);
    let moved = false;
    def.objectives.forEach((objective, index) => {
      const at = progress.counts[index] ?? 0;
      if (objective.kind === "visit") {
        if (at > 0 || objective.level !== state.level.id) return;
        const reach = objective.radius ?? QUESTS.visitRadius;
        // Through `questSpot` for the same reason the pieces are: on a CARVED
        // map the authored mark may sit inside a wall the hero can never stand
        // in, which is an objective that cannot be completed. Re-homed
        // identically at both sites, so the mark and the piece lying on it
        // never drift apart.
        if (
          distance(state.players[0].pos, questSpot(state, objective.at)) > reach
        ) {
          return;
        }
        bump(state, progress, index, objective);
        moved = true;
      } else if (objective.kind === "flag") {
        if (at > 0 || state.questFlags[objective.flag] !== true) return;
        bump(state, progress, index, objective);
        moved = true;
      } else if (objective.kind === "reachLevel") {
        // SET rather than bumped: the tally IS the hero's level, so a level
        // gained (or a hero adopted mid-chain at a level well past the last
        // reading) lands on the right number in one step instead of counting
        // up to it. Only ever climbs, so a respec cannot walk it backwards.
        const level = Math.min(state.players[0].level, objective.level);
        if (level <= at) return;
        progress.counts[index] = level;
        state.events.push({
          type: "questProgress",
          questId: progress.id,
          index,
          count: level,
          need: objective.level,
        });
        moved = true;
      }
    });
    if (moved) refreshQuestCompletion(state, progress.id);
  }
}

/**
 * Open this giver's conversation on approach, if they have anything NEW to
 * say. "New" is the whole restraint: a finished errand always speaks up (it is
 * the payoff, and the walk back is the point of it), and a fresh errand speaks
 * up exactly once. Everything else waits for a deliberate tap, so standing
 * near somebody is never a stream of modals.
 */
function maybeOpenConversation(state: GameState, giver: QuestGiver): void {
  const topics = giverTopics(state, giver.id);
  const speaksUp =
    topics.some((t) => t.kind === "complete") ||
    topics.some(
      (t) => t.kind === "offer" && !giver.autoOffered.includes(t.questId),
    );
  if (!speaksUp) return;
  // Every errand currently on the table counts as offered now, so the greeting
  // is one conversation rather than one per quest.
  for (const topic of topics) {
    if (topic.kind === "offer" && !giver.autoOffered.includes(topic.questId)) {
      giver.autoOffered.push(topic.questId);
    }
  }
  openTopics(state, giver.id, topics, false);
}

/**
 * EVERYTHING THIS PERSON HAS TO SAY, in the order the list shows it: finished
 * work first (it pays, and the hero walked back for it), then work to take,
 * then work already running. Derived fresh on every call, like `giverMark` and
 * for the same reason — a cached list goes stale the instant a kill three
 * rooms away completes an objective.
 */
export function giverTopics(state: GameState, giverId: string): QuestTopic[] {
  const topics: QuestTopic[] = [];
  for (const progress of Object.values(state.quests)) {
    if (progress.status !== "complete" || !hasQuest(progress.id)) continue;
    if (questDef(progress.id).giver === giverId) {
      topics.push({ questId: progress.id, kind: "complete" });
    }
  }
  for (const quest of offerableQuests(state, giverId)) {
    topics.push({ questId: quest.id, kind: "offer" });
  }
  for (const progress of activeQuests(state)) {
    if (questDef(progress.id).giver === giverId) {
      topics.push({ questId: progress.id, kind: "incomplete" });
    }
  }
  return topics;
}

/**
 * Open the right thing for a set of topics: the LIST when there is more than
 * one, the topic itself when there is exactly one (a menu of one is a menu
 * nobody wants), and nothing at all when there are none.
 */
function openTopics(
  state: GameState,
  giverId: string,
  topics: QuestTopic[],
  fromList: boolean,
): boolean {
  if (topics.length === 0) return false;
  if (topics.length === 1) {
    const only = topics[0]!;
    openQuestConversation(state, giverId, only.questId, only.kind, fromList);
    return true;
  }
  openQuestList(state, giverId);
  return true;
}

/** Put the giver's pick list on screen and freeze the run behind it. */
function openQuestList(state: GameState, giverId: string): void {
  state.questOffer = { giverId, kind: "list", page: 0 };
  state.phase = "quest";
  const giver = state.questGivers.find((g) => g.id === giverId);
  if (giver) giver.faceLeft = state.players[0].pos.x < giver.pos.x;
}

/**
 * PICK a row off the list. The app calls it for a tap on a row; returns false
 * for a row that is no longer real (the list is derived, so it cannot be), so
 * a stray tap is simply ignored.
 */
export function pickQuestTopic(state: GameState, questId: string): boolean {
  const offer = state.questOffer;
  if (!offer || offer.kind !== "list") return false;
  const topic = giverTopics(state, offer.giverId).find(
    (t) => t.questId === questId,
  );
  if (!topic) return false;
  openQuestConversation(state, offer.giverId, questId, topic.kind, true);
  return true;
}

/**
 * Step BACK to the list after finishing with one errand — or close the
 * conversation outright when this one wasn't picked off a list, or when there
 * is nothing left to pick. Every exit from a quest conversation goes through
 * here, so "accept, back, accept the next" costs one walk-up instead of three.
 */
function leaveTopic(state: GameState): void {
  const offer = state.questOffer;
  if (!offer) return;
  if (offer.fromList) {
    const topics = giverTopics(state, offer.giverId);
    if (topics.length > 1) {
      openQuestList(state, offer.giverId);
      return;
    }
    // Exactly one left: opening a list of one would be a dead end, and the
    // remaining topic is usually the "not yet" nag for what was just taken.
  }
  closeQuestDialogue(state);
}

/**
 * Open a giver's conversation and FREEZE the run behind it (the `quest`
 * phase). The app calls this for a tap on a giver; the step calls it for the
 * walk-up. Returns false when there is nothing to say or the run is not in a
 * state to be interrupted, so a stray tap is simply ignored.
 */
export function talkToQuestGiver(state: GameState, giverId: string): boolean {
  if (state.phase !== "playing" || state.questOffer !== null) return false;
  // Same rule as the walk-up: never step over a scene already on the stage.
  if (state.dialogue !== null) return false;
  const giver = state.questGivers.find((g) => g.id === giverId);
  if (!giver || !giver.discovered) return false;
  if (distance(state.players[0].pos, giver.pos) > QUESTS.tapRadius)
    return false;

  // A TAP OPENS EVERYTHING THIS PERSON HAS — the pick list when that is more
  // than one thing, the single topic when it is one. It is the answer to the
  // problem a "hand back the first errand" rule creates: `offerableQuests`
  // deliberately keeps a DECLINED quest on the table (a player who said no at
  // level 3 may well want the job at level 9), so always returning the first
  // entry left a refused quest permanently hiding every other quest that giver
  // owned — and there is no other way in.
  const topics = giverTopics(state, giverId);
  for (const topic of topics) {
    if (topic.kind === "offer" && !giver.autoOffered.includes(topic.questId)) {
      giver.autoOffered.push(topic.questId);
    }
  }
  return openTopics(state, giverId, topics, false);
}

function openQuestConversation(
  state: GameState,
  giverId: string,
  questId: string,
  kind: "offer" | "incomplete" | "complete",
  fromList = false,
): void {
  state.questOffer = {
    questId,
    giverId,
    kind,
    page: 0,
    ...(fromList ? { fromList: true } : {}),
  };
  state.phase = "quest";
  const giver = state.questGivers.find((g) => g.id === giverId);
  if (giver) giver.faceLeft = state.players[0].pos.x < giver.pos.x;
}

/** Turn to the next page of the open conversation; the last page closes it —
 * except an OFFER, which waits on ACCEPT or DECLINE. */
export function advanceQuestDialogue(state: GameState): void {
  const offer = state.questOffer;
  if (!offer || offer.kind === "list" || !offer.questId) return;
  const pages = conversationPages(offer.questId, offer.kind);
  if (offer.page < pages.length - 1) {
    offer.page++;
    return;
  }
  // An offer's last page IS the decision — the app draws ACCEPT/DECLINE there
  // rather than a "next", so paging past it must not silently decline.
  if (offer.kind === "offer") return;
  if (offer.kind === "complete") {
    turnInQuest(state);
    return;
  }
  leaveTopic(state);
}

/** The pages a conversation reads out, by its kind. */
export function conversationPages(
  questId: string,
  kind: "list" | "offer" | "incomplete" | "complete",
): readonly (readonly string[])[] {
  if (kind === "list") return [];
  const def = questDef(questId);
  if (kind === "offer") return def.offer;
  if (kind === "complete") return def.complete;
  return def.incomplete ? [def.incomplete] : [["..."]];
}

/** Close the conversation without taking or handing in anything. */
export function closeQuestDialogue(state: GameState): void {
  if (state.phase !== "quest") return;
  state.questOffer = null;
  state.phase = state.players[0].pendingStatPoints > 0 ? "levelup" : "playing";
}

/**
 * OPEN THE QUEST LOG — the "what was I doing" screen, raised from the HUD's own
 * `!` button. It is a PHASE rather than something the app pauses behind,
 * exactly as the fog-of-war map is (`openMap`): the run freezes because the
 * phase is not `playing`, so nothing else has to be told a screen is up, and
 * the pause menu stays the pause menu. The log itself is drawn app-side and
 * reads the state it already has — there is nothing to hold here.
 */
export function openQuestLog(state: GameState): void {
  if (state.phase === "playing") state.phase = "questLog";
}

/** Close the log and resume (pending level-ups take priority). */
export function closeQuestLog(state: GameState): void {
  if (state.phase !== "questLog") return;
  state.phase = state.players[0].pendingStatPoints > 0 ? "levelup" : "playing";
}

/**
 * TAKE THE ERRAND. Lays out whatever the quest needs on the field — the fetch
 * pieces at their spots, the escort at theirs — and starts the tallies. False
 * when there is no offer open (a stray tap).
 */
export function acceptQuest(state: GameState): boolean {
  const offer = state.questOffer;
  if (!offer || offer.kind !== "offer" || !offer.questId) return false;
  const def = questDef(offer.questId);
  state.quests[def.id] = {
    id: def.id,
    status: "active",
    counts: def.objectives.map(() => 0),
    dryKills: def.objectives.map(() => 0),
    acceptedAtMs: state.stats.timeMs,
  };
  state.events.push({
    type: "questAccepted",
    questId: def.id,
    giverId: offer.giverId,
  });

  const giver = state.questGivers.find((g) => g.id === offer.giverId);
  const from = giver?.pos ?? state.players[0].pos;
  placeQuestItems(state, def);
  for (const objective of def.objectives) {
    if (objective.kind !== "escort") continue;
    spawnEscort(state, def.id, objective.escort, objective.to, from);
  }

  // An errand with nothing to do is done the moment it is taken (a "go see
  // this person" link in a chain) — checked here so the `?` appears at once
  // instead of on the next kill.
  refreshQuestCompletion(state, def.id);
  leaveTopic(state);
  return true;
}

/**
 * TURN IT DOWN. Remembered, so the offer never opens itself again — but the
 * giver keeps their `!` and a tap still takes it, because a player who said no
 * at level 3 may well want the job at level 9.
 */
export function declineQuest(state: GameState): boolean {
  const offer = state.questOffer;
  if (!offer || offer.kind !== "offer" || !offer.questId) return false;
  const questId = offer.questId;
  const existing = state.quests[questId];
  if (existing) existing.status = "declined";
  else {
    state.quests[questId] = {
      id: questId,
      status: "declined",
      counts: questDef(questId).objectives.map(() => 0),
      dryKills: questDef(questId).objectives.map(() => 0),
      acceptedAtMs: state.stats.timeMs,
    };
  }
  leaveTopic(state);
  return true;
}

/**
 * HAND IT IN and get paid. The pieces a fetch quest asked for leave the world
 * with it (they were only ever tokens), and the chain's next link becomes
 * offerable — which is what makes the giver's `!` reappear the moment the `?`
 * is spent.
 */
export function turnInQuest(state: GameState): QuestPayout | null {
  const offer = state.questOffer;
  if (!offer || offer.kind !== "complete" || !offer.questId) return null;
  const progress = state.quests[offer.questId];
  if (!progress || progress.status !== "complete") return null;
  const def = questDef(offer.questId);
  const giver = state.questGivers.find((g) => g.id === offer.giverId);
  const at = giver?.pos ?? state.players[0].pos;

  progress.status = "turnedIn";
  clearEscorts(state, def.id);
  // Uncollected tokens for THIS quest are litter now — a fetch piece with
  // nothing left to fetch it for is a pickup that does nothing.
  state.items = state.items.filter(
    (item) => !(item.kind === "quest" && item.questId === def.id),
  );

  const payout = payQuestReward(state, def.reward, at);
  state.events.push({
    type: "questTurnedIn",
    questId: def.id,
    giverId: offer.giverId,
    xp: payout.xp,
    coins: payout.coins,
    items: payout.items.length,
  });
  leaveTopic(state);
  return payout;
}

/** An errand went wrong. Today only an escort that fell. */
export function failQuest(
  state: GameState,
  questId: string,
  reason: "escortDied",
): void {
  const progress = state.quests[questId];
  if (!progress || progress.status !== "active") return;
  progress.status = "failed";
  clearEscorts(state, questId);
  state.events.push({ type: "questFailed", questId, reason });
}

// ---------------------------------------------------------------- the tallies

/**
 * Book a kill against every running errand that wanted it, and roll whatever
 * the corpse was carrying. Called from `killEnemy`, so ANY kill counts — the
 * hero's, a companion's, a powerup's. The errand said thin them out; it did
 * not say prove it was you.
 */
export function creditQuestKill(
  state: GameState,
  def: EnemyDef,
  enemy: Enemy,
): void {
  for (const progress of activeQuests(state)) {
    const quest = questDef(progress.id);
    quest.objectives.forEach((objective, index) => {
      if (objective.kind === "kill" && objective.enemy === def.id) {
        bump(state, progress, index, objective);
      } else if (objective.kind === "killNamed" && objective.enemy === def.id) {
        bump(state, progress, index, objective);
      } else if (objective.kind === "collect") {
        maybeDropQuestItem(state, progress, index, objective, def, enemy);
      }
    });
    refreshQuestCompletion(state, progress.id);
  }
}

/**
 * A quest piece was walked over. Called from the item pass; returns false when
 * the piece belongs to no running errand, which is how a token left over from
 * a failed quest is quietly ignored rather than banked.
 */
export function creditQuestPickup(
  state: GameState,
  questId: string,
  itemId: string,
): boolean {
  const progress = state.quests[questId];
  if (!progress || progress.status !== "active") return false;
  const quest = questDef(questId);
  let took = false;
  quest.objectives.forEach((objective, index) => {
    if (objective.kind !== "collect" || objective.item !== itemId) return;
    if (progress.counts[index]! >= objective.count) return;
    bump(state, progress, index, objective);
    took = true;
  });
  if (took) refreshQuestCompletion(state, questId);
  return took;
}

/**
 * A piece was sold across the trader's counter (see ./merchant.ts). Booked
 * where it happens, like every other tally.
 */
export function creditQuestSale(
  state: GameState,
  questId: string,
  item: string,
): void {
  const progress = state.quests[questId];
  if (!progress || progress.status !== "active") return;
  questDef(questId).objectives.forEach((objective, index) => {
    if (objective.kind !== "sell" || objective.item !== item) return;
    if ((progress.counts[index] ?? 0) > 0) return;
    bump(state, progress, index, objective);
  });
  refreshQuestCompletion(state, questId);
}

/** An escort reached its destination. */
function creditEscortArrival(
  state: GameState,
  questId: string,
  escortId: string,
): void {
  const progress = state.quests[questId];
  if (!progress || progress.status !== "active") return;
  questDef(questId).objectives.forEach((objective, index) => {
    if (objective.kind !== "escort" || objective.escort !== escortId) return;
    if (progress.counts[index]! > 0) return;
    bump(state, progress, index, objective);
  });
  refreshQuestCompletion(state, questId);
}

/** Advance one objective's tally by one and tell the app, capped at the need. */
function bump(
  state: GameState,
  progress: QuestProgress,
  index: number,
  objective: QuestObjective,
): void {
  const need = objectiveNeed(objective);
  const at = progress.counts[index] ?? 0;
  if (at >= need) return;
  const count = at + 1;
  progress.counts[index] = count;
  state.events.push({
    type: "questProgress",
    questId: progress.id,
    index,
    count,
    need,
  });
}

/** Roll a fetch piece off a corpse that was carrying one. */
function maybeDropQuestItem(
  state: GameState,
  progress: QuestProgress,
  index: number,
  objective: Extract<QuestObjective, { kind: "collect" }>,
  def: EnemyDef,
  enemy: Enemy,
): void {
  if ((progress.counts[index] ?? 0) >= objective.count) return;
  const quest = questDef(progress.id);
  const item = quest.items?.find((i) => i.id === objective.item);
  if (!item?.dropFrom?.includes(def.id)) return;

  // THE PITY FLOOR: a run of bad luck on a finite horde is a quest the player
  // cannot finish, so a long dry spell drops for certain. The counter is per
  // objective, and it resets on every piece — including a placed one picked up
  // off the floor, which is the same "you have one, keep looking" signal.
  const dry = (progress.dryKills[index] ?? 0) + 1;
  const chance = item.dropChance ?? QUESTS.dropChance;
  if (dry < QUESTS.dropPity && state.rng() >= chance) {
    progress.dryKills[index] = dry;
    return;
  }
  progress.dryKills[index] = 0;
  dropItem(
    state,
    {
      id: state.nextId++,
      kind: "quest",
      pos: { ...enemy.pos },
      questId: progress.id,
      defId: item.id,
    },
    enemy.pos,
  );
}

/**
 * Lay a fetch quest's PLACED pieces out — done at accept, never at creation.
 * Each spot goes through `questSpot`, which is a no-op on a hand-authored map
 * and re-homes the piece onto clear ground on a CARVED one (see placement.ts):
 * a carve replaces the geometry the coordinate was written against and may not
 * even be the same size, so an authored spot can land in a wall or off the map.
 */
function placeQuestItems(state: GameState, def: QuestDef): void {
  for (const item of def.items ?? []) {
    for (const at of item.at ?? []) {
      state.items.push({
        id: state.nextId++,
        kind: "quest",
        pos: questSpot(state, at),
        questId: def.id,
        defId: item.id,
      });
    }
  }
}

/** Promote a running errand to `complete` once every objective is met. */
function refreshQuestCompletion(state: GameState, questId: string): void {
  const progress = state.quests[questId];
  if (!progress || progress.status !== "active") return;
  const objectives = questDef(questId).objectives;
  const done = objectives.every(
    (objective, index) =>
      (progress.counts[index] ?? 0) >= objectiveNeed(objective),
  );
  if (!done) return;
  progress.status = "complete";
  clearEscorts(state, questId);
  state.events.push({ type: "questCompleted", questId });
}

// ------------------------------------------------------------------- the map

/**
 * Pin what an active errand sent the hero after, the first time he lays eyes
 * on it. Only the errand's OWN targets — a map that pinned every monster
 * would be a map with nothing on it.
 */
function markQuestTargets(state: GameState): void {
  const active = activeQuests(state);
  if (active.length === 0) return;
  for (const progress of active) {
    const objectives = questDef(progress.id).objectives;
    for (const objective of objectives) {
      if (objective.kind !== "kill" && objective.kind !== "killNamed") continue;
      if (state.mapMarkers.some((m) => m.defId === objective.enemy)) continue;
      const seen = state.enemies.find(
        (e) =>
          e.defId === objective.enemy &&
          distance(e.pos, state.players[0].pos) <= QUESTS.markSightRadius &&
          lineOfSight(state, state.players[0].pos, e.pos),
      );
      if (seen) addMapMarker(state, "questTarget", seen.pos, objective.enemy);
    }
  }
}

// -------------------------------------------------------------- the questions

/** How many of a thing an objective wants. */
export function objectiveNeed(objective: QuestObjective): number {
  if (objective.kind === "kill") return objective.count;
  if (objective.kind === "collect") return objective.count;
  // A level gate's "count" is the hero's own level, so its need is the target
  // — which is what gives the tracker `LEVEL 96/99` off the same two numbers
  // every other objective reports.
  if (objective.kind === "reachLevel") return objective.level;
  return 1;
}

/** Every errand currently being worked on. */
export function activeQuests(state: GameState): QuestProgress[] {
  return Object.values(state.quests).filter(
    (q) => q.status === "active" && hasQuest(q.id),
  );
}

/** Every errand the tracker shows — running, finished, or failed this run. */
export function trackedQuests(state: GameState): QuestProgress[] {
  return Object.values(state.quests)
    .filter(
      (q) =>
        hasQuest(q.id) &&
        (q.status === "active" ||
          q.status === "complete" ||
          q.status === "turnedIn" ||
          q.status === "failed"),
    )
    .sort((a, b) => b.acceptedAtMs - a.acceptedAtMs);
}

/**
 * The errands this giver could hand out right now: this map's, theirs, not
 * already taken, past their chain gate and their difficulty gate.
 */
export function offerableQuests(state: GameState, giverId: string): QuestDef[] {
  return questsForLevel(state.level.id).filter((quest) => {
    if (quest.giver !== giverId) return false;
    const progress = state.quests[quest.id];
    if (progress && progress.status !== "declined") return false;
    if (!chainUnlocked(state, quest)) return false;
    return difficultyAllows(state, quest);
  });
}

/** Has every link this quest waits on been turned in? */
function chainUnlocked(state: GameState, quest: QuestDef): boolean {
  return (quest.requires ?? []).every(
    (id) => state.quests[id]?.status === "turnedIn",
  );
}

/** Is the run's rung at or past the quest's `minDifficulty`? */
function difficultyAllows(state: GameState, quest: QuestDef): boolean {
  if (!quest.minDifficulty) return true;
  return (
    difficultyDef(state.difficulty).index >=
    difficultyDef(quest.minDifficulty).index
  );
}

/** A finished errand of this giver's, awaiting handover. */
export function completableQuest(
  state: GameState,
  giverId: string,
): string | null {
  for (const progress of Object.values(state.quests)) {
    if (progress.status !== "complete" || !hasQuest(progress.id)) continue;
    if (questDef(progress.id).giver === giverId) return progress.id;
  }
  return null;
}

/** A running errand of this giver's, for the "not yet" nag. */
function runningQuest(state: GameState, giverId: string): string | null {
  for (const progress of activeQuests(state)) {
    if (questDef(progress.id).giver === giverId) return progress.id;
  }
  return null;
}

/**
 * THE MARK OVER A HEAD, derived fresh every call. Yellow `!` = there is work
 * here; yellow `?` = work finished, come collect; grey `?` = work running;
 * nothing = this person is done with you.
 */
export function giverMark(state: GameState, giverId: string): QuestMark {
  if (completableQuest(state, giverId)) return "turnIn";
  if (offerableQuests(state, giverId).length > 0) return "offer";
  if (runningQuest(state, giverId)) return "progress";
  return "none";
}

/** What the dialogue box calls this person. */
export function questGiverName(giverId: string): string {
  return questGiverDef(giverId).name;
}

/**
 * THE WARD (config `QUESTS.repelRadius`) — the merchant's, applied to every
 * giver: a monster that strays inside is pushed back out to the rim, so the
 * conversation is always reachable. Called from the enemy pass beside the
 * merchant's own ward; the caller decides who is exempt.
 */
export function repelFromQuestGivers(state: GameState, pos: Vec2): void {
  const r = QUESTS.repelRadius;
  for (const giver of state.questGivers) {
    const dx = pos.x - giver.pos.x;
    const dy = pos.y - giver.pos.y;
    const dSq = dx * dx + dy * dy;
    if (dSq >= r * r) continue;
    if (dSq === 0) {
      pos.x = giver.pos.x + r;
      continue;
    }
    const d = Math.sqrt(dSq);
    pos.x = giver.pos.x + (dx / d) * r;
    pos.y = giver.pos.y + (dy / d) * r;
  }
}
