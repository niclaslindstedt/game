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
// 2. **A CONVERSATION NEVER STARTS ITSELF.** Walking up MEETS somebody — they
//    are discovered, pinned on the map and marked with a `!` over the head —
//    and that is all. The conversation waits for a deliberate tap, the same
//    gesture the shop and a bystander already use. It used to auto-open on
//    approach, on the theory that a quest nobody notices is a quest nobody
//    takes; what that actually did was freeze the run into a modal the player
//    had not asked for, mid-fight, because they walked past the wrong crate.
//    The head mark is what carries the invitation now — WoW has never needed
//    more than one — and it costs the player nothing to ignore.
// 3. **PROGRESS IS BOOKED WHERE IT HAPPENS, NOT SCANNED FOR.** `creditQuestKill`
//    is called from `killEnemy` and `creditQuestPickup` from the item pass.
//    Polling the world for "are there still eight assemblers" would be both
//    slower and wrong — the tally must count what the hero DID, not what is
//    left standing.
// 4. **AN ERRAND IS A RUN'S BUSINESS.** The log lives on the run and a fresh
//    run of the same level offers everything again. Quests are pacing and
//    flavour for one visit to a map, not a persistent account the roster has
//    to carry across a content update.

import { direction, distance, type Vec2 } from "@game/lib/vec.ts";
import { resolveCacheLine } from "../cache.ts";

import { QUESTS } from "../config/index.ts";
import { talkToGiverTree } from "../conversation.ts";
import { difficultyDef } from "../defs/difficulties.ts";
import type { EnemyDef } from "../defs/enemies/index.ts";
import {
  giversForLevel,
  hasQuest,
  questDef,
  questGiverDef,
  questPageIsHero,
  questPageLines,
  questsForLevel,
  type QuestDef,
  type QuestObjective,
  type QuestPage,
} from "../defs/quests.ts";
import { dropItem } from "../items/index.ts";
import { addMapMarker, removeMapMarkers } from "../map.ts";
import { floatPlayerThought } from "../story.ts";
import { lineOfSight } from "../obstacles.ts";
import { heroInPlay, partyLevel } from "../party.ts";
import type {
  Enemy,
  GameState,
  Player,
  QuestGiver,
  QuestMark,
  QuestProgress,
  QuestTopic,
} from "../types/index.ts";
import { clearEscorts, spawnEscort, stepEscorts } from "./escort.ts";
import { questSpot } from "./placement.ts";
import { questRewardChoices } from "./reward-choices.ts";
import { restockQuestBreeds } from "./restock.ts";
import { payQuestReward, type QuestPayout } from "./rewards.ts";

export * from "./campaign.ts";
export * from "./escort.ts";
export * from "./placement.ts";
export * from "./merchant.ts";
export * from "./restock.ts";
export * from "./reward-choices.ts";
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
  return giversForLevel(levelId).map((def) => {
    const spot = clearSpot({ ...def.at }, blocked);
    // A giver who ARRIVES starts out where they walked in from and keeps the
    // authored spot as the place they are heading (`QuestGiverDef.arrive`).
    // The clearance check is spent on the DESTINATION, which is the one that
    // has to be standable — the doorstep they set off from is theirs for a few
    // seconds and nothing else wants it.
    if (!def.arrive) {
      return { id: def.id, pos: spot, faceLeft: false, discovered: false };
    }
    return {
      id: def.id,
      pos: { ...def.arrive.from },
      faceLeft: spot.x < def.arrive.from.x,
      discovered: false,
      to: spot,
      ...(def.arrive.delayMs ? { waitMs: def.arrive.delayMs } : {}),
      speed: def.arrive.speed ?? QUESTS.arriveSpeed,
    };
  });
}

/**
 * Walk the givers who are still arriving one tick (see `QuestGiverDef.arrive`).
 *
 * A STRAIGHT LINE, AND NO COLLISION. This is a scripted entrance across ground
 * the level author picked, not a body finding its way: pushing her out of the
 * furniture would have her arrive somewhere the errand was not written for, and
 * routing her round it needs a pathfinder for one walk in the whole game. What
 * the line DOES respect is the door — `stepDoors` opens an approach door for a
 * giver on the move, which is how the garage's roll-up goes up for the woman
 * with her own key.
 */
