// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AUTOPILOT AT HOME (engine/game/bot/hub.ts): on a HUB level the bot works the
// room — the people with a mark over their head, the counter, then the car out
// — where before it stood still, because a hub has no horde, no cache, no fog
// and no boss for the ordinary macro ladder to answer with.
//
// All on the synthetic hub fixtures (`test_hub_level` / `test_road_level`) and
// a fixture giver registered through `registerDefs`, the same seam a mod's
// errands arrive through — so these assert the ENGINE rule and survive the
// shipped garage being deleted.
//
// The BOUNDARY is asserted as hard as the feature: out in the field the bot
// still never walks to a giver and never takes an errand (that is the player's
// decision — see bot/errands.ts), and `bot_errands_test.ts` guards the other
// side of the same line.

import { beforeEach, describe, expect, it } from "vitest";

import { distance } from "@game/lib/vec.ts";
import {
  createBot,
  DOORS,
  registerDefs,
  type GameState,
  type Player,
  type QuestDef,
  type QuestGiverDef,
} from "@game/core";

import {
  atHub,
  botScreenCommand,
  driveOutInput,
  heroCar,
  hubCar,
  hubGoal,
  hubTapCommand,
  trackHubShop,
} from "../../engine/game/bot/hub.ts";
import { errandGiver, giverTapCommand } from "../../engine/game/bot/errands.ts";
import { doorwayVia, routeSteer } from "../../engine/game/bot/nav.ts";
import { macroTarget } from "../../engine/game/bot/macro.ts";
import { botAct } from "../../engine/game/bot/index.ts";
import { botTuningFor } from "../../engine/game/bot/state.ts";
import { applyRunCommand } from "../../engine/game/commands.ts";
import { step } from "../../engine/game/step/index.ts";
import { clearStage, startGame } from "./helpers.ts";

/** Where the fixture hub's car is parked (fixtures.ts `FIX_HUB_LEVEL`). */
const CAR_AT = { x: 700, y: 500 };
/** The fixture giver's post — a walk away from the car, so "who is he going
 * to?" is a question with a visible answer. */
const GIVER_AT = { x: 640, y: 380 };

const FIX_GIVERS: Record<string, QuestGiverDef> = {
  hub_giver: {
    id: "hub_giver",
    level: "test_road_level",
    name: "HUB GIVER",
    sprite: "hub_giver",
    at: GIVER_AT,
    lore: "A synthetic fixture civilian standing in the hub with an errand to hand out.",
  },
};

const FIX_QUESTS: Record<string, QuestDef> = {
  hub_errand: {
    id: "hub_errand",
    level: "test_road_level",
    giver: "hub_giver",
    name: "HUB ERRAND",
    lore: "A synthetic fixture errand handed out at home.",
    offer: [["BRING ME ONE."]],
    complete: [["GOOD."]],
    objectives: [{ kind: "kill", enemy: "test_minion", count: 1 }],
    reward: { coins: 5 },
  },
};

beforeEach(() => {
  registerDefs({ quests: FIX_QUESTS, questGivers: FIX_GIVERS });
});
registerDefs({ quests: FIX_QUESTS, questGivers: FIX_GIVERS });

const TUNE = botTuningFor("test_road_level");

/** A hub run past the opening, with the field cleared — which on a hub is
 * simply what a hub is. */
function stage(levelId = "test_road_level"): GameState {
  const state = startGame(11, levelId);
  clearStage(state);
  state.enemies = [];
  return state;
}

/** Put the hero on a spot (the hub is small; the walk is not what is tested). */
function stand(hero: Player, at: { x: number; y: number }): void {
  hero.pos.x = at.x;
  hero.pos.y = at.y;
}

