// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AUTO PILOT (src/game/autopilot.ts): the coin-metered self-playing mode.
// The engine bills the purse per SIMULATED second (× the speed rung) inside
// `step()`, refuses a ride the purse can't cover, disengages itself with an
// `autopilotStopped` event when the coins run dry, and routes the next run
// (advance / farm / secret-level return) via `autopilotNextLevel`. Runs on
// synthetic fixtures — the routing tests use plain made-up ids.

import { describe, expect, it } from "vitest";

import {
  AUTOPILOT,
  autopilotDrainPerSecond,
  autopilotNextLevel,
  autopilotStepUp,
  creditAutopilotPurse,
  normalizeAutopilotSpeed,
  openShop,
  pauseGame,
  sellItem,
  setAutopilotSpeed,
  startAutopilot,
  step,
  stopAutopilot,
} from "@game/core";
import type { GameState, Player } from "@game/core";
import { clearStage, DT, idle, run, startGame, stopWaves } from "./helpers.ts";

/** The hero buying the ride — the one seat these fixtures have. The ride's
 * verbs take an ACTING HERO because a purse is private (see `startAutopilot`);
 * the two-hero case is `coop_rules_test.ts`'s. */
function hero(state: GameState): Player {
  return state.players[0] as Player;
}

/** A quiet field: no waves, no mobs — nothing to interrupt the meter. */
function quietGame(coins: number): GameState {
  const state = startGame();
  stopWaves(state);
  clearStage(state);
  state.players[0].coins = coins;
  return state;
}

describe("speed rungs", () => {
  it("offers every rung from real-time to the fast-forward ceiling", () => {
    expect(AUTOPILOT.speeds).toEqual([1, 2, 4, 8, 16]);
  });

  it("snaps a requested speed to the closest offered rung", () => {
    expect(normalizeAutopilotSpeed(1)).toBe(1);
    expect(normalizeAutopilotSpeed(2)).toBe(2);
    expect(normalizeAutopilotSpeed(5)).toBe(4);
    expect(normalizeAutopilotSpeed(8)).toBe(8);
    expect(normalizeAutopilotSpeed(16)).toBe(16);
    expect(normalizeAutopilotSpeed(100)).toBe(16);
    expect(normalizeAutopilotSpeed(Number.NaN)).toBe(1);
  });

  it("prices each rung at base × speed per game-second", () => {
    expect(autopilotDrainPerSecond(1)).toBe(AUTOPILOT.coinsPerSecond);
    expect(autopilotDrainPerSecond(2)).toBe(AUTOPILOT.coinsPerSecond * 2);
    expect(autopilotDrainPerSecond(8)).toBe(AUTOPILOT.coinsPerSecond * 8);
    expect(autopilotDrainPerSecond(16)).toBe(AUTOPILOT.coinsPerSecond * 16);
  });
});

describe("engaging", () => {
  it("refuses a purse that can't cover one second at the picked rung", () => {
    const state = quietGame(0);
    expect(startAutopilot(state, hero(state))).toBe(false);
    expect(state.autopilot.active).toBe(false);

    // One second at 1× is affordable; the same purse can't fund 8×.
    state.players[0].coins = AUTOPILOT.coinsPerSecond;
    expect(startAutopilot(state, hero(state), 8)).toBe(false);
    expect(startAutopilot(state, hero(state), 1)).toBe(true);
    expect(state.autopilot.active).toBe(true);
    expect(state.autopilot.speed).toBe(1);
  });

  it("refuses a run that is already over", () => {
    const state = quietGame(1_000_000);
    state.phase = "defeat";
    expect(startAutopilot(state, hero(state))).toBe(false);
  });

  it("retunes the rung mid-flight, but only while engaged", () => {
    const state = quietGame(100_000);
    expect(setAutopilotSpeed(state, 8)).toBe(false);
    expect(startAutopilot(state, hero(state), 1)).toBe(true);
    expect(setAutopilotSpeed(state, 8)).toBe(true);
    expect(state.autopilot.speed).toBe(8);
  });
});

