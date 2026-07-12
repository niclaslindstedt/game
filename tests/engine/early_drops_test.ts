// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The scripted opening loot cadence (`level.loot.earlyDrops`): a level hands
// over a guaranteed weapon → powerup → item loop on a kill schedule, so every
// run teaches the drop loop in its opening seconds instead of waiting on the
// probabilistic rain. Exercised against the synthetic fixture level, whose
// schedule is weapon `test_hammer` @2, ability `test_storm` @5, item xp @8.

import { describe, expect, it } from "vitest";

import { levelDef } from "@game/core";
import type { GameState } from "@game/core";
import {
  clearStage,
  equipBlaster,
  idle,
  makeEnemy,
  run,
  startGame,
} from "./helpers.ts";

// Drive the next kill so the schedule reaches `atKills`: park kills one short,
// then let the blaster finish a stray minion (the parked boss stays alive).
function killAt(state: GameState, atKills: number): void {
  equipBlaster(state); // finish the stray minion from range
  state.items = [];
  // Isolate the early-drop cadence (kill-count driven) from the leveling curve:
  // freeze XP so an opening ding can't flip the phase to "levelup" mid-helper
  // and stall the stray-minion kill this relies on. The fast opening curve dings
  // within a handful of kills, which is exactly this window.
  state.phase = "playing";
  state.player.pendingStatPoints = 0;
  state.levelUpFxMs = 0;
  state.player.xp = 0;
  state.player.xpToNext = Number.MAX_SAFE_INTEGER;
  state.stats.kills = atKills - 1;
  state.enemies.push(
    makeEnemy({ pos: { x: state.player.pos.x + 60, y: state.player.pos.y } }),
  );
  run(state, idle, 2000, (s) => s.enemies.length === 1);
}

describe("scripted opening drops", () => {
  it("fires nothing before the first scheduled kill", () => {
    const state = startGame();
    clearStage(state);
    killAt(state, 1); // schedule's first entry is at kill 2
    expect(state.earlyDropCursor).toBe(0);
    expect(
      state.items.some(
        (i) => i.kind === "equipment" && i.equipment.defId === "test_hammer",
      ),
    ).toBe(false);
  });

  it("hands over the weapon first, then powerup, then item — once each", () => {
    const schedule = levelDef("test_level").loot.earlyDrops!;
    expect("weapon" in schedule[0]!).toBe(true); // weapon leads the cadence

    const state = startGame();
    clearStage(state);

    killAt(state, state.earlyDropKills[0]!);
    expect(state.earlyDropCursor).toBe(1);
    // A unique — never in the random weapon pool, so exactly one, and it is
    // the scheduled drop.
    expect(
      state.items.filter(
        (i) => i.kind === "equipment" && i.equipment.defId === "test_hammer",
      ),
    ).toHaveLength(1);

    killAt(state, state.earlyDropKills[1]!);
    expect(state.earlyDropCursor).toBe(2);
    expect(
      state.items.some((i) => i.kind === "ability" && i.defId === "test_storm"),
    ).toBe(true);

    killAt(state, state.earlyDropKills[2]!);
    expect(state.earlyDropCursor).toBe(schedule.length);
  });

  it("fires every entry a single late kill has passed, fanned out", () => {
    const state = startGame();
    clearStage(state);
    // One kill lands the player past all three thresholds at once.
    killAt(state, 8);
    expect(state.earlyDropCursor).toBe(3);

    const weapon = state.items.find(
      (i) => i.kind === "equipment" && i.equipment.defId === "test_hammer",
    )!;
    const ability = state.items.find(
      (i) => i.kind === "ability" && i.defId === "test_storm",
    )!;
    expect(weapon).toBeDefined();
    expect(ability).toBeDefined();
    // Successive drops fan out so their pickups don't stack on one pixel.
    expect(weapon.pos.x).not.toBe(ability.pos.x);
  });

  it("never re-drops a scheduled entry once its cursor has passed", () => {
    const state = startGame();
    clearStage(state);
    killAt(state, 8); // exhaust the schedule
    expect(state.earlyDropCursor).toBe(3);

    state.items = [];
    // Twenty more kills: the cursor is spent, so no second scheduled weapon.
    for (let k = 0; k < 20; k++) killAt(state, 20 + k);
    expect(state.earlyDropCursor).toBe(3);
    expect(
      state.items.some(
        (i) => i.kind === "equipment" && i.equipment.defId === "test_hammer",
      ),
    ).toBe(false);
  });
});