describe("the hub is a level the autopilot can play", () => {
  it("knows home from everywhere else", () => {
    expect(atHub(stage())).toBe(true);
    expect(atHub(startGame(11, "test_level"))).toBe(false);
  });

  it("goes to the person with work before anything else", () => {
    const state = stage();
    const hero = state.players[0]!;
    const bot = createBot("balanced");
    stand(hero, CAR_AT);
    // The PERSON is `errands.ts`'s rung (it applies on every map), and it sits
    // ABOVE the hub's own — so the hub answers "the car" while the ladder as a
    // whole still walks him to Ruth first.
    expect(errandGiver(bot, state, hero)?.giverId).toBe("hub_giver");
    expect(hubGoal(bot, state, hero, false)?.thought).toBe("TO CAR");
    // …and the macro ladder actually routes there, which is the half that was
    // missing: a hub answers every other rung with nothing.
    expect(macroTarget(bot, state, hero, TUNE)).toEqual(GIVER_AT);
  });

  it("taps the giver it walked to, and only once it is there", () => {
    const state = stage();
    const hero = state.players[0]!;
    const bot = createBot("balanced");
    const tap = () =>
      giverTapCommand(bot, state, hero, macroTarget(bot, state, hero, TUNE));
    stand(hero, CAR_AT); // parked on the car, a long step from the giver
    expect(tap()).toBeNull();
    stand(hero, { x: GIVER_AT.x, y: GIVER_AT.y + 40 });
    expect(tap()).toEqual({
      name: "talkToQuestGiver",
      args: ["hub_giver"],
    });
  });

  it("never boards the car with a person still waiting", () => {
    // The hero SPAWNS on the parking spot, so a ladder that pressed whatever
    // was in reach drove out on the first tick of every visit. The giver rung
    // above the hub's is what holds the car shut until the slate is worked.
    const state = stage();
    const hero = state.players[0]!;
    const bot = createBot("balanced");
    stand(hero, CAR_AT);
    expect(errandGiver(bot, state, hero)).toBeTruthy();
    expect(macroTarget(bot, state, hero, TUNE)).toEqual(GIVER_AT);
  });

  it("takes the errand off the offer, and hands the finished one back", () => {
    const state = stage();
    const hero = state.players[0]!;
    stand(hero, GIVER_AT);
    // Walking into `QUESTS.talkRadius` MEETS the giver (stepQuests), which the
    // tap reach sits inside — so by the time the bot presses, this has already
    // happened on the way in. Set outright here so the press is what is tested.
    state.questGivers.find((g) => g.id === "hub_giver")!.discovered = true;
    expect(
      applyRunCommand(state, "talkToQuestGiver", ["hub_giver"], hero),
    ).toBe(true);
    expect(hero.screen).toBe("quest");
    // A single topic opens the conversation itself; the bot accepts it.
    const take = botScreenCommand(state, hero);
    expect(take).toEqual({ name: "acceptQuest", args: [] });
    applyRunCommand(state, take!.name, take!.args, hero);
    expect(state.quests["hub_errand"]?.status).toBe("active");
    // Nothing left to walk over for while it is merely RUNNING — the "not yet"
    // nag is a conversation with nothing in it.
    const bot = createBot("balanced");
    expect(errandGiver(bot, state, hero)).toBeNull();
    // Finish it, and the `?` brings him back.
    state.quests["hub_errand"]!.status = "complete";
    expect(errandGiver(bot, state, hero)?.giverId).toBe("hub_giver");
    applyRunCommand(state, "talkToQuestGiver", ["hub_giver"], hero);
    const hand = botScreenCommand(state, hero);
    expect(hand).toEqual({ name: "turnInQuest", args: [] });
    applyRunCommand(state, hand!.name, hand!.args, hero);
    expect(state.quests["hub_errand"]?.status).toBe("turnedIn");
  });

  it("closes a screen it has nothing to do with rather than parking behind it", () => {
    const state = stage();
    const hero = state.players[0]!;
    hero.screen = "quest";
    state.questOffer = null;
    expect(botScreenCommand(state, hero)).toEqual({
      name: "closeQuestDialogue",
      args: [],
    });
  });

  it("has nothing to press when no screen is up and nothing is in reach", () => {
    const state = stage();
    const hero = state.players[0]!;
    stand(hero, { x: 200, y: 200 });
    expect(botScreenCommand(state, hero)).toBeNull();
  });
});