function stepArrivingGivers(state: GameState, dt: number, dtMs: number): void {
  for (const giver of state.questGivers) {
    const to = giver.to;
    if (!to || giver.dead) continue;
    // THE PAUSE BEFORE THE WALK (`QuestGiverDef.arrive.delayMs`) — they are
    // standing on the spot they turned up at, which on the hub is the middle of
    // the drive the car leaves by.
    if (giver.waitMs !== undefined && giver.waitMs > 0) {
      giver.waitMs -= dtMs;
      if (giver.waitMs > 0) continue;
      delete giver.waitMs;
    }
    const step = (giver.speed ?? QUESTS.arriveSpeed) * dt;
    const left = distance(giver.pos, to);
    if (left <= step) {
      giver.pos = { ...to };
      delete giver.to;
      delete giver.speed;
      continue;
    }
    const dir = direction(giver.pos, to);
    giver.pos = {
      x: giver.pos.x + dir.x * step,
      y: giver.pos.y + dir.y * step,
    };
    giver.faceLeft = dir.x < 0;
  }
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
      const reach = ring * QUESTS.displaceStep;
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
 * Advance the quest system one tick: MEET the givers (nothing opens — see rule
 * 2), walk the escorts, and pin what the hero has laid eyes on. Runs after the
 * horde has moved, so a sighting means the thing is actually on screen.
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
  stepArrivingGivers(state, dt, dtMs);

  for (const giver of state.questGivers) {
    // A giver still walking in has not met anybody: she is crossing the drive
    // with her back to him, and latching the meeting here would pin a map
    // marker on a spot she is about to leave. Nor has one who did not make it.
    if (giver.to || giver.dead) continue;
    // ANY hero meets a giver (the party rule): whoever walks up
    // discovers them for everybody, and the giver turns to face that hero.
    const meeter = state.players.find(
      (hero) =>
        heroInPlay(hero) &&
        distance(hero.pos, giver.pos) <= QUESTS.talkRadius &&
        lineOfSight(state, hero.pos, giver.pos),
    );
    if (!meeter) continue;
    giver.faceLeft = meeter.pos.x < giver.pos.x;
    if (!giver.discovered) {
      giver.discovered = true;
      addMapMarker(state, "questGiver", giver.pos, giver.id);
      state.events.push({
        type: "questGiverMet",
        pos: { ...giver.pos },
        giverId: giver.id,
      });
    }
    // ...and that is the whole meeting. Nothing opens. `talkToQuestGiver` is
    // the only door into a conversation, and only a tap calls it.
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
        // ANY hero's visit counts — the errand is the party's.
        const spot = questSpot(state, objective.at);
        if (
          !state.players.some(
            (hero) => heroInPlay(hero) && distance(hero.pos, spot) <= reach,
          )
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
        // The PARTY's level (its highest hero in play) — the reading a
        // "reach level N" chain link wants with eight bars on the field.
        const level = Math.min(partyLevel(state), objective.level);
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
  hero: Player,
  giverId: string,
  topics: QuestTopic[],
  fromList: boolean,
): boolean {
  if (topics.length === 0) return false;
  if (topics.length === 1) {
    const only = topics[0]!;
    openQuestConversation(
      state,
      hero,
      giverId,
      only.questId,
      only.kind,
      fromList,
    );
    return true;
  }
  openQuestList(state, hero, giverId);
  return true;
}

/** Put the giver's pick list on this hero's screen. */
function openQuestList(state: GameState, hero: Player, giverId: string): void {
  state.questOffer = { giverId, kind: "list", page: 0 };
  hero.screen = "quest";
  const giver = state.questGivers.find((g) => g.id === giverId);
  if (giver) giver.faceLeft = hero.pos.x < giver.pos.x;
}

/**
 * PICK a row off the list. The app calls it for a tap on a row; returns false
 * for a row that is no longer real (the list is derived, so it cannot be), so
 * a stray tap is simply ignored.
 */
export function pickQuestTopic(
  state: GameState,
  hero: Player,
  questId: string,
): boolean {
  if (hero.screen !== "quest") return false;
  const offer = state.questOffer;
  if (!offer || offer.kind !== "list") return false;
  const topic = giverTopics(state, offer.giverId).find(
    (t) => t.questId === questId,
  );
  if (!topic) return false;
  openQuestConversation(state, hero, offer.giverId, questId, topic.kind, true);
  return true;
}

/**
 * Step BACK to the list after finishing with one errand — or close the
 * conversation outright when this one wasn't picked off a list, or when there
 * is nothing left to pick. Every exit from a quest conversation goes through
 * here, so "accept, back, accept the next" costs one walk-up instead of three.
 */
function leaveTopic(state: GameState, hero: Player): void {
  const offer = state.questOffer;
  if (!offer) return;
  if (offer.fromList) {
    const topics = giverTopics(state, offer.giverId);
    if (topics.length > 1) {
      openQuestList(state, hero, offer.giverId);
      return;
    }
    // Exactly one left: opening a list of one would be a dead end, and the
    // remaining topic is usually the "not yet" nag for what was just taken.
  }
  closeQuestDialogue(state, hero);
}

/**
 * Open a giver's conversation on the TAPPING hero's screen (the
 * rest of the party plays on; solo the world freezes exactly as before). THE
 * ONLY DOOR IN — the app calls it for a tap on a giver, and nothing calls it
 * on the player's behalf. ONE conversation at a time, party-wide: the offer
 * record lives on the run, so a second hero walking up mid-conversation is
 * politely refused. Returns false when there is nothing to say or the hero is
 * not in a state to be interrupted, so a stray tap is simply ignored.
 */
export function talkToQuestGiver(
  state: GameState,
  hero: Player,
  giverId: string,
): boolean {
  if (state.phase !== "playing" || state.questOffer !== null) return false;
  if (hero.screen !== undefined) return false;
  // Never step over a scene already on the stage.
  if (state.dialogue !== null) return false;
  const giver = state.questGivers.find((g) => g.id === giverId);
  if (!giver || !giver.discovered || giver.dead) return false;
  if (distance(hero.pos, giver.pos) > QUESTS.tapRadius) return false;

  // A PERSON MAY OWE THE HERO A MEETING BEFORE THEY OWE HIM AN ERRAND
  // (`QuestGiverDef.intro`). Until the tree's own flag is set, the tap opens
  // the TREE and never the slate: an errand is a thing somebody asks of you,
  // and being asked before you have been spoken to is what makes a giver read
  // as a dispenser. The head mark is unchanged and still says `!`, because
  // there genuinely is work here — the meeting is the first step of taking it,
  // not a door in front of it.
  const intro = questGiverDef(giverId).intro;
  if (intro && state.questFlags[intro.until] !== true) {
    return talkToGiverTree(state, hero, giverId, intro.conversation);
  }

  // A TAP OPENS EVERYTHING THIS PERSON HAS — the pick list when that is more
  // than one thing, the single topic when it is one. It is the answer to the
  // problem a "hand back the first errand" rule creates: `offerableQuests`
  // deliberately keeps a DECLINED quest on the table (a player who said no at
  // level 3 may well want the job at level 9), so always returning the first
  // entry left a refused quest permanently hiding every other quest that giver
  // owned — and there is no other way in.
  return openTopics(state, hero, giverId, giverTopics(state, giverId), false);
}

function openQuestConversation(
  state: GameState,
  hero: Player,
  giverId: string,
  questId: string,
  kind: "offer" | "incomplete" | "complete",
  fromList = false,
): void {
  // MINT THE REWARD BEFORE THE BOX IS ON SCREEN. The gear an errand pays is
  // decided once, here, and shown in full — so what the offer promises is
  // literally the item the handover hands over (see reward-choices.ts). Doing
  // it at the moment the conversation opens is what keeps the app a pure
  // reader: it never mints, so a re-render cannot re-roll the reward.
  const picked = state.quests[questId]?.rewardPick;
  questRewardChoices(state, hero, questId);
  state.questOffer = {
    questId,
    giverId,
    kind,
    page: 0,
    ...(fromList ? { fromList: true } : {}),
    ...(picked !== undefined ? { rewardPick: picked } : {}),
  };
  hero.screen = "quest";
  const giver = state.questGivers.find((g) => g.id === giverId);
  if (giver) giver.faceLeft = hero.pos.x < giver.pos.x;
}

/** Turn to the next page of the open conversation; the last page closes it —
 * except an OFFER, which waits on ACCEPT or DECLINE. */
export function advanceQuestDialogue(state: GameState, hero: Player): void {
  if (hero.screen !== "quest") return;
  const offer = state.questOffer;
  if (!offer || offer.kind === "list" || !offer.questId) return;
  const pages = conversationPages(state, offer.questId, offer.kind);
  if (offer.page < pages.length - 1) {
    offer.page++;
    return;
  }
  // An offer's last page IS the decision — the app draws ACCEPT/DECLINE there
  // rather than a "next", so paging past it must not silently decline.
  if (offer.kind === "offer") return;
  if (offer.kind === "complete") {
    turnInQuest(state, hero);
    return;
  }
  leaveTopic(state, hero);
}

/**
 * The pages a conversation reads out, by its kind.
 *
 * Takes the RUN because an authored page may carry `{CACHE}` — the rung's own
 * line about the chest Ruth just brought (engine/game/cache.ts). A page whose
 * token resolves to nothing (a rung that pays no chest) is DROPPED rather than
 * shown blank, so the same errand reads correctly on a difficulty ladder that a
 * mod cut down.
 */
export function conversationPages(
  state: GameState,
  questId: string,
  kind: "list" | "offer" | "incomplete" | "complete",
): readonly QuestPage[] {
  if (kind === "list") return [];
  const def = questDef(questId);
  const pages: readonly QuestPage[] =
    kind === "offer"
      ? def.offer
      : kind === "complete"
        ? def.complete
        : def.incomplete
          ? [def.incomplete]
          : [["..."]];
  const out: QuestPage[] = [];
  for (const page of pages) {
    // The token can sit in either voice's page — Ruth names the chest and the
    // hero says what he will put in it — so the resolve is done on the LINES and
    // the voice is put back afterwards.
    const resolved = resolveCacheLine(questPageLines(page), state.difficulty);
    if (resolved === null) continue;
    out.push(questPageIsHero(page) ? { hero: resolved } : resolved);
  }
  return out;
}

/** Close the conversation without taking or handing in anything. */
export function closeQuestDialogue(state: GameState, hero: Player): void {
  if (hero.screen !== "quest") return;
  state.questOffer = null;
  delete hero.screen;
}

/**
 * OPEN THE QUEST LOG — the "what was I doing" screen, raised from the HUD's
 * own `!` button. A per-player SCREEN like the fog-of-war map (`openMap`):
 * this hero steps out to read it, the rest of the party plays on, and solo
 * the world freezes exactly as it always did. The log itself is drawn
 * app-side and reads the state it already has — there is nothing to hold
 * here.
 */
export function openQuestLog(state: GameState, hero: Player): void {
  if (state.phase === "playing" && hero.screen === undefined) {
    hero.screen = "questLog";
  }
}

/** Close the log. */
export function closeQuestLog(hero: Player): void {
  if (hero.screen !== "questLog") return;
  delete hero.screen;
}

/**
 * TAKE THE ERRAND. Lays out whatever the quest needs on the field — the fetch
 * pieces at their spots, the escort at theirs — and starts the tallies. False
 * when there is no offer open (a stray tap).
 */
export function acceptQuest(state: GameState, hero: Player): boolean {
  if (hero.screen !== "quest") return false;
  const offer = state.questOffer;
  if (!offer || offer.kind !== "offer" || !offer.questId) return false;
  const def = questDef(offer.questId);
  state.quests[def.id] = {
    id: def.id,
    status: "active",
    counts: def.objectives.map(() => 0),
    dryKills: def.objectives.map(() => 0),
    acceptedAtMs: state.stats.timeMs,
    // Carry a pick made at the OFFER onto the log — the player chose which
    // piece they were saying yes to, and that choice is the reason they said it.
    ...(offer.rewardPick !== undefined ? { rewardPick: offer.rewardPick } : {}),
  };
  state.events.push({
    type: "questAccepted",
    questId: def.id,
    giverId: offer.giverId,
  });

  const giver = state.questGivers.find((g) => g.id === offer.giverId);
  const from = giver?.pos ?? hero.pos;
  placeQuestItems(state, def);
  // AND TOP THE HORDE UP IF IT CANNOT PAY FOR THIS. A carved map's monsters are
  // finite, so an errand taken on ground the hero has already swept has nothing
  // left to count — see restock.ts. A no-op whenever the field is still good
  // for the job, which is most of the time.
  restockQuestBreeds(state, def);
  for (const objective of def.objectives) {
    if (objective.kind !== "escort") continue;
    spawnEscort(state, def.id, objective.escort, objective.to, from);
  }

  // An errand with nothing to do is done the moment it is taken (a "go see
  // this person" link in a chain) — checked here so the `?` appears at once
  // instead of on the next kill.
  refreshQuestCompletion(state, def.id);
  leaveTopic(state, hero);
  return true;
}

/**
 * TURN IT DOWN. Remembered — the giver keeps their `!` and a tap still takes
 * it, because a player who said no at level 3 may well want the job at level
 * 9, so the status is what tells a CAMPAIGN merge that a decline ranks below
 * an untaken offer rather than above it (see campaign-save.ts).
 */
export function declineQuest(state: GameState, hero: Player): boolean {
  if (hero.screen !== "quest") return false;
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
  leaveTopic(state, hero);
  return true;
}

/**
 * HAND IT IN and get paid. The pieces a fetch quest asked for leave the world
 * with it (they were only ever tokens), and the chain's next link becomes
 * offerable — which is what makes the giver's `!` reappear the moment the `?`
 * is spent.
 */
export function turnInQuest(
  state: GameState,
  hero: Player,
): QuestPayout | null {
  if (hero.screen !== "quest") return null;
  const offer = state.questOffer;
  if (!offer || offer.kind !== "complete" || !offer.questId) return null;
  const progress = state.quests[offer.questId];
  if (!progress || progress.status !== "complete") return null;
  const def = questDef(offer.questId);
  const giver = state.questGivers.find((g) => g.id === offer.giverId);
  const at = giver?.pos ?? hero.pos;

  progress.status = "turnedIn";
  clearEscorts(state, def.id);
  // Uncollected tokens for THIS quest are litter now — a fetch piece with
  // nothing left to fetch it for is a pickup that does nothing.
  state.items = state.items.filter(
    (item) => !(item.kind === "quest" && item.questId === def.id),
  );

  const payout = payQuestReward(state, hero, def.reward, at, def.id);
  state.events.push({
    type: "questTurnedIn",
    questId: def.id,
    giverId: offer.giverId,
    xp: payout.xp,
    coins: payout.coins,
    items: payout.items.length,
  });
  leaveTopic(state, hero);
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
      // ANY hero's sighting pins the target — the map is shared.
      const seen = state.enemies.find(
        (e) =>
          e.defId === objective.enemy &&
          state.players.some(
            (hero) =>
              heroInPlay(hero) &&
              distance(e.pos, hero.pos) <= QUESTS.markSightRadius &&
              lineOfSight(state, hero.pos, e.pos),
          ),
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
  // Nothing over a body. Every errand of theirs is off the table for the rest
  // of the run (`QuestGiver.dead`), so a mark would be pointing at a job the
  // player can no longer take.
  if (state.questGivers.some((g) => g.id === giverId && g.dead)) return "none";
  if (completableQuest(state, giverId)) return "turnIn";
  if (offerableQuests(state, giverId).length > 0) return "offer";
  if (runningQuest(state, giverId)) return "progress";
  return "none";
}

/**
 * RUN DOWN. The one thing that can happen to a giver, and it can only happen
 * while they are crossing open ground on their way in (`QuestGiverDef.arrive`)
 * — see `runDownBystander` in vehicles.ts for what does it.
 *
 * The shape is the merchant's (`killMerchant`), because it is the same event
 * with the same consequence: the mark comes off the map, anything of theirs on
 * screen is closed, an event goes out for the blood and the noise, and the
 * person is simply not there any more. Every errand of theirs is unreachable
 * for the rest of the run — which is the whole cost, and it is a TRIP rather
 * than a chain, because the hub mints its givers fresh on the next visit.
 *
 * No line and no toast: what the player is looking at says it.
 *
 * `by` is WHERE THE BLOW CAME FROM — the car's own anchor, which while somebody
 * is driving is also the hero's. The `runDown` beat below is floated over it
 * rather than over the body, because it is the driver's thought and he never
 * looks back.
 */
export function killQuestGiver(
  state: GameState,
  giverId: string,
  by?: Vec2,
): boolean {
  const giver = state.questGivers.find((g) => g.id === giverId);
  if (!giver || giver.dead) return false;
  giver.dead = true;
  delete giver.to;
  delete giver.waitMs;
  delete giver.speed;
  // A conversation of hers on anybody's screen goes with her.
  if (state.questOffer?.giverId === giverId) {
    for (const hero of state.players) {
      if (hero.screen === "quest") delete hero.screen;
    }
    state.questOffer = null;
  }
  removeMapMarkers(state, "questGiver", giverId);
  state.events.push({
    type: "questGiverKilled",
    pos: { ...giver.pos },
    giverId,
  });
  // …AND WHAT THE VENUE SAYS TO MAKE OF IT (`QuestGiverDef.runDown`): the one
  // beat he gets on the spot, and the flag that carries the fact out of this
  // run and down the rest of the campaign.
  //
  // THE BEAT IS FLOATED, NEVER STAGED, and `by` is why the caller passes a
  // position at all. The only way a giver dies is a moving car, so the hero is
  // at the wheel of one when this fires: a dialogue box here stops the wagon
  // mid-driveway and holds it there for a tap, which turns three words the
  // character does not think twice about into a scene the game clearly does.
  // Floated over the car instead, he says it and keeps driving — which is the
  // line (`thoughts.yaml` → `ruth_run_down`). Falls back to the body when
  // nothing said where the blow came from.
  const runDown = questGiverDef(giverId).runDown;
  if (runDown?.flag) state.questFlags[runDown.flag] = true;
  if (runDown?.thought) {
    floatPlayerThought(state, runDown.thought, by ?? giver.pos);
  }
  return true;
}

/** What the dialogue box calls this person. */
export function questGiverName(giverId: string): string {
  return questGiverDef(giverId).name;
}
