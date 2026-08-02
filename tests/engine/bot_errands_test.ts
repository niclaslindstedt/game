// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOT'S QUEST AWARENESS (src/game/bot/errands.ts): a running errand's
// outstanding objective becomes a macro goal — its token fetched, its breed
// hunted, its spot visited — and its tokens become wanted pickups. The
// boundary is asserted as hard as the feature: the bot only HELPS with
// errands already ACTIVE — an unaccepted quest's giver is never a goal, and a
// token the pickup pass would refuse (a dead errand's leftover) is never
// wanted. All on synthetic fixture quests registered through `registerDefs`,
// the same seam a mod's errands arrive through.

import { beforeEach, describe, expect, it } from "vitest";

import {
  botTuningFor,
  createBot,
  registerDefs,
  type GameState,
  type QuestDef,
  type QuestGiverDef,
} from "@game/core";

import {
  questObjectiveTarget,
  questTokenWanted,
} from "../../src/game/bot/errands.ts";
import { macroTarget } from "../../src/game/bot/macro.ts";
import { roughPos } from "../../src/game/bot/content.ts";
import { nearestWantedItem } from "../../src/game/bot/supplies.ts";
import { questSpot } from "../../src/game/quests/placement.ts";
import { clearStage, makeEnemy, startGame } from "./helpers.ts";

const GIVER_AT = { x: 500, y: 1320 };

const FIX_GIVERS: Record<string, QuestGiverDef> = {
  bot_giver: {
    id: "bot_giver",
    level: "test_level",
    name: "BOT GIVER",
    sprite: "bot_giver",
    at: GIVER_AT,
    lore: "A synthetic fixture civilian with errands the autopilot may only help with.",
  },
};

const FIX_QUESTS: Record<string, QuestDef> = {
  // A FETCH errand — its tokens are the bot's detour/goal targets.
  bot_fetch: {
    id: "bot_fetch",
    level: "test_level",
    giver: "bot_giver",
    name: "BOT FETCH",
    lore: "A synthetic fixture errand.",
    offer: [["BRING ME TWO."]],
    complete: [["GOOD."]],
    objectives: [{ kind: "collect", item: "bot_token", count: 2 }],
    items: [
      {
        id: "bot_token",
        name: "BOT TOKEN",
        icon: "bot_token",
        dropFrom: ["test_minion"],
        dropChance: 1,
      },
    ],
    reward: { coins: 5 },
  },
  // A KILL errand — its breed is what the bot should prefer hunting.
  bot_cull: {
    id: "bot_cull",
    level: "test_level",
    giver: "bot_giver",
    name: "BOT CULL",
    lore: "A synthetic fixture errand.",
    offer: [["THIN THEM."]],
    complete: [["DONE."]],
    objectives: [{ kind: "kill", enemy: "test_brute", count: 3 }],
    reward: { coins: 5 },
  },
  // A VISIT errand on THIS level…
  bot_visit: {
    id: "bot_visit",
    level: "test_level",
    giver: "bot_giver",
    name: "BOT VISIT",
    lore: "A synthetic fixture errand.",
    offer: [["GO LOOK."]],
    complete: [["YOU SAW IT."]],
    objectives: [
      {
        kind: "visit",
        level: "test_level",
        at: { x: 2000, y: 600 },
        name: "THE FIXTURE MARKER",
      },
    ],
    reward: { coins: 5 },
  },
  // …and one whose spot is on ANOTHER level — no goal on this map.
  bot_far_visit: {
    id: "bot_far_visit",
    level: "test_level",
    giver: "bot_giver",
    name: "BOT FAR VISIT",
    lore: "A synthetic fixture errand.",
    offer: [["GO FAR."]],
    complete: [["FAR ENOUGH."]],
    objectives: [
      {
        kind: "visit",
        level: "bot_other_level",
        at: { x: 100, y: 100 },
        name: "THE FAR MARKER",
      },
    ],
    reward: { coins: 5 },
  },
};

beforeEach(() => {
  registerDefs({ quests: FIX_QUESTS, questGivers: FIX_GIVERS });
});
registerDefs({ quests: FIX_QUESTS, questGivers: FIX_GIVERS });

/** A cleared solo run with no obstacles to trip the straight-line reads. */
function stage(): GameState {
  const state = startGame(9);
  clearStage(state);
  state.obstacles = [];
  state.items = [];
  return state;
}

/** Mark a fixture errand ACTIVE in the run's log, as an accept would. */
function activate(state: GameState, id: string, counts: number[]): void {
  state.quests[id] = {
    id,
    status: "active",
    counts,
    dryKills: counts.map(() => 0),
    acceptedAtMs: 0,
  };
}

