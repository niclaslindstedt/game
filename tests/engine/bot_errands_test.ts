// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOT'S QUEST PLAY (engine/game/bot/errands.ts): it walks to the person with
// a mark over their head and TAKES the work, then a running errand's
// outstanding objective becomes a macro goal — its token fetched, its breed
// hunted, its spot visited, its ward walked — and its tokens become the
// pickups it prefers. The refusals are asserted as hard as the feature: the
// "not yet" nag is never a destination, a giver the march cannot close on is
// written off, and a token the pickup pass would refuse (a dead errand's
// leftover) is never wanted. All on synthetic fixture quests registered
// through `registerDefs`, the same seam a mod's errands arrive through.

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
  errandGiver,
  questObjectiveTarget,
  questTokenWanted,
  trackErrandAbandon,
} from "../../engine/game/bot/errands.ts";
import { macroSteer, macroTarget } from "../../engine/game/bot/macro.ts";
import { roughPos } from "../../engine/game/bot/content.ts";
import {
  nearestWantedItem,
  wantedItemNearby,
} from "../../engine/game/bot/supplies.ts";
import { questSpot } from "../../engine/game/quests/placement.ts";
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
  // An ESCORT errand — somebody to walk to a door.
  bot_walk: {
    id: "bot_walk",
    level: "test_level",
    giver: "bot_giver",
    name: "BOT WALK",
    lore: "A synthetic fixture errand: walk somebody somewhere.",
    offer: [["WALK THEM OUT."]],
    complete: [["THEY MADE IT."]],
    objectives: [
      { kind: "escort", escort: "bot_ward", to: { x: 1800, y: 1320 } },
    ],
    escorts: [
      {
        id: "bot_ward",
        name: "BOT WARD",
        sprite: "bot_ward",
        at: { x: 520, y: 1320 },
      },
    ],
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

/**
 * A cleared solo run with no obstacles to trip the straight-line reads — and
 * with the fixture giver's whole slate already HANDED IN.
 *
 * That last part is load-bearing now that a `!` outranks the objectives it
 * opens: a giver still holding work is the macro plan, quite correctly, so a
 * suite about where a RUNNING errand sends the hero has to settle everything it
 * is not testing first. `activate` puts the one under test back on the board.
 */
function stage(): GameState {
  const state = startGame(9);
  clearStage(state);
  state.obstacles = [];
  state.items = [];
  for (const id of Object.keys(FIX_QUESTS)) {
    state.quests[id] = {
      id,
      status: "turnedIn",
      counts: questDefCounts(id),
      dryKills: questDefCounts(id),
      acceptedAtMs: 0,
    };
  }
  return state;
}

/** A zero tally the right length for a fixture quest's objectives. */
function questDefCounts(id: string): number[] {
  return (FIX_QUESTS[id]?.objectives ?? []).map(() => 0);
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
    const bot = createBot("balanced");
    const goal = questObjectiveTarget(bot, state, state.players[0]!);
    expect(goal?.pos).toEqual({ x: 900, y: 1100 });
    expect(goal?.thought).toBe("FETCH TOKEN");
    // …and the macro ladder actually routes there (nothing above outranks it
    // on this cleared stage).
    expect(macroTarget(bot, state, state.players[0]!, TUNE)).toEqual({
      x: 900,
      y: 1100,
    });
  });

  it("stops wanting tokens once the tally is met", () => {
    const state = stage();
    activate(state, "bot_fetch", [2]); // need is 2 — the errand is done
    dropToken(state, { x: 900, y: 1100 });
    const bot = createBot("balanced");
    expect(questObjectiveTarget(bot, state, state.players[0]!)).toBeNull();
  });

  it("walks to a visit objective's spot on this level", () => {
    const state = stage();
    activate(state, "bot_visit", [0]);
    const hero = state.players[0]!;
    const bot = createBot("balanced");
    const goal = questObjectiveTarget(bot, state, hero);
    expect(goal?.pos).toEqual(questSpot(state, { x: 2000, y: 600 }));
    expect(goal?.thought).toBe("ON ERRAND");
    expect(macroTarget(bot, state, hero, TUNE)).toEqual(goal!.pos);
  });

  it("ignores a visit objective on another level", () => {
    const state = stage();
    activate(state, "bot_far_visit", [0]);
    const bot = createBot("balanced");
    expect(questObjectiveTarget(bot, state, state.players[0]!)).toBeNull();
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
    const bot = createBot("balanced");
    const goal = questObjectiveTarget(bot, state, hero);
    expect(goal?.pos).toEqual(roughPos(brute.pos));
    expect(goal?.thought).toBe("ON ERRAND");
    expect(macroTarget(bot, state, hero, TUNE)).toEqual(roughPos(brute.pos));
  });

  it("has no goal once the cull is complete", () => {
    const state = stage();
    activate(state, "bot_cull", [3]);
    state.enemies.push(
      makeEnemy({ id: 9203, pos: { x: 1400, y: 1000 } }, "test_brute"),
    );
    const bot = createBot("balanced");
    expect(questObjectiveTarget(bot, state, state.players[0]!)).toBeNull();
  });
});

