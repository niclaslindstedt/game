// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TOPPING THE HORDE UP FOR AN ERRAND (engine/game/quests/restock.ts), on synthetic
// content.
//
// The rule this pins is the one that is silent when it breaks. A carved map's
// monsters are FINITE — `waves` are dropped on a carve, so everything the hero
// will ever fight is queued in a spawn point that drains exactly once — and an
// errand taken on ground he has already swept therefore has nothing left to
// count. It does not throw and it does not warn: the tracker just sits at 0/40
// with an empty map, which looks exactly like bad luck.
//
// So the four things worth holding are: that a swept map is restocked, that a
// stocked one is LEFT ALONE (a top-up that fired every time would be re-tuning
// the venue rather than asking for a job on it), that the top-up goes through
// the spawn points rather than onto the field, and that a fetch errand is
// costed at what the drop ladder actually charges rather than at its piece
// count.

import { beforeEach, describe, expect, it } from "vitest";

import {
  acceptQuest,
  advanceQuestDialogue,
  createGame,
  dismissIntro,
  giverTopics,
  pickQuestTopic,
  QUESTS,
  registerDefs,
  skipCutscene,
  step,
  talkToQuestGiver,
  type GameState,
  type QuestDef,
  type QuestGiverDef,
} from "@game/core";

import { FIX_SPAWNER_LEVEL, installFixtures } from "./fixtures.ts";
import { DT, idle } from "./helpers.ts";

/** Beside the spawner level's first point, so the hero starts within reach. */
const GIVER_AT = { x: 480, y: 1320 };

const GIVERS: Record<string, QuestGiverDef> = {
  restock_giver: {
    id: "restock_giver",
    level: "test_restock_level",
    name: "RESTOCK GIVER",
    sprite: "test_giver",
    at: GIVER_AT,
    lore: "A synthetic fixture civilian who hands out one very large cull.",
  },
};

/** A cull far larger than the fixture level's own queues — the whole point. */
const BIG_CULL = 40;

const QUEST_DEFS: Record<string, QuestDef> = {
  restock_cull: {
    id: "restock_cull",
    level: "test_restock_level",
    giver: "restock_giver",
    name: "RESTOCK CULL",
    lore: "A synthetic fixture errand asking for more than the map holds.",
    offer: [["THIN THEM OUT. ALL OF THEM."]],
    complete: [["THAT'S THE LOT."]],
    objectives: [{ kind: "kill", enemy: "test_minion", count: BIG_CULL }],
    reward: { coins: 5 },
  },
  // A piece off a ONE-OFF carrier: `test_elite` stands where the level placed
  // it and is in no spawn point's mix, so there is nothing to top up.
  restock_relic: {
    id: "restock_relic",
    level: "test_restock_level",
    giver: "restock_giver",
    name: "RESTOCK RELIC",
    lore: "A synthetic fixture errand whose carrier is a named one-off.",
    offer: [["OFF THE NAMED ONE."]],
    complete: [["THAT'S IT."]],
    objectives: [{ kind: "collect", item: "restock_relic_piece", count: 1 }],
    items: [
      {
        id: "restock_relic_piece",
        name: "RESTOCK RELIC",
        icon: "test_token",
        dropFrom: ["test_elite"],
        dropChance: 1,
      },
    ],
    reward: { coins: 5 },
  },
  // Two pieces off the same breed, at the default rate — so the cost is the
  // drop ladder's, not the piece count's.
  restock_fetch: {
    id: "restock_fetch",
    level: "test_restock_level",
    giver: "restock_giver",
    name: "RESTOCK FETCH",
    lore: "A synthetic fixture fetch errand, costed through the drop ladder.",
    offer: [["BRING ME TWO."]],
    complete: [["BOTH."]],
    objectives: [{ kind: "collect", item: "restock_token", count: 2 }],
    items: [
      {
        id: "restock_token",
        name: "RESTOCK TOKEN",
        icon: "test_token",
        dropFrom: ["test_minion"],
      },
    ],
    reward: { coins: 5 },
  },
};

/** The spawner fixture level under its own id, so this suite's giver can stand
 * on a venue whose horde is SPAWN POINTS rather than a wave — a wave level has
 * no queues to top up and the whole pass is a no-op on one. */
function install(): void {
  installFixtures(true);
  registerDefs({
    levels: {
      test_restock_level: { ...FIX_SPAWNER_LEVEL, id: "test_restock_level" },
    },
    quests: QUEST_DEFS,
    questGivers: GIVERS,
  });
}

function run(): GameState {
  const state = createGame(42, "test_restock_level");
  skipCutscene(state);
  dismissIntro(state);
  state.players[0].pos = { x: GIVER_AT.x - 20, y: GIVER_AT.y };
  return state;
}

/** Everything the ordinary spawn points still owe of `breed`. */
function queued(state: GameState, breed = "test_minion"): number {
  let n = 0;
  for (const point of state.spawners) {
    if ((point.openStage ?? 0) > 0) continue;
    for (const id of point.queue) if (id === breed) n++;
  }
  return n;
}

/**
 * MEET the giver — discovered on approach by `stepQuests`, which is what a tap
 * needs before it opens anything. Kept apart from `take` on purpose: these
 * ticks also let the level's spawn points arm and drip, so every arrangement a
 * test makes to the queues has to be made AFTER the walk and read against what
 * the walk left behind.
 */
