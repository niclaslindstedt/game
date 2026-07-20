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
  normalizeAutopilotSpeed,
  pauseGame,
  setAutopilotSpeed,
  startAutopilot,
  step,
  stopAutopilot,
} from "@game/core";
import type { GameState } from "@game/core";
import { clearStage, DT, idle, run, startGame, stopWaves } from "./helpers.ts";

/** A quiet field: no waves, no mobs — nothing to interrupt the meter. */
function quietGame(coins: number): GameState {
  const state = startGame();
  stopWaves(state);
  clearStage(state);
  state.player.coins = coins;
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
    expect(startAutopilot(state)).toBe(false);
    expect(state.autopilot.active).toBe(false);

    // One second at 1× is affordable; the same purse can't fund 8×.
    state.player.coins = AUTOPILOT.coinsPerSecond;
    expect(startAutopilot(state, 8)).toBe(false);
    expect(startAutopilot(state, 1)).toBe(true);
    expect(state.autopilot.active).toBe(true);
    expect(state.autopilot.speed).toBe(1);
  });

  it("refuses a run that is already over", () => {
    const state = quietGame(1_000_000);
    state.phase = "defeat";
    expect(startAutopilot(state)).toBe(false);
  });

  it("retunes the rung mid-flight, but only while engaged", () => {
    const state = quietGame(100_000);
    expect(setAutopilotSpeed(state, 8)).toBe(false);
    expect(startAutopilot(state, 1)).toBe(true);
    expect(setAutopilotSpeed(state, 8)).toBe(true);
    expect(state.autopilot.speed).toBe(8);
  });
});

describe("the meter", () => {
  it("drains coinsPerSecond per game-second at 1×", () => {
    const state = quietGame(1000);
    startAutopilot(state, 1);
    run(state, idle, 125); // 125 × 16ms = 2000ms of game time
    expect(state.player.coins).toBe(1000 - 2 * AUTOPILOT.coinsPerSecond);
    expect(state.autopilot.coinsSpent).toBe(2 * AUTOPILOT.coinsPerSecond);
  });

  it("drains 8× per game-second on the 8× rung", () => {
    const state = quietGame(10_000);
    startAutopilot(state, 8);
    run(state, idle, 125); // 2000ms of game time
    expect(state.player.coins).toBe(10_000 - 16 * AUTOPILOT.coinsPerSecond);
  });

  it("holds the meter while the run is paused", () => {
    const state = quietGame(1000);
    startAutopilot(state, 1);
    pauseGame(state);
    run(state, idle, 125);
    expect(state.player.coins).toBe(1000);
    expect(state.autopilot.active).toBe(true);
  });

  it("stops billing after a player stop", () => {
    const state = quietGame(1000);
    startAutopilot(state, 1);
    run(state, idle, 63); // ~1s → ~100 coins burned
    expect(stopAutopilot(state)).toBe(true);
    const left = state.player.coins;
    run(state, idle, 125);
    expect(state.player.coins).toBe(left);
  });

  it("disengages with an autopilotStopped event when the purse runs dry", () => {
    const state = quietGame(AUTOPILOT.coinsPerSecond); // funds exactly 1s at 1×
    startAutopilot(state, 1);
    let stopped = false;
    for (let i = 0; i < 200 && !stopped; i++) {
      step(state, idle, DT);
      stopped = state.events.some(
        (e) => e.type === "autopilotStopped" && e.reason === "coins",
      );
    }
    expect(stopped).toBe(true);
    expect(state.player.coins).toBe(0);
    expect(state.autopilot.active).toBe(false);
    // The run itself carries on — only the autopilot let go.
    expect(state.phase).toBe("playing");
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