describe("the bot goes and takes the errand", () => {
  // The rule this suite used to assert was the opposite one — a giver was
  // never a goal, because taking an errand was the player's decision. That
  // left the autopilot walking past the one part of a level with a name on it
  // and throwing its whole payout away, so the boundary moved: the bot takes
  // work everywhere now, and what is asserted here is that it actually does.
  it("walks to an unaccepted quest's giver", () => {
    const state = stage();
    // Put one offer back on the board — this suite's stage hands them all in.
    delete state.quests["bot_fetch"];
    const giver = state.questGivers.find((g) => g.id === "bot_giver");
    expect(giver).toBeTruthy();
    const bot = createBot("balanced");
    // Nothing is running, so there is no OBJECTIVE to walk to…
    expect(questObjectiveTarget(bot, state, state.players[0]!)).toBeNull();
    // …but there is somebody with a `!` over their head, and that is the plan.
    expect(errandGiver(bot, state, state.players[0]!)?.giverId).toBe(
      "bot_giver",
    );
    expect(macroTarget(bot, state, state.players[0]!, TUNE)).toEqual(
      giver!.pos,
    );
  });

  it("stops walking to somebody whose slate is only a NOT-YET nag", () => {
    const state = stage();
    // Taken, unfinished: the giver's mark drops to grey `?`, which is a
    // conversation with nothing in it.
    activate(state, "bot_fetch", [0]);
    activate(state, "bot_cull", [0]);
    activate(state, "bot_visit", [0]);
    activate(state, "bot_far_visit", [0]);
    const bot = createBot("balanced");
    expect(errandGiver(bot, state, state.players[0]!)).toBeNull();
  });

  it("goes back to hand a finished errand in", () => {
    const state = stage();
    activate(state, "bot_fetch", [2]);
    state.quests["bot_fetch"]!.status = "complete";
    // …with nothing else of theirs on offer, so the `?` is the whole reason.
    const bot = createBot("balanced");
    expect(errandGiver(bot, state, state.players[0]!)?.giverId).toBe(
      "bot_giver",
    );
  });

  it("writes a giver off when the march makes no headway", () => {
    const state = stage();
    // Put the offer back on the board — this suite's stage hands everything in.
    delete state.quests["bot_fetch"];
    const hero = state.players[0]!;
    const bot = createBot("balanced");
    expect(errandGiver(bot, state, hero)?.giverId).toBe("bot_giver");
    // Steer at them (which is what plans the route the gauge reads) while the
    // hero never actually moves: no headway, ever — a giver a carve walled off.
    for (let ms = 0; ms <= 40_000; ms += 500) {
      state.stats.timeMs = ms;
      macroSteer(bot, state, hero, TUNE);
      trackErrandAbandon(bot, state, hero);
    }
    expect(bot.errand?.skip).toContain("bot_giver");
    expect(errandGiver(bot, state, hero)).toBeNull();
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

describe("walking somebody somewhere", () => {
  /** A run with the escort errand taken and its ward on the field. */
  function walking(gap: number): {
    state: GameState;
    hero: GameState["players"][number];
    bot: ReturnType<typeof createBot>;
  } {
    const state = stage();
    activate(state, "bot_walk", [0]);
    const hero = state.players[0]!;
    hero.pos.x = 900;
    hero.pos.y = 1320;
    state.escorts.push({
      id: 7100,
      questId: "bot_walk",
      defId: "bot_ward",
      pos: { x: hero.pos.x - gap, y: hero.pos.y },
      hp: 200,
      maxHp: 200,
      to: { x: 1800, y: 1320 },
      faceLeft: false,
      moving: false,
      hitCooldownMs: 0,
      arrived: false,
      waiting: false,
    });
    return { state, hero, bot: createBot("balanced") };
  }

  it("heads for the door while they are keeping up", () => {
    const { state, hero, bot } = walking(40);
    const goal = questObjectiveTarget(bot, state, hero);
    expect(goal?.thought).toBe("WALK THEM");
    expect(goal?.pos).toEqual({ x: 1800, y: 1320 });
  });

  it("turns back once they have been left behind", () => {
    // Past the hold band (a share of `escortLeashDistance`, beyond which the
    // escort stops dead and the errand stops progressing at all).
    const { state, hero, bot } = walking(200);
    const goal = questObjectiveTarget(bot, state, hero);
    expect(goal?.thought).toBe("WALK THEM");
    expect(goal?.pos).toEqual({ x: 700, y: 1320 });
    // …and HOLDS the turn-back through the band (hysteresis), so the walk
    // makes real legs instead of stuttering on the boundary.
    hero.pos.x = 800; // gap 100 — inside the far bar, outside the near one
    expect(questObjectiveTarget(bot, state, hero)?.pos).toEqual({
      x: 700,
      y: 1320,
    });
  });

  it("stops caring once they have arrived", () => {
    const { state, hero, bot } = walking(40);
    state.escorts[0]!.arrived = true;
    expect(questObjectiveTarget(bot, state, hero)).toBeNull();
  });
});

describe("quest loot comes first", () => {
  it("prefers a token over a nearer ordinary drop", () => {
    const state = stage();
    activate(state, "bot_fetch", [0]);
    const hero = state.players[0]!;
    const bot = createBot("balanced");
    // A medkit two steps away, the errand's token four — on distance alone the
    // kit wins, which is exactly what left tokens lying on swept ground.
    state.items.push({
      id: 9500,
      kind: "medkit",
      pos: { x: hero.pos.x + 60, y: hero.pos.y },
    });
    dropToken(state, { x: hero.pos.x + 140, y: hero.pos.y });
    const token = state.items.find((i) => i.kind === "quest");
    expect(nearestWantedItem(state, hero)?.kind).toBe("medkit");
    expect(wantedItemNearby(bot, state, hero, TUNE)).toBe(token);
  });

  it("leaves a token its errand cannot bank to the ordinary read", () => {
    const state = stage();
    const hero = state.players[0]!;
    const bot = createBot("balanced");
    state.items.push({
      id: 9501,
      kind: "medkit",
      pos: { x: hero.pos.x + 60, y: hero.pos.y },
    });
    // No log entry at all — the pickup pass would refuse this token.
    dropToken(state, { x: hero.pos.x + 140, y: hero.pos.y });
    expect(wantedItemNearby(bot, state, hero, TUNE)?.kind).toBe("medkit");
  });
});

describe("the work outranks the caches", () => {
  it("puts a running errand's token above a chest on the sweep", () => {
    const state = stage();
    activate(state, "bot_fetch", [0]);
    const hero = state.players[0]!;
    const bot = createBot("balanced");
    // A chest right beside him, the token well across the room.
    state.obstacles.push({
      id: 9600,
      kind: "test_chest",
      sprite: "chest",
      pos: { x: hero.pos.x + 90, y: hero.pos.y },
      radius: 10,
      jumpable: false,
      chest: true,
      breakable: true,
      hp: 40,
      maxHp: 40,
    });
    state.obstaclesVersion++;
    dropToken(state, { x: hero.pos.x + 700, y: hero.pos.y });
    expect(macroTarget(bot, state, hero, TUNE)).toEqual({
      x: hero.pos.x + 700,
      y: hero.pos.y,
    });
  });
});