describe("the car out", () => {
  /** The hub with its errands already settled — turned in, so nobody carries a
   * mark and the errand rung above the hub's stays silent — so the car is the
   * plan. */
  function settled(): { state: GameState; hero: Player } {
    const state = stage();
    const hero = state.players[0]!;
    state.quests["hub_errand"] = {
      id: "hub_errand",
      status: "turnedIn",
      counts: [1],
      dryKills: [0],
      acceptedAtMs: 0,
    };
    return { state, hero };
  }

  it("makes the car the plan once the room is worked", () => {
    const { state, hero } = settled();
    stand(hero, { x: 400, y: 500 });
    const goal = hubGoal(createBot("balanced"), state, hero, false);
    expect(goal?.thought).toBe("TO CAR");
    expect(goal?.pos).toEqual(CAR_AT);
  });

  it("climbs in at the car, and then IS the driver", () => {
    const { state, hero } = settled();
    const bot = createBot("balanced");
    stand(hero, CAR_AT);
    expect(hubTapCommand(bot, state, hero, false)).toEqual({
      name: "enterCar",
      args: [],
    });
    expect(applyRunCommand(state, "enterCar", [], hero)).toBe(true);
    expect(heroCar(state, hero)).toBeTruthy();
    // A car with somebody at the wheel is no longer a place to walk to.
    expect(hubCar(state)).toBeNull();
    expect(hubTapCommand(bot, state, hero, false)).toBeNull();
  });

  it("steers a driven car at the road, and drives out", () => {
    const { state, hero } = settled();
    const bot = createBot("balanced");
    stand(hero, CAR_AT);
    applyRunCommand(state, "enterCar", [], hero);
    const drive = driveOutInput(bot, state, hero);
    expect(drive?.steering).toBe(true);
    // The road runs north-south from x 1000; the car is parked at x 700, so
    // the whole trip is eastward.
    expect(drive!.target.x).toBeGreaterThan(CAR_AT.x);
    // …and driven, it actually gets there: the departure books with the
    // destination the level's own car door names.
    let departed: string | undefined;
    for (let tick = 0; tick < 1200 && !departed; tick++) {
      const input = botAct(bot, state, hero);
      step(state, input, 16);
      for (const event of state.events) {
        if (event.type === "carDeparted") departed = event.to;
      }
      if (state.departure?.booked) departed ??= state.departure.to;
    }
    expect(departed).toBe("test_level_2");
  });

  it("drives nothing when the hero is on his own feet", () => {
    const { state, hero } = settled();
    expect(driveOutInput(createBot("balanced"), state, hero)).toBeNull();
  });
});

describe("the counter can never strand the ride", () => {
  it("writes the shop errand off after standing at it too long, and leaves", () => {
    const state = stage();
    const hero = state.players[0]!;
    const bot = createBot("balanced");
    state.quests["hub_errand"] = {
      id: "hub_errand",
      status: "turnedIn",
      counts: [1],
      dryKills: [0],
      acceptedAtMs: 0,
    };
    stand(hero, state.merchant.pos);
    // A want the trade cannot satisfy: standing AT the counter, still wanting.
    expect(hubGoal(bot, state, hero, true)?.thought).toBe("TO SHOP");
    for (let ms = 0; ms <= 60_000; ms += 1000) {
      state.stats.timeMs = ms;
      trackHubShop(bot, state, hero, true);
    }
    expect(hubGoal(bot, state, hero, true)?.thought).toBe("TO CAR");
  });

  it("re-arms the clock whenever the hero is not standing at the counter", () => {
    const state = stage();
    const hero = state.players[0]!;
    const bot = createBot("balanced");
    stand(hero, { x: 100, y: 100 });
    for (let ms = 0; ms <= 60_000; ms += 1000) {
      state.stats.timeMs = ms;
      trackHubShop(bot, state, hero, true);
    }
    expect(bot.hub?.shopDone).toBe(false);
  });
});