describe("the meter", () => {
  it("drains coinsPerSecond per game-second at 1×", () => {
    const state = quietGame(1000);
    startAutopilot(state, hero(state), 1);
    run(state, idle, 125); // 125 × 16ms = 2000ms of game time
    expect(state.players[0].coins).toBe(1000 - 2 * AUTOPILOT.coinsPerSecond);
    expect(state.autopilot.coinsSpent).toBe(2 * AUTOPILOT.coinsPerSecond);
  });

  it("drains 8× per game-second on the 8× rung", () => {
    const state = quietGame(10_000);
    startAutopilot(state, hero(state), 8);
    run(state, idle, 125); // 2000ms of game time
    expect(state.players[0].coins).toBe(10_000 - 16 * AUTOPILOT.coinsPerSecond);
  });

  it("holds the meter while the run is paused", () => {
    const state = quietGame(1000);
    startAutopilot(state, hero(state), 1);
    pauseGame(state, state.players[0]);
    run(state, idle, 125);
    expect(state.players[0].coins).toBe(1000);
    expect(state.autopilot.active).toBe(true);
  });

  it("stops billing after a player stop", () => {
    const state = quietGame(1000);
    startAutopilot(state, hero(state), 1);
    run(state, idle, 63); // ~1s → ~100 coins burned
    expect(stopAutopilot(state)).toBe(true);
    const left = state.players[0].coins;
    run(state, idle, 125);
    expect(state.players[0].coins).toBe(left);
  });

  it("disengages with an autopilotStopped event when the purse runs dry", () => {
    const state = quietGame(AUTOPILOT.coinsPerSecond); // funds exactly 1s at 1×
    startAutopilot(state, hero(state), 1);
    let stopped = false;
    for (let i = 0; i < 200 && !stopped; i++) {
      step(state, idle, DT);
      stopped = state.events.some(
        (e) => e.type === "autopilotStopped" && e.reason === "coins",
      );
    }
    expect(stopped).toBe(true);
    expect(state.players[0].coins).toBe(0);
    expect(state.autopilot.active).toBe(false);
    // The run itself carries on — only the autopilot let go.
    expect(state.phase).toBe("playing");
  });
});

describe("crediting the purse", () => {
  it("tops the purse up so a refused rung becomes affordable", () => {
    const state = quietGame(0);
    expect(startAutopilot(state, hero(state), 1)).toBe(false);

    expect(
      creditAutopilotPurse(state, hero(state), AUTOPILOT.coinsPerSecond),
    ).toBe(AUTOPILOT.coinsPerSecond);
    expect(state.players[0].coins).toBe(AUTOPILOT.coinsPerSecond);
    expect(startAutopilot(state, hero(state), 1)).toBe(true);
  });

  it("adds to an existing purse in whole coins and ignores nothing amounts", () => {
    const state = quietGame(500);
    expect(creditAutopilotPurse(state, hero(state), 250.9)).toBe(250);
    expect(state.players[0].coins).toBe(750);
    expect(creditAutopilotPurse(state, hero(state), 0)).toBe(0);
    expect(creditAutopilotPurse(state, hero(state), -100)).toBe(0);
    expect(creditAutopilotPurse(state, hero(state), Number.NaN)).toBe(0);
    expect(state.players[0].coins).toBe(750);
  });
});

describe("the takings meter (coinsEarned)", () => {
  /** Open the counter with `loot` in the first bag cell — the ride's only way
   * of turning what it kills into coins. */
  function atTheCounter(coins: number): GameState {
    const state = quietGame(coins);
    state.obstacles = []; // nothing between hero and stall — the meeting needs sight
    state.merchant.discovered = true;
    state.players[0].pos = { ...state.merchant.pos };
    state.players[0].inventory[0] = {
      id: 1,
      defId: "blaster",
      slot: "weapon",
      tier: "regular",
      ilvl: 3,
      affixes: [],
    };
    return state;
  }

  it("books what the ride sells as EARNED, apart from what it spent", () => {
    const state = atTheCounter(1000);
    startAutopilot(state, hero(state), 1);
    run(state, idle, 63); // ~1s of metered flight → the price
    const billed = state.autopilot.coinsSpent;
    expect(billed).toBeGreaterThan(0);
    expect(state.autopilot.coinsEarned).toBe(0);

    expect(openShop(state, state.players[0])).toBe(true);
    const paid = sellItem(state, state.players[0], 0);
    expect(paid).toBeGreaterThan(0);
    // The sale lands in the takings; the price is untouched by it.
    expect(state.autopilot.coinsEarned).toBe(paid);
    expect(state.autopilot.coinsSpent).toBe(billed);
  });

  it("ignores sales made off the ride — takings are the flight's, not the run's", () => {
    const state = atTheCounter(1000);
    expect(state.autopilot.active).toBe(false);
    expect(openShop(state, state.players[0])).toBe(true);
    expect(sellItem(state, state.players[0], 0)).toBeGreaterThan(0);
    expect(state.autopilot.coinsEarned).toBe(0);
  });

  it("does not count a store top-up as earnings", () => {
    const state = quietGame(500);
    startAutopilot(state, hero(state), 1);
    expect(creditAutopilotPurse(state, hero(state), 5_000)).toBe(5_000);
    expect(state.autopilot.coinsEarned).toBe(0);
  });
});