function meet(state: GameState): void {
  for (let i = 0; i < 20 && state.phase === "playing"; i++) {
    step(state, idle, DT);
  }
  const giver = state.questGivers.find((g) => g.id === "restock_giver");
  expect(giver?.discovered, "the giver was never met").toBe(true);
}

/** Tap, pick `questId` off the slate, read the offer and say yes. */
function take(state: GameState, questId: string): void {
  talkToQuestGiver(state, state.players[0], "restock_giver");
  if (state.questOffer?.kind === "list") {
    const topic = giverTopics(state, "restock_giver").find(
      (t) => t.questId === questId,
    );
    expect(topic, `never offered "${questId}"`).toBeDefined();
    pickQuestTopic(state, state.players[0], questId);
  }
  while (state.questOffer && state.questOffer.kind === "offer") {
    const before = state.questOffer.page;
    advanceQuestDialogue(state, state.players[0]);
    if (state.questOffer && state.questOffer.page === before) break;
  }
  expect(acceptQuest(state, state.players[0]), `accepting "${questId}"`).toBe(
    true,
  );
}

describe("an errand tops the horde up when the field cannot pay for it", () => {
  beforeEach(install);

  it("queues the shortfall into the spawn points, not onto the field", () => {
    const state = run();
    meet(state);
    const before = queued(state);
    const standing = state.enemies.length;
    take(state, "restock_cull");

    // The field is asked for the count PLUS the headroom that says a queued
    // mob is not a met mob — a point only pours while the hero is inside it.
    const want = Math.ceil(BIG_CULL * QUESTS.restockHeadroom);
    expect(queued(state)).toBe(Math.min(want, before + QUESTS.restockMax));
    expect(queued(state)).toBeGreaterThan(before);
    // Nothing was conjured next to the giver: the top-up rides the spawn
    // points, so it arrives off-screen, running in, under the alive caps.
    expect(state.enemies.length).toBe(standing);
  });

  it("says so, once, with what it added", () => {
    const state = run();
    meet(state);
    state.events.length = 0;
    const before = queued(state);
    take(state, "restock_cull");
    const said = state.events.filter((e) => e.type === "questRestocked");
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({ enemy: "test_minion" });
    expect(queued(state) - before).toBe((said[0] as { count: number }).count);
  });

  it("keeps the remaining-foe readout honest", () => {
    // `total` is what the HUD spends down; a top-up that skipped it would
    // show the mission getting LONGER as the hero killed things.
    const state = run();
    meet(state);
    const before = state.spawners.reduce((n, p) => n + p.total, 0);
    take(state, "restock_cull");
    const added = state.spawners.reduce((n, p) => n + p.total, 0) - before;
    expect(added).toBe(
      queued(state) -
        (state.spawners.reduce((n, p) => n + p.queue.length, 0) - added),
    );
    expect(added).toBeGreaterThan(0);
  });

  it("re-arms a drained point rather than leaving the map empty", () => {
    const state = run();
    meet(state);
    for (const point of state.spawners) {
      point.queue = [];
      point.status = "drained";
      point.drainedAtMs = 0;
    }
    take(state, "restock_cull");
    expect(state.spawners.some((p) => p.status === "dormant")).toBe(true);
    expect(state.spawners.every((p) => p.status !== "drained")).toBe(true);
    expect(queued(state)).toBe(QUESTS.restockMax);
  });

  it("leaves a map that can still pay for the job alone", () => {
    const state = run();
    meet(state);
    // Stock one point past what the errand plus its headroom asks for.
    const want = Math.ceil(BIG_CULL * QUESTS.restockHeadroom);
    const first = state.spawners[0]!;
    while (queued(state) <= want) first.queue.push("test_minion");
    const before = queued(state);
    take(state, "restock_cull");
    expect(queued(state)).toBe(before);
    expect(state.events.some((e) => e.type === "questRestocked")).toBe(false);
  });

  it("never conjures a one-off carrier into the ordinary horde", () => {
    // THE LINE THAT MAKES THIS A TOP-UP RATHER THAN A REWRITE. An errand names
    // its carriers without caring where they stand, so a piece off a named
    // elite, a cache guardian or a rampage-only hellborn would otherwise be
    // "restocked" by queueing that mob into the knots — and meeting one of
    // those IS the errand. Only breeds the level's own spawn points were built
    // from may be topped up, however empty the map is.
    const state = run();
    meet(state);
    for (const point of state.spawners) {
      point.queue = [];
      point.status = "drained";
      point.drainedAtMs = 0;
    }
    take(state, "restock_relic");
    expect(queued(state, "test_elite")).toBe(0);
    expect(state.events.some((e) => e.type === "questRestocked")).toBe(false);
  });

  it("costs a fetch errand at the drop ladder's rate, not its piece count", () => {
    const state = run();
    meet(state);
    const before = queued(state);
    take(state, "restock_fetch");
    // Two pieces at the default chance are worth many more than two kills —
    // `(1 − (1 − p)^pity) / p` of them each. An errand costed at its piece
    // count would top the map up by nothing at all and read as fine.
    const perPiece =
      (1 - Math.pow(1 - QUESTS.dropChance, QUESTS.dropPity)) /
      QUESTS.dropChance;
    expect(perPiece).toBeGreaterThan(5);
    const want = Math.ceil(Math.ceil(2 * perPiece) * QUESTS.restockHeadroom);
    expect(queued(state)).toBe(Math.min(want, before + QUESTS.restockMax));
  });
});