describe("the errand boundary holds off the hub", () => {
  it("has no home plan on an ordinary level", () => {
    const state = startGame(11, "test_level");
    clearStage(state);
    const hero = state.players[0]!;
    expect(hubGoal(createBot("balanced"), state, hero, true)).toBeNull();
    expect(hubTapCommand(createBot("balanced"), state, hero, false)).toBeNull();
  });
});

describe("the hub keeps the autopilot deterministic", () => {
  it("plays a hub identically from the same seed with a fresh bot", () => {
    const trail = (): string[] => {
      const state = stage();
      const hero = state.players[0]!;
      const bot = createBot("balanced");
      const out: string[] = [];
      for (let tick = 0; tick < 240; tick++) {
        const input = botAct(bot, state, hero);
        out.push(
          `${bot.lastThought}|${input.target.x.toFixed(2)},${input.target.y.toFixed(2)}`,
        );
        step(state, input, 16);
      }
      return out;
    };
    expect(trail()).toEqual(trail());
  });
});

describe("a shut door that opens for anybody is a way through", () => {
  /**
   * THE BAY, WALLED. The garage fixture hangs its roll-up across x 800 between
   * y 440 and 560 but authors no walls around it, so the hero could simply walk
   * round the leaf — and the rule being tested only exists for a door that is
   * genuinely the only way out. So build the wall: one slab above the doorway,
   * one below, leaving exactly the door's own span as the gap.
   */
  function walledBay(state: GameState): void {
    const slab = (
      id: number,
      cy: number,
      halfY: number,
    ): GameState["obstacles"][number] => ({
      id,
      kind: "test_wall",
      sprite: "wall",
      pos: { x: 800, y: cy },
      radius: Math.hypot(10, halfY),
      half: { x: 10, y: halfY },
      jumpable: false,
    });
    state.obstacles.push(slab(9500, 220, 220), slab(9501, 1080, 520));
    state.obstaclesVersion++;
  }

  it("walks up to the bay door when the goal is on the far side of it", () => {
    // The nav grid is built from the obstacle field, so a closed `approach`
    // door reads as a solid wall and A* comes back EMPTY — which is what left
    // the bot tracing the bay wall forever instead of going out to the counter.
    // `doorwayVia` names the spot to walk to; arriving opens it.
    const state = stage("test_garage_level");
    walledBay(state);
    const hero = state.players[0]!;
    const bot = createBot("balanced");
    stand(hero, { x: 700, y: 500 }); // in the bay, west of the door at x 800
    const door = state.doors[0]!;
    expect(door.open).toBe(false);
    const beyond = { x: 1100, y: 500 }; // out past the threshold
    const via = doorwayVia(bot, state, hero, beyond);
    expect(via).toBeTruthy();
    expect(distance(via!, door.center)).toBeLessThan(DOORS.openRadius);
    // …and it is NOT consulted for a goal the hero can already reach.
    expect(doorwayVia(bot, state, hero, { x: 640, y: 380 })).toBeNull();
  });

  it("gets out of the bay under its own steam, and the door opens", () => {
    const state = stage("test_garage_level");
    walledBay(state);
    const hero = state.players[0]!;
    const bot = createBot("balanced");
    stand(hero, { x: 700, y: 500 });
    // Anything out on the lot is a walk through the doorway — which is the
    // whole of the garage's own geometry.
    const outside = { x: 1100, y: 500 };
    for (let tick = 0; tick < 1500 && !state.doors[0]!.open; tick++) {
      step(state, routeSteer(bot, state, hero, outside), 16);
    }
    expect(state.doors[0]!.open).toBe(true);
    expect(hero.pos.x).toBeGreaterThan(700);
  });
});