describe("routing (autopilotNextLevel)", () => {
  const route = {
    order: ["lvl_a", "lvl_b", "lvl_c"],
    beaten: false,
    farmLevel: "lvl_farm",
  };

  it("advances the campaign while the difficulty is unbeaten", () => {
    expect(autopilotNextLevel("lvl_a", route)).toBe("lvl_b");
    expect(autopilotNextLevel("lvl_b", route)).toBe("lvl_c");
  });

  it("rolls the last campaign clear into the farm level", () => {
    expect(autopilotNextLevel("lvl_c", route)).toBe("lvl_farm");
  });

  it("farms forever once the difficulty is beaten", () => {
    const beaten = { ...route, beaten: true };
    expect(autopilotNextLevel("lvl_a", beaten)).toBe("lvl_farm");
    expect(autopilotNextLevel("lvl_farm", beaten)).toBe("lvl_farm");
  });

  it("a session pinned to a replayed level farms that level, never advancing", () => {
    // Engaged on already-cleared ground (a goodco/mars farm): every clear
    // restarts the pinned level — even with the difficulty beaten, and even
    // though the campaign has a next level to offer.
    const pinned = { ...route, pinned: "lvl_a" };
    expect(autopilotNextLevel("lvl_a", pinned)).toBe("lvl_a");
    expect(autopilotNextLevel("lvl_a", { ...pinned, beaten: true })).toBe(
      "lvl_a",
    );
  });

  it("the secret-level door outranks the pin", () => {
    // A bunker detour from a pinned rift farm still returns through exitTo.
    const pinned = { ...route, beaten: true, pinned: "lvl_farm" };
    expect(autopilotNextLevel("lvl_secret", pinned, "lvl_farm")).toBe(
      "lvl_farm",
    );
  });

  it("always returns a secret level through its own door", () => {
    // The bunker's exitTo wins even on a beaten difficulty — cow-level style,
    // back to the rift for a fresh key.
    const beaten = { ...route, beaten: true };
    expect(autopilotNextLevel("lvl_secret", beaten, "lvl_farm")).toBe(
      "lvl_farm",
    );
  });

  it("falls back to the farm on a level outside the campaign order", () => {
    expect(autopilotNextLevel("lvl_unknown", route)).toBe("lvl_farm");
  });
});

describe("stepping up a difficulty (autopilotStepUp)", () => {
  const route = {
    order: ["lvl_a", "lvl_b", "lvl_c"],
    beaten: false,
    farmLevel: "lvl_farm",
  };

  it("climbs the ladder once the campaign is beaten and a rung is open", () => {
    // Beating the game is exactly when a player raises the difficulty, so the
    // ride does too — rather than grinding the beaten rung's rift all night.
    expect(
      autopilotStepUp({ ...route, beaten: true, stepUp: "nightmare" }),
    ).toBe("nightmare");
  });

  it("stays put while the campaign is unfinished", () => {
    expect(autopilotStepUp({ ...route, stepUp: "nightmare" })).toBeNull();
  });

  it("stays put at the top of the ladder", () => {
    // Nothing left to unlock: the beaten rung farms on as before.
    expect(autopilotStepUp({ ...route, beaten: true })).toBeNull();
    expect(
      autopilotStepUp({ ...route, beaten: true, stepUp: null }),
    ).toBeNull();
  });

  it("never overrides a deliberate farm order", () => {
    // A session PINNED to a level was the player asking for that level, at
    // that rung — a step-up would silently disobey it.
    expect(
      autopilotStepUp({
        ...route,
        beaten: true,
        pinned: "lvl_a",
        stepUp: "nightmare",
      }),
    ).toBeNull();
  });

  it("finishes a secret-level detour before changing rung", () => {
    // The bunker crossing IS the run; a rung change mid-detour strands it.
    expect(
      autopilotStepUp(
        { ...route, beaten: true, stepUp: "nightmare" },
        "lvl_farm",
      ),
    ).toBeNull();
  });
});