/** Drop a fetch token on the floor. */
function dropToken(state: GameState, pos: { x: number; y: number }): void {
  state.items.push({
    id: state.nextId++,
    kind: "quest",
    pos: { x: pos.x, y: pos.y },
    questId: "bot_fetch",
    defId: "bot_token",
  });
}

const TUNE = botTuningFor("test_level");

describe("an active errand is a macro goal", () => {
  it("fetches an active collect quest's token", () => {
    const state = stage();
    activate(state, "bot_fetch", [0]);
    dropToken(state, { x: 900, y: 1100 });
    const goal = questObjectiveTarget(state, state.players[0]!);
    expect(goal?.pos).toEqual({ x: 900, y: 1100 });
    expect(goal?.thought).toBe("FETCH TOKEN");
    // …and the macro ladder actually routes there (nothing above outranks it
    // on this cleared stage).
    const bot = createBot("balanced");
    expect(macroTarget(bot, state, state.players[0]!, TUNE)).toEqual({
      x: 900,
      y: 1100,
    });
  });

  it("stops wanting tokens once the tally is met", () => {
    const state = stage();
    activate(state, "bot_fetch", [2]); // need is 2 — the errand is done
    dropToken(state, { x: 900, y: 1100 });
    expect(questObjectiveTarget(state, state.players[0]!)).toBeNull();
  });

  it("walks to a visit objective's spot on this level", () => {
    const state = stage();
    activate(state, "bot_visit", [0]);
    const hero = state.players[0]!;
    const goal = questObjectiveTarget(state, hero);
    expect(goal?.pos).toEqual(questSpot(state, { x: 2000, y: 600 }));
    expect(goal?.thought).toBe("ON ERRAND");
    const bot = createBot("balanced");
    expect(macroTarget(bot, state, hero, TUNE)).toEqual(goal!.pos);
  });

  it("ignores a visit objective on another level", () => {
    const state = stage();
    activate(state, "bot_far_visit", [0]);
    expect(questObjectiveTarget(state, state.players[0]!)).toBeNull();
  });

  it("hunts a kill objective's breed, not whatever is nearest", () => {
    const state = stage();
    activate(state, "bot_cull", [0]);
    const hero = state.players[0]!;
    // A stray minion stands nearer than the errand's breed…
    state.enemies.push(makeEnemy({ id: 9201, pos: { x: 800, y: 1300 } }));
    const brute = makeEnemy(
      { id: 9202, pos: { x: 1400, y: 1000 } },
      "test_brute",
    );
    state.enemies.push(brute);
    const goal = questObjectiveTarget(state, hero);
    expect(goal?.pos).toEqual(roughPos(brute.pos));
    expect(goal?.thought).toBe("ON ERRAND");
    const bot = createBot("balanced");
    expect(macroTarget(bot, state, hero, TUNE)).toEqual(roughPos(brute.pos));
  });

  it("has no goal once the cull is complete", () => {
    const state = stage();
    activate(state, "bot_cull", [3]);
    state.enemies.push(
      makeEnemy({ id: 9203, pos: { x: 1400, y: 1000 } }, "test_brute"),
    );
    expect(questObjectiveTarget(state, state.players[0]!)).toBeNull();
  });
});

describe("the bot never takes an errand", () => {
  it("never walks to an unaccepted quest's giver", () => {
    const state = stage();
    // The giver stands on the field with work to offer — and nothing accepted.
    const giver = state.questGivers.find((g) => g.id === "bot_giver");
    expect(giver).toBeTruthy();
    expect(questObjectiveTarget(state, state.players[0]!)).toBeNull();
    const bot = createBot("balanced");
    const goal = macroTarget(bot, state, state.players[0]!, TUNE);
    expect(goal).not.toEqual(giver!.pos);
  });
});

describe("quest tokens as pickups", () => {
  it("wants a bankable token of an active errand", () => {
    const state = stage();
    activate(state, "bot_fetch", [0]);
    dropToken(state, { x: 420, y: 1320 });
    const item = state.items[0]!;
    expect(questTokenWanted(state, item)).toBe(true);
    expect(nearestWantedItem(state, state.players[0]!)).toBe(item);
  });

  it("refuses a token its errand can no longer bank", () => {
    const state = stage();
    dropToken(state, { x: 420, y: 1320 });
    const item = state.items[0]!;
    // No log entry at all — an errand never taken.
    expect(questTokenWanted(state, item)).toBe(false);
    expect(nearestWantedItem(state, state.players[0]!)).toBeUndefined();
    // A failed errand's leftover is litter too.
    activate(state, "bot_fetch", [0]);
    state.quests["bot_fetch"]!.status = "failed";
    expect(questTokenWanted(state, item)).toBe(false);
    // And a tally already met turns the pickup away.
    state.quests["bot_fetch"]!.status = "active";
    state.quests["bot_fetch"]!.counts = [2];
    expect(questTokenWanted(state, item)).toBe(false);
  });
});
